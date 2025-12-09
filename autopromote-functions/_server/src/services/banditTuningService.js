// banditTuningService.js - adjusts BANDIT weights based on recent variant selection outcomes
// Stores rolling performance windows and updates system_config.global.banditWeights
const { db } = require('../firebaseAdmin');
const { updateConfig, getConfig } = require('./configService');

const COLLECTION = 'bandit_selection_metrics';
const WINDOW_MINUTES = parseInt(process.env.BANDIT_TUNER_WINDOW_MIN || '180', 10); // 3h default
const MIN_EVENTS = parseInt(process.env.BANDIT_TUNER_MIN_EVENTS || '50', 10);
const LEARNING_RATE = parseFloat(process.env.BANDIT_TUNER_LR || '0.05');
const TARGET_EXPLORATION = parseFloat(process.env.BANDIT_TUNER_TARGET_EXPLORATION || '0.25');
const ROLLBACK_DROP_PCT = parseFloat(process.env.BANDIT_TUNER_ROLLBACK_PCT || '0.25'); // 25% avg CTR drop
const ROLLBACK_LOOKBACK_MIN = parseInt(process.env.BANDIT_TUNER_ROLLBACK_LOOKBACK_MIN || '60',10);

async function recentCtrAverage(minutes) {
  const sinceIso = new Date(Date.now() - minutes*60000).toISOString();
  const snap = await db.collection(COLLECTION)
    .where('at','>=', sinceIso)
    .orderBy('at','desc')
    .limit(300)
    .get().catch(()=>({ empty:true, docs:[] }));
  if (snap.empty) return null;
  let sum=0,n=0; snap.docs.forEach(d=>{ const v=d.data(); if (typeof v.rewardCtr==='number' && v.rewardCtr>=0) { sum+=v.rewardCtr; n++; } });
  return n? sum/n : null;
}

// reward schema: { at, contentId, platform, variant, rewardCtr, rewardQuality, rewardReach }
async function recordSelectionOutcome({ contentId, platform, variant, rewardCtr, rewardQuality, rewardReach }) {
  try {
    await db.collection(COLLECTION).add({
      contentId, platform, variant,
      rewardCtr: typeof rewardCtr === 'number' ? rewardCtr : 0,
      rewardQuality: typeof rewardQuality === 'number' ? rewardQuality : 0,
      rewardReach: typeof rewardReach === 'number' ? rewardReach : 0,
      at: new Date().toISOString()
    });
  } catch (_) {}
}

async function computeSuggestedWeights() {
  const sinceIso = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
  const snap = await db.collection(COLLECTION)
    .where('at','>=', sinceIso)
    .orderBy('at','desc')
    .limit(500)
    .get().catch(()=>({ empty:true, docs:[] }));
  if (snap.empty || snap.size < MIN_EVENTS) return null;
  let sumCtr=0, sumQual=0, sumReach=0, n=0;
  const rewards=[];
  snap.docs.forEach(d => { const v=d.data();
    const rc = v.rewardCtr||0, rq=v.rewardQuality||0, rr=v.rewardReach||0;
    sumCtr+=rc; sumQual+=rq; sumReach+=rr; n++; rewards.push({ rc, rq, rr });
  });
  if (!n) return null;
  // Basic averages
  const avgCtr = sumCtr / n;
  const avgQual = sumQual / n;
  const avgReach = sumReach / n;
  // Optional z-score normalization (scales) - placeholder reading config
  let method = 'raw';
  try { const cfg = await getConfig(); if (cfg.rewardNormalization && cfg.rewardNormalization.method) method = cfg.rewardNormalization.method; } catch(_){ }
  let wCtrRaw=avgCtr, wQualRaw=avgQual, wReachRaw=avgReach;
  if (method === 'zscore') {
    const std = (vals, mean) => { const v = vals.reduce((a,b)=> a + Math.pow(b-mean,2),0)/ (vals.length||1); return Math.sqrt(v)||1; };
    const ctrVals = rewards.map(r=>r.rc); const qualVals = rewards.map(r=>r.rq); const reachVals = rewards.map(r=>r.rr);
    const ctrStd = std(ctrVals, avgCtr); const qualStd = std(qualVals, avgQual); const reachStd = std(reachVals, avgReach);
    wCtrRaw = avgCtr/ctrStd; wQualRaw = avgQual/qualStd; wReachRaw = avgReach/reachStd;
  }
  const total = wCtrRaw + wQualRaw + wReachRaw || 1;
  let wCtr = wCtrRaw/total, wQual = wQualRaw/total, wReach = wReachRaw/total;
  // Soft regularization: keep within [0.05,0.85]
  function clamp(v){ return Math.min(0.85, Math.max(0.05, v)); }
  wCtr = clamp(wCtr); wQual = clamp(wQual); wReach = clamp(wReach);
  // Renormalize after clamp
  const renorm = wCtr + wQual + wReach; wCtr/=renorm; wQual/=renorm; wReach/=renorm;
  return { wCtr, wQual, wReach, sample: n, windowMinutes: WINDOW_MINUTES, avgCtr, avgQual, avgReach, method };
}

async function applyAutoTune() {
  const suggestion = await computeSuggestedWeights();
  if (!suggestion) return { updated:false };
  try {
    const current = await getConfig();
    const prev = current.banditWeights || {}; // { ctr, reach, quality }
    // Smooth update with learning rate
    const newWeights = {
      ctr: (prev.ctr ?? parseFloat(process.env.BANDIT_WEIGHT_CTR || '0.6'))*(1-LEARNING_RATE) + suggestion.wCtr*LEARNING_RATE,
      reach: (prev.reach ?? parseFloat(process.env.BANDIT_WEIGHT_REACH || '0.25'))*(1-LEARNING_RATE) + suggestion.wReach*LEARNING_RATE,
      quality: (prev.quality ?? parseFloat(process.env.BANDIT_WEIGHT_QUALITY || '0.15'))*(1-LEARNING_RATE) + suggestion.wQual*LEARNING_RATE
    };
    const sum = newWeights.ctr + newWeights.reach + newWeights.quality || 1;
    newWeights.ctr/=sum; newWeights.reach/=sum; newWeights.quality/=sum;
    const updatedAt = new Date().toISOString();
    await updateConfig({ banditWeights: { ...newWeights, meta: suggestion, updatedAt } });
    try {
      await db.collection('bandit_weight_history').add({
        at: updatedAt,
        prev: { ctr: prev.ctr, reach: prev.reach, quality: prev.quality },
        next: newWeights,
        meta: suggestion
      });
    } catch(_){ }
    // Rollback guard: compare last window vs previous window of equal length
    try {
      const currentAvg = await recentCtrAverage(WINDOW_MINUTES/2);
      const priorAvg = await recentCtrAverage(WINDOW_MINUTES + ROLLBACK_LOOKBACK_MIN);
      if (currentAvg != null && priorAvg != null && priorAvg>0) {
        const drop = (priorAvg - currentAvg)/priorAvg;
        if (drop >= ROLLBACK_DROP_PCT) {
          // Roll back to previous weights
            await updateConfig({ banditWeights: { ctr: prev.ctr, reach: prev.reach, quality: prev.quality, rolledBackAt: new Date().toISOString(), reason: 'ctr_drop', dropPct: drop } });
            const rollbackAt = new Date().toISOString();
            try { await db.collection('bandit_weight_history').add({ at: rollbackAt, rollback:true, dropPct:drop, restored: prev }); } catch(_){ }
            try { const { recordRollbackAlert } = require('./alertingService'); recordRollbackAlert({ reason:'ctr_drop', dropPct:drop, manual:false }); } catch(_){ }
            return { updated:true, rolledBack:true, dropPct: drop, newWeights: prev, suggestion };
        }
      }
    } catch(_){ }
    return { updated:true, newWeights, suggestion };
  } catch (e) { return { updated:false, error:e.message }; }
}

module.exports = { recordSelectionOutcome, applyAutoTune, computeSuggestedWeights };