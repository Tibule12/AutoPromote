// explorationControllerService.js
// Dynamically adjusts exploration factor to maintain target exploration ratio.
// Uses events collection (type='variant_selection', exploration boolean) over recent window.

const { db } = require('../firebaseAdmin');
const { updateConfig, getConfig } = require('./configService');

async function computeExplorationRatio({ minutes = 180 } = {}) {
  const since = Date.now() - minutes * 60000;
  const sinceIso = new Date(since).toISOString();
  const snap = await db.collection('events')
    .where('type','==','variant_selection')
    .where('at','>=', sinceIso)
    .orderBy('at','desc')
    .limit(5000)
    .get().catch(()=>({ empty:true, docs:[] }));
  if (snap.empty) return { exploration:0, total:0, ratio:0 };
  let exploration = 0, total = 0;
  snap.docs.forEach(d=>{ const v=d.data(); total++; if (v.exploration) exploration++; });
  return { exploration, total, ratio: total? exploration/total:0 };
}

async function adjustExplorationFactor() {
  const cfg = await getConfig();
  const target = cfg.banditExplorationTarget ?? parseFloat(process.env.BANDIT_EXPLORATION_TARGET || '0.25');
  const tolerance = cfg.banditExplorationTolerance ?? 0.05; // ±5%
  const factor = cfg.banditExplorationFactor ?? 1.0;
  const { ratio } = await computeExplorationRatio({ minutes: cfg.banditExplorationWindowMin || 180 });
  let newFactor = factor;
  if (ratio < target - tolerance) {
    newFactor = Math.min(factor * 1.10, 3.0); // increase up to 3x
  } else if (ratio > target + tolerance) {
    newFactor = Math.max(factor * 0.90, 0.2); // decrease lower bound
  }
  if (Math.abs(newFactor - factor) > 0.02) {
    await updateConfig({ banditExplorationFactor: newFactor, banditExplorationLastAdjustment: new Date().toISOString(), banditExplorationObservedRatio: ratio });
    return { updated:true, newFactor, ratio, target };
  }
  return { updated:false, factor, ratio, target };
}

module.exports = { adjustExplorationFactor, computeExplorationRatio };