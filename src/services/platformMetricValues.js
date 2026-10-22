// Absence is distinct from a platform reporting a measured zero.
const aliases = {
  views: ["views", "view_count", "video_views", "video_view_count", "play_count", "plays"],
  impressions: ["impressions", "post_impressions", "impression_count"],
  likes: ["likes", "like_count", "favorite_count", "reaction_count"],
  comments: ["comments", "comment_count", "comments_count", "reply_count", "total_comments"],
  shares: ["shares", "share_count", "retweet_count", "repost_count", "reposts"],
  clicks: ["clicks", "click_count", "link_clicks", "post_clicks"],
};

function numericMetric(...values) {
  for (const value of values) {
    if (typeof value !== "number" && typeof value !== "string") continue;
    if (typeof value === "string" && !value.trim()) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function normalizeMetrics(metrics = {}) {
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) =>
    [key, numericMetric(...names.map(name => metrics?.[name]))]));
}

module.exports = { aliases, numericMetric, normalizeMetrics };
