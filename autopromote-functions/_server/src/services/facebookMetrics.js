const { numericMetric } = require("./platformMetricValues");

function issue(metric, response) {
  const error = response?.body?.error;
  return {
    metric,
    code: [10, 200].includes(error?.code)
      ? "PERMISSION_DENIED"
      : error?.code === 190
        ? "RECONNECT_REQUIRED"
        : error?.code === 100
          ? "UNSUPPORTED_METRIC"
          : "PROVIDER_REQUEST_FAILED",
    message:
      typeof error?.message === "string"
        ? error.message.slice(0, 400)
        : `Facebook statistics request failed (${response?.status || "network"}).`,
  };
}

async function collectFacebookMetrics({ postId, request }) {
  // Publishing a video returns its Video node ID. A Page feed post uses the
  // composite PAGE_POST ID. Post-only attachments/insights do not exist on Video.
  const video = !String(postId).includes("_");
  const edge = video ? "video_insights" : "insights";
  const metric = video ? "total_video_views" : "post_impressions,post_engaged_users";
  const fetch = async suffix => {
    try {
      return await request(suffix);
    } catch {
      return { ok: false, status: 0 };
    }
  };
  const [insights, initialBasic] = await Promise.all([
    fetch(`/${edge}?metric=${metric}`),
    fetch(
      video
        ? "?fields=comments.summary(true),likes.summary(true)"
        : "?fields=comments.summary(true),reactions.summary(true),shares"
    ),
  ]);
  let basic = initialBasic;
  const issues = [];
  if (!insights.ok) issues.push(issue(video ? "views" : "impressions", insights));
  if (!basic.ok && basic.body?.error?.code === 100) {
    issues.push(issue("shares", basic));
    basic = await fetch("?fields=comments.summary(true),likes.summary(true)");
  }
  if (!basic.ok) issues.push(issue("engagement", basic));
  const values = Object.fromEntries(
    (insights.ok ? insights.body?.data || [] : []).map(row => [row.name, row.values?.at(-1)?.value])
  );
  const data = basic.ok ? basic.body : {};
  return {
    postId,
    views: numericMetric(values.total_video_views, values.post_video_views),
    impressions: numericMetric(values.post_impressions),
    engagedUsers: numericMetric(values.post_engaged_users),
    likes: numericMetric(data.reactions?.summary?.total_count, data.likes?.summary?.total_count),
    comments: numericMetric(data.comments?.summary?.total_count),
    shares: numericMetric(data.shares?.count),
    fetchedAt: new Date().toISOString(),
    partial: issues.length > 0,
    issues,
  };
}

module.exports = { collectFacebookMetrics };
