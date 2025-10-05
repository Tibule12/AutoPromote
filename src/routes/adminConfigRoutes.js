const express = require('express');
const router = express.Router();
const { updateConfig, getConfig } = require('../services/configService');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_){ authMiddleware = (req,res,next)=>next(); }
const adminOnly = require('../middlewares/adminOnly');
const { db } = require('../firebaseAdmin');

router.get('/', authMiddleware, adminOnly, async (_req,res)=>{
  try { const cfg = await getConfig(); return res.json({ ok:true, config: cfg }); } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

router.get('/weight-history', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const limit = Math.min(parseInt(req.query.limit || '50',10), 200);
    const snap = await require('../firebaseAdmin').db.collection('bandit_weight_history').orderBy('at','desc').limit(limit).get();
    const history = snap.docs.map(d=> d.data());
    return res.json({ ok:true, history });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

router.post('/update', authMiddleware, adminOnly, async (req,res)=>{
  try {
    const patch = req.body || {};
    // Whitelist fields to prevent arbitrary doc pollution
    const allowed = [
      'banditWeights',
      'banditExplorationTarget',
      'banditExplorationTolerance',
      'banditExplorationFactor',
      'rewardNormalization', // { method:'zscore'|'percentile', window: N }
      'penaltyScaling',      // { suppressed: number, quarantined: number }
      'rollback',            // { ctrDropPct, minObservations }
      'alerting'             // { webhookUrl, enabledEvents: [] }
    ];
    const filtered = {};
    allowed.forEach(k => { if (patch[k] !== undefined) filtered[k] = patch[k]; });
    if (Object.keys(filtered).length === 0) return res.status(400).json({ ok:false, error:'no_valid_fields' });
    const updated = await updateConfig(filtered);
    try { await db.collection('admin_logs').add({ type:'config_update', by: req.userId||'unknown', patch: filtered, at: new Date().toISOString() }); } catch(_){ }
    return res.json({ ok:true, config: updated });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;