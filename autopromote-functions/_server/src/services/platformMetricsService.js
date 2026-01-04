// platformMetricsService.js
// Phase 3: Fetch metrics for platform posts (skeleton implementations, best-effort)

const fetch = require("node-fetch");

async function safeJson(res) {
  let txt;
  try {
    txt = await res.text();
  } catch (_) {
    return {};
  }
  try {
    return JSON.parse(txt);
  } catch (_) {
    return { raw: txt };
  }
}

async function fetchFacebookPostMetrics(externalId) {
  const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!PAGE_TOKEN || !externalId) return null;
  try {
    // Metrics: post_impressions, post_engaged_users
    const url = `https://graph.facebook.com/${externalId}/insights?metric=post_impressions,post_engaged_users&access_token=${encodeURIComponent(PAGE_TOKEN)}`;
    const res = await fetch(url);
    const json = await safeJson(res);
    if (!res.ok) return null;
    const metrics = {};
    (json.data || []).forEach(m => {
      metrics[m.name] = parseInt(m.values?.[0]?.value || 0, 10);
    });
    return metrics;
  } catch (_) {
    return null;
  }
}

async function fetchTwitterTweetMetrics(tweetId) {
  const BEARER = process.env.TWITTER_BEARER_TOKEN;
  if (!BEARER || !tweetId) return null;
  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${BEARER}` } }
    );
    const json = await safeJson(res);
    if (!res.ok) return null;
    return json.data?.public_metrics || null;
  } catch (_) {
    return null;
  }
}

async function fetchInstagramMediaMetrics(mediaId) {
  const IG_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN; // Assuming same token scope if IG connected
  if (!IG_TOKEN || !mediaId) return null;
  try {
    // Basic metrics: impressions, reach, engagement (varies by media type)
    const url = `https://graph.facebook.com/${mediaId}/insights?metric=impressions,reach,engagement&access_token=${encodeURIComponent(IG_TOKEN)}`;
    const res = await fetch(url);
    const json = await safeJson(res);
    if (!res.ok) return null;
    const metrics = {};
    (json.data || []).forEach(m => {
      metrics[m.name] = parseInt(m.values?.[0]?.value || 0, 10);
    });
    return metrics;
  } catch (_) {
    return null;
  }
}

module.exports = { fetchFacebookPostMetrics, fetchTwitterTweetMetrics, fetchInstagramMediaMetrics };
