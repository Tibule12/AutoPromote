// promotionTaskQueue.js
// Phase 2: Simple Firestore-backed task queue for YouTube auto uploads

const { db } = require('../firebaseAdmin');
const { recordTaskCompletion, recordRateLimitEvent } = require('./aggregationService');
const { getCooldown, noteRateLimit } = require('./rateLimitTracker');
const { uploadVideo } = require('./youtubeService');

const MAX_ATTEMPTS = parseInt(process.env.TASK_MAX_ATTEMPTS || '5', 10);
const BASE_BACKOFF_MS = parseInt(process.env.TASK_BASE_BACKOFF_MS || '60000', 10); // 1 min default

function classifyError(message = '') {
  const m = message.toLowerCase();
  if (m.includes('quota') || m.includes('rate limit') || m.includes('too many requests') || m.includes('429')) return 'rate_limit';
  if (m.includes('timeout') || m.includes('network') || m.includes('fetch failed')) return 'transient';
  if (m.includes('auth') || m.includes('unauthorized') || m.includes('permission')) return 'auth';
  if (m.includes('not found')) return 'not_found';
  return 'generic';
}

function computeNextAttempt(attempts, classification) {
  // Exponential backoff with jitter, classification-based modifier
  const base = BASE_BACKOFF_MS * Math.pow(2, Math.min(attempts, 6));
  const classFactor = classification === 'rate_limit' ? 2 : classification === 'auth' ? 3 : 1;
  const jitter = Math.floor(Math.random() * (base * 0.3));
  return Date.now() + (base * classFactor) + jitter;
}

function canRetry(classification) {
  if (classification === 'auth') return false; // require manual intervention
  if (classification === 'not_found') return false; // likely unrecoverable for this resource
  return true;
}

async function enqueueYouTubeUploadTask({ contentId, uid, title, description, fileUrl, shortsMode }) {
  if (!contentId || !uid || !fileUrl) throw new Error('contentId, uid, fileUrl required');
  const ref = db.collection('promotion_tasks').doc();
  const baseTask = {
    type: 'youtube_upload',
    status: 'queued',
    contentId,
    uid,
    title: title || 'Untitled',
    description: description || '',
    fileUrl,
    shortsMode: !!shortsMode,
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let task = baseTask;
  try { const { attachSignature } = require('../utils/docSigner'); task = attachSignature(baseTask); } catch(_){ }
  await ref.set(task);
  return { id: ref.id, ...task };
}

async function processNextYouTubeTask() {
  // Fetch one queued task (simple FIFO by createdAt)
  const nowIso = new Date().toISOString();
  const snapshot = await db.collection('promotion_tasks')
    .where('type', '==', 'youtube_upload')
    .where('status', 'in', ['queued'])
    .orderBy('createdAt')
    .limit(5)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  // Pick first eligible by nextAttemptAt <= now
  let selectedDoc = null;
  let selectedData = null;
  const now = Date.now();
  for (const d of snapshot.docs) {
    const data = d.data();
    const nextAt = data.nextAttemptAt ? Date.parse(data.nextAttemptAt) : Date.now();
    if (nextAt <= now) { selectedDoc = d; selectedData = data; break; }
  }
  if (!selectedDoc) return null; // none ready yet
  const task = { id: selectedDoc.id, ...selectedData };

  // Verify signature before processing
  try {
    const { verifySignature } = require('../utils/docSigner');
    const valid = verifySignature(selectedData);
    if (!valid) {
      await selectedDoc.ref.update({ status:'failed', integrityFailed:true, updatedAt: new Date().toISOString() });
      try { await db.collection('dead_letter_tasks').doc(selectedDoc.id).set({ ...selectedData, integrityFailed:true }); } catch(_){ }
      return { taskId: task.id, error:'integrity_failed' };
    }
  } catch(_){ /* ignore */ }

  const taskRef = selectedDoc.ref;
  await taskRef.update({ status: 'processing', updatedAt: new Date().toISOString() });

  try {
    const outcome = await uploadVideo({
      uid: task.uid,
      title: task.title,
      description: task.description,
      fileUrl: task.fileUrl,
      mimeType: 'video/mp4',
      contentId: task.contentId,
      shortsMode: task.shortsMode
    });
    await taskRef.update({
      status: 'completed',
      outcome,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await recordTaskCompletion('youtube_upload', true);
    return { taskId: task.id, outcome };
  } catch (err) {
    const attempts = (task.attempts || 0) + 1;
    const classification = classifyError(err.message);
    const retryable = attempts < MAX_ATTEMPTS && canRetry(classification);
    const nextAttemptAt = retryable ? new Date(computeNextAttempt(attempts, classification)).toISOString() : null;
    const failed = {
      status: retryable ? 'queued' : 'failed',
      error: err.message,
      errorClass: classification,
      attempts,
      nextAttemptAt,
      updatedAt: new Date().toISOString(),
      failedAt: new Date().toISOString()
    };
    await taskRef.update(failed);
    if (failed.status === 'failed') {
      // Dead-letter (J): copy to collection for manual inspection
      try { await db.collection('dead_letter_tasks').doc(task.id).set({ ...task, failed }); } catch(_){}
      await recordTaskCompletion('youtube_upload', false);
    }
    return { taskId: task.id, error: err.message, classification, retrying: failed.status === 'queued' };
  }
}

// Enqueue a generic cross-platform promotion task (e.g., tiktok/instagram/twitter/facebook)
async function enqueuePlatformPostTask({ contentId, uid, platform, reason = 'manual', payload = {}, skipIfDuplicate = true, forceRepost = false }) {
  if (!contentId || !uid || !platform) throw new Error('contentId, uid, platform required');
  // Quota enforcement (monthly task quota based on plan)
  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const planTier = userSnap.exists && userSnap.data().plan ? (userSnap.data().plan.tier || userSnap.data().plan.id || 'free') : 'free';
    const { getPlan } = require('./planService');
    const plan = getPlan(planTier);
    const quota = plan.monthlyTaskQuota || 0;
    if (quota > 0) {
      // Count tasks enqueued this calendar month
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      // Lightweight: sample up to quota+5 tasks to detect overage
      const snap = await db.collection('promotion_tasks')
        .where('uid','==', uid)
        .where('createdAt','>=', monthStart)
        .where('type','==','platform_post')
        .limit(quota + 5)
        .get();
      const used = snap.size;
      if (used >= quota) {
        // Record overage event (best effort)
        try { await db.collection('events').add({ type: 'task_quota_block', uid, plan: planTier, quota, createdAt: new Date().toISOString() }); } catch(_){ }
        return { skipped: true, reason: 'quota_exceeded', platform, contentId, quota, plan: planTier };
      }
    }
  } catch (qe) {
    // Non-fatal; continue without blocking if quota check fails
  }
  // Revenue eligibility gate: user must have >= MIN_CONTENT_FOR_REVENUE content docs to count for revenue
  const MIN_CONTENT_FOR_REVENUE = parseInt(process.env.MIN_CONTENT_FOR_REVENUE || '100', 10);
  try {
    const contentCountSnap = await db.collection('content').where('user_id','==', uid).select().get();
    const totalContent = contentCountSnap.size;
    if (totalContent < MIN_CONTENT_FOR_REVENUE) {
      // Mark user doc with progress to eligibility (best-effort)
      try { await db.collection('users').doc(uid).set({ revenueEligible: false, contentCount: totalContent, requiredForRevenue: MIN_CONTENT_FOR_REVENUE }, { merge: true }); } catch(_){}
      // We still enqueue the task (platform growth) but note in payload metadata not revenue eligible yet
      payload.__revenueEligible = false;
    } else {
      try { await db.collection('users').doc(uid).set({ revenueEligible: true, contentCount: totalContent, requiredForRevenue: MIN_CONTENT_FOR_REVENUE }, { merge: true }); } catch(_){}
      payload.__revenueEligible = true;
    }
  } catch (e) {
    // On error, proceed without blocking; mark unknown
    payload.__revenueEligible = null;
  }
  const crypto = require('crypto');
  // Canonical subset of payload for hashing (avoid volatile fields)
  const canonical = {
    message: payload.message || '',
    link: payload.link || payload.url || '',
    media: payload.mediaUrl || payload.videoUrl || ''
  };
  const postHash = crypto.createHash('sha256').update(`${platform}|${contentId}|${reason}|${JSON.stringify(canonical)}`,'utf8').digest('hex');

  const COOLDOWN_HOURS = parseInt(process.env.PLATFORM_POST_DUPLICATE_COOLDOWN_HOURS || '24', 10);
  const sinceMs = Date.now() - COOLDOWN_HOURS * 3600000;
  let duplicateRecent = null;
  if (skipIfDuplicate && !forceRepost) {
    try {
      const dupSnap = await db.collection('platform_posts')
        .where('postHash','==', postHash)
        .where('success','==', true)
        .orderBy('createdAt','desc')
        .limit(1)
        .get();
      if (!dupSnap.empty) {
        const d = dupSnap.docs[0];
        const data = d.data();
        const ts = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
        if (!ts || ts >= sinceMs) duplicateRecent = { id: d.id, externalId: data.externalId };
      }
    } catch(_) { /* ignore */ }
  }

  if (duplicateRecent && skipIfDuplicate && !forceRepost) {
    try { const { recordPlatformPostDuplicate } = require('./aggregationService'); recordPlatformPostDuplicate(true); } catch(_){}
    return { skipped: true, reason: 'duplicate_recent_post', platform, contentId, postHash, existing: duplicateRecent };
  }

  // Also guard tasks level (pending tasks) for same hash
  const existingTask = await db.collection('promotion_tasks')
    .where('type','==','platform_post')
    .where('platform','==', platform)
    .where('contentId','==', contentId)
    .where('reason','==', reason)
    .where('status','in',['queued','processing'])
    .limit(1)
    .get().catch(()=>({ empty: true }));
  if (!existingTask.empty) {
    return { skipped: true, reason: 'duplicate_pending', platform, contentId, postHash };
  }

  const ref = db.collection('promotion_tasks').doc();
  const baseTask = {
    type: 'platform_post',
    status: 'queued',
    platform,
    contentId,
    uid,
    reason,
    payload,
    postHash,
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let task = baseTask;
  try { const { attachSignature } = require('../utils/docSigner'); task = attachSignature(baseTask); } catch(_){ }
  await ref.set(task);
  try { const { recordPlatformPostDuplicate } = require('./aggregationService'); recordPlatformPostDuplicate(false); } catch(_){ }
  return { id: ref.id, ...task };
}

async function processNextPlatformTask() {
  // Fetch small batch of queued tasks then pick highest priority dynamically (velocity-aware)
  const snapshot = await db.collection('promotion_tasks')
    .where('type', '==', 'platform_post')
    .where('status', 'in', ['queued'])
    .orderBy('createdAt')
    .limit(10)
    .get();
  if (snapshot.empty) return null;
  let selectedDoc = null; let selectedData = null; const now = Date.now();
  let bestScore = -Infinity;
  for (const d of snapshot.docs) {
    const data = d.data();
    const nextAt = data.nextAttemptAt ? Date.parse(data.nextAttemptAt) : Date.now();
    if (nextAt > now) continue; // not ready
    // Dynamic priority heuristic: base 0 + youtube velocity if present on content + random tie breaker
    let priority = 0;
    try {
      const cSnap = await db.collection('content').doc(data.contentId).get();
      if (cSnap.exists) {
        const cData = cSnap.data();
        if (cData.youtube && typeof cData.youtube.velocity === 'number') {
          priority += Math.min(cData.youtube.velocity, 1000); // cap contribution
        }
        if (cData.youtube && cData.youtube.velocityStatus === 'high') priority += 250;
      }
      // Engagement-based boost (aggregate recent platform_posts metrics for this content)
      const postsSnap = await db.collection('platform_posts')
        .where('contentId','==', data.contentId)
        .orderBy('createdAt','desc')
        .limit(5)
        .get();
      let impressions = 0, likes = 0;
      postsSnap.forEach(p => { const d = p.data(); if (d.metrics) { impressions += d.metrics.impressions||0; likes += d.metrics.likes||0; } });
      if (impressions > 0) {
        const likeRate = likes / impressions; // 0..1
        priority += Math.min(impressions, 500) * 0.5; // moderate weight
        priority += likeRate * 200; // amplify quality
      }
    } catch(_){}
    priority += Math.random();
    if (priority > bestScore) { bestScore = priority; selectedDoc = d; selectedData = data; }
  }
  if (!selectedDoc) return null;
  const task = { id: selectedDoc.id, ...selectedData };
  // Verify signature before processing
  try {
    const { verifySignature } = require('../utils/docSigner');
    const valid = verifySignature(selectedData);
    if (!valid) {
      await selectedDoc.ref.update({ status:'failed', integrityFailed:true, updatedAt: new Date().toISOString() });
      try { await db.collection('dead_letter_tasks').doc(selectedDoc.id).set({ ...selectedData, integrityFailed:true }); } catch(_){ }
      return { taskId: task.id, error:'integrity_failed' };
    }
  } catch(_){ }
  await selectedDoc.ref.update({ status: 'processing', updatedAt: new Date().toISOString() });
  try {
    const { dispatchPlatformPost } = require('./platformPoster');
    const { recordPlatformPost } = require('./platformPostsService');

    // Check platform rate limit cooldown before dispatch
    const cooldownUntil = await getCooldown(task.platform);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      // Re-queue with nextAttemptAt = cooldownUntil
      await selectedDoc.ref.update({
        status: 'queued',
        nextAttemptAt: new Date(cooldownUntil + 500).toISOString(),
        updatedAt: new Date().toISOString(),
        rateLimitDeferred: true
      });
      return { taskId: task.id, deferredUntil: cooldownUntil, reason: 'rate_limit_cooldown' };
    }
    // Variant selection
    // Strategy controlled by VARIANT_SELECTION_STRATEGY env: 'bandit' (UCB1) or 'rotation' (default)
    let payload = task.payload || {};
    let selectedVariant = null;
    let variantIndex = null;
    if (Array.isArray(payload.variants) && payload.variants.length) {
      let strategy = (process.env.VARIANT_SELECTION_STRATEGY || 'rotation').toLowerCase();
      // Allow per-content override (content.variant_strategy) or user default (content.variant_strategy set during upload)
      try {
        const contentSnap = await db.collection('content').doc(task.contentId).get();
        if (contentSnap.exists) {
          const c = contentSnap.data();
          if (c.variant_strategy && ['rotation','bandit'].includes(String(c.variant_strategy).toLowerCase())) {
            strategy = String(c.variant_strategy).toLowerCase();
          }
        }
      } catch(_){ }
      if (strategy === 'bandit') {
        try {
          let stats;
          // Try materialized stats first
          try {
            const { getVariantStats } = require('./variantStatsService');
            const vs = await getVariantStats(task.contentId);
            if (vs && vs.platforms && vs.platforms[task.platform]) {
              const arr = vs.platforms[task.platform].variants;
              stats = payload.variants.map(v => {
                const row = arr.find(r => r.value === v);
                return { variant: v, posts: row ? row.posts : 0, clicks: row ? row.clicks : 0 };
              });
            }
          } catch(_) { /* ignore */ }
          if (!stats) {
            const prevPostsSnap = await db.collection('platform_posts')
              .where('platform','==', task.platform)
              .where('contentId','==', task.contentId)
              .orderBy('createdAt','desc')
              .limit(200)
              .get();
            stats = payload.variants.map(v => ({ variant: v, posts: 0, clicks: 0 }));
            prevPostsSnap.forEach(p => {
              const d = p.data();
              if (d.usedVariant) {
                const idx = payload.variants.indexOf(d.usedVariant);
                if (idx !== -1) {
                  stats[idx].posts += 1;
                  stats[idx].clicks += d.clicks || 0;
                }
              }
            });
          }
          // Reactivation sweep: unsuppress variants whose cooldown elapsed
          try {
            const cooldownMin = parseInt(process.env.VARIANT_REACTIVATION_COOLDOWN_MIN || '720',10); // 12h
            const nowMs = Date.now();
            let changed = false;
            stats.forEach(s=>{
              if (s.suppressed && s.suppressedAt) {
                const ageMin = (nowMs - s.suppressedAt)/60000;
                if (ageMin >= cooldownMin) { s.suppressed = false; delete s.suppressedAt; changed = true; }
              }
            });
            if (changed) { try { await db.collection('events').add({ type:'variant_reactivation_batch', contentId: task.contentId, platform: task.platform, at: new Date().toISOString() }); } catch(_){ } }
          } catch(_){ }
          const totalPosts = stats.reduce((a,b)=>a+(b.posts||0),0);
          let bestScore = -Infinity; let bestIdx = 0; const lnTotal = totalPosts > 0 ? Math.log(totalPosts) : 0; let exploration = false;
          // Precompute medians for normalization
          const ctrArray = stats.map(s=>{
            const rc = typeof s.decayedClicks === 'number'? s.decayedClicks: s.clicks;
            const rp = (typeof s.decayedPosts === 'number' && s.decayedPosts>0)? s.decayedPosts: (s.posts||1);
            return rc / rp;
          }).filter(n=>!Number.isNaN(n)).sort((a,b)=>a-b);
          const medianCtr = ctrArray.length? ctrArray[Math.floor(ctrArray.length/2)]: 0.01;
          let explorationFactor = 1.0;
          try {
            const { getConfig } = require('./configService');
            const cfg = await getConfig();
            if (cfg && typeof cfg.banditExplorationFactor === 'number') explorationFactor = cfg.banditExplorationFactor;
          } catch(_){ }
            // Pre-fetch config once for weights & penalties
            let cfg = {};
            try { const { getConfig } = require('./configService'); cfg = await getConfig(); } catch(_){ }
            const dynamicWeights = (cfg && cfg.banditWeights) ? cfg.banditWeights : null;
            const penaltyScaling = (cfg && cfg.penaltyScaling) ? cfg.penaltyScaling : { suppressed: 0.6, quarantined: 0.85 };
            const wCfgCtr = dynamicWeights && typeof dynamicWeights.ctr === 'number' ? dynamicWeights.ctr : parseFloat(process.env.BANDIT_WEIGHT_CTR || '0.6');
            const wCfgReach = dynamicWeights && typeof dynamicWeights.reach === 'number' ? dynamicWeights.reach : parseFloat(process.env.BANDIT_WEIGHT_REACH || '0.25');
            const wCfgQual = dynamicWeights && typeof dynamicWeights.quality === 'number' ? dynamicWeights.quality : parseFloat(process.env.BANDIT_WEIGHT_QUALITY || '0.15');
            stats.forEach((s,i) => {
            if (s.suppressed) return; // skip suppressed
            if (s.quarantined) return; // skip quarantined variants entirely
            if (s.posts === 0) {
              const coldStartScore = 1e9 * explorationFactor; // scaled by exploration factor
              if (bestScore < coldStartScore) { bestScore = coldStartScore; bestIdx = i; exploration = true; }
              return;
            }
            const recentClicks = (typeof s.decayedClicks === 'number') ? s.decayedClicks : s.clicks;
            const recentPosts = (typeof s.decayedPosts === 'number' && s.decayedPosts>0) ? s.decayedPosts : s.posts;
            const meanCtr = recentClicks / recentPosts;
            const ctrNorm = medianCtr>0? Math.min(1, meanCtr / (medianCtr*2)) : meanCtr; // normalize
            // Placeholder predicted reach proxy = posts weight (could integrate optimization profile if cheap)
            const reachProxy = Math.log10((s.impressions || (s.posts*100) || 1) + 10)/3; // ~0..1 scale
            const qualityComponent = typeof s.qualityScore === 'number' ? (s.qualityScore/100) : 0.5; // fallback
              const baseScore = (ctrNorm * wCfgCtr) + (reachProxy * wCfgReach) + (qualityComponent * wCfgQual);
            const bonus = Math.sqrt((2 * lnTotal) / s.posts) * explorationFactor;
            let score = baseScore + bonus;
            // Down-rank anomaly unless few alternatives
            if (s.anomaly) score *= 0.4;
            try {
              const { adjustBanditScoreForBaseline } = require('./promotionOptimizerService');
              score = adjustBanditScoreForBaseline({ score, posts: s.posts, clicks: s.clicks });
            } catch(_){ }
            if (score > bestScore) { bestScore = score; bestIdx = i; exploration = false; }
          });
          selectedVariant = payload.variants[bestIdx];
          variantIndex = bestIdx;
          payload = { ...payload, message: selectedVariant };
          // Record exploration vs exploitation event (best-effort)
          try { await db.collection('events').add({ type:'variant_selection', contentId: task.contentId, platform: task.platform, strategy:'ucb1', exploration, chosen: selectedVariant, idx: bestIdx, at: new Date().toISOString() }); } catch(_){ }
          // Record selection metrics (reward placeholders) for tuner (use current normalized components as proxies)
          try {
            const { recordSelectionOutcome } = require('./banditTuningService');
            const s = stats[bestIdx];
            const rc = (typeof s.decayedClicks === 'number') ? s.decayedClicks : s.clicks;
            const rp = (typeof s.decayedPosts === 'number' && s.decayedPosts>0) ? s.decayedPosts : Math.max(1,s.posts);
            const rewardCtr = rp>0? rc/rp:0;
            const rewardQuality = typeof s.qualityScore === 'number'? s.qualityScore/100 : 0.5;
            const rewardReach = (s.impressions || (s.posts*100) || 0)/1000; // scaled
            await recordSelectionOutcome({ contentId: task.contentId, platform: task.platform, variant: selectedVariant, rewardCtr, rewardQuality, rewardReach });
            // Record penalties for suppressed/quarantined variants (negative samples)
            // Penalty scaling configurable
            const penaltyCtrBase = -0.05; const penaltyQualBase = -0.05; const penaltyReachBase = -0.02;
            for (const p of stats) {
              if (p === s) continue;
              if (p.suppressed || p.quarantined) {
                const scale = p.quarantined ? (penaltyScaling.quarantined || 0.85) : (penaltyScaling.suppressed || 0.6);
                try { await recordSelectionOutcome({ contentId: task.contentId, platform: task.platform, variant: p.variant, rewardCtr: penaltyCtrBase*scale, rewardQuality: penaltyQualBase*scale, rewardReach: penaltyReachBase*scale }); } catch(_){ }
              }
            }
          } catch(_){ }
        } catch (e) {
          // Fallback to rotation on error
          try {
            const prevPostsSnap = await db.collection('platform_posts')
              .where('platform','==', task.platform)
              .where('contentId','==', task.contentId)
              .limit(50)
              .get();
            const count = prevPostsSnap.size;
            const idx = count % payload.variants.length;
            selectedVariant = payload.variants[idx];
            variantIndex = idx;
            payload = { ...payload, message: selectedVariant };
          } catch(_){}
        }
      } else { // rotation
        try {
          const prevPostsSnap = await db.collection('platform_posts')
            .where('platform','==', task.platform)
            .where('contentId','==', task.contentId)
            .limit(50)
            .get();
          const count = prevPostsSnap.size;
          const idx = count % payload.variants.length;
          selectedVariant = payload.variants[idx];
          variantIndex = idx;
          payload = { ...payload, message: selectedVariant };
        } catch(_){}
      }
    }
    // Auto shortlink generation (per post & variant) if content has landing page
    try {
      if (!payload.shortlink) {
        const contentSnap = await db.collection('content').doc(task.contentId).get();
        if (contentSnap.exists) {
          const data = contentSnap.data();
          const hasLanding = data.landingPageUrl || data.smartLink || data.url;
          if (hasLanding) {
            const { createShortlink } = require('./shortlinkService');
            const code = await createShortlink({ contentId: task.contentId, platform: task.platform, variantIndex, taskId: task.id, usedVariant: selectedVariant });
            const base = process.env.SHORTLINK_BASE_URL || process.env.LANDING_BASE_URL || '';
            if (base) {
              payload.shortlink = base.replace(/\/$/,'') + '/s/' + code;
              payload.link = payload.shortlink; // prefer shortlink going forward
              payload.__shortlinkCode = code;
            }
          }
        }
      }
    } catch (e) { /* non-fatal */ }
    const simulatedResult = await dispatchPlatformPost({
      platform: task.platform,
      contentId: task.contentId,
      payload,
      reason: task.reason,
      uid: task.uid
    });
    if (selectedVariant) {
      simulatedResult.usedVariant = selectedVariant;
      simulatedResult.variantIndex = variantIndex;
    }
    // Adaptive scheduling: if bandit strategy and exploration flagged high reward, enqueue a fast-follow task
    try {
      if (selectedVariant && (process.env.ADAPTIVE_FAST_FOLLOW === 'true')) {
        const meanClicks = simulatedResult.clicks || 0;
        if (meanClicks >= parseInt(process.env.FAST_FOLLOW_MIN_CLICKS || '5',10)) {
          // schedule another task for this content/platform sooner (15% of base backoff or 2 min)
          const ffDelayMs = Math.min(2*60000, Math.max(30000, BASE_BACKOFF_MS * 0.15));
          const ref = db.collection('promotion_tasks').doc();
          const ffBase = {
            type:'platform_post', status:'queued', platform: task.platform, contentId: task.contentId, uid: task.uid, reason:'fast_follow',
            payload: { ...(task.payload||{}), fastFollow:true }, attempts:0, nextAttemptAt: new Date(Date.now()+ffDelayMs).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
          };
          let ffTask = ffBase; try { const { attachSignature } = require('../utils/docSigner'); ffTask = attachSignature(ffBase); } catch(_){ }
          await ref.set(ffTask);
          try { await db.collection('events').add({ type:'fast_follow_enqueued', contentId: task.contentId, platform: task.platform, variant: selectedVariant, delayMs: ffDelayMs, at: new Date().toISOString() }); } catch(_){ }
        }
      }
    } catch(_){ }
    await selectedDoc.ref.update({
      status: 'completed',
      outcome: simulatedResult,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    // Record persistent platform post (Phase 1)
    try {
        await recordPlatformPost({
        platform: task.platform,
        contentId: task.contentId,
        uid: task.uid,
        reason: task.reason,
          payload,
          outcome: simulatedResult,
        taskId: task.id,
        postHash: task.postHash,
        shortlinkCode: payload.__shortlinkCode || null
      });
    } catch (e) {
      console.warn('[platform_posts][record] failed:', e.message);
    }
    await recordTaskCompletion('platform_post', true);
    // Post-selection regeneration check (non-blocking)
    try {
      if (process.env.ENABLE_VARIANT_REGEN === 'true' && task.contentId && task.platform) {
        const { regenerateIfNeeded } = require('./variantRegeneratorService');
        regenerateIfNeeded({ contentId: task.contentId, platform: task.platform }).catch(()=>{});
      }
    } catch(_){ }
    return { taskId: task.id, outcome: simulatedResult };
  } catch (err) {
    const attempts = (task.attempts || 0) + 1;
    const classification = classifyError(err.message);
    if (classification === 'rate_limit') {
      // Note platform-wide cooldown (configurable window)
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS_DEFAULT || '900000', 10); // 15min default
      try { await noteRateLimit(task.platform, windowMs); await recordRateLimitEvent(task.platform); } catch(_){ }
    }
    const retryable = attempts < MAX_ATTEMPTS && canRetry(classification);
    const nextAttemptAt = retryable ? new Date(computeNextAttempt(attempts, classification)).toISOString() : null;
    const failed = {
      status: retryable ? 'queued' : 'failed',
      error: err.message,
      errorClass: classification,
      attempts,
      nextAttemptAt,
      updatedAt: new Date().toISOString(),
      failedAt: new Date().toISOString()
    };
    await selectedDoc.ref.update(failed);
    if (failed.status === 'failed') {
      try { await db.collection('dead_letter_tasks').doc(task.id).set({ ...task, failed }); } catch(_){}
      await recordTaskCompletion('platform_post', false);
      // Even on terminal failure, record a platform post record for observability
      try {
        const { recordPlatformPost } = require('./platformPostsService');
        await recordPlatformPost({
          platform: task.platform,
            contentId: task.contentId,
            uid: task.uid,
            reason: task.reason,
            payload: task.payload,
            outcome: { success: false, error: err.message },
            taskId: task.id
        });
      } catch(_){ }
    }
    return { taskId: task.id, error: err.message, classification, retrying: failed.status === 'queued' };
  }
}

module.exports = { enqueueYouTubeUploadTask, processNextYouTubeTask, enqueuePlatformPostTask, processNextPlatformTask };
