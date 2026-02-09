// tiktokService.js - TikTok OAuth 2.0 and Content Posting API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

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

const DEFAULT_CHUNK_SIZE = parseInt(process.env.TIKTOK_CHUNK_SIZE || "5242880", 10); // 5MB default

// Compute candidate chunk sizes following TikTok Media Transfer Guide
function computeChunkCandidates(videoSize) {
  const MB = 1024 * 1024;
  const minChunk = 5 * MB;
  const candidates = [];

  if (videoSize < minChunk) {
    // Must upload whole file
    return [videoSize];
  }

  // Use a limited set of standard chunk sizes to avoid spanning thousands of candidates
  // TikTok supports chunks between 5MB and 64MB.
  // We prioritize larger chunks to reduce HTTP requests.
  const sizesToTryMB = [64, 50, 40, 32, 25, 20, 15, 10, 5];

  for (const sizeMB of sizesToTryMB) {
    const cs = sizeMB * MB;
    const totalChunks = Math.ceil(videoSize / cs);

    // Safety check for ridiculous chunk counts (unlikely with these sizes)
    if (totalChunks > 1000) continue;

    // We do NOT strictly enforce last-chunk >= 5MB here because most APIs allow the last chunk to be smaller.
    // If specific errors arise, we can adjust. The previous logic was overly restrictive and caused infinite-like loops.
    candidates.push(cs);
  }

  return candidates;
}

const fs = require("fs");
const path = require("path");
const TIKTOK_CAPTURE_DIR =
  process.env.TIKTOK_CAPTURE_DIR || path.join(process.cwd(), "tmp", "tiktok-chunk-captures");

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
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey) {
    throw new Error("TikTok client key not configured");
  }

  const body = {
    client_key: clientKey,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  const params = new URLSearchParams();
  params.append("client_key", clientKey);
  if (clientSecret) params.append("client_secret", clientSecret);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);

  const response = await safeFetch(TOKEN_URL, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    requireHttps: true,
    allowHosts: ["open.tiktokapis.com"],
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "<no-body>");
    console.error("[TikTok] refresh response not ok:", txt);
    throw new Error(`TikTok token refresh failed: ${txt}`);
  }

  const data = await response.json();
  // Support APIs that return tokens at top-level or under { data: { ... } }
  const tokens = data && data.data ? data.data : data;
  if (!tokens || !tokens.access_token) {
    try {
      console.error("[TikTok] refresh response json:", JSON.stringify(data));
    } catch (_) {}
    throw new Error(
      (data && data.error_description) || JSON.stringify(data) || "Token refresh failed"
    );
  }

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

  // If tokens is a raw string (legacy encrypted single-token), treat it as an access token
  if (tokens.raw && typeof tokens.raw === "string") {
    return tokens.raw;
  }

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

  return tokens.access_token || null;
}

/**
 * Save upload init capture for diagnostics
 */
async function saveInitCapture({
  publishId = null,
  initBody = null,
  status = null,
  resHeaders = null,
  resBody = null,
  error = null,
}) {
  try {
    await fs.promises.mkdir(TIKTOK_CAPTURE_DIR, { recursive: true });
    const id = Date.now().toString() + "-init-" + Math.random().toString(36).slice(2, 8);
    const dir = path.join(TIKTOK_CAPTURE_DIR, id);
    await fs.promises.mkdir(dir);
    const meta = {
      timestamp: new Date().toISOString(),
      publishId: publishId || null,
      status: status || null,
      resHeaders: resHeaders || null,
      resBody: resBody || null,
      error: error ? error.message || String(error) : null,
    };
    await fs.promises.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    if (initBody) {
      await fs.promises.writeFile(
        path.join(dir, "init-body.json"),
        JSON.stringify(initBody, null, 2)
      );
    }
    console.log(`[tiktok] saved init capture to ${dir}`);
    return dir;
  } catch (e) {
    console.warn("[tiktok] failed to save init capture", e && (e.message || e));
  }
}

/**
 * Initialize video upload - returns upload URL and video ID
 */
async function initializeVideoUpload({
  accessToken,
  videoSize,
  chunkSize = DEFAULT_CHUNK_SIZE,
  privacyLevel = "SELF_ONLY",
  // New flags for Commercial/Branded Content
  isCommercial = false,
  brandOrganic = false,
  brandedContent = false,
}) {
  if (!fetchFn) throw new Error("Fetch not available");

  const body = {
    post_info: {
      title: "",
      privacy_level: privacyLevel, // Set by caller (admin-approved publishes default PUBLIC)
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
      // Inject Commercial Content flags if present
      ...(isCommercial
        ? {
            // TikTok API structure for disclosure
            commercial_content_type: brandOrganic
              ? "BRAND_ORGANIC"
              : brandedContent
                ? "BRANDED_CONTENT"
                : "NONE",
            is_disclosed: true,
          }
        : {}),
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize === chunkSize ? videoSize : chunkSize,
      total_chunk_count: Math.ceil(videoSize / chunkSize),
    },
  };

  const callInit = async bodyToSend =>
    safeFetch("https://open.tiktokapis.com/v2/post/publish/video/init/", fetchFn, {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyToSend),
      },
      requireHttps: true,
      allowHosts: ["open.tiktokapis.com"],
    });

  // initial attempt
  let response = await callInit(body);

  // gather response headers for diagnostics
  const initResHeaders = {};
  try {
    if (response && response.headers && typeof response.headers.forEach === "function") {
      response.headers.forEach((val, k) => {
        initResHeaders[k] = val;
      });
    } else if (response && response.headers && typeof response.headers.entries === "function") {
      for (const [k, v2] of response.headers.entries()) initResHeaders[k] = v2;
    }
  } catch (_) {}

  // If TikTok complains about chunk params, consider a single-chunk retry only for small videos (<= 5MB)
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    // Save init capture for triage
    try {
      await saveInitCapture({
        initBody: body,
        status: response.status,
        resHeaders: initResHeaders,
        resBody: errorText || null,
      });
    } catch (_) {}

    if (errorText && /chunk|total chunk/i.test(errorText)) {
      const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
      if (videoSize <= MIN_CHUNK_BYTES) {
        try {
          const retryBody = {
            post_info: body.post_info,
            source_info: {
              source: "FILE_UPLOAD",
              video_size: videoSize,
              chunk_size: videoSize,
              total_chunk_count: 1,
            },
          };
          const retryRes = await callInit(retryBody);

          const retryResHeaders = {};
          try {
            if (retryRes && retryRes.headers && typeof retryRes.headers.forEach === "function") {
              retryRes.headers.forEach((val, k) => {
                retryResHeaders[k] = val;
              });
            } else if (
              retryRes &&
              retryRes.headers &&
              typeof retryRes.headers.entries === "function"
            ) {
              for (const [k, v2] of retryRes.headers.entries()) retryResHeaders[k] = v2;
            }
          } catch (_) {}

          if (retryRes.ok) {
            response = retryRes;
          } else {
            const err2 = await retryRes.text().catch(() => "");
            try {
              await saveInitCapture({
                initBody: retryBody,
                status: retryRes.status,
                resHeaders: retryResHeaders,
                resBody: err2 || null,
              });
            } catch (_) {}
            throw new Error(`TikTok upload init failed (retry): ${err2 || "<no body>"}`);
          }
        } catch (e) {
          throw new Error(`TikTok upload init failed: ${errorText || e.message || e}`);
        }
      } else {
        // For larger videos, do not retry with single-chunk since Media Transfer Guide requires chunks >= 5MB and <=64MB
        console.warn(
          "[tiktok] init error indicates chunk params, but videoSize > 5MB; not retrying single-chunk. error=%s",
          errorText || "<no-body>"
        );
        throw new Error(`TikTok upload init failed: ${errorText || "<no body>"}`);
      }
    } else {
      throw new Error(`TikTok upload init failed: ${errorText || "<no body>"}`);
    }
  }

  const data = await response.json().catch(() => null);

  if (!data || (data.error && data.error.code !== "ok") || !data.data) {
    console.error("[tiktok] init returned invalid data", data);
    throw new Error((data && data.error && data.error.message) || "Upload initialization failed");
  }

  return data.data; // { publish_id, upload_url }
}

/**
 * Save chunk capture for replay/diagnostics
 */
async function saveChunkCapture({
  publishId = null,
  uploadUrl,
  method = "PUT",
  headers = {},
  chunk = null,
  attempt = 0,
  variant = "default",
  status = null,
  resHeaders = null,
  resBody = null,
  error = null,
}) {
  try {
    await fs.promises.mkdir(TIKTOK_CAPTURE_DIR, { recursive: true });
    const id = Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8);
    const dir = path.join(TIKTOK_CAPTURE_DIR, id);
    await fs.promises.mkdir(dir);
    const meta = {
      timestamp: new Date().toISOString(),
      publishId: publishId || null,
      uploadUrl,
      method,
      headers,
      attempt,
      variant,
      status: status || null,
      resHeaders: resHeaders || null,
      resBody: resBody || null,
      error: error ? error.message || String(error) : null,
      chunkLength: chunk ? chunk.length : 0,
      chunkHexPrefix: chunk ? chunk.slice(0, 16).toString("hex") : null,
    };
    await fs.promises.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    if (chunk) {
      await fs.promises.writeFile(path.join(dir, `chunk-${attempt}-${variant}.bin`), chunk);
    }
    console.log(`[tiktok] saved chunk capture to ${dir}`);
    return dir;
  } catch (e) {
    console.warn("[tiktok] failed to save chunk capture", e && (e.message || e));
  }
}

/**
 * Upload video chunk
 */
async function uploadVideoChunk({
  uploadUrl,
  videoBuffer,
  chunkIndex,
  totalChunks: _totalChunks,
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxAttempts = 3,
  publishId = null,
}) {
  if (!fetchFn) throw new Error("Fetch not available");

  const start = chunkIndex * chunkSize;
  const end = Math.min((chunkIndex + 1) * chunkSize - 1, videoBuffer.length - 1);
  const chunk = videoBuffer.slice(
    start,
    Math.min((chunkIndex + 1) * chunkSize, videoBuffer.length)
  );

  // Prepare header permutations to try when the endpoint rejects certain header shapes
  const baseHeaders = { "Content-Type": "application/octet-stream" };
  const variants = [
    {
      name: "default",
      method: "PUT",
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${videoBuffer.length}`,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "no-content-length",
      method: "PUT",
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${videoBuffer.length}`,
      },
    },
    {
      name: "no-content-range",
      method: "PUT",
      headers: {
        ...baseHeaders,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "video-mp4",
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${videoBuffer.length}`,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "post-range",
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${videoBuffer.length}`,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "range-no-total",
      method: "PUT",
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}`,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "accept-any",
      method: "PUT",
      headers: {
        ...baseHeaders,
        Accept: "*/*",
        "Content-Range": `bytes ${start}-${end}/${videoBuffer.length}`,
        "Content-Length": `${chunk.length}`,
      },
    },
    {
      name: "put-video-mp4-no-range",
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": `${chunk.length}`,
      },
    },
  ];

  let lastErr = null;
  const tries = Math.min(maxAttempts, variants.length);

  for (let attempt = 0; attempt < tries; attempt++) {
    const v = variants[attempt];
    try {
      // Mask query for logs to avoid exposing tokens
      const urlForLog = uploadUrl.split("?")[0];
      console.log(
        `[tiktok] chunk upload attempt=%d variant=%s url=%s start=%d end=%d chunkLen=%d hexPrefix=%s`,
        attempt,
        v.name,
        urlForLog,
        start,
        end,
        chunk.length,
        chunk.slice(0, 16).toString("hex")
      );

      const res = await fetch(uploadUrl, {
        method: v.method || "PUT",
        headers: v.headers,
        body: chunk,
      });

      const bodyText = await res.text().catch(() => null);
      // collect response headers for diagnostics (may be empty in some environments)
      const resHeadersObj = {};
      try {
        if (res && res.headers && typeof res.headers.forEach === "function") {
          res.headers.forEach((val, k) => {
            resHeadersObj[k] = val;
          });
        } else if (res && res.headers && typeof res.headers.entries === "function") {
          for (const [k, v2] of res.headers.entries()) resHeadersObj[k] = v2;
        }
      } catch (_) {}

      if (res.ok) {
        console.log(
          `[tiktok] chunk upload succeeded attempt=%d variant=%s status=%d headers=%o`,
          attempt,
          v.name,
          res.status,
          resHeadersObj
        );
        return { success: true };
      }

      console.warn(
        `[tiktok] chunk upload attempt failed attempt=%d variant=%s status=%d body=%s headers=%o`,
        attempt,
        v.name,
        res.status,
        bodyText || "<no-body>",
        resHeadersObj
      );

      // Save capture for diagnostics
      try {
        await saveChunkCapture({
          publishId,
          uploadUrl,
          method: v.method || "PUT",
          headers: v.headers,
          chunk,
          attempt,
          variant: v.name,
          status: res.status,
          resHeaders: resHeadersObj,
          resBody: bodyText || null,
        });
      } catch (_) {}

      lastErr = new Error(
        `Chunk upload failed: status=${res.status} body=${bodyText || "<no-body>"}`
      );

      // Only retry for 415/416 which typically indicate header/byte-range issues
      if (![415, 416].includes(res.status)) {
        break;
      }

      // small backoff before next variant
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    } catch (e) {
      lastErr = e;
      console.warn("[tiktok] chunk upload exception", e && (e.message || e));
      try {
        await saveChunkCapture({
          publishId,
          uploadUrl,
          method: v && v.method ? v.method : "PUT",
          headers: v && v.headers ? v.headers : {},
          chunk,
          attempt,
          variant: v && v.name ? v.name : "exception",
          error: e,
        });
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  // Final capture if all attempts failed
  try {
    await saveChunkCapture({
      publishId,
      uploadUrl,
      method: "FINAL",
      headers: {},
      chunk,
      attempt: tries - 1,
      variant: "final-failed",
      error: lastErr,
    });
  } catch (_) {}

  throw lastErr || new Error("Chunk upload failed: unknown error");
}

/**
 * Publish the uploaded video
 */
async function publishVideo({ accessToken, publishId, title, privacyLevel = undefined, soundId }) {
  if (!fetchFn) throw new Error("Fetch not available");

  // Allow caller to override privacy when finalizing the publish
  const body = privacyLevel
    ? { publish_id: publishId, post_info: { privacy_level: privacyLevel } }
    : { publish_id: publishId };

  const response = await safeFetch(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
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
    console.error("[tiktok] publish status fetch failed", response.status, error);
    throw new Error(`TikTok publish failed: ${error}`);
  }

  const data = await response.json();

  if (data.error && data.error.code !== "ok") {
    console.error("[tiktok] publish response error", data);
    throw new Error(data.error.message || "Publish failed");
  }

  return data.data; // { status, fail_reason, publicaly_available_post_id }
}

/**
 * Upload TikTok video - full implementation
 */
async function pullFromUrlPublish({
  accessToken,
  videoUrl,
  contentId,
  privacyLevel = undefined,
  maxWaitMs = 120000,
  isCommercial = false,
  brandOrganic = false,
  brandedContent = false,
}) {
  if (!fetchFn) throw new Error("Fetch not available");
  // Init PULL_FROM_URL
  const initBody = {
    post_info: {
      title: "",
      privacy_level: privacyLevel || "SELF_ONLY",
      is_commercial_content: isCommercial,
      brand_content_toggle: brandedContent,
      brand_organic_toggle: brandOrganic,
    },
    source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
  };

  const initRes = await safeFetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(initBody),
      },
      requireHttps: true,
      allowHosts: ["open.tiktokapis.com"],
    }
  );

  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    return { success: false, error: `init_failed: ${txt}` };
  }

  const initJson = await initRes.json().catch(() => ({}));
  const publishId = initJson?.data?.publish_id;
  if (!publishId) return { success: false, error: `no_publish_id` };

  const start = Date.now();
  let lastDownloaded = -1;
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await safeFetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      fetchFn,
      {
        fetchOptions: {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ publish_id: publishId }),
        },
        requireHttps: true,
        allowHosts: ["open.tiktokapis.com"],
      }
    );
    let statusJson = await statusRes.json().catch(() => ({}));
    const s = statusJson && statusJson.data ? statusJson.data : null;
    if (s) {
      // If download is in progress, check progress
      if (s.downloaded_bytes && s.downloaded_bytes > lastDownloaded)
        lastDownloaded = s.downloaded_bytes;
      if (s.status === "SUCCESS" || s.status === "PUBLISH_COMPLETE") {
        return { success: true, publishId, status: s.status, data: s };
      }
      if (s.status === "FAILED") {
        return {
          success: false,
          publishId,
          status: "FAILED",
          reason: s.fail_reason || null,
          data: s,
        };
      }
    }
    // If we have seen no progress after several polls, consider stalled
    if (Date.now() - start > 30000 && lastDownloaded === 0) {
      return { success: false, publishId, status: "stalled", reason: "download_stalled" };
    }
  }
  return { success: false, publishId, reason: "timeout" };
}

async function uploadTikTokVideo({ contentId, payload, uid, reason }) {
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

  let accessToken = await getValidAccessToken(uid);

  if (!accessToken) {
    return { platform: "tiktok", success: false, error: "not_authenticated" };
  }

  // Determine video URL from payload or content doc
  let videoUrl = payload?.videoUrl || payload?.mediaUrl || payload?.url || payload?.video_url;

  // Construct Caption/Title: TikTok 'title' is actually the post caption.
  // We must incorporate hashtags if they are provided separately.
  let baseTitle = payload?.title || payload?.message || "AutoPromote Video";

  // Append hashtags if present and not already in the title
  if (payload?.hashtagString && !baseTitle.includes(payload.hashtagString.trim())) {
    baseTitle += ` ${payload.hashtagString.trim()}`;
  } else if (Array.isArray(payload?.hashtags) && payload.hashtags.length > 0) {
    const tagStr = payload.hashtags.map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    if (!baseTitle.includes(tagStr)) {
      baseTitle += ` ${tagStr}`;
    }
  }

  const title = baseTitle;

  // Default privacy: make approved publishes public, otherwise can be overridden by payload.privacy
  let privacyLevel =
    payload?.privacy || (reason === "approved" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY");

  // Extract commercial content metrics
  const opts = payload?.platform_options?.tiktok || {};
  const isCommercial = opts.is_commercial_content || opts.commercial || false;
  const brandOrganic = opts.brand_organic_toggle || opts.brandOrganic || false;
  const brandedContent = opts.brand_content_toggle || opts.brandedContent || false;

  if (isCommercial || brandOrganic || brandedContent) {
    privacyLevel = "PUBLIC_TO_EVERYONE";
  }

  // If we have a contentId, prefer a fresh signed URL from content doc
  if (contentId) {
    try {
      const cSnap = await db.collection("content").doc(contentId).get();
      if (cSnap.exists) {
        const c = cSnap.data();
        // prefer storagePath if present for deterministic signed URL
        let storagePath = c.storagePath || null;
        if (!storagePath && c.url) {
          try {
            const u = new URL(c.url);
            if (u.hostname === "firebasestorage.googleapis.com") {
              const match = u.pathname.match(/\/o\/(.+)$/);
              if (match && match[1]) {
                storagePath = decodeURIComponent(match[1]);
              }
            } else {
              const parts = u.pathname.split("/").filter(Boolean);
              if (parts.length >= 2) {
                // strip leading bucket name if present
                if (parts[0] === (process.env.FIREBASE_STORAGE_BUCKET || "")) parts.shift();
                storagePath = parts.join("/");
              }
            }
          } catch (e) {
            /* ignore */
          }
        }
        if (!process.env.TIKTOK_FORCE_FILE_UPLOAD) {
          if (storagePath) {
            const { Storage } = require("@google-cloud/storage");
            const storage = new Storage();
            try {
              const file = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET).file(storagePath);
              const [signed] = await file.getSignedUrl({
                version: "v4",
                action: "read",
                expires: Date.now() + 60 * 60 * 1000,
              });
              videoUrl = signed;
              // persist fresh URL
              try {
                await db
                  .collection("content")
                  .doc(contentId)
                  .update({ mediaUrl: signed, urlSignedAt: new Date().toISOString() });
              } catch (_) {}
            } catch (e) {
              console.warn(
                "[tiktok] failed to generate signed url from storagePath",
                e && (e.message || e)
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn("[tiktok] failed to refresh signed url for content", e && (e.message || e));
    }
  }

  if (!videoUrl) {
    return { platform: "tiktok", success: false, error: "video_url_required" };
  }

  try {
    // If possible, try PULL_FROM_URL first (cheaper). If it stalls/fails, fallback to FILE_UPLOAD
    let triedPull = false;
    if (contentId && videoUrl && !process.env.TIKTOK_FORCE_FILE_UPLOAD) {
      triedPull = true;
      let pullResult = await pullFromUrlPublish({
        accessToken,
        videoUrl,
        contentId,
        privacyLevel,
        isCommercial,
        brandOrganic,
        brandedContent,
      });

      // If token is invalid, attempt a server-side refresh and retry once
      if (pullResult && pullResult.error && /access_token_invalid|401/i.test(pullResult.error)) {
        console.log(
          "[tiktok] pull init reported token invalid - attempting server-side refresh for uid=%s",
          uid
        );
        try {
          const conn = await getUserTikTokConnection(uid);
          const refreshTok =
            conn &&
            conn.tokens &&
            (conn.tokens.refresh_token || conn.tokens.refreshToken || conn.tokens.refresh);
          if (refreshTok) {
            const refreshed = await refreshToken(uid, refreshTok);
            accessToken =
              refreshed && refreshed.access_token ? refreshed.access_token : accessToken;
            console.log("[tiktok] refresh succeeded, retrying PULL_FROM_URL with new token");
            pullResult = await pullFromUrlPublish({
              accessToken,
              videoUrl,
              contentId,
              privacyLevel,
              isCommercial,
              brandOrganic,
              brandedContent,
            });
          } else {
            console.warn("[tiktok] no refresh token available for uid=%s", uid);
          }
        } catch (e) {
          console.warn("[tiktok] server-side refresh failed:", e && (e.message || e));
        }
      }

      if (pullResult && pullResult.success) {
        // Record in Firestore
        try {
          await db
            .collection("content")
            .doc(contentId)
            .set(
              {
                tiktok: {
                  publishId: pullResult.publishId,
                  videoId: pullResult.publishId,
                  status: pullResult.status,
                  postedAt: new Date().toISOString(),
                },
              },
              { merge: true }
            );
        } catch (_) {}
        try {
          require("./metricsRecorder").incrCounter("tiktok.publish.success");
        } catch (_) {}
        return {
          platform: "tiktok",
          success: true,
          publishId: pullResult.publishId,
          status: pullResult.status,
        };
      }

      // If pull failed and is a transient stall, proceed to file upload fallback
      console.warn(
        "[tiktok] PULL_FROM_URL failed or stalled, falling back to FILE_UPLOAD",
        pullResult && (pullResult.reason || pullResult.error || pullResult.status)
      );
      try {
        require("./metricsRecorder").incrCounter("tiktok.upload.fallback.file_upload");
      } catch (_) {}
    }

    // Download video for FILE_UPLOAD fallback (unless caller supplied a buffer)
    let videoBuffer;
    let videoSize;
    if (payload && payload.videoBuffer) {
      // Accept a Buffer or base64 string supplied by the caller to avoid a second download
      if (typeof payload.videoBuffer === "string") {
        videoBuffer = Buffer.from(payload.videoBuffer, "base64");
      } else {
        videoBuffer = Buffer.from(payload.videoBuffer);
      }
      videoSize = videoBuffer.byteLength;
    } else {
      const videoResponse = await safeFetch(videoUrl, fetchFn, {
        requireHttps: true,
        fetchOptions: { redirect: "follow" },
      });

      if (!videoResponse.ok) {
        console.error(`[tiktok] Download failed for URL: ${videoUrl}`);
        const statusText =
          videoResponse && videoResponse.status ? `status=${videoResponse.status}` : "";
        let errorBody = "";
        try {
          errorBody = await videoResponse.text();
        } catch (_) {}
        throw new Error(
          `Failed to download video ${statusText} from ${videoUrl}. Body: ${errorBody}`
        );
      }

      const ab = await videoResponse.arrayBuffer();
      videoBuffer = Buffer.from(ab);
      videoSize = videoBuffer.byteLength;

      if (videoSize < 100) {
        let snippet = "";
        try {
          snippet = videoBuffer.toString("utf8").replace(/\n/g, " ");
        } catch (_) {}
        throw new Error(
          `Video file corrupted (too small: ${videoSize} bytes) from ${videoUrl}. Content: "${snippet}". Please re-upload.`
        );
      }
    }

    // For small videos, try the simpler single-PUT upload endpoint which is less error-prone
    if (videoSize <= DEFAULT_CHUNK_SIZE) {
      try {
        const conn = await getUserTikTokConnection(uid);
        const openId = conn && (conn.open_id || (conn.meta && conn.meta.open_id));
        if (openId) {
          console.log("[tiktok] simple upload candidate openId=%s size=%d", openId, videoSize);
          const uploadRes = await safeFetch(
            "https://open.tiktokapis.com/v2/video/upload/",
            fetchFn,
            {
              fetchOptions: {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ open_id: openId }),
              },
              requireHttps: true,
              allowHosts: ["open.tiktokapis.com"],
            }
          );
          console.log("[tiktok] video/upload status=%s", uploadRes && uploadRes.status);
          const uploadData = await uploadRes.json().catch(() => null);
          console.log(
            "[tiktok] video/upload dataKeys=%o",
            uploadData && Object.keys(uploadData || {})
          );
          const uploadUrl = uploadData && uploadData.data && uploadData.data.upload_url;
          const videoId = uploadData && uploadData.data && uploadData.data.video_id;
          if (uploadUrl) {
            console.log(
              "[tiktok] simple upload -> PUT url=%s size=%d headers=%o",
              uploadUrl,
              videoSize,
              {
                "Content-Type": "video/mp4",
                "Content-Length": `${videoSize}`,
              }
            );
            const uploadToTikTokRes = await safeFetch(uploadUrl, fetchFn, {
              fetchOptions: {
                method: "PUT",
                headers: { "Content-Type": "video/mp4", "Content-Length": `${videoSize}` },
                body: Buffer.from(videoBuffer),
              },
              requireHttps: true,
              allowHosts: ["open.tiktokapis.com", "sandbox.tiktokapis.com"],
            });
            console.log(
              "[tiktok] simple upload PUT status=%s",
              uploadToTikTokRes && uploadToTikTokRes.status
            );
            const uploadToTikTokBody = await uploadToTikTokRes.text().catch(() => "<no-body>");
            console.log("[tiktok] simple upload PUT body=%s", uploadToTikTokBody);
            if (uploadToTikTokRes.ok) {
              // Finalize publish
              const createRes = await safeFetch(
                "https://open.tiktokapis.com/v2/video/publish/",
                fetchFn,
                {
                  fetchOptions: {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ open_id: openId, video_id: videoId, title }),
                  },
                  requireHttps: true,
                  allowHosts: ["open.tiktokapis.com"],
                }
              );
              if (createRes.ok) {
                const createData = await createRes.json().catch(() => null);
                const publishId =
                  (createData && createData.data && createData.data.video_id) || videoId || null;
                const status =
                  (createData && createData.data && createData.data.status) || "PUBLISH_COMPLETE";
                // Store result in Firestore
                if (contentId) {
                  try {
                    await db
                      .collection("content")
                      .doc(contentId)
                      .set(
                        {
                          tiktok: {
                            publishId: publishId,
                            videoId: publishId,
                            status: status,
                            postedAt: new Date().toISOString(),
                          },
                        },
                        { merge: true }
                      );
                  } catch (_) {}
                }
                try {
                  require("./metricsRecorder").incrCounter("tiktok.publish.success");
                } catch (_) {}
                return { platform: "tiktok", success: true, publishId, status };
              }
            }
          }
        }
      } catch (e) {
        console.warn(
          "[tiktok] simple upload attempt failed, falling back to chunked upload",
          e && (e.message || e)
        );
      }
    }

    // Initialize upload (FILE_UPLOAD).
    // Compute chunk_size candidates using the Media Transfer Guide and try them (larger chunks first).
    const computedCandidates = computeChunkCandidates(videoSize);
    // Append a few conservative fallbacks (DEFAULT_CHUNK_SIZE and a couple of small sizes) ensuring uniqueness
    const fallbackCandidates = [DEFAULT_CHUNK_SIZE, Math.min(DEFAULT_CHUNK_SIZE, 262144), 65536];
    const chunkSizeCandidates = Array.from(new Set([...computedCandidates, ...fallbackCandidates]));

    let publish_id = null;
    let upload_url = null;
    let uploadSucceeded = false;

    for (let csIndex = 0; csIndex < chunkSizeCandidates.length; csIndex++) {
      const cs = chunkSizeCandidates[csIndex];
      try {
        console.log("[tiktok] trying chunk_size candidate=%d", cs);
        const initData = await initializeVideoUpload({
          accessToken,
          videoSize,
          privacyLevel,
          chunkSize: cs,
          isCommercial,
          brandOrganic,
          brandedContent,
        });
        publish_id = initData.publish_id;
        upload_url = initData.upload_url;

        const totalChunks = Math.ceil(videoSize / cs);
        for (let i = 0; i < totalChunks; i++) {
          await uploadVideoChunk({
            publishId: publish_id,
            uploadUrl: upload_url,
            videoBuffer: Buffer.from(videoBuffer),
            chunkIndex: i,
            totalChunks,
            chunkSize: cs,
          });
        }

        uploadSucceeded = true;
        console.log(
          "[tiktok] upload completed with chunkSize=%d totalChunks=%d",
          cs,
          Math.ceil(videoSize / cs)
        );
        break;
      } catch (e) {
        console.warn(
          "[tiktok] upload attempt failed with chunkSize=%d: %s",
          cs,
          e && (e.message || e)
        );
        // If this is the last candidate, rethrow so outer catch handles it
        if (csIndex === chunkSizeCandidates.length - 1) {
          throw e;
        }

        // Wait 2 seconds before retrying to avoid rate limiting
        console.log("[tiktok] waiting 2s before next attempt...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // otherwise continue to next smaller chunk size
      }
    }

    if (!uploadSucceeded) {
      throw new Error("Failed to upload video after trying multiple chunk sizes");
    }

    // Publish video
    const soundId =
      payload && payload.platform_options && payload.platform_options.tiktok
        ? payload.platform_options.tiktok.sound_id
        : undefined;

    // Map TikTok commercial toggles
    let postPrivacyLevel = privacyLevel;
    if (
      payload &&
      payload.platform_options &&
      payload.platform_options.tiktok &&
      payload.platform_options.tiktok.is_sponsored
    ) {
      // If sponsored/commercial, enforce PUBLIC
      postPrivacyLevel = "PUBLIC_TO_EVERYONE";
    }

    const publishResult = await publishVideo({
      accessToken,
      publishId: publish_id,
      title,
      privacyLevel: postPrivacyLevel,
      soundId,
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

    try {
      require("./metricsRecorder").incrCounter("tiktok.publish.success");
    } catch (_) {}

    return {
      platform: "tiktok",
      success: true,
      publishId: publish_id,
      videoId: publishResult.publicaly_available_post_id,
      status: publishResult.status,
    };
  } catch (e) {
    console.error("[tiktok] uploadTikTokVideo failed:", e && (e.stack || e.message || e));
    try {
      require("./metricsRecorder").incrCounter("tiktok.publish.failure");
    } catch (_) {}
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
  // Forward reason so upload flow can default privacy (e.g. 'approved' -> PUBLIC)
  return uploadTikTokVideo({ contentId, payload, uid, reason });
}

/**
 * Fetch video metrics (views, likes, comments, shares)
 */
async function getVideoMetrics(uid, videoIds) {
  if (!fetchFn) throw new Error("Fetch not available");
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid TikTok access token");

  const ids = Array.isArray(videoIds) ? videoIds : [videoIds];
  if (ids.length === 0) return [];

  // TikTok V2 Video Query endpoint
  const url =
    "https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count";

  const response = await safeFetch(url, fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: {
          video_ids: ids,
        },
      }),
    },
    requireHttps: true,
    allowHosts: ["open.tiktokapis.com"],
  });

  if (!response.ok) {
    const txt = await response.text();
    console.warn("[TikTok] Failed to fetch metrics:", txt);
    return [];
  }

  const json = await response.json();
  return json.data?.videos || []; // Returns array of video objects with metrics
}

module.exports = {
  uploadTikTokVideo,
  postToTikTok,
  generateAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  getValidAccessToken,
  getUserTikTokConnection,
  getVideoMetrics,
};
