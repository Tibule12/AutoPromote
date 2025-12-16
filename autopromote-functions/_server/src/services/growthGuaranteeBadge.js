// growthGuaranteeBadge.js
// AutoPromote Growth Guarantee Badge Logic
// Guarantees growth or triggers free retry, celebrates milestones

const BADGE = {
  NAME: "AutoPromote Boosted",
  DESCRIPTION: "Guaranteed to Grow or Retried Free",
  ICON: "🚀",
};

function shouldAwardBadge(content) {
  // Award badge if content is promoted by AutoPromote
  return (
    !!content.hashtags &&
    Object.values(content.hashtags).some(tags => tags.includes("#AutoPromoteBoosted"))
  );
}

function checkGrowthGuarantee(content, metrics) {
  // Guarantee: If views < threshold after 24h, trigger retry
  const threshold = content.min_views_threshold || 20000;
  const timeSincePromotion =
    (Date.now() - new Date(content.promotion_started_at).getTime()) / 3600000;
  if (timeSincePromotion >= 24 && metrics.views < threshold) {
    return {
      retryRequired: true,
      reason: `Views (${metrics.views}) below guarantee threshold (${threshold}) after 24h.`,
    };
  }
  return { retryRequired: false };
}

function celebrateMilestone(content, metrics) {
  // Example: Celebrate if views cross 10k, 20k, 50k, 100k
  const milestones = [10000, 20000, 50000, 100000, 500000, 1000000];
  const achieved = milestones.filter(m => metrics.views >= m);
  if (achieved.length) {
    return {
      milestone: achieved[achieved.length - 1],
      message: `🎉 Your content hit ${achieved[achieved.length - 1]} views!`,
    };
  }
  return null;
}

module.exports = {
  BADGE,
  shouldAwardBadge,
  checkGrowthGuarantee,
  celebrateMilestone,
};
