// platformMetricsService.js
// Phase 3: Fetch metrics for platform posts (skeleton implementations, best-effort)

const fetch = require("node-fetch");

const { getPostStats: getFacebookPostStats } = require("./facebookService");

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

async function fetchFacebookPostMetrics(uid, externalId, pageId) {
  if (!uid || !externalId) return null;
  try {
    const stats = await getFacebookPostStats({ uid, postId: externalId, pageId });
    if (!stats) return null;
    return {
      post_impressions: stats.impressions,
      post_engaged_users: stats.engagedUsers,
      // map other fields if needed for computing score
      likes: stats.likes,
      comments: stats.comments,
    };
  } catch (e) {
    console.warn("[PlatformMetrics] Facebook fetch failed:", e.message);
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

const { getVideoMetrics } = require("./tiktokService");
const { getPostStats: getLinkedInPostStats } = require("./linkedinService");
const { getPostInfo: getRedditPostInfo } = require("./redditService");

async function fetchTikTokMetrics(uid, externalId) {
  if (!uid || !externalId) return null;
  try {
    const videos = await getVideoMetrics(uid, [externalId]);
    if (!videos || videos.length === 0) return null;

    const v = videos[0];
    // Normalize strict typing
    return {
      view_count: v.view_count || 0,
      like_count: v.like_count || 0,
      comment_count: v.comment_count || 0,
      share_count: v.share_count || 0,
    };
  } catch (e) {
    console.warn("[PlatformMetrics] TikTok fetch failed for %s: %s", externalId, e.message);
    return null;
  }
}

async function fetchLinkedInMetrics(uid, externalId) {
  if (!uid || !externalId) return null;
  try {
    const stats = await getLinkedInPostStats({ uid, shareId: externalId });
    return {
      like_count: stats.likes || 0,
      comment_count: stats.comments || 0,
      // LinkedIn API (basic) doesn't give views/impressions easily
    };
  } catch (e) {
    console.warn("[PlatformMetrics] LinkedIn fetch failed:", e.message);
    return null;
  }
}

async function fetchRedditMetrics(uid, externalId) {
  if (!uid || !externalId) return null;
  try {
    const info = await getRedditPostInfo({ uid, postId: externalId });
    return {
      score: info.score,
      upvote_ratio: info.upvoteRatio,
      comment_count: info.numComments,
      // Reddit doesn't expose view counts via API generally
    };
  } catch (e) {
    console.warn("[PlatformMetrics] Reddit fetch failed:", e.message);
    return null;
  }
}

module.exports = {
  fetchFacebookPostMetrics,
  fetchTwitterTweetMetrics,
  fetchInstagramMediaMetrics,
  fetchTikTokMetrics,
  fetchLinkedInMetrics,
  fetchRedditMetrics,
};
