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
  const task = {
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
  const task = {
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
    // Variant rotation: if payload.variants array exists, select next based on existing post count
    let payload = task.payload || {};
    let selectedVariant = null;
    let variantIndex = null;
    if (Array.isArray(payload.variants) && payload.variants.length) {
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
