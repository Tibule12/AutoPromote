const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const router = express.Router();

// GET /api/admin/variants/strategy-stats
router.get('/strategy-stats', authMiddleware, adminOnly, async (_req,res)=>{
  try {
    const snap = await db.collection('content').orderBy('created_at','desc').limit(1000).get();
    const counts = { rotation:0, bandit:0, unspecified:0 };
    snap.forEach(d=>{
      const v = d.data().variant_strategy;
      if (!v) counts.unspecified++; else if (String(v).toLowerCase()==='bandit') counts.bandit++; else counts.rotation++;
    });
    return res.json({ ok:true, sample: snap.size, counts });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/admin/variants/stats/:contentId - detailed variant performance (materialized)
router.get('/stats/:contentId', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const { contentId } = req.params;
    const { getVariantStats } = require('../services/variantStatsService');
    const stats = await getVariantStats(contentId);
    if (!stats) return res.status(404).json({ ok:false, error:'not_found' });
    return res.json({ ok:true, stats });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/admin/variants/exploration-ratio?days=7
router.get('/exploration-ratio', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const days = parseInt(req.query.days || '7',10);
    const since = Date.now() - days*86400000;
    const snap = await db.collection('events')
      .where('type','==','variant_selection')
      .orderBy('at','desc')
      .limit(5000)
      .get().catch(()=>({ empty:true, docs:[] }));
    let exploration=0, total=0;
    snap.docs.forEach(d=>{ const v=d.data(); const ts = Date.parse(v.at||''); if (!ts || ts < since) return; total++; if (v.exploration) exploration++; });
    return res.json({ ok:true, windowDays: days, exploration, total, ratio: total? exploration/total:0 });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/admin/variants/optimization/:contentId?platform=twitter
router.get('/optimization/:contentId', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const { contentId } = req.params; const platform = req.query.platform || 'generic';
    const uid = req.userId || null;
    const { computeOptimizationProfile } = require('../services/promotionOptimizerService');
    const profile = await computeOptimizationProfile({ contentId, platform, uid });
    // Attach suppression/anomaly view if stats exist
    try {
      const { getVariantStats } = require('../services/variantStatsService');
      const vs = await getVariantStats(contentId);
      if (vs && vs.platforms && vs.platforms[platform]) {
        profile.variants = vs.platforms[platform].variants.map(v => ({ value: v.value, posts: v.posts, clicks: v.clicks, suppressed: !!v.suppressed, anomaly: !!v.anomaly, quarantined: !!v.quarantined, decayedCtr: v.decayedPosts ? (v.decayedClicks / v.decayedPosts) : null }));
      }
    } catch(_){}
    return res.json({ ok:true, profile });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
