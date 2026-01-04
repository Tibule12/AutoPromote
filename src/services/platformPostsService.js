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

module.exports = { recordPlatformPost };
