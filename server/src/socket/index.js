const User = require('../models/User');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const env = require('../config/env');
const { verifyAuthToken } = require('../utils/tokens');

const chatCache = new Map();
const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_THREADS = 1000;
const CHAT_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CHAT_TEXT_LENGTH = 1000;
const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_CANDIDATE_BYTES = 16 * 1024;
const SOCKET_LIMITS = {
  join: { windowMs: 60 * 1000, limit: 30 },
  monitorRequest: { windowMs: 60 * 1000, limit: 30 },
  monitorStop: { windowMs: 60 * 1000, limit: 60 },
  sdp: { windowMs: 60 * 1000, limit: 30 },
  iceCandidate: { windowMs: 60 * 1000, limit: 300 },
  chatHistory: { windowMs: 60 * 1000, limit: 60 },
  chatSend: { windowMs: 60 * 1000, limit: 30 },
};

function readCookie(cookieHeader, name) {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .reduce((value, part) => {
      if (value) return value;
      const separator = part.indexOf('=');
      if (separator === -1) return '';
      const key = part.slice(0, separator).trim();
      try {
        return key === name ? decodeURIComponent(part.slice(separator + 1).trim()) : '';
      } catch (_error) {
        return '';
      }
    }, '');
}

async function authenticateSocket(socket) {
  if (socket.data?.user) return socket.data.user;

  const headerToken = String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const cookieToken = readCookie(socket.handshake.headers.cookie, env.auth.cookieName);
  const token = socket.handshake.auth?.token || headerToken || cookieToken;
  if (!token) return null;

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub).select('+activeSessionId +tokenInvalidBefore');
    if (!user || user.status !== 'active') return null;
    if (payload.role !== user.role) return null;

    const issuedAtMs = Number(payload.iat || 0) * 1000;
    const invalidBefore = user.tokenInvalidBefore || user.passwordChangedAt;
    if (invalidBefore && issuedAtMs + 1000 < invalidBefore.getTime()) return null;
    if (user.role === ROLES.STUDENT && user.activeSessionId && payload.sid !== user.activeSessionId) return null;

    socket.data.user = user;
    return user;
  } catch (_error) {
    return null;
  }
}

function chatKey(proctorAssignmentId, studentId) {
  return `${proctorAssignmentId}:${studentId}`;
}

function pruneChatCache(now = Date.now()) {
  for (const [key, entry] of chatCache.entries()) {
    if (!entry || entry.expiresAt <= now) chatCache.delete(key);
  }

  while (chatCache.size > MAX_CHAT_THREADS) {
    const oldestKey = chatCache.keys().next().value;
    if (!oldestKey) break;
    chatCache.delete(oldestKey);
  }
}

function readChatMessages(proctorAssignmentId, studentId) {
  pruneChatCache();
  return chatCache.get(chatKey(proctorAssignmentId, studentId))?.messages || [];
}

function pushChatMessage(proctorAssignmentId, studentId, message) {
  pruneChatCache();
  const key = chatKey(proctorAssignmentId, studentId);
  const current = chatCache.get(key)?.messages || [];
  const next = [...current, message].slice(-MAX_CHAT_MESSAGES);
  chatCache.set(key, { messages: next, expiresAt: Date.now() + CHAT_TTL_MS });
  return next;
}

function safeObjectId(value) {
  const id = String(value || '').trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : '';
}

function safeSessionId(value) {
  return String(value || '').trim().slice(0, 128);
}

function byteSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch (_error) {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeSdp(value) {
  if (!value || typeof value !== 'object' || byteSize(value) > MAX_SIGNAL_BYTES) return null;
  const type = String(value.type || '').trim();
  const sdp = String(value.sdp || '');
  if (!['offer', 'answer'].includes(type) || !sdp || sdp.length > MAX_SIGNAL_BYTES) return null;
  return { ...value, type, sdp };
}

function normalizeIceCandidate(value) {
  if (!value || typeof value !== 'object' || byteSize(value) > MAX_CANDIDATE_BYTES) return null;
  return value;
}

function cleanChatText(value) {
  return String(value || '').trim().slice(0, MAX_CHAT_TEXT_LENGTH);
}

async function findStudentAssignmentForSocket(user, assignmentId) {
  const id = safeObjectId(assignmentId);
  if (!id) return null;
  return AssessmentStudent.findOne({
    _id: id,
    $or: [{ email: user.email }, { generatedExamId: user.loginId }],
  }).lean();
}

async function findProctorAssignmentForStudent(user, proctorAssignmentId, studentId) {
  const assignmentId = safeObjectId(proctorAssignmentId);
  const assignedStudentId = safeObjectId(studentId);
  if (!assignmentId || !assignedStudentId) return null;
  return AssessmentProctor.findOne({
    _id: assignmentId,
    email: user.email,
    'assignedStudents.assessmentStudentId': assignedStudentId,
  }).lean();
}

async function findProctorAssignmentByStudent(proctorAssignmentId, studentId, assessmentId) {
  const assignmentId = safeObjectId(proctorAssignmentId);
  const assignedStudentId = safeObjectId(studentId);
  if (!assignmentId || !assignedStudentId) return null;
  return AssessmentProctor.findOne({
    _id: assignmentId,
    assessmentId,
    'assignedStudents.assessmentStudentId': assignedStudentId,
  }).lean();
}

function ackError(ack, message) {
  if (typeof ack === 'function') ack({ ok: false, message });
}

function socketRateLimit(socket, bucket, policy, ack) {
  const now = Date.now();
  const limits = socket.data.rateLimits || new Map();
  socket.data.rateLimits = limits;

  const key = String(bucket);
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + policy.windowMs });
    return true;
  }

  current.count += 1;
  if (current.count > policy.limit) {
    const retryAfter = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    ackError(ack, `Too many realtime requests. Try again in ${retryAfter}s.`);
    return false;
  }

  return true;
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const safeOn = (event, handler) => {
      socket.on(event, (...args) => {
        Promise.resolve(handler(...args)).catch((_error) => {
          const ack = args.find((item) => typeof item === 'function');
          ackError(ack, 'Realtime request failed.');
        });
      });
    };

    socket.emit('system:ready', {
      socketId: socket.id,
      message: 'Evalora realtime channel connected.',
    });

    safeOn('proctor:join', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:join', SOCKET_LIMITS.join, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Authentication required.' });
        return;
      }

      const assignmentId = safeObjectId(payload.assignmentId);
      if (!assignmentId) {
        ackError(ack, 'Assigned assessment was not found.');
        return;
      }

      const assignment = await AssessmentProctor.findOne({
        _id: assignmentId,
        email: user.email,
      }).lean();

      if (!assignment) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Assigned assessment was not found.' });
        return;
      }

      socket.join(`proctor:${assignment._id}`);
      socket.join(`assessment:${assignment.assessmentId}:proctors`);
      if (typeof ack === 'function') ack({ ok: true });
    });

    safeOn('student:join', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'student:join', SOCKET_LIMITS.join, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findStudentAssignmentForSocket(user, payload.assignmentId);
      if (!assignment) {
        ackError(ack, 'Student assessment was not found.');
        return;
      }

      socket.join(`student:${assignment._id}`);
      socket.join(`assessment:${assignment.assessmentId}:students`);
      if (typeof ack === 'function') ack({ ok: true });
    });

    safeOn('proctor:monitor-request', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:monitor-request', SOCKET_LIMITS.monitorRequest, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment) {
        ackError(ack, 'Assigned student was not found for this proctor.');
        return;
      }

      io.to(`student:${payload.studentId}`).emit('student:monitor-request', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: safeSessionId(payload.sessionId),
        proctor: {
          id: String(user._id),
          name: user.name,
          email: user.email,
        },
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    safeOn('student:webrtc-offer', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'student:webrtc-offer', SOCKET_LIMITS.sdp, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findStudentAssignmentForSocket(user, payload.studentId);
      if (!assignment) {
        ackError(ack, 'Student assessment was not found.');
        return;
      }
      const proctorAssignment = await findProctorAssignmentByStudent(payload.assignmentId, assignment._id, assignment.assessmentId);
      if (!proctorAssignment) {
        ackError(ack, 'Proctor assignment was not found for this student.');
        return;
      }

      const sdp = normalizeSdp(payload.sdp);
      if (!sdp) {
        ackError(ack, 'WebRTC offer is missing.');
        return;
      }

      io.to(`proctor:${payload.assignmentId}`).emit('proctor:webrtc-offer', {
        assignmentId: payload.assignmentId,
        studentId: String(assignment._id),
        sessionId: safeSessionId(payload.sessionId),
        sdp,
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    safeOn('proctor:webrtc-answer', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:webrtc-answer', SOCKET_LIMITS.sdp, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment) {
        ackError(ack, 'Assigned student was not found for this proctor.');
        return;
      }

      const sdp = normalizeSdp(payload.sdp);
      if (!sdp) {
        ackError(ack, 'WebRTC answer is missing.');
        return;
      }

      io.to(`student:${payload.studentId}`).emit('student:webrtc-answer', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: safeSessionId(payload.sessionId),
        sdp,
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    safeOn('proctor:monitor-stop', async (payload = {}) => {
      if (!socketRateLimit(socket, 'proctor:monitor-stop', SOCKET_LIMITS.monitorStop)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) return;
      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment) return;

      io.to(`student:${payload.studentId}`).emit('student:monitor-stop', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: safeSessionId(payload.sessionId),
      });
    });

    safeOn('student:ice-candidate', async (payload = {}) => {
      if (!socketRateLimit(socket, 'student:ice-candidate', SOCKET_LIMITS.iceCandidate)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) return;
      const assignment = await findStudentAssignmentForSocket(user, payload.studentId);
      const proctorAssignment = assignment
        ? await findProctorAssignmentByStudent(payload.assignmentId, assignment._id, assignment.assessmentId)
        : null;
      const candidate = normalizeIceCandidate(payload.candidate);
      if (!assignment || !proctorAssignment || !candidate) return;

      io.to(`proctor:${payload.assignmentId}`).emit('proctor:ice-candidate', {
        assignmentId: payload.assignmentId,
        studentId: String(assignment._id),
        sessionId: safeSessionId(payload.sessionId),
        candidate,
      });
    });

    safeOn('proctor:ice-candidate', async (payload = {}) => {
      if (!socketRateLimit(socket, 'proctor:ice-candidate', SOCKET_LIMITS.iceCandidate)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) return;
      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      const candidate = normalizeIceCandidate(payload.candidate);
      if (!assignment || !candidate) return;

      io.to(`student:${payload.studentId}`).emit('student:ice-candidate', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: safeSessionId(payload.sessionId),
        candidate,
      });
    });

    safeOn('proctor:chat-history', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:chat-history', SOCKET_LIMITS.chatHistory, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment) {
        ackError(ack, 'Assigned student was not found for this proctor.');
        return;
      }

      if (typeof ack === 'function') ack({ ok: true, messages: readChatMessages(payload.assignmentId, payload.studentId) });
    });

    safeOn('proctor:chat-send', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:chat-send', SOCKET_LIMITS.chatSend, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      const text = cleanChatText(payload.text);
      if (!assignment || !text) {
        ackError(ack, 'Unable to send message.');
        return;
      }

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        senderRole: ROLES.PROCTOR,
        senderName: user.name || 'Proctor',
        text,
        createdAt: new Date().toISOString(),
      };
      pushChatMessage(assignment._id, payload.studentId, message);
      io.to(`student:${payload.studentId}`).emit('proctor:chat-message', message);
      io.to(`proctor:${assignment._id}`).emit('proctor:chat-message', message);
      if (typeof ack === 'function') ack({ ok: true, message });
    });

    safeOn('student:chat-send', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'student:chat-send', SOCKET_LIMITS.chatSend, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findStudentAssignmentForSocket(user, payload.studentId);
      const text = cleanChatText(payload.text);
      const proctorAssignment = assignment
        ? await findProctorAssignmentByStudent(payload.assignmentId, assignment._id, assignment.assessmentId)
        : null;
      if (!assignment || !proctorAssignment || !text) {
        ackError(ack, 'Unable to send message.');
        return;
      }

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        assignmentId: String(payload.assignmentId),
        studentId: String(assignment._id),
        senderRole: ROLES.STUDENT,
        senderName: user.name || assignment.name || 'Student',
        text,
        createdAt: new Date().toISOString(),
      };
      pushChatMessage(payload.assignmentId, assignment._id, message);
      io.to(`student:${assignment._id}`).emit('proctor:chat-message', message);
      io.to(`proctor:${payload.assignmentId}`).emit('proctor:chat-message', message);
      if (typeof ack === 'function') ack({ ok: true, message });
    });

    safeOn('disconnect', () => {});
  });
}

module.exports = registerSocketHandlers;
