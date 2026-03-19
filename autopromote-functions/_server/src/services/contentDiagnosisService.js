function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildPerformanceSnapshot(content = {}, analytics = {}) {
  const views = toNumber(analytics.views, toNumber(content.views, 0));
  const engagements = toNumber(
    analytics.engagements,
    toNumber(content.engagements, toNumber(content.likes, 0) + toNumber(content.comments, 0))
  );
  const revenue = toNumber(analytics.revenue, toNumber(content.revenue, 0));
  const cost = toNumber(analytics.cost, toNumber(content.cost, 0));
  const shares = toNumber(analytics.shares, toNumber(content.shares, 0));
  const comments = toNumber(analytics.comments, toNumber(content.comments, 0));

  const engagementRate =
    toNumber(analytics.engagementRate, views > 0 ? engagements / views : 0) || 0;
  const conversionRate = toNumber(analytics.conversionRate, 0);
  const roi = toNumber(analytics.roi, cost > 0 ? revenue / cost : 0);

  return {
    views,
    engagements,
    shares,
    comments,
    revenue,
    cost,
    engagementRate,
    conversionRate,
    roi,
    titleLength: typeof content.title === "string" ? content.title.trim().length : 0,
    hasHashtags: Array.isArray(content.hashtags)
      ? content.hashtags.length > 0
      : typeof content.tags === "string"
        ? content.tags.trim().length > 0
        : false,
    hasThumbnail: Boolean(content.thumbnailUrl || content.thumbnail || content.coverImage),
    platform: content.platform || analytics.platform || null,
  };
}

function diagnoseContentPerformance(snapshot = {}) {
  const issues = [];

  const lowVolumeViews = toNumber(process.env.DIAG_LOW_VIEWS_THRESHOLD || 200, 200);
  const lowEngagementRate = toNumber(process.env.DIAG_LOW_ENGAGEMENT_RATE || 0.02, 0.02);
  const weakShareRate = toNumber(process.env.DIAG_LOW_SHARE_RATE || 0.002, 0.002);
  const weakCommentRate = toNumber(process.env.DIAG_LOW_COMMENT_RATE || 0.001, 0.001);

  const views = toNumber(snapshot.views, 0);
  const engagementRate = toNumber(snapshot.engagementRate, 0);
  const conversionRate = toNumber(snapshot.conversionRate, 0);
  const roi = toNumber(snapshot.roi, 0);
  const shareRate = views > 0 ? toNumber(snapshot.shares, 0) / views : 0;
  const commentRate = views > 0 ? toNumber(snapshot.comments, 0) / views : 0;

  if (views < lowVolumeViews) {
    issues.push({
      type: "distribution",
      severity: "medium",
      confidence: 0.72,
      reason: "Content has low reach, suggesting weak distribution or poor timing.",
      evidence: { views, threshold: lowVolumeViews },
    });
  }

  if (engagementRate < lowEngagementRate) {
    issues.push({
      type: "hook",
      severity: engagementRate < lowEngagementRate * 0.5 ? "high" : "medium",
      confidence: 0.78,
      reason: "Engagement rate is below target, indicating weak hook or creative mismatch.",
      evidence: { engagementRate, threshold: lowEngagementRate },
    });
  }

  if (shareRate < weakShareRate && commentRate < weakCommentRate && views >= lowVolumeViews) {
    issues.push({
      type: "creative_depth",
      severity: "medium",
      confidence: 0.66,
      reason: "Low shares and comments suggest content is seen but not resonating deeply.",
      evidence: {
        shareRate,
        commentRate,
        shareThreshold: weakShareRate,
        commentThreshold: weakCommentRate,
      },
    });
  }

  if (conversionRate > 0 && roi < 1) {
    issues.push({
      type: "monetization",
      severity: roi < 0.6 ? "high" : "medium",
      confidence: 0.75,
      reason: "Spend is not converting to profitable outcomes.",
      evidence: { conversionRate, roi },
    });
  }

  if (!snapshot.hasThumbnail) {
    issues.push({
      type: "creative_packaging",
      severity: "medium",
      confidence: 0.68,
      reason:
        "Missing thumbnail or cover art can reduce click-through and first impression quality.",
      evidence: { hasThumbnail: false },
    });
  }

  if (snapshot.titleLength > 0 && snapshot.titleLength < 20) {
    issues.push({
      type: "metadata",
      severity: "low",
      confidence: 0.57,
      reason: "Very short title may reduce context and discoverability.",
      evidence: { titleLength: snapshot.titleLength },
    });
  }

  if (!snapshot.hasHashtags) {
    issues.push({
      type: "discoverability",
      severity: "low",
      confidence: 0.55,
      reason: "No tags/hashtags detected, which may limit discoverability.",
      evidence: { hasHashtags: false },
    });
  }

  const rawHealth =
    engagementRate * 45 +
    clamp(conversionRate * 100, 0, 20) +
    clamp(roi * 12, 0, 20) +
    (views >= lowVolumeViews ? 15 : (views / Math.max(lowVolumeViews, 1)) * 15);
  const healthScore = clamp(Math.round(rawHealth), 0, 100);

  return {
    healthScore,
    status: healthScore >= 70 ? "healthy" : healthScore >= 45 ? "watch" : "at_risk",
    issues,
  };
}

function recommendationForIssue(issue) {
  switch (issue.type) {
    case "distribution":
      return {
        recommendation: "Run a timed re-distribution test across your top two platforms",
        reason: "Low reach indicates the content likely needs better timing and channel placement.",
      };
    case "hook":
      return {
        recommendation: "Generate 3 new hook variants and A/B test within the next posting window",
        reason:
          "Low engagement is usually improved by stronger opening lines and first-frame creative.",
      };
    case "creative_depth":
      return {
        recommendation: "Add stronger call-to-action and narrative tension in the middle section",
        reason:
          "Low shares/comments indicate the content is not compelling enough to prompt interaction.",
      };
    case "monetization":
      return {
        recommendation: "Reduce paid spend by 15% and retarget only high-intent audiences",
        reason: "Current spend profile is not producing positive ROI.",
      };
    case "creative_packaging":
      return {
        recommendation: "Create a high-contrast thumbnail with a clear focal subject",
        reason: "Improved packaging can increase click-through from feeds.",
      };
    case "metadata":
      return {
        recommendation: "Rewrite title to 35-60 characters with a clear value promise",
        reason: "Longer, clearer titles generally improve context and discoverability.",
      };
    case "discoverability":
      return {
        recommendation: "Add 3-5 targeted hashtags relevant to audience intent",
        reason: "Tag coverage helps the platform classify and distribute content.",
      };
    default:
      return null;
  }
}

function generateRecommendations(content = {}, analytics = {}) {
  const snapshot = buildPerformanceSnapshot(content, analytics);
  const diagnosis = diagnoseContentPerformance(snapshot);

  const recs = diagnosis.issues.map(recommendationForIssue).filter(Boolean).slice(0, 5);

  if (recs.length === 0) {
    recs.push({
      recommendation: "Maintain cadence and continue light variant testing",
      reason: "Performance is stable; incremental testing helps sustain momentum.",
    });
  }

  return {
    snapshot,
    diagnosis,
    recommendations: recs,
  };
}

module.exports = {
  buildPerformanceSnapshot,
  diagnoseContentPerformance,
  generateRecommendations,
};
