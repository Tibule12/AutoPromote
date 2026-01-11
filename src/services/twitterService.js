/* eslint-disable no-console */
// twitterService.js
// Handles OAuth2 PKCE flow & token refresh for Twitter (X) user-context posting

const fetch = require("node-fetch");
const crypto = require("crypto");
const { db, admin } = require("../firebaseAdmin");
const { encryptToken, decryptToken, hasEncryption } = require("./secretVault");
const { safeFetch } = require("../utils/ssrfGuard");

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const AUTH_BASE = "https://twitter.com/i/oauth2/authorize";
const TWEET_URL = "https://api.twitter.com/2/tweets";
const SCOPES = (process.env.TWITTER_SCOPES || "tweet.read tweet.write users.read offline.access")
  .split(/\s+/)
  .filter(Boolean);

function generatePkcePair() {
  const code_verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(code_verifier)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return { code_verifier, code_challenge: challenge };
}

async function createAuthStateDoc({ uid, code_verifier }) {
  const state = crypto.randomBytes(16).toString("hex");
  await db.collection("oauth_states").doc(state).set({
    uid,
    code_verifier,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return state;
}

async function consumeAuthState(state) {
  if (!state) return null;
  const ref = db.collection("oauth_states").doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete().catch(() => {}); // one-time use
  return snap.data();
}

function buildAuthUrl({ clientId, redirectUri, state, code_challenge }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

async function exchangeCode({ code, code_verifier, redirectUri, clientId }) {
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECTRET; // accept typo fallback
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier,
    client_id: clientId,
  });
  // If confidential client, Twitter expects HTTP Basic header (client_id:client_secret)
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const res = await safeFetch(TOKEN_URL, fetch, {
    fetchOptions: { method: "POST", headers, body },
    requireHttps: true,
    allowHosts: ["api.twitter.com"],
  });
  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { raw: txt };
  }
  if (process.env.DEBUG_TWITTER_OAUTH) {
    console.log("[Twitter][exchangeCode] status", res.status, "bodyKeys:", Object.keys(json));
  }
  if (!res.ok)
    throw new Error(json.error_description || json.error || "twitter_token_exchange_failed");
  return json; // { token_type, expires_in, access_token, scope, refresh_token }
}

async function refreshToken({ refresh_token, clientId }) {
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECTRET;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: clientId,
  });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const res = await safeFetch(TOKEN_URL, fetch, {
    fetchOptions: { method: "POST", headers, body },
    requireHttps: true,
    allowHosts: ["api.twitter.com"],
  });
  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { raw: txt };
  }
  if (process.env.DEBUG_TWITTER_OAUTH) {
    console.log("[Twitter][refreshToken] status", res.status, "keys:", Object.keys(json));
  }
  if (!res.ok) throw new Error(json.error_description || json.error || "twitter_refresh_failed");
  return json;
}

async function storeUserTokens(uid, tokens) {
  const ref = db.collection("users").doc(uid).collection("connections").doc("twitter");
  const expires_at = Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 3600 * 1000);
  const useEncryption = hasEncryption();
  const doc = {
    token_type: tokens.token_type,
    scope: tokens.scope,
    expires_at,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    hasEncryption: useEncryption,
  };
  if (useEncryption) {
    doc.encrypted_access_token = encryptToken(tokens.access_token);
    if (tokens.refresh_token) doc.encrypted_refresh_token = encryptToken(tokens.refresh_token);
    // remove legacy plaintext if re-writing
    doc.access_token = admin.firestore.FieldValue.delete();
    doc.refresh_token = admin.firestore.FieldValue.delete();
  } else {
    doc.access_token = tokens.access_token;
    doc.refresh_token = tokens.refresh_token || null;
  }
  await ref.set(doc, { merge: true });
  return { expires_at };
}

async function getValidAccessToken(uid) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) throw new Error("TWITTER_CLIENT_ID missing");
  const ref = db.collection("users").doc(uid).collection("connections").doc("twitter");
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  const now = Date.now();
  // Resolve access token (decrypt if needed)
  const accessPlain = data.encrypted_access_token
    ? decryptToken(data.encrypted_access_token)
    : data.access_token;
  const refreshPlain = data.encrypted_refresh_token
    ? decryptToken(data.encrypted_refresh_token)
    : data.refresh_token;

  if (data.expires_at && data.expires_at - now > 120000) {
    return accessPlain; // still valid
  }
  if (!refreshPlain) {
    return accessPlain; // cannot refresh
  }
  try {
    const refreshed = await refreshToken({ refresh_token: refreshPlain, clientId });
    await storeUserTokens(uid, refreshed); // will encrypt if key present
    return refreshed.access_token;
  } catch (e) {
    console.warn("[Twitter][refresh] failed:", e.message);
    return accessPlain; // fallback (may be expired)
  }
}

// Cleanup old oauth state docs (default older than 30 minutes)
async function cleanupOldStates(maxAgeMinutes = 30) {
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
  const query = await db
    .collection("oauth_states")
    .where("createdAt", "<", new admin.firestore.Timestamp(Math.floor(cutoff / 1000), 0))
    .limit(50) // batch limit
    .get()
    .catch(() => ({ empty: true, docs: [] }));
  if (query.empty) return 0;
  const batch = db.batch();
  query.docs.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(() => {});
  return query.docs.length;
}

/**
 * Post a tweet to Twitter using user's OAuth token
 * @param {Object} params - Tweet parameters
 * @param {string} params.uid - User ID
 * @param {string} params.text - Tweet text (required)
 * @param {string} [params.contentId] - Content ID for tracking
 * @param {Array<string>} [params.mediaIds] - Array of media IDs (from media upload)
 * @param {string} [params.replyToTweetId] - Tweet ID to reply to
 * @returns {Promise<Object>} Tweet creation result
 */
async function postTweet({ uid, text, contentId, mediaIds, replyToTweetId }) {
  if (!uid) throw new Error("uid required");
  if (!text || typeof text !== "string") throw new Error("text required and must be a string");
  if (text.length > 280) throw new Error("Tweet text exceeds 280 characters");

  // Get valid access token (will refresh if needed)
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Twitter access token found");

  // Build tweet payload
  const tweetPayload = { text };

  // Add media if provided
  if (mediaIds && Array.isArray(mediaIds) && mediaIds.length > 0) {
    tweetPayload.media = { media_ids: mediaIds };
  }

  // Add reply if provided
  if (replyToTweetId) {
    tweetPayload.reply = { in_reply_to_tweet_id: replyToTweetId };
  }

  // Post tweet using Twitter API v2
  const response = await safeFetch(TWEET_URL, fetch, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetPayload),
    },
    requireHttps: true,
    allowHosts: ["api.twitter.com"],
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errorMsg =
      responseData.detail || responseData.title || responseData.error || "Twitter API error";
    throw new Error(`Twitter posting failed: ${errorMsg}`);
  }

  const tweetId = responseData.data?.id;
  const tweetText = responseData.data?.text;

  // Store tweet info in Firestore if contentId provided
  if (contentId && tweetId) {
    try {
      const contentRef = db.collection("content").doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().twitter || {} : {};

      await contentRef.set(
        {
          twitter: {
            ...existingData,
            tweetId,
            text: tweetText || text,
            postedAt: new Date().toISOString(),
            createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[Twitter] Failed to store tweet info in Firestore:", e.message);
    }
  }

  return {
    success: true,
    platform: "twitter",
    tweetId,
    text: tweetText || text,
    url: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : null,
    raw: responseData,
  };
}

/**
 * Upload media to Twitter for use in tweets
 * @param {Object} params - Media upload parameters
 * @param {string} params.uid - User ID
 * @param {string} params.mediaUrl - URL of media to upload
 * @param {string} [params.mediaType] - Media type (image/jpeg, image/png, video/mp4, etc.)
 * @returns {Promise<string>} Media ID for use in tweet
 */
async function uploadMedia({ uid, mediaUrl, mediaType = "image/jpeg" }) {
  if (!uid) throw new Error("uid required");
  if (!mediaUrl) throw new Error("mediaUrl required");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Twitter access token found");

  // Download media from URL
  const mediaResponse = await safeFetch(mediaUrl, fetch, { requireHttps: true });
  if (!mediaResponse.ok) throw new Error("Failed to download media from URL");

  const mediaBuffer = await mediaResponse.buffer();
  const mediaSize = mediaBuffer.length;

  // Twitter media upload uses v1.1 API with multipart/form-data
  // This is a simplified implementation - for production, consider using a library like 'form-data'
  const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

  // INIT phase
  const initResponse = await safeFetch(UPLOAD_URL, fetch, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        command: "INIT",
        total_bytes: mediaSize.toString(),
        media_type: mediaType,
      }),
    },
    requireHttps: true,
    allowHosts: ["upload.twitter.com"],
  });

  const initData = await initResponse.json();
  if (!initResponse.ok) throw new Error("Twitter media upload INIT failed");

  const mediaId = initData.media_id_string;

  // APPEND phase (simplified - in production, chunk large files)
  const FormData = require("form-data");
  const formData = new FormData();
  formData.append("command", "APPEND");
  formData.append("media_id", mediaId);
  formData.append("media", mediaBuffer, { filename: "media", contentType: mediaType });
  formData.append("segment_index", "0");

  const appendResponse = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!appendResponse.ok) throw new Error("Twitter media upload APPEND failed");

  // FINALIZE phase
  const finalizeResponse = await safeFetch(UPLOAD_URL, fetch, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        command: "FINALIZE",
        media_id: mediaId,
      }),
    },
    requireHttps: true,
    allowHosts: ["upload.twitter.com"],
  });

  const finalizeData = await finalizeResponse.json();
  if (!finalizeResponse.ok) throw new Error("Twitter media upload FINALIZE failed");

  // Check processing status if needed
  if (finalizeData.processing_info) {
    // For video/gif, may need to poll STATUS
    // Simplified: just wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return mediaId;
}

/**
 * Get tweet statistics
 * @param {Object} params - Parameters
 * @param {string} params.uid - User ID
 * @param {string} params.tweetId - Tweet ID
 * @returns {Promise<Object>} Tweet stats
 */
async function getTweetStats({ uid, tweetId }) {
  if (!uid) throw new Error("uid required");
  if (!tweetId) throw new Error("tweetId required");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Twitter access token found");

  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,created_at`;

  const response = await safeFetch(url, fetch, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    requireHttps: true,
    allowHosts: ["api.twitter.com"],
  });

  const data = await response.json();
  if (!response.ok) throw new Error("Failed to fetch tweet stats");

  return {
    tweetId,
    metrics: data.data?.public_metrics || {},
    createdAt: data.data?.created_at,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Post a thread of tweets
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {Array<string>} params.tweets - Array of tweet strings.
 * @param {string} [params.contentId] - Content ID
 */
async function postThread({ uid, tweets, contentId }) {
  if (!uid) throw new Error("uid required");
  if (!tweets || !Array.isArray(tweets) || tweets.length === 0)
    throw new Error("tweets array required");

  let lastTweetId = null;
  const posted = [];

  for (let i = 0; i < tweets.length; i++) {
    const text = tweets[i];
    // Attach contentId only to the first tweet (the "head" of the thread)
    const res = await postTweet({
      uid,
      text,
      contentId: i === 0 ? contentId : null,
      replyToTweetId: lastTweetId,
    });
    lastTweetId = res.tweetId;
    posted.push(res);
  }
  return {
    success: true,
    platform: "twitter",
    threadId: posted[0].tweetId,
    childCount: posted.length - 1,
    posted,
  };
}

module.exports = {
  generatePkcePair,
  createAuthStateDoc,
  consumeAuthState,
  buildAuthUrl,
  exchangeCode,
  storeUserTokens,
  getValidAccessToken,
  cleanupOldStates,
  postTweet,
  postThread,
  uploadMedia,
  getTweetStats,
};
