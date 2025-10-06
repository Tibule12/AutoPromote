const express = require('express');
const adminOnly = require('../middlewares/adminOnly');
const router = express.Router();

router.get('/query-metrics', require('../authMiddleware'), adminOnly, (req, res) => {
  try {
    const { getMetrics } = require('../utils/queryMetrics');
    const metrics = getMetrics();
    const mem = process.memoryUsage();
    res.json({ ok: true, at: Date.now(), metrics, memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
