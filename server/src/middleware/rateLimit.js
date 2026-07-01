const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const env = require('../config/env');
const { getRateLimitRedisClient, isRateLimitRedisReady } = require('../config/rateLimitRedis');

const MINUTE = 60 * 1000;
const FIFTEEN_MINUTES = 15 * MINUTE;

function retryAfterSeconds(req) {
  const resetTime = req.rateLimit?.resetTime;
  if (!resetTime) return undefined;
  return Math.max(Math.ceil((resetTime.getTime() - Date.now()) / 1000), 1);
}

function createRateLimiter({
  windowMs,
  limit,
  message = 'Too many requests. Please wait a moment and try again.',
  skipSuccessfulRequests = false,
  skipFailedRequests = false,
  keyGenerator,
  storePrefix = 'api',
} = {}) {
  const store = createRedisRateLimitStore(storePrefix);

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator,
    store,
    passOnStoreError: true,
    handler(req, res) {
      const retryAfter = retryAfterSeconds(req);
      if (retryAfter) res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        message,
        retryAfter,
      });
    },
  });
}

function createRedisRateLimitStore(prefix) {
  const client = getRateLimitRedisClient();
  if (!client) return undefined;

  return new RedisStore({
    prefix: `${env.rateLimits.redisPrefix}:${prefix}:`,
    sendCommand: (command, ...args) => client.call(command, ...args),
  });
}

function cleanupExpiredHits(hits, now) {
  for (const [key, entry] of hits.entries()) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

function safeKeyPart(value) {
  return encodeURIComponent(String(value || '').trim().slice(0, 200) || 'none');
}

function createAuthenticatedRateLimiter({
  windowMs = MINUTE,
  limit = 60,
  keyPrefix = 'auth-user',
  message = 'Too many requests. Please wait a moment and try again.',
  scope,
} = {}) {
  const hits = new Map();

  function runLocalLimiter(req, res, next) {
    const now = Date.now();
    const identity = req.user?._id?.toString() || req.user?.email || req.ip || 'anonymous';
    const scopeKey = typeof scope === 'function' ? scope(req) : '';
    const key = [keyPrefix, identity, scopeKey].filter(Boolean).join(':');
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 5000 || Math.random() < 0.01) cleanupExpiredHits(hits, now);
      return next();
    }

    current.count += 1;
    if (current.count > limit) {
      const retryAfter = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message, retryAfter });
    }

    return next();
  }

  return async (req, res, next) => {
    const client = getRateLimitRedisClient();
    if (!client || !isRateLimitRedisReady()) {
      return runLocalLimiter(req, res, next);
    }

    try {
      const identity = req.user?._id?.toString() || req.user?.email || req.ip || 'anonymous';
      const scopeKey = typeof scope === 'function' ? scope(req) : '';
      const redisKey = `${env.rateLimits.redisPrefix}:${keyPrefix}:${safeKeyPart(identity)}:${safeKeyPart(scopeKey)}`;
      const count = Number(await client.incr(redisKey));
      let ttl = Number(await client.pttl(redisKey));

      if (count === 1 || ttl < 0) {
        await client.pexpire(redisKey, windowMs);
        ttl = windowMs;
      }

      if (count > limit) {
        const retryAfter = Math.max(Math.ceil(ttl / 1000), 1);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ message, retryAfter });
      }

      return next();
    } catch (_error) {
      return runLocalLimiter(req, res, next);
    }
  };
}

const globalApiLimiter = createRateLimiter({
  windowMs: env.rateLimits.globalWindowMs,
  limit: env.rateLimits.globalLimit,
  message: 'Too many API requests. Please wait a moment and try again.',
  storePrefix: 'global',
});

const authLoginLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_AUTH_LOGIN_LIMIT || 30),
  message: 'Too many login attempts. Please wait and try again.',
  storePrefix: 'auth-login',
});

const passwordChangeLimiter = createAuthenticatedRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_PASSWORD_CHANGE_LIMIT || 12),
  keyPrefix: 'password-change',
  message: 'Too many password requests. Please wait and try again.',
});

const examAnswerLimiter = createAuthenticatedRateLimiter({
  windowMs: MINUTE,
  limit: Number(process.env.RATE_LIMIT_EXAM_ANSWERS_LIMIT || 180),
  keyPrefix: 'exam-answer',
  scope: (req) => req.params.assignmentId,
  message: 'Too many answer saves. Please wait a moment.',
});

const examHeartbeatLimiter = createAuthenticatedRateLimiter({
  windowMs: MINUTE,
  limit: Number(process.env.RATE_LIMIT_EXAM_HEARTBEAT_LIMIT || 90),
  keyPrefix: 'exam-heartbeat',
  scope: (req) => req.params.assignmentId,
  message: 'Too many heartbeat updates. Please wait a moment.',
});

const examSecurityEventLimiter = createAuthenticatedRateLimiter({
  windowMs: MINUTE,
  limit: Number(process.env.RATE_LIMIT_EXAM_SECURITY_LIMIT || 45),
  keyPrefix: 'exam-security',
  scope: (req) => req.params.assignmentId,
  message: 'Too many security events. Please wait a moment.',
});

const examActionLimiter = createAuthenticatedRateLimiter({
  windowMs: MINUTE,
  limit: Number(process.env.RATE_LIMIT_EXAM_ACTION_LIMIT || 60),
  keyPrefix: 'exam-action',
  scope: (req) => req.params.assignmentId,
  message: 'Too many exam actions. Please wait a moment.',
});

const proctorVerifyLimiter = createAuthenticatedRateLimiter({
  windowMs: 5 * MINUTE,
  limit: Number(process.env.RATE_LIMIT_PROCTOR_VERIFY_LIMIT || 20),
  keyPrefix: 'proctor-verify',
  scope: (req) => req.params.assignmentId,
  message: 'Too many assessment password checks. Please wait and try again.',
});

const proctorActionLimiter = createAuthenticatedRateLimiter({
  windowMs: MINUTE,
  limit: Number(process.env.RATE_LIMIT_PROCTOR_ACTION_LIMIT || 90),
  keyPrefix: 'proctor-action',
  scope: (req) => req.params.assignmentId,
  message: 'Too many proctor actions. Please wait a moment.',
});

const bulkImportLimiter = createAuthenticatedRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_BULK_IMPORT_LIMIT || 30),
  keyPrefix: 'bulk-import',
  message: 'Too many import requests. Please wait and try again.',
});

const mailSendLimiter = createAuthenticatedRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_MAIL_SEND_LIMIT || 60),
  keyPrefix: 'mail-send',
  message: 'Too many mail send requests. Please wait and try again.',
});

const adminWriteLimiter = createAuthenticatedRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_ADMIN_WRITE_LIMIT || 180),
  keyPrefix: 'admin-write',
  message: 'Too many management changes. Please wait and try again.',
});

module.exports = {
  createRateLimiter,
  createAuthenticatedRateLimiter,
  globalApiLimiter,
  authLoginLimiter,
  passwordChangeLimiter,
  examAnswerLimiter,
  examHeartbeatLimiter,
  examSecurityEventLimiter,
  examActionLimiter,
  proctorVerifyLimiter,
  proctorActionLimiter,
  bulkImportLimiter,
  mailSendLimiter,
  adminWriteLimiter,
};
