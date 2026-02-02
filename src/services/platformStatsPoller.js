// platformStatsPoller.js
// Phase 3 & 4: Poll platform_posts for missing/aged metrics and compute normalized score

const { db, admin } = require("../firebaseAdmin");
const {
  fetchFacebookPostMetrics,
  fetchTwitterTweetMetrics,
  fetchInstagramMediaMetrics,
  fetchTikTokMetrics,
  fetchLinkedInMetrics,
  fetchRedditMetrics,
} = require("./platformMetricsService");
const {
  recordPlatformAmplifyTrigger,
  recordPlatformAccelerationTrigger,
  recordPlatformDecayEvent,
  recordPlatformReactivationEvent,
} = require("./aggregationService");
const logger = require("./logger");
const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
const { addImpressions } = require("./variantStatsService");

function computeNormalizedScore(platform, metrics) {
  if (!metrics) return null;
  // Simple heuristic per platform (placeholder): engagement / impressions scaled
  switch (platform) {
    case "facebook": {
      const impressions = metrics.post_impressions || 0;
      const engaged = metrics.post_engaged_users || 0;
      if (!impressions) return engaged ? 50 : 0;
      return Math.min(100, (engaged / impressions) * 100 * 2); // scale
    }
    case "twitter": {
      const impressions = metrics.impression_count || metrics.impressions || 0;
      const likes = metrics.like_count || 0;
      const retweets = metrics.retweet_count || 0;
      const replies = metrics.reply_count || 0;
      if (!impressions) return likes + retweets + replies ? 40 : 0;
      return Math.min(100, ((likes + retweets * 2 + replies) / impressions) * 100 * 1.5);
    }
    case "instagram": {
      const impressions = metrics.impressions || 0;
      const engagement = metrics.engagement || 0; // IG metric may include likes+comments
      if (!impressions) return engagement ? 60 : 0;
      return Math.min(100, (engagement / impressions) * 100 * 2.5);
    }
    case "tiktok": {
      // Heuristic: (likes + comments*2 + shares*4) / views * 100
      const views = metrics.view_count || 0;
      const likes = metrics.like_count || 0;
      const comments = metrics.comment_count || 0;
      const shares = metrics.share_count || 0;
      if (!views) return 0;

      const score = ((likes + comments * 2 + shares * 4) / Math.max(views, 1)) * 100;
      return Math.min(100, score * 3.0); // Multiplier to normalize against other platforms
    }
    case "linkedin": {
      // LinkedIn (basic) has no views. Use raw engagement count as proxy for score
      const likes = metrics.like_count || 0;
      const comments = metrics.comment_count || 0;
      // Arbitrary scoring: e.g. 5 points per like, 10 per comment, cap at 100 (for now)
      const raw = likes * 5 + comments * 10;
      return Math.min(100, raw);
    }
    case "reddit": {
      // Score, upvote_ratio, comments
      const score = metrics.score || 0;
      const comments = metrics.comment_count || 0;
      // Reddit scores can be negative
      if (score < 0) return 0;
      // Heuristic: score + comments*2
      return Math.min(100, (score + comments * 2) * 0.5);
    }
    default:
      return null;
  }
}

async function fetchMetricsForPost(doc) {
  const data = doc.data();
  const platform = data.platform;
  const externalId = data.externalId;
  if (!externalId) return null;
  try {
    switch (platform) {
      case "facebook":
        // Extract pageId from outcome if available, or try to infer from data
        // platformPostsService stores explicit 'pageId' in some versions, but mostly inside rawOutcome or outcome
        // But wait, recordPlatformPost stores: externalId, payload, rawOutcome.
        // In facebookService.js, 'pageId' is returned in the result.
        // usage: const pageId = data.rawOutcome?.pageId || data.outcome?.pageId;
        const fbPageId = data.rawOutcome?.pageId || data.pageId;
        return await fetchFacebookPostMetrics(data.uid, externalId, fbPageId);
      case "twitter":
        return await fetchTwitterTweetMetrics(externalId);
      case "instagram":
        return await fetchInstagramMediaMetrics(externalId);
      case "tiktok":
        return await fetchTikTokMetrics(data.uid, externalId);
      case "linkedin":
        return await fetchLinkedInMetrics(data.uid, externalId);
      case "reddit":
        return await fetchRedditMetrics(data.uid, externalId);
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}

async function pollPlatformPostMetricsBatch({ batchSize = 5, maxAgeMinutes = 30 } = {}) {
  const cutoff = Date.now() - maxAgeMinutes * 60000;
  const snap = await db
    .collection("platform_posts")
    .where("success", "==", true)
    .orderBy("createdAt", "desc")
    .limit(batchSize * 5) // oversample then filter
    .get()
    .catch(() => ({ empty: true, docs: [] }));
  if (snap.empty) return { processed: 0 };
  let processed = 0;
  for (const doc of snap.docs) {
    if (processed >= batchSize) break;
    const d = doc.data();
    if (d.simulated) continue; // skip simulated posts
    const lastCheckMs =
      d.lastMetricsCheck && d.lastMetricsCheck.toMillis ? d.lastMetricsCheck.toMillis() : 0;
    if (lastCheckMs && lastCheckMs > cutoff) continue; // recently checked
    try {
      const metrics = await fetchMetricsForPost(doc);
      if (metrics) {
        const normalizedScore = computeNormalizedScore(d.platform, metrics);
        const update = {
          metrics,
          normalizedScore,
          lastMetricsCheck: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Attempt to propagate impressions into variant materialized stats
        try {
          const impressions =
            metrics.post_impressions || metrics.impressions || metrics.impression_count || null;
          if (impressions && d.contentId && d.variant) {
            await addImpressions({
              contentId: d.contentId,
              platform: d.platform,
              variant: d.variant,
              impressions,
            });
          }
        } catch (imprErr) {
          logger.warn("impressions_update_failed", {
            error: imprErr.message,
            contentId: d.contentId,
            platform: d.platform,
          });
        }
        // Score history & acceleration / decay logic
        try {
          const prevHistory = Array.isArray(d.scoreHistory) ? d.scoreHistory.slice(-19) : []; // keep last 19
          const nowTs = Date.now();
          const lastEntry = prevHistory[prevHistory.length - 1];
          const newEntry = { t: nowTs, s: normalizedScore };
          const history = [...prevHistory, newEntry];
          update.scoreHistory = history;
          if (lastEntry) {
            const dtHours = Math.max((nowTs - lastEntry.t) / 3600000, 0.001);
            const ds = normalizedScore - lastEntry.s;
            const acceleration = ds / dtHours; // score change per hour
            update.acceleration = acceleration;
            // Update peak
            const peak =
              typeof d.peakScore === "number"
                ? Math.max(d.peakScore, normalizedScore)
                : normalizedScore;
            update.peakScore = peak;
            const accelThreshold = parseFloat(process.env.PLATFORM_SCORE_ACCEL_THRESHOLD || "15");
            if (!d.accelTriggeredAt && acceleration >= accelThreshold) {
              update.accelTriggeredAt = admin.firestore.FieldValue.serverTimestamp();
              await db.collection("analytics").add({
                type: "platform_score_acceleration",
                platform: d.platform,
                contentId: d.contentId,
                postId: d.externalId,
                acceleration,
                normalizedScore,
                threshold: accelThreshold,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              try {
                await recordPlatformAccelerationTrigger();
              } catch (_) {}
            }
            // Decay detection
            const decayPct = parseFloat(process.env.PLATFORM_SCORE_DECAY_PCT || "0.3"); // 30%
            if (!d.decayedAt && peak > 0 && normalizedScore < peak * (1 - decayPct)) {
              update.decayedAt = admin.firestore.FieldValue.serverTimestamp();
              await db.collection("analytics").add({
                type: "platform_score_decay",
                platform: d.platform,
                contentId: d.contentId,
                postId: d.externalId,
                normalizedScore,
                peak,
                decayPct,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              try {
                await recordPlatformDecayEvent();
              } catch (_) {}
            }
            // Reactivation: after decay, climbs above (peak * (1 - decayPct/2))
            if (
              d.decayedAt &&
              !d.reactivatedAt &&
              peak > 0 &&
              normalizedScore >= peak * (1 - decayPct / 2)
            ) {
              update.reactivatedAt = admin.firestore.FieldValue.serverTimestamp();
              await db.collection("analytics").add({
                type: "platform_score_reactivation",
                platform: d.platform,
                contentId: d.contentId,
                postId: d.externalId,
                normalizedScore,
                peak,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              try {
                await recordPlatformReactivationEvent();
              } catch (_) {}
            }
          } else {
            update.peakScore = normalizedScore;
          }
        } catch (_) {}
        // Amplification trigger logic (Phase 5)
        try {
          const { amplifiedAt, platform, contentId, uid } = d;
          const threshold = resolveAmplifyThreshold(platform);
          if (
            !amplifiedAt &&
            threshold &&
            normalizedScore !== null &&
            normalizedScore >= threshold
          ) {
            update.amplifiedAt = admin.firestore.FieldValue.serverTimestamp();
            // Log analytics event
            await db.collection("analytics").add({
              type: "platform_amplify_trigger",
              platform,
              contentId,
              postId: d.externalId || null,
              normalizedScore,
              threshold,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            try {
              await recordPlatformAmplifyTrigger();
            } catch (_) {}
            // Enqueue cross-platform amplification tasks (exclude current platform)
            const targets = ["facebook", "twitter", "instagram", "tiktok"].filter(
              p => p !== platform
            );
            for (const target of targets) {
              try {
                await enqueuePlatformPostTask({
                  contentId,
                  uid: uid || d.uid || "system",
                  platform: target,
                  reason: "platform_score_high",
                  payload: { sourcePlatform: platform, normalizedScore },
                });
              } catch (enqErr) {
                logger.warn("amplify_enqueue_failed", {
                  error: enqErr.message,
                  target,
                  sourcePlatform: platform,
                });
              }
            }
            logger.info("platform_amplify_trigger", {
              platform,
              contentId,
              normalizedScore,
              threshold,
            });
          }
        } catch (ampErr) {
          logger.warn("amplify_logic_error", { error: ampErr.message });
        }
        await doc.ref.set(update, { merge: true });
        // Unified content-level aggregation (Platform C)
        try {
          if (d.contentId && typeof normalizedScore === "number") {
            const contentRef = db.collection("content").doc(d.contentId);
            const contentSnap = await contentRef.get();
            const cData = contentSnap.exists ? contentSnap.data() : {};
            const existingScores = cData.amplificationScores || {};
            const newScores = { ...existingScores, [d.platform]: normalizedScore };
            // Compute unified score (max for now)
            const unified = Object.values(newScores).reduce(
              (m, v) => (typeof v === "number" ? Math.max(m, v) : m),
              0
            );
            await contentRef.set(
              {
                amplificationScores: newScores,
                amplificationUnified: unified,
                amplificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        } catch (_) {}
        processed++;
      }
    } catch (_) {
      /* swallow */
    }
  }
  return { processed };
}

function resolveAmplifyThreshold(platform) {
  // Per-platform env overrides else default
  const def = parseInt(process.env.PLATFORM_AMPLIFY_THRESHOLD_DEFAULT || "65", 10);
  const map = {
    facebook: parseInt(process.env.FACEBOOK_AMPLIFY_THRESHOLD || def, 10),
    twitter: parseInt(process.env.TWITTER_AMPLIFY_THRESHOLD || def, 10),
    instagram: parseInt(process.env.INSTAGRAM_AMPLIFY_THRESHOLD || def, 10),
    tiktok: parseInt(process.env.TIKTOK_AMPLIFY_THRESHOLD || def, 10),
  };
  return map[platform] || def;
}

module.exports = { pollPlatformPostMetricsBatch };
