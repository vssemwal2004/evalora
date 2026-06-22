const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      sid: user.activeSessionId,
    },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
}

function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function signAssignmentToken({ assignmentId, userId, role }) {
  return jwt.sign({ assignmentId: String(assignmentId), sub: String(userId), role, purpose: 'assignment' }, env.jwtSecret, { expiresIn: '2h' });
}

function verifyAssignmentToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== 'assignment') throw new Error('Invalid assignment access token.');
  return payload;
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
  signAssignmentToken,
  verifyAssignmentToken,
};
