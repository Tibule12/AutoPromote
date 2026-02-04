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
const { getTracksBatch } = require("./spotifyService");

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

/**
 * Validated Cost-Efficient Architecture: Batch Fetching
 * Maps to user requirement: fetch_engagement_batch
 */
async function fetchBatchMetrics(platform, items) {
  // items: array of { id: string, uid: string }
  if (!items || items.length === 0) return {};

  // 1. TikTok Optimized Batching
  if (platform === "tiktok") {
    // Group by UID because TikTok token is per-user
    const byUid = {};
    items.forEach(i => {
      if (!byUid[i.uid]) byUid[i.uid] = [];
      byUid[i.uid].push(i.id);
    });

    const results = {};
    for (const [uid, ids] of Object.entries(byUid)) {
      try {
        const videos = await getVideoMetrics(uid, ids);
        videos.forEach(v => {
          results[v.id] = {
            view_count: v.view_count || 0,
            like_count: v.like_count || 0,
            comment_count: v.comment_count || 0,
            share_count: v.share_count || 0,
          };
        });
      } catch (e) {
        console.warn("[PlatformMetrics] TikTok batch fetch failed for uid=%s", uid);
      }
    }
    return results;
  }

  // 3. Spotify Batching
  if (platform === "spotify") {
    // items: array of { id: trackId, uid: string }
    // Spotify batching is by Token, so we group by UID
    const byUid = {};
    items.forEach(i => {
      if (!byUid[i.uid]) byUid[i.uid] = [];
      byUid[i.uid].push(i.id);
    });

    const results = {};
    for (const [uid, ids] of Object.entries(byUid)) {
      try {
        const tracks = await getTracksBatch({ uid, trackIds: ids });
        tracks.forEach(t => {
          results[t.id] = {
            popularity: t.popularity || 0,
            url: t.url, // useful for reference
          };
        });
      } catch (e) {
        console.warn("[PlatformMetrics] Spotify batch fetch failed for uid=%s", uid);
      }
    }
    return results;
  }

  // 2. Fallback for others (Parallel execution)
  const results = {};
  await Promise.all(
    items.map(async item => {
      let metrics = null;
      if (platform === "facebook")
        metrics = await fetchFacebookPostMetrics(item.uid, item.id, item.pageId);
      else if (platform === "instagram") metrics = await fetchInstagramMediaMetrics(item.id);
      else if (platform === "twitter") metrics = await fetchTwitterTweetMetrics(item.id);
      else if (platform === "linkedin") metrics = await fetchLinkedInMetrics(item.uid, item.id);

      if (metrics) results[item.id] = metrics;
    })
  );
  return results;
}

module.exports = {
  fetchFacebookPostMetrics,
  fetchTwitterTweetMetrics,
  fetchInstagramMediaMetrics,
  fetchTikTokMetrics,
  fetchLinkedInMetrics,
  fetchRedditMetrics,
  fetchBatchMetrics,
};
