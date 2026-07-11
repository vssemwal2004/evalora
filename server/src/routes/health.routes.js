const express = require('express');
const mongoose = require('mongoose');
const { getRateLimitRedisStatus } = require('../config/rateLimitRedis');

const router = express.Router();
const DOWNLOAD_PROBE = Buffer.alloc(256 * 1024, 'evalora-network-probe-');

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'evalora-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    rateLimitRedis: getRateLimitRedisStatus(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/download-probe', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/octet-stream',
    'Content-Length': DOWNLOAD_PROBE.length,
  });
  return res.send(DOWNLOAD_PROBE);
});

module.exports = router;
