// retryRepackageEngine.js
// AutoPromote Retry & Repackage Engine
// Detects underperforming posts, retries with new hooks, captions, hashtags, timing

function shouldRetryContent(content, metrics) {
  // Retry if views < threshold after 24h
  const threshold = content.min_views_threshold || 20000;
  const timeSincePromotion =
    (Date.now() - new Date(content.promotion_started_at).getTime()) / 3600000;
  return timeSincePromotion >= 24 && metrics.views < threshold;
}

function repackageContent(content) {
  // Generate new hooks, captions, hashtags, and timing
  const newTitle = `${content.title} (Remix)`;
  const newCaption = `${newTitle} ${Object.values(content.hashtags || {})
    .flat()
    .join(" ")} #Remix #Retry`;
  const newHashtags = Object.fromEntries(
    Object.entries(content.hashtags || {}).map(([platform, tags]) => [
      platform,
      [...tags, "#Remix", "#Retry"],
    ])
  );
  const newPromotionTime = new Date(Date.now() + 3600000).toISOString(); // Retry in 1 hour
  return {
    ...content,
    title: newTitle,
    caption: newCaption,
    hashtags: newHashtags,
    next_promotion_time: newPromotionTime,
  };
}

module.exports = {
  shouldRetryContent,
  repackageContent,
};
