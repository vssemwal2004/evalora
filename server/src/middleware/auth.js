const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const env = require('../config/env');
const { verifyAuthToken } = require('../utils/tokens');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : req.cookies?.[env.auth.cookieName] || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub).select('+activeSessionId +tokenInvalidBefore');

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid or inactive account.' });
    }

    if (payload.role !== user.role) {
      return res.status(401).json({ message: 'Invalid authentication token.' });
    }

    const issuedAtMs = Number(payload.iat || 0) * 1000;
    const invalidBefore = user.tokenInvalidBefore || user.passwordChangedAt;
    if (invalidBefore && issuedAtMs + 1000 < invalidBefore.getTime()) {
      return res.status(401).json({
        code: 'SESSION_EXPIRED',
        message: 'Your session expired after an account security update. Please sign in again.',
      });
    }

    if (user.role === ROLES.STUDENT && user.activeSessionId && payload.sid !== user.activeSessionId) {
      return res.status(401).json({
        code: 'MULTIPLE_LOGIN_DETECTED',
        message: 'Multiple login detected. This account was opened on another device, so this session has been logged out.',
      });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid authentication token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }

    return next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (req.user.role === 'super_admin' || req.user.permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({ message: 'Permission denied.' });
  };
}

module.exports = {
  authenticate,
  requireRole,
  requirePermission,
};
