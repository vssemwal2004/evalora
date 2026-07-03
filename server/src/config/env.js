const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env'), override: true });

const required = ['JWT_SECRET'];
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendOrigins = listFromEnv(process.env.FRONTEND_ORIGINS, [frontendUrl]);
const authCookieSecure = boolFromEnv(process.env.AUTH_COOKIE_SECURE, isProduction);

function listFromEnv(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : fallback;
}

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function isLocalhostUrl(value) {
  try {
    const { hostname } = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch (_error) {
    return false;
  }
}

function assertValidOrigin(origin) {
  if (origin === '*') {
    throw new Error('FRONTEND_ORIGINS cannot contain wildcard "*" when credentials are enabled.');
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_error) {
    throw new Error(`Invalid frontend origin: ${origin}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Frontend origin must use http or https: ${origin}`);
  }

  if (isProduction && parsed.protocol !== 'https:' && !boolFromEnv(process.env.ALLOW_INSECURE_FRONTEND_ORIGINS, false)) {
    throw new Error(`Production frontend origin must use HTTPS: ${origin}`);
  }
}

function validateEnv() {
  if (nodeEnv === 'test') {
    return;
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`Missing environment values: ${missing.join(', ')}`);
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction && (!jwtSecret || jwtSecret === 'development-only-secret' || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be set to a strong production secret with at least 32 characters.');
  }

  frontendOrigins.forEach(assertValidOrigin);

  if (isProduction && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be configured in production.');
  }

  if (isProduction && !process.env.FRONTEND_URL && !process.env.FRONTEND_ORIGINS) {
    throw new Error('FRONTEND_URL or FRONTEND_ORIGINS must be configured in production.');
  }

  if (isProduction && frontendOrigins.some(isLocalhostUrl) && !boolFromEnv(process.env.ALLOW_LOCALHOST_FRONTEND_ORIGINS, false)) {
    throw new Error('Production FRONTEND_ORIGINS cannot use localhost.');
  }

  if (isProduction && !authCookieSecure) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production.');
  }

  if (isProduction && !process.env.RATE_LIMIT_REDIS_URL && !process.env.REDIS_URL) {
    console.warn('RATE_LIMIT_REDIS_URL is not configured; rate limits will be local to each API instance.');
  }

  if (isProduction && !process.env.CREDENTIAL_ENCRYPTION_SECRET) {
    console.warn('CREDENTIAL_ENCRYPTION_SECRET is not configured; JWT_SECRET will be used to encrypt credential previews.');
  }

  if (isProduction && (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM)) {
    console.warn('SMTP settings are incomplete; credential and review emails may fail in production.');
  }
}

validateEnv();

module.exports = {
  port: Number(process.env.PORT || 5000),
  nodeEnv,
  mongoUri: process.env.MONGO_URI || '',
  frontendUrl,
  frontendOrigins,
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '1mb',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
  rateLimits: {
    globalWindowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 15 * 60 * 1000),
    globalLimit: Number(process.env.RATE_LIMIT_GLOBAL_LIMIT || 600),
    redisUrl: process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || '',
    redisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX || 'evalora:rate-limit',
  },
  auth: {
    tokenTtl: process.env.AUTH_TOKEN_TTL || '12h',
    assignmentTokenTtl: process.env.ASSIGNMENT_TOKEN_TTL || '2h',
    issuer: process.env.JWT_ISSUER || 'evalora-api',
    audience: process.env.JWT_AUDIENCE || 'evalora-client',
    cookieName: process.env.AUTH_COOKIE_NAME || 'evalora_token',
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'evalora_csrf',
    csrfHeaderName: process.env.CSRF_HEADER_NAME || 'x-csrf-token',
    cookieSecure: authCookieSecure,
    cookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 12 * 60 * 60 * 1000),
    loginMaxFailedAttempts: Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS || 5),
    loginFailureWindowMs: Number(process.env.LOGIN_FAILURE_WINDOW_MS || 15 * 60 * 1000),
    loginLockMs: Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000),
  },
  credentialEncryptionSecret: process.env.CREDENTIAL_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'development-only-secret',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
};
