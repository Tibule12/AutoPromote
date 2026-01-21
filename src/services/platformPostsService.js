// platformPostsService.js
// Phase 1 (Cross-Platform Generalization): persistent records for platform posts
// Responsibilities:
//  - Record outcome of platform posting tasks into `platform_posts`
//  - Provide a foundation for later phases (hash idempotency, stats polling, engagement scores)

const { db, admin } = require("../firebaseAdmin");

/**
 * Persist a platform post outcome.
 * @param {Object} params
 * @param {string} params.platform - e.g. 'facebook','twitter','instagram','tiktok'
 * @param {string} params.contentId - Related content document id
 * @param {string} params.uid - User who owns the content / initiated promotion
 * @param {string} [params.reason] - Reason (e.g. 'youtube_velocity_high')
 * @param {Object} [params.payload] - Original payload used to create the post
 * @param {Object} params.outcome - Result returned by platformPoster dispatcher
 * @param {string} [params.taskId] - Associated promotion_tasks doc id
 * @returns {Promise<{id:string, success:boolean}>}
 */
async function recordPlatformPost({
  platform,
  contentId,
  uid,
  reason,
  payload = {},
  outcome = {},
  taskId,
  postHash,
  shortlinkCode,
}) {
  if (!platform || !contentId) throw new Error("platform & contentId required");
  // If a postHash is present, avoid creating duplicate successful records
  if (postHash) {
    try {
      const dupSnap = await db
        .collection("platform_posts")
        .where("postHash", "==", postHash)
        .where("success", "==", true)
        .limit(1)
        .get()
        .catch(() => ({ empty: true }));
      if (!dupSnap.empty) {
        // Return existing record id to indicate deduplication
        const existing = dupSnap.docs[0].data();
        return { id: dupSnap.docs[0].id, success: true, existing: existing };
      }
    } catch (_) {}
  }

  const ref = db.collection("platform_posts").doc();
  const success = outcome.success !== false; // treat missing flag as success (unless explicitly false)
  const externalId =
    outcome.postId || outcome.tweetId || outcome.mediaId || outcome.externalId || null;
  const usedVariant = outcome.usedVariant || null;
  const variantIndex = typeof outcome.variantIndex === "number" ? outcome.variantIndex : null;
  // Build tracked link (attribution) if link or landing page ref available
  let trackedLink = null;
  try {
    // Prefer shortlink if provided (already attribution-enabled)
    const base = payload.shortlink || payload.link || payload.url || null;
    if (base) {
      const sep = base.includes("?") ? "&" : "?";
      const parts = [`src=${encodeURIComponent(platform)}`, `c=${encodeURIComponent(contentId)}`];
      if (typeof variantIndex === "number") parts.push(`v=${variantIndex}`);
      if (taskId) parts.push(`t=${encodeURIComponent(taskId)}`);
      // If base already looks like a shortlink (contains /s/), don't append params (redirect layer handles)
      if (/\/s\//.test(base)) {
        trackedLink = base; // shortlink encodes attribution on redirect
      } else {
        trackedLink = base + sep + parts.join("&");
      }
    }
  } catch (_) {
    /* ignore */
  }
  const doc = {
    platform,
    contentId,
    uid: uid || null,
    reason: reason || "unspecified",
    taskId: taskId || null,
    postHash: postHash || null,
    success,
    simulated: !!outcome.simulated,
    externalId,
    payload: payload || {},
    shortlinkCode: shortlinkCode || null,
    rawOutcome: sanitizeOutcome(outcome),
    usedVariant,
    variantIndex,
    trackedLink: trackedLink,
    metrics: null, // placeholder for Phase 3
    normalizedScore: null, // placeholder for Phase 4
    lastMetricsCheck: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  // Update materialized variant stats (posts level)
  try {
    if (usedVariant) {
      const { updateVariantStats } = require("./variantStatsService");
      await updateVariantStats({
        contentId,
        platform,
        variant: usedVariant,
        clicksDelta: typeof outcome.clicks === "number" ? outcome.clicks : 0,
      });
      // Attempt inline quality scoring for the variant if not scored yet
      try {
        const { computeQualityScore } = require("./variantQualityService");
        const msg = doc.payload && (doc.payload.message || doc.payload.text || doc.payload.caption);
        if (msg) {
          // Light touch update (merge) only if variant_stats exists & variant qualityScore missing
          const vsRef = require("../firebaseAdmin").db.collection("variant_stats").doc(contentId);
          await require("../firebaseAdmin").db.runTransaction(async tx => {
            const vsSnap = await tx.get(vsRef);
            if (!vsSnap.exists) return;
            const data = vsSnap.data();
            const plat = data.platforms && data.platforms[platform];
            if (!plat) return;
            const row = plat.variants.find(v => v.value === usedVariant);
            if (!row) return;
            if (row.qualityScore == null) {
              row.qualityScore = computeQualityScore(msg);
              tx.set(vsRef, data, { merge: true });
            }
          });
        }
      } catch (_) {}
    }
  } catch (_) {
    /* non-fatal */
  }
  return { id: ref.id, success };
}

function sanitizeOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") return outcome;
  // Avoid storing large raw API payloads if present
  const clone = { ...outcome };
  if (clone.raw && typeof clone.raw === "string" && clone.raw.length > 2000) {
    clone.raw = clone.raw.slice(0, 2000) + "…";
  }
  return clone;
}

async function tryCreatePlatformPostLock({
  platform,
  postHash,
  contentId,
  uid,
  reason,
  payload,
  taskId,
  shortlinkCode,
}) {
  if (!platform || !postHash) throw new Error("platform & postHash required");
  const id = `${platform}_${postHash}`;
  const ref = db.collection("platform_posts").doc(id);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = {
    platform,
    contentId,
    uid: uid || null,
    reason: reason || "unspecified",
    taskId: taskId || null,
    postHash,
    success: null,
    simulated: false,
    externalId: null,
    payload: payload || {},
    rawOutcome: null,
    shortlinkCode: shortlinkCode || null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    // Use create() which will fail if doc exists — atomic create-if-not-exists
    await ref.create(doc);
    return { created: true, id };
  } catch (err) {
    try {
      const snap = await ref.get();
      return { created: false, id, existing: snap.exists ? snap.data() : null };
    } catch (_) {
      return { created: false, id, existing: null };
    }
  }
}

async function finalizePlatformPostById(
  id,
  {
    outcome = {},
    success = null,
    externalId = null,
    usedVariant = null,
    variantIndex = null,
    payload = null,
    uid = null,
    taskId = null,
    reason = null,
    shortlinkCode = null,
  }
) {
  if (!id) throw new Error("id required");
  const ref = db.collection("platform_posts").doc(id);
  const update = {
    rawOutcome: sanitizeOutcome(outcome),
    success: success === null ? outcome && outcome.success !== false : success,
    externalId:
      externalId ||
      outcome.externalId ||
      outcome.postId ||
      outcome.tweetId ||
      outcome.mediaId ||
      null,
    usedVariant: usedVariant || (outcome && outcome.usedVariant) || null,
    variantIndex:
      typeof variantIndex === "number"
        ? variantIndex
        : outcome && typeof outcome.variantIndex === "number"
          ? outcome.variantIndex
          : null,
    payload: payload || undefined,
    uid: uid || undefined,
    taskId: taskId || undefined,
    reason: reason || undefined,
    shortlinkCode: shortlinkCode || undefined,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // Clean undefined keys (don't overwrite existing with undefined)
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
  await ref.set(update, { merge: true });
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

async function tryTakeoverPlatformPostLock({
  platform,
  postHash,
  newTaskId,
  takeoverThresholdMs = 300000,
}) {
  if (!platform || !postHash || !newTaskId)
    throw new Error("platform, postHash & newTaskId required");
  const id = `${platform}_${postHash}`;
  const ref = db.collection("platform_posts").doc(id);
  try {
    // metrics: record attempt
    try {
      const { recordLockTakeoverAttempt } = require("./aggregationService");
      await recordLockTakeoverAttempt(platform);
    } catch (_) {}

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { taken: false, reason: "not_exists" };
      const data = snap.data();
      if (data.success === true) return { taken: false, reason: "already_success", existing: data };
      if (data.taskId === newTaskId) return { taken: false, reason: "already_owned" };
      // Normalize updatedAt (could be Firestore Timestamp, ISO string, or number)
      let updatedMs = 0;
      if (data.updatedAt && typeof data.updatedAt.toMillis === "function")
        updatedMs = data.updatedAt.toMillis();
      else if (typeof data.updatedAt === "string") updatedMs = Date.parse(data.updatedAt);
      else if (data.updatedAt && typeof data.updatedAt === "number") updatedMs = data.updatedAt;
      else if (data.updatedAt && data.updatedAt.seconds) updatedMs = data.updatedAt.seconds * 1000;
      if (Date.now() - updatedMs < takeoverThresholdMs)
        return { taken: false, reason: "not_expired" };
      tx.update(ref, {
        taskId: newTaskId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { taken: true, id };
    });

    // metrics: record success/failure based on result
    try {
      const {
        recordLockTakeoverSuccess,
        recordLockTakeoverFailure,
      } = require("./aggregationService");
      if (result && result.taken) {
        await recordLockTakeoverSuccess(platform);
      } else {
        await recordLockTakeoverFailure(platform);
      }
    } catch (_) {}

    return result;
  } catch (err) {
    try {
      const { recordLockTakeoverFailure } = require("./aggregationService");
      await recordLockTakeoverFailure(platform);
    } catch (_) {}
    return { taken: false, error: err && err.message };
  }
}

module.exports = {
  recordPlatformPost,
  tryCreatePlatformPostLock,
  finalizePlatformPostById,
  tryTakeoverPlatformPostLock,
};
