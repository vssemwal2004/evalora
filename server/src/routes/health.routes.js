const express = require('express');
const mongoose = require('mongoose');
const { getRateLimitRedisStatus } = require('../config/rateLimitRedis');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'evalora-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    rateLimitRedis: getRateLimitRedisStatus(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
