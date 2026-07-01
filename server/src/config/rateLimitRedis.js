const Redis = require('ioredis');
const env = require('./env');

let client;
let lastErrorMessage = '';

function hasRateLimitRedis() {
  return Boolean(env.rateLimits.redisUrl);
}

function getRateLimitRedisClient() {
  if (!hasRateLimitRedis()) return null;

  if (!client) {
    client = new Redis(env.rateLimits.redisUrl, {
      connectTimeout: Number(process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS || 1000),
      maxRetriesPerRequest: Number(process.env.RATE_LIMIT_REDIS_MAX_RETRIES || 1),
      enableReadyCheck: true,
      lazyConnect: true,
      keepAlive: 30000,
    });

    client.on('error', (error) => {
      lastErrorMessage = error.message;
      if (env.nodeEnv !== 'test') {
        console.warn(`Rate limit Redis error: ${error.message}`);
      }
    });

    client.connect().catch((error) => {
      lastErrorMessage = error.message;
      if (env.nodeEnv !== 'test') {
        console.warn(`Rate limit Redis unavailable; using local fallback until it recovers. ${error.message}`);
      }
    });
  }

  return client;
}

function isRateLimitRedisReady() {
  return Boolean(client && client.status === 'ready');
}

function getRateLimitRedisStatus() {
  return {
    configured: hasRateLimitRedis(),
    status: client?.status || (hasRateLimitRedis() ? 'not_started' : 'disabled'),
    ready: isRateLimitRedisReady(),
    lastError: lastErrorMessage,
  };
}

function closeRateLimitRedis() {
  if (!client) return;
  client.disconnect();
  client = null;
  lastErrorMessage = '';
}

module.exports = {
  closeRateLimitRedis,
  getRateLimitRedisClient,
  getRateLimitRedisStatus,
  hasRateLimitRedis,
  isRateLimitRedisReady,
};
