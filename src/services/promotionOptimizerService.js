// promotionOptimizerService.js - predictive scoring & optimization hints for promotion tasks
// Provides: quality scoring, predicted reach, baseline CTR checks, schedule adjustment suggestions.

const { db } = require("../firebaseAdmin");

const DEFAULT_BASELINE_CTR = parseFloat(process.env.BASELINE_CTR_TARGET || "0.03"); // 3%
const MIN_POSTS_FOR_BASELINE = parseInt(process.env.MIN_POSTS_FOR_BASELINE || "3", 10);

async function fetchRecentPerformance({ contentId, platform, uid, limit = 100 }) {
  const snap = await db
    .collection("platform_posts")
    .where("contentId", "==", contentId)
    .where("platform", "==", platform)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
    .catch(() => ({ empty: true, docs: [] }));
  const stats = { posts: 0, clicks: 0, impressions: 0, likeRate: 0, avgCtr: 0 };
  snap.docs.forEach(d => {
    const v = d.data();
    stats.posts++;
    stats.clicks += v.outcome?.clicks || 0;
    stats.impressions += v.metrics?.impressions || 0;
  });
  if (stats.impressions > 0) stats.avgCtr = stats.clicks / stats.impressions;
  return stats;
}

function qualityScoreFromContent(contentDoc = {}) {
  // Lightweight heuristic using metadata flags.
  let score = 50;
  if (contentDoc.has_captions || contentDoc.captionsGenerated) score += 8;
  if (Array.isArray(contentDoc.variants) && contentDoc.variants.length > 1) score += 5;
  if (contentDoc.durationSec) {
    if (contentDoc.durationSec >= 20 && contentDoc.durationSec <= 90) score += 7; // sweet spot for short form
  }
  if (contentDoc.thumbnailQuality === "high") score += 5;
  if (contentDoc.topicAuthorityScore) score += Math.min(10, contentDoc.topicAuthorityScore);
  return Math.max(0, Math.min(100, score));
}

function predictedReach({ baseAvgImpressionsPerPost, qualityScore, boostFactor = 1 }) {
  // Non-linear mapping: quality amplifies base impressions.
  const q = (qualityScore || 50) / 50; // 1.0 baseline
  return Math.round(baseAvgImpressionsPerPost * (0.6 + 0.4 * q) * boostFactor);
}

async function computeOptimizationProfile({ contentId, platform, uid }) {
  const perf = await fetchRecentPerformance({ contentId, platform, uid });
  // Derive baseline average impressions
  const baseAvg = perf.posts ? perf.impressions / perf.posts : 500; // fallback constant
  let contentDoc = null;
  try {
    const snap = await db.collection("content").doc(contentId).get();
    contentDoc = snap.exists ? snap.data() : null;
  } catch (_) {}
  const qScore = qualityScoreFromContent(contentDoc || {});
  const reach = predictedReach({ baseAvgImpressionsPerPost: baseAvg, qualityScore: qScore });
  const belowBaseline = perf.posts >= MIN_POSTS_FOR_BASELINE && perf.avgCtr < DEFAULT_BASELINE_CTR;
  const recommendations = [];
  if (belowBaseline)
    recommendations.push(
      "Increase creative exploration: add new variant hooks or adjust first 3 seconds."
    );
  // Pull variant suppression/anomaly context if available
  try {
    const { getVariantStats } = require("./variantStatsService");
    const vs = await getVariantStats(contentId);
    if (vs && vs.platforms && vs.platforms[platform]) {
      const suppressed = vs.platforms[platform].variants.filter(v => v.suppressed).length;
      if (suppressed > 0)
        recommendations.push(
          `${suppressed} variant(s) suppressed for low performance—refresh creative.`
        );
      const anomalies = vs.platforms[platform].variants.filter(v => v.anomaly).length;
      if (anomalies > 0)
        recommendations.push(
          `${anomalies} variant(s) flagged anomalous—validate traffic authenticity.`
        );
    }
  } catch (_) {}
  if ((contentDoc?.variants || []).length < 3)
    recommendations.push("Add more copy variants to improve exploration bandwidth.");
  if (!contentDoc?.has_captions && !contentDoc?.captionsGenerated)
    recommendations.push("Generate captions to raise accessibility engagement.");
  if (qScore < 60) recommendations.push("Improve thumbnail/metadata to raise quality score.");
  return {
    performance: perf,
    qualityScore: qScore,
    predictedReach: reach,
    belowBaseline,
    baselineCtrTarget: DEFAULT_BASELINE_CTR,
    recommendations,
  };
}

function adjustBanditScoreForBaseline({ score, posts, clicks }) {
  if (posts >= MIN_POSTS_FOR_BASELINE && posts > 0) {
    const ctr = clicks / posts; // proxy when impressions not stored
    if (ctr < DEFAULT_BASELINE_CTR) {
      // Penalize under baseline but keep exploration potential.
      return score * 0.6;
    }
  }
  return score;
}

module.exports = {
  computeOptimizationProfile,
  adjustBanditScoreForBaseline,
  qualityScoreFromContent,
  predictedReach,
  fetchRecentPerformance,
};
