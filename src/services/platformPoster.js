// platformPoster.js
// Phase D: Realistic platform posting integration (foundation layer)
// Supports: facebook (page feed), twitter (X - basic v2 create tweet), fallback simulations for others
// NOTE: Actual success depends on valid credentials / API access levels.

const fetch = require("node-fetch");
const { db } = require("../firebaseAdmin");
const hashtagEngine = require("./hashtagEngine");
// New platform service stubs
const { postToSpotify: _postToSpotify } = require("./spotifyService");
void _postToSpotify;
const { postToReddit } = require("./redditService");
const { postToDiscord } = require("./discordService");
const { postToLinkedIn } = require("./linkedinService");
const { postToTelegram } = require("./telegramService");
const { postToPinterest } = require("./pinterestService");
const { postToSnapchat } = require("./snapchatService");
const { uploadVideo: postToYouTube } = require("./youtubeService");

// Utility: safe JSON
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

function mask(v) {
  if (!v) return null;
  return v.slice(0, 4) + "…" + v.slice(-4);
}

async function buildContentContext(contentId) {
  if (!contentId) return {};
  try {
    const snap = await db.collection("content").doc(contentId).get();
    if (!snap.exists) return {};
    const data = snap.data();
    return {
      title: data.title,
      description: data.description,
      landingPageUrl: data.landingPageUrl || data.smartLink || data.url,
      processedUrl: data.processedUrl || null,
      url: data.url || null,
      tags: data.tags || [],
      youtubeVideoId: data.youtube && data.youtube.videoId,
    };
  } catch (_) {
    return {};
  }
}

async function postToFacebook({ contentId, payload, reason, uid }) {
  // Try user-context posting first
  if (uid) {
    try {
      const { postToFacebook: fbPost } = require("./facebookService");
      const result = await fbPost({ contentId, payload, reason, uid });
      if (result.success || result.error !== "not_authenticated") {
        return result;
      }
    } catch (e) {
      console.warn("[Facebook] User-context post failed, falling back to page token:", e.message);
    }
  }

  // Fallback to server page token (legacy)
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!PAGE_ID || !PAGE_TOKEN) {
    return { platform: "facebook", simulated: true, reason: "missing_credentials" };
  }
  const ctx = await buildContentContext(contentId);
  const messageBase = payload?.message || ctx.title || "New content";
  let link = payload?.shortlink || payload?.link || ctx.landingPageUrl || "";
  if (link) {
    if (!/\/s\//.test(link)) {
      // raw landing link, add tracking params
      if (!/([?&])src=/.test(link)) {
        link +=
          (link.includes("?") ? "&" : "?") + "src=fb&c=" + encodeURIComponent(contentId || "");
      }
    }
  }
  // Use safeFetch for SSRF protection
  const { safeFetch } = require("../utils/ssrfGuard");
  const body = new URLSearchParams({
    message: link ? `${messageBase}\n${link}` : messageBase,
    access_token: PAGE_TOKEN,
  });
  const res = await safeFetch(`https://graph.facebook.com/${PAGE_ID}/feed`, fetch, {
    fetchOptions: { method: "POST", body },
    requireHttps: true,
    allowHosts: ["graph.facebook.com"],
  });
  const json = await safeJson(res);
  if (!res.ok) {
    return {
      platform: "facebook",
      success: false,
      error: json.error?.message || JSON.stringify(json),
    };
  }
  return {
    platform: "facebook",
    success: true,
    postId: json.id,
    reason,
    masked: { page: mask(PAGE_ID) },
  };
}

async function postToTwitter({ contentId, payload, reason, uid }) {
  const ctx = await buildContentContext(contentId);
  let link = payload?.shortlink || payload?.link || ctx.landingPageUrl || "";
  if (link) {
    if (!/\/s\//.test(link)) {
      if (!/([?&])src=/.test(link)) {
        link +=
          (link.includes("?") ? "&" : "?") + "src=tw&c=" + encodeURIComponent(contentId || "");
      }
    }
  }

  const rawText = payload?.message || ctx.title || "New content";

  // Priority 1: User-Context (OAuth2) via twitterService
  // Now supports threads if payload.threadMode is true
  if (uid) {
    try {
      const { postTweet, postThread } = require("./twitterService");

      if (payload?.threadMode) {
        // Split text into chunks for threading
        const chunks = [];
        const words = rawText.split(/\s+/);
        let current = "";
        const MAX_LEN = 270; // safety buffer below 280

        for (const w of words) {
          if (current.length + w.length + 1 > MAX_LEN) {
            chunks.push(current.trim());
            current = w + " ";
          } else {
            current += w + " ";
          }
        }
        if (current.trim()) chunks.push(current.trim());

        // Append link to last chunk if possible, or make new chunk
        if (link) {
          if (chunks.length > 0) {
            const last = chunks[chunks.length - 1];
            if (last.length + link.length + 1 <= 280) {
              chunks[chunks.length - 1] = last + "\n" + link;
            } else {
              chunks.push(link);
            }
          } else {
            chunks.push(link);
          }
        }

        return await postThread({ uid, tweets: chunks, contentId });
      } else {
        // Single Tweet Mode
        const text = rawText.slice(0, 270) + (link ? `\n${link}` : "");
        return await postTweet({ uid, text, contentId });
      }
    } catch (e) {
      console.warn("[Twitter] User-context post failed:", e.message);
      // If we failed on a thread, do not fallback to single env-var tweet (which would be partial content)
      if (payload?.threadMode) {
        return { platform: "twitter", success: false, error: e.message };
      }
      // If single tweet, allow fallback below
    }
  }

  // Priority 2: System/Legacy (Env Vars) - Single Tweet Only
  let bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) return { platform: "twitter", simulated: true, reason: "missing_credentials" };

  const { safeFetch } = require("../utils/ssrfGuard");
  const text = rawText.slice(0, 270) + (link ? `\n${link}` : "");
  const res = await safeFetch("https://api.twitter.com/2/tweets", fetch, {
    fetchOptions: {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
    requireHttps: true,
    allowHosts: ["api.twitter.com"],
  });
  const json = await safeJson(res);
  if (!res.ok) {
    return { platform: "twitter", success: false, error: json.error || JSON.stringify(json) };
  }
  return { platform: "twitter", success: true, tweetId: json.data?.id, reason };
}

async function postToInstagram({ contentId, payload, reason, uid }) {
  try {
    const { publishInstagram } = require("./instagramPublisher");
    return await publishInstagram({ contentId, payload, reason, uid });
  } catch (e) {
    return { platform: "instagram", simulated: true, error: e.message, reason };
  }
}

async function postToTikTok({ contentId, payload, reason, uid }) {
  // Feature flag: if TikTok is disabled and the UID is not in the canary set, skip posting
  try {
    const enabled = String(process.env.TIKTOK_ENABLED || "false").toLowerCase() === "true";
    const canary = (process.env.TIKTOK_CANARY_UIDS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (!enabled && !(uid && canary.includes(uid))) {
      try {
        require("./metricsRecorder").incrCounter("tiktok.dispatch.skipped.disabled");
      } catch (_) {}
      return {
        platform: "tiktok",
        success: false,
        skipped: true,
        reason: "disabled_by_feature_flag",
      };
    }
  } catch (e) {
    // ignore gating errors and proceed
  }

  try {
    const { postToTikTok: tiktokPost } = require("./tiktokService");
    const res = await tiktokPost({ contentId, payload, reason, uid });
    if (res && res.success) {
      try {
        require("./metricsRecorder").incrCounter("tiktok.dispatch.success");
      } catch (_) {}
    } else {
      try {
        require("./metricsRecorder").incrCounter("tiktok.dispatch.failure");
      } catch (_) {}
    }
    return res;
  } catch (e) {
    try {
      require("./metricsRecorder").incrCounter("tiktok.dispatch.error");
    } catch (_) {}
    return {
      platform: "tiktok",
      success: false,
      error: e.message || "tiktok_upload_failed",
      reason,
    };
  }
}

async function postToSpotifyHandler(args) {
  const { uid, payload, contentId } = args || {};
  try {
    const { addTracksToPlaylist, postToSpotify } = require("./spotifyService");
    // If playlistId and trackUris provided, add tracks to an existing playlist
    if (
      payload &&
      payload.playlistId &&
      payload.trackUris &&
      Array.isArray(payload.trackUris) &&
      payload.trackUris.length
    ) {
      const res = await addTracksToPlaylist({
        uid,
        playlistId: payload.playlistId,
        trackUris: payload.trackUris,
      });
      return {
        platform: "spotify",
        success: true,
        snapshotId: res.snapshotId,
        added: res.tracksAdded,
      };
    }
    // If a playlist name provided, create playlist and optionally add tracks
    if (payload && payload.name) {
      const res = await postToSpotify({
        uid,
        name: payload.name,
        description: payload.description || "",
        trackUris: payload.trackUris || [],
        contentId,
      });
      return {
        platform: "spotify",
        success: true,
        playlist: { id: res.playlistId, url: res.url, name: res.name },
      };
    }
    return { platform: "spotify", success: false, error: "no_action_specified" };
  } catch (e) {
    return { platform: "spotify", success: false, error: e.message || "spotify_post_failed" };
  }
}

async function postToYouTubeHandler(args) {
  // Wrapper to match platformPoster signature
  // uploadVideo signature: ({ uid, fileUrl | videoUrl, title, description, privacy, tags, contentId })
  const { contentId, payload, reason, uid } = args;
  try {
    const res = await postToYouTube({
      uid,
      fileUrl: payload.url || payload.mediaUrl, // Use `fileUrl` key required by `uploadVideo`
      title: payload.title || payload.message,
      description: payload.description,
      privacy: payload.privacy || "public",
      tags: payload.tags || payload.hashtags,
      contentId,
      payload, // Pass full payload for advanced options (sponsorships, kids)
    });

    if (res.success) {
      return { platform: "youtube", success: true, videoId: res.videoId, reason };
    } else {
      return { platform: "youtube", success: false, error: res.error || "Upload failed" };
    }
  } catch (e) {
    return { platform: "youtube", success: false, error: e.message };
  }
}

const handlers = {
  facebook: postToFacebook,
  twitter: postToTwitter,
  instagram: postToInstagram,
  tiktok: postToTikTok,
  youtube: postToYouTubeHandler,
  linkedin: postToLinkedIn,
  pinterest: postToPinterest,
  snapchat: postToSnapchat,
  spotify: postToSpotifyHandler,
  reddit: postToReddit,
  discord: postToDiscord,
  telegram: postToTelegram,
};

async function dispatchPlatformPost({ platform, contentId, payload, reason, uid }) {
  // If no hashtagString provided and we have a contentId, generate platform
  // specific hashtags automatically so posting flows can include them.
  if (!payload.hashtagString && !payload.hashtags && contentId) {
    try {
      const contentSnap = await db.collection("content").doc(contentId).get();
      const content = contentSnap.exists ? contentSnap.data() : {};

      // SPONSORSHIP DISCLOSURE (Greedy Revenue Engine)
      // Automatically inject disclosure tags, product links, and force public visibility
      const mon = content.monetization_settings || {};
      if (mon.is_sponsored) {
        const disclosure = mon.brand_name
          ? ` #ad #${mon.brand_name.replace(/\s+/g, "")}`
          : " #ad #sponsored";
        const promoLink = mon.product_link ? `\n\nCheck it out here: ${mon.product_link}` : "";

        // 1. Inject into hashtagString (used by Reddit/LinkedIn/Twitter)
        const currentTags = payload.hashtagString || "";
        if (!currentTags.includes("#ad") && !currentTags.includes("#sponsored")) {
          payload.hashtagString = (currentTags + disclosure).trim();
        }

        // 2. Inject into message/text (used by Facebook/Generic)
        // Append promoLink here as well
        const msgKey = payload.message ? "message" : payload.text ? "text" : null;
        if (msgKey) {
          if (!payload[msgKey].includes("#ad")) {
            payload[msgKey] += disclosure;
          }
          if (promoLink && !payload[msgKey].includes(mon.product_link)) {
            payload[msgKey] += promoLink;
          }
        } else if (!payload.message && !payload.text) {
          // If no text yet, start with disclosure and link
          payload.message = (content.title || "Check this out") + disclosure + promoLink;
        }

        // 3. Force Public
        payload.privacyLevel = "PUBLIC";
      }

      const optimization = await hashtagEngine.generateCustomHashtags({
        content,
        platform,
        customTags: payload.customTags || [],
      });
      payload.hashtags = optimization.hashtags || [];
      payload.hashtagString = optimization.hashtagString || "";
    } catch (e) {
      // non-fatal; continue without hashtags
    }
  }

  const handler = handlers[platform];
  if (!handler) return { platform, success: false, error: "unsupported_platform" };

  // Ensure essential fields (mediaUrl, title, description) are present by fetching original content
  try {
    const missingMedia =
      !payload || !(payload.mediaUrl || payload.videoUrl || payload.imageUrl || payload.url);
    const missingTitle = !payload || !payload.title;
    const missingDesc = !payload || !payload.description;

    if (contentId && (missingMedia || missingTitle || missingDesc)) {
      const ctx = await buildContentContext(contentId);
      payload = payload || {}; // Ensure payload object exists

      if (missingMedia) {
        // Prefer processed/optimized URL, then raw upload URL, then link
        const mediaUrl = ctx.processedUrl || ctx.url || ctx.landingPageUrl || null;
        if (mediaUrl) payload.mediaUrl = mediaUrl;
      }
      if (missingTitle && ctx.title) payload.title = ctx.title;
      if (missingDesc && ctx.description) payload.description = ctx.description;
    }
  } catch (err) {
    console.warn("[platformPoster] Context hydration failed:", err.message);
  }
  // Spread `payload` into top-level for services that expect plain args
  // (e.g., redditService expects title/text/url at top-level), while
  // still providing `payload` for handlers that prefer the object.
  const baseArgs = { contentId, payload, reason, uid, ...(payload || {}) };
  // Merge any `platformOptions` into top-level args to meet service expectations
  try {
    const opts =
      payload && payload.platformOptions && typeof payload.platformOptions === "object"
        ? payload.platformOptions
        : null;
    if (opts) {
      Object.assign(baseArgs, opts);
      // Also merge into payload so services that read payload.* find the fields
      baseArgs.payload = { ...(baseArgs.payload || {}), ...(opts || {}) };
    }
  } catch (_) {
    /* ignore */
  }
  return handler(baseArgs);
}

module.exports = { dispatchPlatformPost };
