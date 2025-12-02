// platformPoster.js
// Phase D: Realistic platform posting integration (foundation layer)
// Supports: facebook (page feed), twitter (X - basic v2 create tweet), fallback simulations for others
// NOTE: Actual success depends on valid credentials / API access levels.

const fetch = require('node-fetch');
const { db } = require('../firebaseAdmin');
const hashtagEngine = require('./hashtagEngine');
// New platform service stubs
const { postToSpotify } = require('./spotifyService');
const { postToReddit } = require('./redditService');
const { postToDiscord } = require('./discordService');
const { postToLinkedIn } = require('./linkedinService');
const { postToTelegram } = require('./telegramService');
const { postToPinterest } = require('./pinterestService');
const { postToSnapchat } = require('./snapchatService');

// Utility: safe JSON
async function safeJson(res) {
  let txt; try { txt = await res.text(); } catch (_) { return {}; }
  try { return JSON.parse(txt); } catch (_) { return { raw: txt }; }
}

function mask(v){ if(!v) return null; return v.slice(0,4)+"…"+v.slice(-4); }

async function buildContentContext(contentId) {
  if (!contentId) return {};
  try {
    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) return {};
    const data = snap.data();
    return {
      title: data.title,
      description: data.description,
      landingPageUrl: data.landingPageUrl || data.smartLink || data.url,
      processedUrl: data.processedUrl || null,
      url: data.url || null,
      tags: data.tags || [],
      youtubeVideoId: data.youtube && data.youtube.videoId
    };
  } catch (_) { return {}; }
}

async function postToFacebook({ contentId, payload, reason, uid }) {
  // Try user-context posting first
  if (uid) {
    try {
      const { postToFacebook: fbPost } = require('./facebookService');
      const result = await fbPost({ contentId, payload, reason, uid });
      if (result.success || result.error !== 'not_authenticated') {
        return result;
      }
    } catch (e) {
      console.warn('[Facebook] User-context post failed, falling back to page token:', e.message);
    }
  }
  
  // Fallback to server page token (legacy)
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!PAGE_ID || !PAGE_TOKEN) {
    return { platform: 'facebook', simulated: true, reason: 'missing_credentials' };
  }
  const ctx = await buildContentContext(contentId);
  const messageBase = payload?.message || ctx.title || 'New content';
  let link = payload?.shortlink || payload?.link || ctx.landingPageUrl || '';
  if (link) {
    if (!/\/s\//.test(link)) { // raw landing link, add tracking params
      if (!/([?&])src=/.test(link)) {
        link += (link.includes('?') ? '&' : '?') + 'src=fb&c=' + encodeURIComponent(contentId || '');
      }
    }
  }
  // Use safeFetch for SSRF protection
  const { safeFetch } = require('../utils/ssrfGuard');
  const body = new URLSearchParams({ message: link ? `${messageBase}\n${link}` : messageBase, access_token: PAGE_TOKEN });
  const res = await safeFetch(`https://graph.facebook.com/${PAGE_ID}/feed`, fetch, {
    fetchOptions: { method: 'POST', body },
    requireHttps: true,
    allowHosts: ['graph.facebook.com']
  });
  const json = await safeJson(res);
  if (!res.ok) {
    return { platform: 'facebook', success: false, error: json.error?.message || JSON.stringify(json) };
  }
  return { platform: 'facebook', success: true, postId: json.id, reason, masked: { page: mask(PAGE_ID) } };
}

async function postToTwitter({ contentId, payload, reason, uid }) {
  // Prefer user-context token via twitterService; fallback to env bearer (legacy)
  let bearer = null;
  if (uid) {
    try {
      const { getValidAccessToken } = require('./twitterService');
      bearer = await getValidAccessToken(uid);
    } catch (e) {
      console.warn('[Twitter] user token fetch failed:', e.message);
    }
  }
  if (!bearer) {
    bearer = process.env.TWITTER_BEARER_TOKEN || null;
  }
  if (!bearer) return { platform: 'twitter', simulated: true, reason: 'missing_credentials' };
  const ctx = await buildContentContext(contentId);
  let link = payload?.shortlink || payload?.link || ctx.landingPageUrl || '';
  if (link) {
    if (!/\/s\//.test(link)) {
      if (!/([?&])src=/.test(link)) {
        link += (link.includes('?') ? '&' : '?') + 'src=tw&c=' + encodeURIComponent(contentId || '');
      }
    }
  }
  // Use safeFetch for SSRF protection
  const { safeFetch } = require('../utils/ssrfGuard');
  const text = (payload?.message || ctx.title || 'New content').slice(0, 270) + (link ? `\n${link}` : '');
  const res = await safeFetch('https://api.twitter.com/2/tweets', fetch, {
    fetchOptions: {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    },
    requireHttps: true,
    allowHosts: ['api.twitter.com']
  });
  const json = await safeJson(res);
  if (!res.ok) {
    return { platform: 'twitter', success: false, error: json.error || JSON.stringify(json) };
  }
  return { platform: 'twitter', success: true, tweetId: json.data?.id, reason };
}

async function postToInstagram({ contentId, payload, reason }) {
  try {
    const { publishInstagram } = require('./instagramPublisher');
    return await publishInstagram({ contentId, payload, reason });
  } catch (e) {
    return { platform: 'instagram', simulated: true, error: e.message, reason };
  }
}

async function postToTikTok({ contentId, payload, reason, uid }) {
  try {
    const { postToTikTok: tiktokPost } = require('./tiktokService');
    return await tiktokPost({ contentId, payload, reason, uid });
  } catch (e) {
    return { platform: 'tiktok', success: false, error: e.message || 'tiktok_upload_failed', reason };
  }
}

async function postToSpotifyHandler(args) {
  const { uid, payload, contentId } = args || {};
  try {
    const { addTracksToPlaylist, postToSpotify } = require('./spotifyService');
    // If playlistId and trackUris provided, add tracks to an existing playlist
    if (payload && payload.playlistId && payload.trackUris && Array.isArray(payload.trackUris) && payload.trackUris.length) {
      const res = await addTracksToPlaylist({ uid, playlistId: payload.playlistId, trackUris: payload.trackUris });
      return { platform: 'spotify', success: true, snapshotId: res.snapshotId, added: res.tracksAdded };
    }
    // If a playlist name provided, create playlist and optionally add tracks
    if (payload && payload.name) {
      const res = await postToSpotify({ uid, name: payload.name, description: payload.description || '', trackUris: payload.trackUris || [], contentId });
      return { platform: 'spotify', success: true, playlist: { id: res.playlistId, url: res.url, name: res.name } };
    }
    return { platform: 'spotify', success: false, error: 'no_action_specified' };
  } catch (e) {
    return { platform: 'spotify', success: false, error: e.message || 'spotify_post_failed' };
  }
}

const handlers = {
  facebook: postToFacebook,
  twitter: postToTwitter,
  instagram: postToInstagram,
  tiktok: postToTikTok
  ,
  linkedin: postToLinkedIn,
  pinterest: postToPinterest,
  snapchat: postToSnapchat,
  spotify: postToSpotifyHandler,
  reddit: postToReddit,
  discord: postToDiscord,
  telegram: postToTelegram
};

async function dispatchPlatformPost({ platform, contentId, payload, reason, uid }) {
  // If no hashtagString provided and we have a contentId, generate platform
  // specific hashtags automatically so posting flows can include them.
  if (!payload.hashtagString && !payload.hashtags && contentId) {
    try {
      const contentSnap = await db.collection('content').doc(contentId).get();
      const content = contentSnap.exists ? contentSnap.data() : {};
      const optimization = await hashtagEngine.generateCustomHashtags({ content, platform, customTags: payload.customTags || [] });
      payload.hashtags = optimization.hashtags || [];
      payload.hashtagString = optimization.hashtagString || '';
    } catch (e) {
      // non-fatal; continue without hashtags
    }
  }

  const handler = handlers[platform];
  if (!handler) return { platform, success: false, error: 'unsupported_platform' };
  // Ensure payload.mediaUrl is present (prefer processedUrl if available)
  try {
    if (contentId && !(payload && (payload.mediaUrl || payload.videoUrl || payload.imageUrl || payload.url))) {
      const ctx = await buildContentContext(contentId);
      const mediaUrl = ctx.processedUrl || ctx.url || ctx.landingPageUrl || null;
      if (mediaUrl) {
        payload = { ...(payload || {}), mediaUrl };
      }
    }
  } catch (_) {}
  // Spread `payload` into top-level for services that expect plain args
  // (e.g., redditService expects title/text/url at top-level), while
  // still providing `payload` for handlers that prefer the object.
  const baseArgs = { contentId, payload, reason, uid, ...(payload || {}) };
  // Merge any `platformOptions` into top-level args to meet service expectations
  try {
    const opts = payload && payload.platformOptions && typeof payload.platformOptions === 'object' ? payload.platformOptions : null;
    if (opts) {
      Object.assign(baseArgs, opts);
      // Also merge into payload so services that read payload.* find the fields
      baseArgs.payload = { ...(baseArgs.payload || {}), ...(opts || {}) };
    }
  } catch (_) { /* ignore */ }
  return handler(baseArgs);
}

module.exports = { dispatchPlatformPost };
