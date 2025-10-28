const express = require('express');
const router = express.Router();
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const { addImpressions } = require('../services/variantStatsService');

const variantAdminLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_VARIANT_ADMIN || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'variant_admin' });

// Helper to run a transactional mutation on a variant
async function mutateVariant({ contentId, platform, variant, mutator }) {
  const ref = db.collection('variant_stats').doc(contentId);
  await db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref); if(!snap.exists) throw new Error('not_found');
    const data = snap.data(); const plat = data.platforms && data.platforms[platform]; if(!plat) throw new Error('platform_not_found');
    const row = plat.variants.find(v=> v.value === variant); if(!row) throw new Error('variant_not_found');
    mutator(row);
    data.updatedAt = new Date(); plat.updatedAt = new Date();
    tx.set(ref, data, { merge:true });
  });
}

// GET /api/admin/variants/anomalies - list recent anomalous variants
router.get('/anomalies', authMiddleware, adminOnly, variantAdminLimiter, async (req,res)=>{
  try {
    const limit = Math.min(parseInt(req.query.limit || '300',10), 800);
    const snap = await db.collection('variant_stats').orderBy('updatedAt','desc').limit(limit).get();
    const anomalies = [];
    snap.forEach(d => {
      const v = d.data();
      const contentId = d.id;
      if (!v.platforms) return;
      Object.entries(v.platforms).forEach(([platform, pdata]) => {
        (pdata.variants||[]).forEach(row => {
          if (row.anomaly || row.quarantined) {
            const decayedCtr = row.decayedPosts ? (row.decayedClicks / row.decayedPosts) : null;
            anomalies.push({ contentId, platform, variant: row.value, posts: row.posts, clicks: row.clicks, decayedCtr, suppressed: !!row.suppressed, quarantined: !!row.quarantined });
          }
        });
      });
    });
    return res.json({ ok:true, anomalies, count: anomalies.length });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/variants/clear-anomaly { contentId, platform, variant }
router.post('/clear-anomaly', authMiddleware, adminOnly, variantAdminLimiter, async (req,res)=>{
  try {
    const { contentId, platform, variant } = req.body || {};
    if (!contentId || !platform || !variant) return res.status(400).json({ ok:false, error:'missing_params' });
    await mutateVariant({ contentId, platform, variant, mutator: row => { row.anomaly = false; } });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/variants/unsuppress { contentId, platform, variant }
router.post('/unsuppress', authMiddleware, adminOnly, variantAdminLimiter, async (req,res)=>{
  try {
    const { contentId, platform, variant } = req.body || {};
    if (!contentId || !platform || !variant) return res.status(400).json({ ok:false, error:'missing_params' });
    await mutateVariant({ contentId, platform, variant, mutator: row => { row.suppressed = false; row.suppressedAt = null; } });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/variants/impressions { contentId, platform, variant, impressions }
router.post('/impressions', authMiddleware, adminOnly, variantAdminLimiter, async (req,res)=>{
  try {
    const { contentId, platform, variant, impressions } = req.body || {};
    const n = parseInt(impressions,10);
    if (!contentId || !platform || !variant || !n || n <= 0) return res.status(400).json({ ok:false, error:'invalid_params' });
    await addImpressions({ contentId, platform, variant, impressions: n });
    return res.json({ ok:true, added: n });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
// POST /api/admin/variants/unquarantine { contentId, platform, variant }
router.post('/unquarantine', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const { contentId, platform, variant } = req.body || {}; if(!contentId||!platform||!variant) return res.status(400).json({ ok:false, error:'missing_params' });
    await mutateVariant({ contentId, platform, variant, mutator: row => { row.quarantined = false; } });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/variants/quarantine { contentId, platform, variant }
router.post('/quarantine', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const { contentId, platform, variant } = req.body || {}; if(!contentId||!platform||!variant) return res.status(400).json({ ok:false, error:'missing_params' });
    await mutateVariant({ contentId, platform, variant, mutator: row => { row.quarantined = true; } });
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});
