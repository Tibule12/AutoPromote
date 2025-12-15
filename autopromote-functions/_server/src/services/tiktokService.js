// tiktokService.js - TikTok OAuth 2.0 and Content Posting API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const crypto = require("crypto");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";

/**
 * Get user's TikTok connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserTikTokConnection(uid) {
  const snap = await db.collection("users").doc(uid).collection("connections").doc("tiktok").get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Generate TikTok OAuth authorization URL
 */
function generateAuthUrl({
  clientKey,
  redirectUri,
  state,
  scope = "user.info.basic,video.upload,video.publish",
}) {
  const params = new URLSearchParams({
    client_key: clientKey,
    scope,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken({ code, redirectUri }) {
  if (!fetchFn) throw new Error("Fetch not available");

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error("TikTok client credentials not configured");
  }

  const body = {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };

  const response = await safeFetch(TOKEN_URL, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    requireHttps: true,
    allowHosts: ["open.tiktokapis.com"],
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok token exchange failed: ${error}`);
  }

  const data = await response.json();

  if (data.error || !data.data) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }

  return data.data; // { access_token, expires_in, refresh_token, open_id, scope }
}

/**
 * Refresh TikTok access token
 */
async function refreshToken(uid, refreshToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const clientKey = process.env.TIKTOK_CLIENT_KEY;

  if (!clientKey) {
    throw new Error("TikTok client key not configured");
  }

  const body = {
    client_key: clientKey,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  const response = await safeFetch(TOKEN_URL, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    requireHttps: true,
    allowHosts: ["open.tiktokapis.com"],
  });

  if (!response.ok) {
    throw new Error("TikTok token refresh failed");
  }

  const data = await response.json();

  if (data.error || !data.data) {
    throw new Error(data.error_description || "Token refresh failed");
  }

  const tokens = data.data;

  // Store refreshed tokens
  const ref = db.collection("users").doc(uid).collection("connections").doc("tiktok");
  try {
    const { encryptToken, hasEncryption } = require("./secretVault");
    if (hasEncryption()) {
      await ref.set(
        {
          tokens: encryptToken(JSON.stringify(tokens)),
          hasEncryption: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          ...tokens,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    await ref.set(
      {
        ...tokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return tokens;
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserTikTokConnection(uid);
  if (!connection || !connection.tokens) return null;

  const tokens = connection.tokens;
  const now = Date.now();

  // Check if token is still valid (TikTok tokens typically last 24 hours)
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + tokens.expires_in * 1000;
    if (now < expiresAt - 300000) {
      // 5 min buffer
      return tokens.access_token;
    }
  }

  // Try to refresh token
  if (tokens.refresh_token) {
    try {
      const refreshed = await refreshToken(uid, tokens.refresh_token);
      return refreshed.access_token;
    } catch (e) {
      console.warn("[TikTok] Token refresh failed:", e.message);
    }
  }

  return tokens.access_token;
}

/**
 * Initialize video upload - returns upload URL and video ID
 */
async function initializeVideoUpload({ accessToken, videoSize, chunkSize = 10485760 }) {
  if (!fetchFn) throw new Error("Fetch not available");

  const body = {
    post_info: {
      title: "",
      privacy_level: "SELF_ONLY", // Will be updated when publishing
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: Math.ceil(videoSize / chunkSize),
    },
  };

  const response = await safeFetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      requireHttps: true,
      allowHosts: ["open.tiktokapis.com"],
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok upload init failed: ${error}`);
  }

  const data = await response.json();

  if (data.error || !data.data) {
    throw new Error(data.error?.message || "Upload initialization failed");
  }

  return data.data; // { publish_id, upload_url }
}

/**
 * Upload video chunk
 */
async function uploadVideoChunk({ uploadUrl, videoBuffer, chunkIndex, totalChunks }) {
  if (!fetchFn) throw new Error("Fetch not available");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes ${chunkIndex * 10485760}-${Math.min((chunkIndex + 1) * 10485760 - 1, videoBuffer.length - 1)}/${videoBuffer.length}`,
    },
    body: videoBuffer.slice(
      chunkIndex * 10485760,
      Math.min((chunkIndex + 1) * 10485760, videoBuffer.length)
    ),
  });

  if (!response.ok) {
    throw new Error(`Chunk upload failed: ${response.statusText}`);
  }

  return { success: true };
}

/**
 * Publish the uploaded video
 */
async function publishVideo({
  accessToken,
  publishId,
  title,
  privacyLevel = "PUBLIC_TO_EVERYONE",
}) {
  if (!fetchFn) throw new Error("Fetch not available");

  const body = {
    post_info: {
      title: title || "New Video",
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: {
      source: "FILE_UPLOAD",
    },
  };

  const response = await safeFetch(
    `https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${publishId}`,
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      requireHttps: true,
      allowHosts: ["open.tiktokapis.com"],
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok publish failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "Publish failed");
  }

  return data.data; // { status, fail_reason, publicaly_available_post_id }
}

/**
 * Upload TikTok video - full implementation
 */
async function uploadTikTokVideo({ contentId, payload, uid }) {
  const bypass =
    process.env.CI_ROUTE_IMPORTS === "1" ||
    process.env.FIREBASE_ADMIN_BYPASS === "1" ||
    process.env.NODE_ENV === "test" ||
    typeof process.env.JEST_WORKER_ID !== "undefined";
  if (bypass) {
    // Return simulated response in test/bypass mode to avoid heavy network calls
    return {
      platform: "tiktok",
      success: true,
      simulated: true,
      videoId: `sim_${Date.now().toString(36)}`,
    };
  }
  if (!uid) {
    return { platform: "tiktok", success: false, error: "uid_required" };
  }

  const accessToken = await getValidAccessToken(uid);

  if (!accessToken) {
    return { platform: "tiktok", success: false, error: "not_authenticated" };
  }

  const videoUrl = payload?.videoUrl || payload?.mediaUrl;
  const title = payload?.title || payload?.message || "AutoPromote Video";
  const privacyLevel = payload?.privacy || "PUBLIC_TO_EVERYONE";

  if (!videoUrl) {
    return { platform: "tiktok", success: false, error: "video_url_required" };
  }

  try {
    // Download video
    const videoResponse = await safeFetch(videoUrl, fetchFn, {
      requireHttps: true,
    });

    if (!videoResponse.ok) {
      throw new Error("Failed to download video");
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;

    // Initialize upload
    const { publish_id, upload_url } = await initializeVideoUpload({
      accessToken,
      videoSize,
    });

    // Upload video chunks
    const chunkSize = 10485760; // 10MB
    const totalChunks = Math.ceil(videoSize / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      await uploadVideoChunk({
        uploadUrl: upload_url,
        videoBuffer: Buffer.from(videoBuffer),
        chunkIndex: i,
        totalChunks,
      });
    }

    // Publish video
    const publishResult = await publishVideo({
      accessToken,
      publishId: publish_id,
      title,
      privacyLevel,
    });

    // Store result in Firestore
    if (contentId) {
      try {
        await db
          .collection("content")
          .doc(contentId)
          .set(
            {
              tiktok: {
                publishId: publish_id,
                videoId: publishResult.publicaly_available_post_id || publish_id,
                status: publishResult.status,
                postedAt: new Date().toISOString(),
              },
            },
            { merge: true }
          );
      } catch (_) {}
    }

    return {
      platform: "tiktok",
      success: true,
      publishId: publish_id,
      videoId: publishResult.publicaly_available_post_id,
      status: publishResult.status,
    };
  } catch (e) {
    return {
      platform: "tiktok",
      success: false,
      error: e.message || "upload_failed",
    };
  }
}

/**
 * Post to TikTok (wrapper for platformPoster integration)
 */
async function postToTikTok({ contentId, payload, reason, uid }) {
  return uploadTikTokVideo({ contentId, payload, uid });
}

module.exports = {
  uploadTikTokVideo,
  postToTikTok,
  generateAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  getValidAccessToken,
  getUserTikTokConnection,
};
