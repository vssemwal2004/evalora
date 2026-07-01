const User = require('../models/User');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { verifyAuthToken } = require('../utils/tokens');

const chatCache = new Map();
const MAX_CHAT_MESSAGES = 100;

async function authenticateSocket(socket) {
  const token = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') return null;
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

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.emit('system:ready', {
      socketId: socket.id,
      message: 'Evalora realtime channel connected.',
    });

    socket.on('proctor:join', async (payload = {}, ack) => {
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
