const jwt = require('jsonwebtoken');
const env = require('../config/env');

function jwtOptions(extra = {}) {
  return {
    issuer: env.auth.issuer,
    audience: env.auth.audience,
    ...extra,
  };
}

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      sid: user.activeSessionId,
    },
    env.jwtSecret,
    jwtOptions({ expiresIn: env.auth.tokenTtl })
  );
}

function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret, jwtOptions());
}

function signAssignmentToken({ assignmentId, userId, role }) {
  return jwt.sign(
    { assignmentId: String(assignmentId), sub: String(userId), role, purpose: 'assignment' },
    env.jwtSecret,
    jwtOptions({ expiresIn: env.auth.assignmentTokenTtl })
  );
}

function verifyAssignmentToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, jwtOptions());
  if (payload.purpose !== 'assignment') throw new Error('Invalid assignment access token.');
  return payload;
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
  signAssignmentToken,
  verifyAssignmentToken,
};
