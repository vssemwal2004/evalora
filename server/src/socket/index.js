const User = require('../models/User');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { verifyAuthToken } = require('../utils/tokens');

const chatCache = new Map();
const MAX_CHAT_MESSAGES = 100;
const SOCKET_LIMITS = {
  join: { windowMs: 60 * 1000, limit: 30 },
  monitorRequest: { windowMs: 60 * 1000, limit: 30 },
  monitorStop: { windowMs: 60 * 1000, limit: 60 },
  sdp: { windowMs: 60 * 1000, limit: 30 },
  iceCandidate: { windowMs: 60 * 1000, limit: 300 },
  chatHistory: { windowMs: 60 * 1000, limit: 60 },
  chatSend: { windowMs: 60 * 1000, limit: 30 },
};

async function authenticateSocket(socket) {
  if (socket.data?.user) return socket.data.user;

  const token = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') return null;
    socket.data.user = user;
    return user;
  } catch (_error) {
    return null;
  }
}

function chatKey(proctorAssignmentId, studentId) {
  return `${proctorAssignmentId}:${studentId}`;
}

function pushChatMessage(proctorAssignmentId, studentId, message) {
  const key = chatKey(proctorAssignmentId, studentId);
  const current = chatCache.get(key) || [];
  const next = [...current, message].slice(-MAX_CHAT_MESSAGES);
  chatCache.set(key, next);
  return next;
}

function normalizeSdp(value) {
  return value && typeof value === 'object' ? value : null;
}

async function findStudentAssignmentForSocket(user, assignmentId) {
  return AssessmentStudent.findOne({
    _id: assignmentId,
    $or: [{ email: user.email }, { generatedExamId: user.loginId }],
  }).lean();
}

async function findProctorAssignmentForStudent(user, proctorAssignmentId, studentId) {
  return AssessmentProctor.findOne({
    _id: proctorAssignmentId,
    email: user.email,
    'assignedStudents.assessmentStudentId': studentId,
  }).lean();
}

async function findProctorAssignmentByStudent(proctorAssignmentId, studentId, assessmentId) {
  return AssessmentProctor.findOne({
    _id: proctorAssignmentId,
    assessmentId,
    'assignedStudents.assessmentStudentId': studentId,
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
    socket.emit('system:ready', {
      socketId: socket.id,
      message: 'Evalora realtime channel connected.',
    });

    socket.on('proctor:join', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:join', SOCKET_LIMITS.join, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Authentication required.' });
        return;
      }

      const assignment = await AssessmentProctor.findOne({
        _id: payload.assignmentId,
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

    socket.on('student:join', async (payload = {}, ack) => {
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

    socket.on('proctor:monitor-request', async (payload = {}, ack) => {
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
        sessionId: payload.sessionId,
        proctor: {
          id: String(user._id),
          name: user.name,
          email: user.email,
        },
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('student:webrtc-offer', async (payload = {}, ack) => {
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
        sessionId: payload.sessionId,
        sdp,
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('proctor:webrtc-answer', async (payload = {}, ack) => {
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
        sessionId: payload.sessionId,
        sdp,
      });

      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('proctor:monitor-stop', async (payload = {}) => {
      if (!socketRateLimit(socket, 'proctor:monitor-stop', SOCKET_LIMITS.monitorStop)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) return;
      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment) return;

      io.to(`student:${payload.studentId}`).emit('student:monitor-stop', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: payload.sessionId,
      });
    });

    socket.on('student:ice-candidate', async (payload = {}) => {
      if (!socketRateLimit(socket, 'student:ice-candidate', SOCKET_LIMITS.iceCandidate)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) return;
      const assignment = await findStudentAssignmentForSocket(user, payload.studentId);
      const proctorAssignment = assignment
        ? await findProctorAssignmentByStudent(payload.assignmentId, assignment._id, assignment.assessmentId)
        : null;
      if (!assignment || !proctorAssignment || !payload.candidate) return;

      io.to(`proctor:${payload.assignmentId}`).emit('proctor:ice-candidate', {
        assignmentId: payload.assignmentId,
        studentId: String(assignment._id),
        sessionId: payload.sessionId,
        candidate: payload.candidate,
      });
    });

    socket.on('proctor:ice-candidate', async (payload = {}) => {
      if (!socketRateLimit(socket, 'proctor:ice-candidate', SOCKET_LIMITS.iceCandidate)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) return;
      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      if (!assignment || !payload.candidate) return;

      io.to(`student:${payload.studentId}`).emit('student:ice-candidate', {
        assignmentId: String(assignment._id),
        studentId: String(payload.studentId),
        sessionId: payload.sessionId,
        candidate: payload.candidate,
      });
    });

    socket.on('proctor:chat-history', async (payload = {}, ack) => {
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

      if (typeof ack === 'function') ack({ ok: true, messages: chatCache.get(chatKey(payload.assignmentId, payload.studentId)) || [] });
    });

    socket.on('proctor:chat-send', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'proctor:chat-send', SOCKET_LIMITS.chatSend, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.PROCTOR) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findProctorAssignmentForStudent(user, payload.assignmentId, payload.studentId);
      const text = String(payload.text || '').trim();
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
        text: text.slice(0, 1000),
        createdAt: new Date().toISOString(),
      };
      pushChatMessage(assignment._id, payload.studentId, message);
      io.to(`student:${payload.studentId}`).emit('proctor:chat-message', message);
      io.to(`proctor:${assignment._id}`).emit('proctor:chat-message', message);
      if (typeof ack === 'function') ack({ ok: true, message });
    });

    socket.on('student:chat-send', async (payload = {}, ack) => {
      if (!socketRateLimit(socket, 'student:chat-send', SOCKET_LIMITS.chatSend, ack)) return;
      const user = await authenticateSocket(socket);
      if (!user || user.role !== ROLES.STUDENT) {
        ackError(ack, 'Authentication required.');
        return;
      }

      const assignment = await findStudentAssignmentForSocket(user, payload.studentId);
      const text = String(payload.text || '').trim();
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
        text: text.slice(0, 1000),
        createdAt: new Date().toISOString(),
      };
      pushChatMessage(payload.assignmentId, assignment._id, message);
      io.to(`student:${assignment._id}`).emit('proctor:chat-message', message);
      io.to(`proctor:${payload.assignmentId}`).emit('proctor:chat-message', message);
      if (typeof ack === 'function') ack({ ok: true, message });
    });

    socket.on('disconnect', () => {});
  });
}

module.exports = registerSocketHandlers;
