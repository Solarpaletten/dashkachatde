const express = require('express');
const router = express.Router();
const config = require('../config');
const cache = require('../utils/cache');
const { clientManager } = require('../websocket');

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'DashkaBot Cloud Server',
    version: '3.0.0',
    websocket_clients: clientManager.getClientCount(),
    cache_size: cache.getSize(),
    openai_configured: config.openai.enabled,
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

router.get('/stats', (req, res) => {
  res.json({
    status: 'success',
    stats: {
      cache_size: cache.getSize(),
      websocket_clients: clientManager.getClientCount(),
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      version: '3.0.0'
    }
  });
});

module.exports = router;