const crypto = require('crypto');
const env = require('../config/env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.nodeEnv === 'production' ? 'strict' : 'lax',
    secure: env.auth.cookieSecure,
    maxAge: env.auth.cookieMaxAgeMs,
    path: '/',
  };
}

function signNonce(nonce) {
  return crypto.createHmac('sha256', env.jwtSecret).update(nonce).digest('base64url');
}

function createCsrfToken() {
  const nonce = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return `${nonce}.${signNonce(nonce)}`;
}

function isValidCsrfToken(token) {
  const [nonce, signature, extra] = String(token || '').split('.');
  if (!nonce || !signature || extra) return false;

  const expected = signNonce(nonce);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function setCsrfCookie(res, token = createCsrfToken()) {
  res.cookie(env.auth.csrfCookieName, token, cookieOptions());
  return token;
}

function clearCsrfCookie(res) {
  res.clearCookie(env.auth.csrfCookieName, {
    httpOnly: true,
    sameSite: env.nodeEnv === 'production' ? 'strict' : 'lax',
    secure: env.auth.cookieSecure,
    path: '/',
  });
}

function shouldSkipCsrf(req) {
  if (SAFE_METHODS.has(req.method)) return true;
  if (req.path === '/auth/login') return true;
  if (req.path === '/auth/csrf') return true;
  return !req.cookies?.[env.auth.cookieName] && !req.cookies?.token;
}

function csrfProtection(req, res, next) {
  if (shouldSkipCsrf(req)) return next();

  const cookieToken = req.cookies?.[env.auth.csrfCookieName];
  const headerToken = req.get(env.auth.csrfHeaderName);

  if (!cookieToken || !headerToken || cookieToken !== headerToken || !isValidCsrfToken(cookieToken)) {
    return res.status(403).json({
      code: 'CSRF_TOKEN_INVALID',
      message: 'Security token expired. Refresh the page and try again.',
    });
  }

  return next();
}

module.exports = {
  clearCsrfCookie,
  createCsrfToken,
  csrfProtection,
  setCsrfCookie,
};
