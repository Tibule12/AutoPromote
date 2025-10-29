// platformPoster.js
// Phase D: Realistic platform posting integration (foundation layer)
// Supports: facebook (page feed), twitter (X - basic v2 create tweet), fallback simulations for others
// NOTE: Actual success depends on valid credentials / API access levels.

const fetch = require('node-fetch');
const { db } = require('../firebaseAdmin');
// New platform service stubs
const { postToSpotify } = require('./spotifyService');
const { postToReddit } = require('./redditService');
const { postToDiscord } = require('./discordService');
const { postToLinkedIn } = require('./linkedinService');
const { postToTelegram } = require('./telegramService');
const { postToPinterest } = require('./pinterestService');

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
      tags: data.tags || [],
      youtubeVideoId: data.youtube && data.youtube.videoId
    };
  } catch (_) { return {}; }
}

async function postToFacebook({ contentId, payload, reason }) {
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

async function postToTikTok({ contentId, payload, reason }) {
  const uploadUrl = payload?.videoUrl || null;
  const hasCreds = process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_ACCESS_TOKEN;
  if (!hasCreds) {
    return { platform: 'tiktok', simulated: true, reason: 'missing_credentials', videoUrl: uploadUrl };
  }
  try {
    const { uploadTikTokVideo } = require('./tiktokService');
    const res = await uploadTikTokVideo({ contentId, payload });
    return { platform: 'tiktok', success: true, videoId: res.videoId, reason };
  } catch (e) {
    return { platform: 'tiktok', success: false, error: e.message || 'tiktok_upload_failed', reason };
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
  spotify: postToSpotify,
  reddit: postToReddit,
  discord: postToDiscord,
  telegram: postToTelegram
};

async function dispatchPlatformPost({ platform, contentId, payload, reason, uid }) {
  const handler = handlers[platform];
  if (!handler) return { platform, success: false, error: 'unsupported_platform' };
  return handler({ contentId, payload, reason, uid });
}

module.exports = { dispatchPlatformPost };
