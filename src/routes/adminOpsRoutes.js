const express = require('express');
const router = express.Router();
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_){ authMiddleware = (req,res,next)=>next(); }
const adminOnly = require('../middlewares/adminOnly');

// Leader status
router.get('/leader', authMiddleware, adminOnly, (_req,res)=>{
  const leader = global.__bgLeader && global.__bgLeader.isLeader ? global.__bgLeader.isLeader() : false;
  return res.json({ ok:true, leader });
});

// Force leader relinquish (next election cycle another instance can grab it)
router.post('/leader/relinquish', authMiddleware, adminOnly, async (_req,res)=>{
  try {
    if (!global.__bgLeader) return res.status(500).json({ ok:false, error:'leader_control_unavailable' });
    const r = await global.__bgLeader.relinquish();
    return res.json({ ok:r, leader:false });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// In-memory latency metrics (JSON)
router.get('/latency', authMiddleware, adminOnly, (_req,res)=>{
  try { const stats = (global.getLatencyStats || require('../server').getLatencyStats)(); return res.json({ ok:true, stats }); }
  catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// Prometheus style latency export
router.get('/latency/prom', authMiddleware, adminOnly, (_req,res)=>{
  try {
    const stats = (global.getLatencyStats || require('../server').getLatencyStats)();
    res.setHeader('Content-Type','text/plain');
    if (!stats.count) return res.send('# no samples yet');
    const lines = [
      '# HELP autopromote_latency_ms Request latency summary (in-memory)',
      '# TYPE autopromote_latency_ms summary',
      `autopromote_latency_ms_count ${stats.count}`,
      `autopromote_latency_ms_avg ${stats.avg}`,
      `autopromote_latency_ms_p50 ${stats.p50}`,
      `autopromote_latency_ms_p90 ${stats.p90}`,
      `autopromote_latency_ms_p95 ${stats.p95}`,
      `autopromote_latency_ms_p99 ${stats.p99}`,
      `autopromote_latency_ms_max ${stats.max}`
    ];
    return res.send(lines.join('\n'));
  } catch(e){ return res.status(500).send(`# error ${e.message}`); }
});

module.exports = router;
