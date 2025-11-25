const express = require('express');
const router = express.Router();
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const adminOnly = require('../middlewares/adminOnly');
const { getConfig, updateConfig } = require('../services/configService');
const { db } = require('../firebaseAdmin');

// Utility: normalize weights so they sum to 1 and remain within soft bounds
function normalizeWeights(w) {
  let { ctr, reach, quality } = w;
  if ([ctr,reach,quality].some(v=> typeof v !== 'number' || isNaN(v) || v <= 0)) throw new Error('invalid_weights');
  const sum = ctr + reach + quality;
  ctr/=sum; reach/=sum; quality/=sum;
  // Soft clamp 0.02..0.9 then renormalize
  function clamp(v){ return Math.min(0.9, Math.max(0.02, v)); }
  ctr = clamp(ctr); reach = clamp(reach); quality = clamp(quality);
  const rs = ctr + reach + quality; ctr/=rs; reach/=rs; quality/=rs;
  return { ctr, reach, quality };
}

// GET /api/admin/bandit/status - current weights + recent history
router.get('/status', authMiddleware, adminOnly, async (_req,res)=>{
  try {
    const cfg = await getConfig();
    const snap = await db.collection('bandit_weight_history').orderBy('at','desc').limit(25).get();
    const history = snap.docs.map(d=> d.data());
    return res.json({ ok:true, current: cfg.banditWeights || null, history });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/admin/bandit/rollback
// Body options:
// { strategy: 'previous' | 'custom' | 'revision', targetWeights?: {ctr,reach,quality}, targetRevisionAt?: iso, reason?: string }
router.post('/rollback', authMiddleware, adminOnly, async (req,res)=>{
  const { strategy='previous', targetWeights, targetRevisionAt, reason='manual' } = req.body || {};
  try {
    const cfg = await getConfig();
    const current = cfg.banditWeights || null;
    if (!current) return res.status(400).json({ ok:false, error:'no_current_weights' });

    let target = null;
    if (strategy === 'custom') {
      if (!targetWeights) return res.status(400).json({ ok:false, error:'missing_target_weights' });
      target = normalizeWeights(targetWeights);
    } else {
      // Fetch history
      const hSnap = await db.collection('bandit_weight_history').orderBy('at','desc').limit(50).get();
      const rows = hSnap.docs.map(d=> d.data());
      if (strategy === 'revision') {
        if (!targetRevisionAt) return res.status(400).json({ ok:false, error:'missing_targetRevisionAt' });
        const match = rows.find(r=> r.at === targetRevisionAt);
        if (!match) return res.status(404).json({ ok:false, error:'revision_not_found' });
        // Use prev if available, else restored or next
        target = match.prev || match.restored || match.next || null;
      } else { // previous
        // previous stable = most recent entry with prev & next (a tuning commit)
        for (const r of rows) {
          if (r.prev && r.next && !r.rollbackApplied && !r.rollback) { target = r.prev; break; }
        }
      }
      if (!target) return res.status(400).json({ ok:false, error:'no_previous_found' });
      target = normalizeWeights(target);
    }

    // Apply rollback
    const updated = await updateConfig({ banditWeights: { ...target, rolledBackAt: new Date().toISOString(), manual:true, manualReason: reason, from: current } });
    const historyDoc = {
      at: new Date().toISOString(),
      rollbackApplied: true,
      rollbackReason: reason,
      manual: true,
      restored: target,
      from: current,
      strategy,
    };
    try { await db.collection('bandit_weight_history').add(historyDoc); } catch(_){ }
    try { await db.collection('events').add({ type:'bandit_manual_rollback', at: historyDoc.at, reason, from: current, to: target, strategy }); } catch(_){ }
    try { const { recordRollbackAlert } = require('../services/alertingService'); recordRollbackAlert({ reason, manual:true }); } catch(_){ }
    return res.json({ ok:true, restored: target, strategy, reason, config: updated });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;