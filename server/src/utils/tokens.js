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

module.exports = {
  signAuthToken,
  verifyAuthToken,
};
