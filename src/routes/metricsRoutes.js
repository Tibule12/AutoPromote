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

// New: business config + revenue projection endpoints
router.get('/business-config', async (req, res) => {
  try {
    const { getPlans } = require('../services/planService');
    const plans = getPlans();
    const out = {
      revenue_per_million: parseInt(process.env.REVENUE_PER_MILLION || '3000', 10),
      creator_payout_rate: parseFloat(process.env.CREATOR_PAYOUT_RATE || '0.05'),
      platform_fee_rate: parseFloat(process.env.PLATFORM_FEE_RATE || '0.10'),
      daily_target_views: parseInt(process.env.DAILY_TARGET_VIEWS || '200000', 10),
      auto_remove_days: parseInt(process.env.AUTO_REMOVE_DAYS || '2', 10),
      plans
    };
    return res.json({ ok: true, business: out, generatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/revenue/projection', authMiddleware, async (req, res) => {
  try {
    const windowDays = Math.min(parseInt(req.query.days || '30', 10), 90);
    const since = Date.now() - windowDays * 86400000;
    const { getPlans } = require('../services/planService');
    const plans = getPlans();
    // Pull recent events (cap 5000) - for MVP sampling
    const snap = await db.collection('events')
      .orderBy('createdAt','desc')
      .limit(5000)
      .get().catch(()=>({ empty: true, docs: [] }));
    const events = [];
    snap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || '') || 0;
      if (ts >= since) events.push(v);
    });
    // Basic aggregation
    const usersActive = new Set(events.filter(e=>e.userId).map(e=>e.userId));
    // Fetch paid user count (best effort) - users collection where plan.tier != 'free'
    let paidUsers = 0;
    try {
      const paidSnap = await db.collection('users').where('plan.tier','!=','free').limit(500).get();
      paidUsers = paidSnap.size;
    } catch(_) { /* ignore (index may be missing) */ }
    const ARPPU = parseFloat(process.env.MODEL_ARPPU || '32');
    const subscriptionMRR = paidUsers * ARPPU;
    const taskEvents = events.filter(e=>e.type === 'platform_post_enqueued');
    // Simulate overage: assume each user free quota 15 tasks
    const tasksPerUser = {};
    taskEvents.forEach(t => { tasksPerUser[t.userId] = (tasksPerUser[t.userId]||0)+1; });
    let excessTasks = 0; const FREE = 15;
    Object.values(tasksPerUser).forEach(ct => { if (ct>FREE) excessTasks += (ct-FREE); });
    const taskFee = parseFloat(process.env.TASK_FEE || '0.15');
    const promotionMRR = excessTasks * taskFee * (30 / windowDays); // scale to monthly
    // AI events placeholder (none yet) -> zero
    const aiMRR = 0;
    // Landing page estimate (if we had visits) -> simulate using content uploads * factor
    const uploadEvents = events.filter(e=>e.type==='content_uploaded');
    const landingVisits = uploadEvents.length * parseInt(process.env.MODEL_VISITS_PER_UPLOAD || '20',10);
    const rpm = parseFloat(process.env.MODEL_LANDING_RPM || '4');
    const landingRevenue = (landingVisits/1000)*rpm;
    const addonsMRR = 0; // future
    const grossMRR = subscriptionMRR + promotionMRR + aiMRR + landingRevenue + addonsMRR;
    const procCost = grossMRR * 0.03 + (paidUsers * 0.30);
    const infraPerPaid = parseFloat(process.env.MODEL_INFRA_PER_PAID || '2');
    const infraCost = paidUsers * infraPerPaid;
    const netMRR = grossMRR - procCost - infraCost;
    return res.json({
      ok: true,
      window_days: windowDays,
      users: { active: usersActive.size, paid: paidUsers },
      mrr_breakdown: {
        subscription: subscriptionMRR,
        promotion_overage: promotionMRR,
        ai: aiMRR,
        landing: landingRevenue,
        addons: addonsMRR
      },
      gross_mrr: grossMRR,
      costs: { processing: procCost, infra: infraCost },
      net_mrr: netMRR,
      assumptions: {
        task_fee: taskFee,
        free_task_quota: FREE,
        arppu: ARPPU,
        landing_rpm: rpm
      },
      sample: { events: events.length, uploads: uploadEvents.length, tasks_enqueued: taskEvents.length, excess_tasks: excessTasks },
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// Landing page view tracker (public, lightweight). Accepts contentId (optional) & path.
router.post('/landing/track', async (req, res) => {
  try {
    const { contentId, path } = req.body || {};
    const referer = req.get('referer') || null;
    const ua = req.get('user-agent') || null;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    // Attribution parse (if path includes ?src=...)
    let src = null, cId = contentId || null;
    if (path && path.includes('?')) {
      try {
        const q = path.split('?')[1];
        const params = new URLSearchParams(q);
        src = params.get('src');
        const contentParam = params.get('c');
        if (contentParam && !cId) cId = contentParam;
      } catch(_) { }
    }
    const doc = {
      type: 'landing_view',
      contentId: cId,
      path: path || '/',
      src: src || null,
      referer,
      ua: ua ? ua.slice(0,200) : null,
      ipHash: ip ? require('crypto').createHash('sha256').update(ip).digest('hex').slice(0,16) : null,
      createdAt: new Date().toISOString()
    };
    await db.collection('events').add(doc);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// Funnel attribution summary: aggregates recent landing_view events and platform_posts
router.get('/funnel/summary', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || '7',10), 30);
    const since = Date.now() - days * 86400000;
    const landingSnap = await db.collection('events')
      .where('type','==','landing_view')
      .orderBy('createdAt','desc')
      .limit(3000)
      .get().catch(()=>({ empty: true, docs: [] }));
    const views = [];
    landingSnap.docs.forEach(d => { const v = d.data(); const ts = Date.parse(v.createdAt||'') || 0; if (ts >= since) views.push(v); });
    const bySrc = {}; const byContent = {};
    views.forEach(v => {
      if (v.src) bySrc[v.src] = (bySrc[v.src]||0)+1;
      if (v.contentId) byContent[v.contentId] = (byContent[v.contentId]||0)+1;
    });
    // Top posts join attempt: fetch platform_posts for recent contentIds (sample)
    const contentIds = Object.keys(byContent).slice(0, 25);
    const posts = [];
    for (const cid of contentIds) {
      try {
        const snap = await db.collection('platform_posts').where('contentId','==', cid).limit(10).get();
        snap.forEach(p => { const d = p.data(); posts.push({ id: p.id, platform: d.platform, contentId: d.contentId, success: d.success, trackedLink: d.trackedLink || null }); });
      } catch(_){}
    }
    return res.json({ ok: true, window_days: days, totals: { views: views.length }, bySrc, byContentSample: byContent, samplePosts: posts });
  } catch (e) { return res.status(500).json({ ok:false, error: e.message }); }
});

// Variant performance summary (counts of usedVariant occurrences per platform/content)
router.get('/variants/summary', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '500',10), 2000);
    const snap = await db.collection('platform_posts')
      .orderBy('createdAt','desc')
      .limit(limit)
      .get().catch(()=>({ empty: true, docs: [] }));
    const variantCounts = {};
    snap.docs.forEach(d => {
      const v = d.data();
        const variant = v.usedVariant || (v.rawOutcome && v.rawOutcome.usedVariant) || null;
      if (!variant) return;
      const key = `${v.platform}|${v.contentId}`;
      if (!variantCounts[key]) variantCounts[key] = { platform: v.platform, contentId: v.contentId, variants: {} };
        const bucket = variantCounts[key];
        bucket.variants[variant] = (bucket.variants[variant]||0) + 1;
        if (typeof v.variantIndex === 'number') {
          bucket.variantIndexes = bucket.variantIndexes || {};
          bucket.variantIndexes[v.variantIndex] = (bucket.variantIndexes[v.variantIndex]||0)+1;
        }
    });
    return res.json({ ok: true, groups: Object.values(variantCounts), sampled: snap.docs.length });
  } catch (e) { return res.status(500).json({ ok:false, error: e.message }); }
});

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
