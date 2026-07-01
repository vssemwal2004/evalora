const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env'), override: true });

const required = ['JWT_SECRET'];

function listFromEnv(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : fallback;
}

function validateEnv() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`Missing environment values: ${missing.join(', ')}`);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction && (!jwtSecret || jwtSecret === 'development-only-secret' || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be set to a strong production secret with at least 32 characters.');
  }

  if (isProduction && !process.env.RATE_LIMIT_REDIS_URL && !process.env.REDIS_URL) {
    console.warn('RATE_LIMIT_REDIS_URL is not configured; rate limits will be local to each API instance.');
  }
}

validateEnv();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

module.exports = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || '',
  frontendUrl,
  frontendOrigins: listFromEnv(process.env.FRONTEND_ORIGINS, [frontendUrl]),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '1mb',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
  rateLimits: {
    globalWindowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 15 * 60 * 1000),
    globalLimit: Number(process.env.RATE_LIMIT_GLOBAL_LIMIT || 600),
    redisUrl: process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || '',
    redisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX || 'evalora:rate-limit',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
};
