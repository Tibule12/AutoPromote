// variantStatsService.js - materialized per-content variant stats for faster bandit decisions & reporting
// Collection: variant_stats (docId = contentId)
// Schema: { contentId, platforms: { [platform]: { variants: [{ value, posts, clicks, impressions, decayedClicks, decayedPosts, lastPostAt, anomaly, suppressed, lastDecayAt }], updatedAt } }, updatedAt }
// Supports exponential decay to emphasize recent performance.

const { db, admin } = require('../firebaseAdmin');

const HALF_LIFE_MIN = parseFloat(process.env.VARIANT_DECAY_HALF_LIFE_MIN || '720'); // 12h default
const LN2 = Math.log(2);

function applyDecay(prevValue, minutesElapsed) {
  if (!prevValue || !minutesElapsed || minutesElapsed <= 0) return prevValue || 0;
  const decayFactor = Math.exp(-LN2 * (minutesElapsed / HALF_LIFE_MIN));
  return prevValue * decayFactor;
}

const SUPPRESSION_MIN_POSTS = parseInt(process.env.SUPPRESSION_MIN_POSTS || '5',10);
const ENABLE_VARIANT_SUPPRESSION = process.env.ENABLE_VARIANT_SUPPRESSION === 'true';
const ANOMALY_CTR_SPIKE_FACTOR = parseFloat(process.env.ANOMALY_CTR_SPIKE_FACTOR || '4');
const ANOMALY_MIN_POSTS = parseInt(process.env.ANOMALY_MIN_POSTS || '3',10);

async function updateVariantStats({ contentId, platform, variant, clicksDelta = 0, impressionsDelta = 0 }) {
  if (!contentId || !platform || typeof variant !== 'string') return;
  const ref = db.collection('variant_stats').doc(contentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    let data = snap.exists ? snap.data() : { contentId, platforms: {}, updatedAt: now };
    if (!data.platforms[platform]) data.platforms[platform] = { variants: [], updatedAt: now };
    const arr = data.platforms[platform].variants;
    let row = arr.find(v => v.value === variant);
    const nowMs = Date.now();
  if (!row) { row = { value: variant, posts: 0, clicks: 0, impressions: 0, decayedClicks: 0, decayedPosts: 0, lastDecayAt: nowMs, lastPostAt: null, anomaly: false, suppressed: false, suppressedAt: null, quarantined: false, qualityScore: null }; arr.push(row); }
    const lastDecayAt = row.lastDecayAt || nowMs;
    const minutesElapsed = (nowMs - lastDecayAt) / 60000;
    // Apply decay to decayed metrics
    row.decayedClicks = applyDecay(row.decayedClicks, minutesElapsed);
    row.decayedPosts = applyDecay(row.decayedPosts, minutesElapsed);
    // Increment
    row.posts += 1;
    row.clicks += clicksDelta;
    row.impressions = (row.impressions || 0) + impressionsDelta;
    row.decayedPosts += 1;
    row.decayedClicks += clicksDelta;
    row.lastPostAt = now;
    row.lastDecayAt = nowMs;
    // Derive decayed CTR
    const variantCtr = row.decayedPosts > 0 ? (row.decayedClicks / row.decayedPosts) : 0;
    // Compute median CTR across variants (decayed)
    const ctrs = arr.map(v => v.decayedPosts > 0 ? (v.decayedClicks / v.decayedPosts) : 0).filter(n => !Number.isNaN(n)).sort((a,b)=>a-b);
    const medianCtr = ctrs.length ? ctrs[Math.floor(ctrs.length/2)] : 0;
    // Anomaly detection (spike)
    if (variantCtr > 0 && medianCtr > 0 && variantCtr >= medianCtr * ANOMALY_CTR_SPIKE_FACTOR && row.decayedPosts >= ANOMALY_MIN_POSTS) {
      row.anomaly = true;
      if (process.env.ENABLE_VARIANT_QUARANTINE === 'true') { row.quarantined = true; }
    }
    // Suppression logic
    if (ENABLE_VARIANT_SUPPRESSION && !row.suppressed && row.posts >= SUPPRESSION_MIN_POSTS) {
      const baseline = parseFloat(process.env.BASELINE_CTR_TARGET || '0.03');
      if (variantCtr < baseline * 0.6) { row.suppressed = true; row.suppressedAt = Date.now(); }
    }
    data.platforms[platform].updatedAt = now;
    data.updatedAt = now;
    tx.set(ref, data, { merge: true });
  });
}

async function applyClickAttribution({ contentId, platform, variant, clicks = 1 }) {
  if (!contentId || !platform || typeof variant !== 'string') return;
  const ref = db.collection('variant_stats').doc(contentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return; // only update existing stats after at least one post
    const data = snap.data();
    const p = data.platforms && data.platforms[platform];
    if (!p) return;
    const row = p.variants.find(v => v.value === variant);
    if (!row) return;
    const nowMs = Date.now();
    const minutesElapsed = row.lastDecayAt ? (nowMs - row.lastDecayAt)/60000 : 0;
    row.decayedClicks = applyDecay(row.decayedClicks || 0, minutesElapsed) + clicks;
    row.decayedPosts = applyDecay(row.decayedPosts || 0, minutesElapsed);
    row.lastDecayAt = nowMs;
    row.clicks += clicks;
    // Recompute anomaly / suppression quickly (lighter version)
    const variantCtr = row.decayedPosts > 0 ? (row.decayedClicks / row.decayedPosts) : 0;
    if (row.decayedPosts >= ANOMALY_MIN_POSTS && variantCtr > 0) {
      // need median again
      const p = data.platforms[platform];
      const ctrs = p.variants.map(v => v.decayedPosts > 0 ? (v.decayedClicks / v.decayedPosts) : 0).filter(n=>!Number.isNaN(n)).sort((a,b)=>a-b);
      const medianCtr = ctrs.length ? ctrs[Math.floor(ctrs.length/2)] : 0;
      if (medianCtr > 0 && variantCtr >= medianCtr * ANOMALY_CTR_SPIKE_FACTOR) { row.anomaly = true; if (process.env.ENABLE_VARIANT_QUARANTINE === 'true') row.quarantined = true; }
    }
    if (ENABLE_VARIANT_SUPPRESSION && !row.suppressed && row.posts >= SUPPRESSION_MIN_POSTS) {
      const baseline = parseFloat(process.env.BASELINE_CTR_TARGET || '0.03');
      if (variantCtr < baseline * 0.6) { row.suppressed = true; row.suppressedAt = Date.now(); }
    }
    tx.set(ref, data, { merge: true });
  });
}

async function getVariantStats(contentId) {
  const snap = await db.collection('variant_stats').doc(contentId).get();
  return snap.exists ? snap.data() : null;
}

async function addImpressions({ contentId, platform, variant, impressions }) {
  if (!contentId || !platform || typeof variant !== 'string' || !impressions) return;
  const ref = db.collection('variant_stats').doc(contentId);
  await db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref); if(!snap.exists) return;
    const data = snap.data(); const plat = data.platforms && data.platforms[platform]; if (!plat) return;
    const row = plat.variants.find(v=> v.value === variant); if (!row) return;
    row.impressions = (row.impressions||0) + impressions;
    tx.set(ref, data, { merge:true });
  });
}

module.exports = { updateVariantStats, applyClickAttribution, getVariantStats, addImpressions };