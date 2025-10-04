const express = require('express');
const { db } = require('../firebaseAdmin');
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');

// Basic metrics route (read-only). Optionally protect with auth (currently requires auth).
// Returns:
// - taskQueue: status counts + recent tasks
// - velocityTriggers: recent trigger events
// - highVelocityContent: content docs with youtube.velocityStatus == 'high'
// - uploadStats: number of distinct uploads recorded
// NOTE: This is a lightweight aggregation; for very large datasets, migrate to pre-aggregated counters.

const router = express.Router();

// Utility safe number
function num(v) { return typeof v === 'number' && !Number.isNaN(v) ? v : 0; }

async function fetchTaskMetrics(limitPerType = 150) {
  const types = ['youtube_upload','platform_post'];
  const results = {};
  for (const type of types) {
    const snap = await db.collection('promotion_tasks')
      .where('type','==', type)
      .orderBy('createdAt','desc')
      .limit(limitPerType)
      .get();
    const tasks = [];
    const statusCounts = {};
    snap.forEach(doc => {
      const data = doc.data();
      statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
      tasks.push({ id: doc.id, status: data.status, platform: data.platform, reason: data.reason, createdAt: data.createdAt, updatedAt: data.updatedAt });
    });
    results[type] = { totalSampled: tasks.length, statusCounts, recent: tasks.slice(0, 20) };
  }
  return results;
}

async function fetchVelocityTriggers(limit = 25, hours = 24) {
  const since = Date.now() - hours * 3600000;
  // We can't query by time unless we stored a timestamp field; createdAt is serverTimestamp.
  // We'll just pull latest N triggers and filter heuristically if they have a createdAt Timestamp.
  const snap = await db.collection('analytics')
    .where('type','==','velocity_trigger')
    .orderBy('createdAt','desc')
    .limit(limit)
    .get();
  const triggers = [];
  snap.forEach(doc => {
    const d = doc.data();
    const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null;
    if (!ts || ts >= since) {
      triggers.push({ id: doc.id, contentId: d.contentId, platform: d.platform, videoId: d.videoId, velocity: d.velocity, threshold: d.velocityThreshold, createdAt: ts || null });
    }
  });
  return triggers;
}

async function fetchHighVelocityContent(limit = 20) {
  // Firestore doesn't allow querying by nested field inequality + ordering easily; simple where equals.
  const snap = await db.collection('content')
    .where('youtube.velocityStatus','==','high')
    .limit(limit)
    .get().catch(()=>({ empty: true, forEach: ()=>{} }));
  const items = [];
  if (!snap.empty) {
    snap.forEach(doc => {
      const d = doc.data();
      items.push({ id: doc.id, title: d.title, velocity: d.youtube?.velocity, videoId: d.youtube?.videoId, publishedAt: d.youtube?.publishedAt });
    });
  }
  return items;
}

async function fetchUploadStats(limit = 1) {
  // We just count a small sample to detect presence and approximate. Real cardinality would need a count aggregation or BigQuery export.
  const snap = await db.collection('youtube_uploads').limit(1).get().catch(()=>({ empty: true }));
  return { hasUploads: !snap.empty };
}

async function fetchPlatformPostsSummary(limit = 100) {
  const snap = await db.collection('platform_posts')
    .orderBy('createdAt','desc')
    .limit(limit)
    .get().catch(()=>({ empty: true, forEach:()=>{} }));
  const counts = { total: 0, success: 0, simulated: 0 };
  const perPlatform = {};
  if (!snap.empty) {
    snap.forEach(doc => {
      const d = doc.data();
      counts.total++;
      if (d.success) counts.success++;
      if (d.simulated) counts.simulated++;
      if (!perPlatform[d.platform]) perPlatform[d.platform] = { total: 0, success: 0 };
      perPlatform[d.platform].total++;
      if (d.success) perPlatform[d.platform].success++;
    });
  }
  return { counts, perPlatform, sample: Math.min(counts.total, 20) };
}

async function fetchTopPlatformPosts(limit = 10) {
  const snap = await db.collection('platform_posts')
    .where('success','==', true)
    .orderBy('normalizedScore','desc')
    .limit(limit)
    .get().catch(()=>({ empty: true, forEach: ()=>{} }));
  const out = [];
  if (!snap.empty) snap.forEach(doc => { const d = doc.data(); out.push({ id: doc.id, platform: d.platform, contentId: d.contentId, score: d.normalizedScore, peak: d.peakScore, accel: d.acceleration }); });
  return out;
}

async function fetchTopContentUnified(limit = 10) {
  // This requires an index for amplificationUnified desc; if missing, it will error – handle gracefully.
  try {
    const snap = await db.collection('content')
      .orderBy('amplificationUnified','desc')
      .limit(limit)
      .get();
    const out = [];
    snap.forEach(doc => { const d = doc.data(); if (typeof d.amplificationUnified === 'number') out.push({ id: doc.id, unified: d.amplificationUnified, scores: d.amplificationScores || {} }); });
    return out;
  } catch (e) { return { indexRequired: true, message: e.message }; }
}

const METRICS_REQUIRE_ADMIN = process.env.METRICS_REQUIRE_ADMIN !== 'false';

router.get('/dashboard', authMiddleware, (req, res, next) => {
  if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
  return next();
}, async (req, res) => {
  try {
    const { getCounters } = require('../services/aggregationService');
    const dlSnap = await db.collection('dead_letter_tasks').limit(1).get().catch(()=>({ empty: true }));
    const [taskQueue, triggers, highVelocity, uploadStats, counters, platformPosts, topPosts, topContent] = await Promise.all([
      fetchTaskMetrics(),
      fetchVelocityTriggers(),
      fetchHighVelocityContent(),
      fetchUploadStats(),
      getCounters(),
      fetchPlatformPostsSummary(),
      fetchTopPlatformPosts(),
      fetchTopContentUnified()
    ]);
    return res.json({
      ok: true,
      taskQueue,
      velocityTriggers: { count: triggers.length, recent: triggers },
      highVelocityContent: highVelocity,
      uploadStats,
      aggregated: counters,
      platformPosts,
      topPlatformPosts: topPosts,
      topContentUnified: topContent,
      deadLetterPresent: !dlSnap.empty,
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// System counters (lightweight, best-effort) - guarded by same admin rule if enabled
router.get('/counters', authMiddleware, (req,res,next) => {
  if (METRICS_REQUIRE_ADMIN) return adminOnly(req,res,next);
  return next();
}, async (req,res) => {
  try {
    const snap = await db.collection('system_counters').limit(200).get();
    const counters = {};
    snap.forEach(d => { const v = d.data(); counters[d.id] = v.value || 0; });
    return res.json({ ok: true, counters, count: Object.keys(counters).length, generatedAt: new Date().toISOString() });
  } catch (e) { return res.status(500).json({ ok:false, error: e.message }); }
});

// Raw export (F) - limited sample for BI ingestion (admin only already enforced at router level)
router.get('/raw', authMiddleware, (req, res, next) => {
  if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
  return next();
}, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const postsSnap = await db.collection('platform_posts')
      .orderBy('createdAt','desc')
      .limit(limit)
      .get().catch(()=>({ empty: true, docs: [] }));
    const rows = [];
    postsSnap.docs.forEach(d => { const v = d.data(); rows.push({ id: d.id, platform: v.platform, contentId: v.contentId, score: v.normalizedScore, peak: v.peakScore, accel: v.acceleration, success: v.success, simulated: v.simulated, createdAt: v.createdAt, postHash: v.postHash }); });
    const analyticsSnap = await db.collection('analytics')
      .orderBy('createdAt','desc')
      .limit(200)
      .get().catch(()=>({ empty: true, docs: [] }));
    const analytics = [];
    analyticsSnap.docs.forEach(a => { const d = a.data(); analytics.push({ id: a.id, type: d.type, platform: d.platform, contentId: d.contentId, createdAt: d.createdAt, velocity: d.velocity, normalizedScore: d.normalizedScore, acceleration: d.acceleration }); });
    return res.json({ ok: true, posts: rows, analyticsCount: analytics.length, analytics });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

// Prometheus-style export (best-effort) at /api/metrics/prom
// Only exposes counters from system_counters collection.
router.get('/prom', async (req, res) => {
  try {
    const snap = await db.collection('system_counters').limit(500).get();
    const lines = [
      '# HELP autopromote_counter Generic system counters',
      '# TYPE autopromote_counter counter'
    ];
    snap.forEach(d => {
      const v = d.data();
      const val = (v && typeof v.value === 'number') ? v.value : 0;
      const name = d.id.replace(/[^a-zA-Z0-9_]/g,'_');
      lines.push(`autopromote_counter{name="${name}"} ${val}`);
    });
    res.set('Content-Type','text/plain; version=0.0.4');
    return res.send(lines.join('\n') + '\n');
  } catch (e) {
    return res.status(500).send(`# error ${e.message}`);
  }
});
