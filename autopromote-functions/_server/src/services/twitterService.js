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

// ---- OAuth1 storage helpers ----
async function storeUserOAuth1Tokens(uid, oauthToken, oauthTokenSecret, meta = {}) {
  const ref = db.collection("users").doc(uid).collection("connections").doc("twitter");
  const useEncryption = hasEncryption();
  const doc = {
    oauth1_connected: true,
    oauth1_meta: meta,
    oauth1_missing: false, // clear missing flag on successful oauth1 connect
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (useEncryption) {
    doc.encrypted_oauth1_access_token = encryptToken(oauthToken);
    doc.encrypted_oauth1_access_secret = encryptToken(oauthTokenSecret);
    doc.oauth1_access_token = admin.firestore.FieldValue.delete();
    doc.oauth1_access_secret = admin.firestore.FieldValue.delete();
  } else {
    doc.oauth1_access_token = oauthToken;
    doc.oauth1_access_secret = oauthTokenSecret;
  }
  await ref.set(doc, { merge: true });
  return { stored: true };
}

async function getUserOAuth1Tokens(uid) {
  const ref = db.collection("users").doc(uid).collection("connections").doc("twitter");
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  const token = data.encrypted_oauth1_access_token
    ? decryptToken(data.encrypted_oauth1_access_token)
    : data.oauth1_access_token;
  const tokenSecret = data.encrypted_oauth1_access_secret
    ? decryptToken(data.encrypted_oauth1_access_secret)
    : data.oauth1_access_secret;
  if (!token || !tokenSecret) return null;
  return { token, tokenSecret };
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

  // Download media from URL (allow the media host through SSRF allowlist)
  let mediaResponse;
  try {
    const mediaHost = new URL(mediaUrl).hostname;
    mediaResponse = await safeFetch(mediaUrl, fetch, {
      requireHttps: true,
      allowHosts: [mediaHost],
    });
  } catch (e) {
    throw new Error(`Failed to download media from URL: ${e && e.message}`);
  }
  if (!mediaResponse.ok) {
    // Attempt Firebase Admin SDK download for private storage URLs
    const m = mediaUrl.match(/^https?:\/\/[^/]+\/([^/]+)\/(.+)$/i);
    if (m) {
      const bucketName = m[1];
      const objectPath = m[2];
      try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(objectPath);
        const data = await file.download();
        mediaResponse = { ok: true, buffer: async () => data[0] };
      } catch (err) {
        throw new Error(`Failed to download media from URL: ${err && err.message}`);
      }
    } else {
      throw new Error("Failed to download media from URL");
    }
  }

  let mediaBuffer;
  try {
    mediaBuffer = await mediaResponse.buffer();
  } catch (e) {
    // If fetch failed or is forbidden (e.g., private storage URL), try using Firebase Admin SDK to download
    const m = mediaUrl.match(/^https?:\/\/[^/]+\/([^/]+)\/(.+)$/i);
    if (m) {
      const bucketName = m[1];
      const objectPath = m[2];
      try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(objectPath);
        const data = await file.download();
        mediaBuffer = data[0];
      } catch (err) {
        throw new Error(`Failed to download media from storage bucket: ${err && err.message}`);
      }
    } else {
      throw new Error(`Failed to buffer media response: ${e && e.message}`);
    }
  }
  const mediaSize = mediaBuffer.length;

  // Twitter media upload uses v1.1 API with multipart/form-data
  // Prefer OAuth1.0a user-signed requests (required for many accounts). Fall back to OAuth2 if only OAuth2 tokens are present.
  const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

  // Prefer OAuth1 tokens when available
  const oauth1 = await getUserOAuth1Tokens(uid);
  const consumerKey = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CONSUMER_SECRET;

  // Helper to throw helpful guidance when upload fails due to missing OAuth1
  async function oauth1MissingError() {
    try {
      // Mark user's connection doc to indicate OAuth1 is required so the frontend can surface a banner
      const ref = db.collection("users").doc(uid).collection("connections").doc("twitter");
      await ref.set(
        {
          oauth1_missing: true,
          oauth1_missingAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      // Non-fatal; continue to throw the guidance error
      console.warn("Failed to persist oauth1_missing flag:", e.message);
    }
    const err = new Error(
      "Twitter media upload failed: OAuth1 credentials required for native media uploads. Reconnect with OAuth1 at /api/twitter/oauth1/prepare"
    );
    err.code = "oauth1_required";
    err.reconnectUrl = "/api/twitter/oauth1/prepare";
    return err;
  }

  // INIT phase
  let initResponse;
  if (oauth1 && consumerKey && consumerSecret) {
    // Build OAuth1 Authorization header including the form params in the signature
    const extraParams = {
      command: "INIT",
      total_bytes: mediaSize.toString(),
      media_type: mediaType,
    };
    const { buildOauth1Header } = require("../utils/oauth1");
    const authHeader = buildOauth1Header({
      method: "POST",
      url: UPLOAD_URL,
      consumerKey,
      consumerSecret,
      token: oauth1.token,
      tokenSecret: oauth1.tokenSecret,
      extraParams,
    });

    initResponse = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(extraParams),
    });
  } else {
    // Fallback: try using OAuth2 Bearer token (may be rejected with 403)
    if (!accessToken) throw oauth1MissingError();

    initResponse = await safeFetch(UPLOAD_URL, fetch, {
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
  }

  // Robustly handle non-JSON / empty responses and include status/body in errors
  const initText = await initResponse.text();
  let initData = null;
  try {
    initData = initText ? JSON.parse(initText) : null;
  } catch (e) {
    throw new Error(
      `Twitter media upload INIT returned invalid JSON (status ${initResponse.status}): ${initText}`
    );
  }
  if (!initResponse.ok) {
    // If we tried OAuth2 and got a 403, suggest OAuth1 reconnect
    if (!oauth1 && initResponse.status === 403) {
      const e = await oauth1MissingError();
      throw e;
    }
  }

  const mediaId = initData.media_id_string;

  // APPEND phase (simplified - in production, chunk large files)
  const FormData = require("form-data");
  const formData = new FormData();
  formData.append("command", "APPEND");
  formData.append("media_id", mediaId);
  formData.append("media", mediaBuffer, { filename: "media", contentType: mediaType });
  formData.append("segment_index", "0");

  let appendResponse;
  if (oauth1 && consumerKey && consumerSecret) {
    const { buildOauth1Header } = require("../utils/oauth1");
    // For multipart, do not include the binary body in the signature (per OAuth1 rules). Include the simple params instead.
    const authHeader = buildOauth1Header({
      method: "POST",
      url: UPLOAD_URL,
      consumerKey,
      consumerSecret,
      token: oauth1.token,
      tokenSecret: oauth1.tokenSecret,
      extraParams: { command: "APPEND", media_id: mediaId, segment_index: "0" },
    });

    appendResponse = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        ...formData.getHeaders(),
      },
      body: formData,
    });
  } else {
    appendResponse = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });
  }

  if (!appendResponse.ok) {
    let txt = "";
    try {
      txt = await appendResponse.text();
    } catch (e) {
      txt = "<no body>";
    }
    // If 403 and no oauth1, recommend reauth
    if (!oauth1 && appendResponse.status === 403) {
      const e = await oauth1MissingError();
      throw e;
    }
    throw new Error(`Twitter media upload APPEND failed (status ${appendResponse.status}): ${txt}`);
  }

  // FINALIZE phase
  let finalizeResponse;
  if (oauth1 && consumerKey && consumerSecret) {
    const { buildOauth1Header } = require("../utils/oauth1");
    const authHeader = buildOauth1Header({
      method: "POST",
      url: UPLOAD_URL,
      consumerKey,
      consumerSecret,
      token: oauth1.token,
      tokenSecret: oauth1.tokenSecret,
      extraParams: { command: "FINALIZE", media_id: mediaId },
    });

    finalizeResponse = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ command: "FINALIZE", media_id: mediaId }),
    });
  } else {
    finalizeResponse = await safeFetch(UPLOAD_URL, fetch, {
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
  }

  const finalizeText = await finalizeResponse.text();
  let finalizeData = null;
  try {
    finalizeData = finalizeText ? JSON.parse(finalizeText) : null;
  } catch (e) {
    throw new Error(
      `Twitter media upload FINALIZE returned invalid JSON (status ${finalizeResponse.status}): ${finalizeText}`
    );
  }
  if (!finalizeResponse.ok) {
    if (!oauth1 && finalizeResponse.status === 403) {
      const e = await oauth1MissingError();
      throw e;
    }
    throw new Error(
      `Twitter media upload FINALIZE failed (status ${finalizeResponse.status}): ${finalizeText}`
    );
  }

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
  storeUserOAuth1Tokens,
  getUserOAuth1Tokens,
  getValidAccessToken,
  cleanupOldStates,
  postTweet,
  postThread,
  uploadMedia,
  getTweetStats,
};
