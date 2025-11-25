const express = require('express');
const router = express.Router();
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const { db } = require('../firebaseAdmin');

// Helper: compute exploration ratio from recent bandit selection metrics
async function getExplorationStats(limit = 300) {
  try {
    const snap = await db.collection('bandit_selection_metrics').orderBy('at','desc').limit(limit).get();
    if (snap.empty) return { ratio: null, total: 0, explored: 0 };
    let explored = 0, total = 0;
    snap.forEach(d => { const v = d.data()||{}; total++; if (v.exploration) explored++; });
    return { ratio: total? explored/total : 0, total, explored };
  } catch(e) {
    return { error: e.message, ratio: null, total: 0, explored: 0 };
  }
}

// Helper: summarize latest bandit weight history
async function getRecentWeightHistory(limit = 20) {
  try {
    const snap = await db.collection('bandit_weight_history').orderBy('at','desc').limit(limit).get();
    const rows = snap.docs.map(d=> d.data());
    return rows;
  } catch(e){ return []; }
}

// Helper: anomaly & quarantine counts + sample
async function getVariantGovernanceSummary(limitDocs = 120) {
  const snap = await db.collection('variant_stats').orderBy('updatedAt','desc').limit(limitDocs).get();
  let anomalyCount=0, quarantinedCount=0, suppressedCount=0, sample=[];
  snap.forEach(d => {
    const v = d.data();
    if (!v.platforms) return;
    Object.entries(v.platforms).forEach(([platform, pdata]) => {
      (pdata.variants || []).forEach(row => {
        if (row.anomaly) anomalyCount++;
        if (row.quarantined) quarantinedCount++;
        if (row.suppressed) suppressedCount++;
        if ((row.anomaly || row.quarantined) && sample.length < 25) {
          const decayedCtr = row.decayedPosts ? (row.decayedClicks / row.decayedPosts) : null;
          sample.push({ contentId: d.id, platform, variant: row.value, decayedCtr, posts: row.posts, clicks: row.clicks, suppressed: !!row.suppressed, quarantined: !!row.quarantined });
        }
      });
    });
  });
  return { anomalyCount, quarantinedCount, suppressedCount, sample };
}

// Helper: estimate diversity (# unique active variants / total variants considered)
async function getVariantDiversity(limitDocs = 150) {
  const snap = await db.collection('variant_stats').orderBy('updatedAt','desc').limit(limitDocs).get();
  let activeSet = new Set();
  let total = 0;
  snap.forEach(d => {
    const v = d.data();
    if (!v.platforms) return;
    Object.values(v.platforms).forEach(pdata => {
      (pdata.variants||[]).forEach(row => {
        total++;
        if (!row.suppressed && !row.quarantined) activeSet.add(row.value);
      });
    });
  });
  const activeUnique = activeSet.size;
  return { activeUnique, totalVariants: total, diversityRatio: total ? activeUnique/total : null };
}

// GET /api/admin/dashboard/overview
router.get('/overview', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const [explore, weights, gov, diversity] = await Promise.all([
      getExplorationStats(),
      getRecentWeightHistory(),
      getVariantGovernanceSummary(),
      getVariantDiversity()
    ]);

    // Derive recent weight trend (delta vs previous)
    let weightTrend = null;
    if (weights.length >= 2) {
      const curr = weights[0];
      const prev = weights[1];
      if (curr && prev && curr.weights && prev.weights) {
        weightTrend = Object.keys(curr.weights).reduce((acc,k)=>{
          acc[k] = { current: curr.weights[k], prev: prev.weights[k], delta: (curr.weights[k] - prev.weights[k]) };
          return acc;
        }, {});
      }
    }

    // Placeholder for rollback detection (mark entries where rolledBack flag or note exists)
  const rollbacks = weights.filter(w => w.rollbackApplied || w.rollback).map(w => ({ at: w.at, reason: w.rollbackReason || w.reason || (w.rollback?'auto':'unknown'), restored: w.restored || w.prev || null }));

    return res.json({ ok:true, generatedAt: new Date().toISOString(), exploration: explore, weightHistoryCount: weights.length, latestWeights: weights[0]||null, weightTrend, governance: gov, diversity, rollbacks });
  } catch(e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// GET /api/admin/dashboard/weights/raw - full recent weight history (limited)
router.get('/weights/raw', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const limit = Math.min(parseInt(req.query.limit || '100',10), 300);
    const snap = await db.collection('bandit_weight_history').orderBy('at','desc').limit(limit).get();
    return res.json({ ok:true, history: snap.docs.map(d=> d.data()) });
  } catch(e){ return res.status(500).json({ ok:false, error: e.message }); }
});

// GET /api/admin/dashboard/exploration - explicit exploration stats
router.get('/exploration', authMiddleware, adminOnly, async (req,res)=>{
  const stats = await getExplorationStats();
  return res.json({ ok:true, ...stats });
});

// GET /api/admin/dashboard/governance - anomaly/quarantine summary only
router.get('/governance', authMiddleware, adminOnly, async (req,res)=>{
  try { const gov = await getVariantGovernanceSummary(); return res.json({ ok:true, ...gov }); } catch(e){ return res.status(500).json({ ok:false, error: e.message }); }
});

// GET /api/admin/dashboard/diversity
router.get('/diversity', authMiddleware, adminOnly, async (req,res)=>{
  try { const d = await getVariantDiversity(); return res.json({ ok:true, ...d }); } catch(e){ return res.status(500).json({ ok:false, error: e.message }); }
});

module.exports = router;