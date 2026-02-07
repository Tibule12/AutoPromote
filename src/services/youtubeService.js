const fetch = require("node-fetch");
const streamifier = require("streamifier");
const { google } = require("googleapis");
const { admin, db } = require("../firebaseAdmin");
const crypto = require("crypto");
const { recordVelocityTrigger, recordUploadDuplicate } = require("./aggregationService");
const { safeFetch } = require("../utils/ssrfGuard");

// Central YouTube service (Phase 1)
// Responsibilities:
// - Retrieve stored connection tokens
// - Build authorized OAuth2 client (with refresh handling)
// - Upload video from a remote file URL
// - Persist result (optionally) back to content document

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function hasRequiredScopes(scopeString) {
  if (!scopeString) return false;
  const scopes = scopeString.split(/[\s,]+/).filter(Boolean);
  return REQUIRED_SCOPES.every(s => scopes.includes(s));
}

const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserYouTubeConnection(uid) {
  const snap = await db.collection("users").doc(uid).collection("connections").doc("youtube").get();
  if (!snap.exists) return null;
  const d = snap.data();
  // ensure tokens exist for OAuth client build
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

function buildOAuthClient(connectionData) {
  // Handle connection data that handles tokens either at root or in .tokens (decrypted)
  const tokens =
    connectionData && connectionData.tokens
      ? { ...connectionData, ...connectionData.tokens }
      : connectionData || {};

  const { access_token, refresh_token, scope, token_type, expires_in, expiry_date } = tokens;

  const client = new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET,
    process.env.YT_REDIRECT_URI
  );
  client.setCredentials({
    access_token,
    refresh_token,
    scope,
    token_type,
    expiry_date: expiry_date || Date.now() + (expires_in ? expires_in * 1000 : 0),
  });
  return client;
}

async function ensureFreshTokens(oauth2Client, connectionData, uid) {
  // Flatten tokens for checks
  const tokens =
    connectionData && connectionData.tokens
      ? { ...connectionData, ...connectionData.tokens }
      : connectionData || {};

  // Force refresh if expiry is missing, invalid, or expired
  const expiry = oauth2Client.credentials.expiry_date;
  const isExpiredOrInvalid = !expiry || isNaN(expiry) || Date.now() >= expiry - 120000;

  if (!isExpiredOrInvalid) return oauth2Client; // still valid

  if (!tokens.refresh_token) {
    console.warn("YouTube token expired but no refresh_token available.");
    return oauth2Client;
  }

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    try {
      const { encryptToken, hasEncryption } = require("./secretVault");
      const ref = db.collection("users").doc(uid).collection("connections").doc("youtube");

      // Merge credentials into the flat token object
      const tokenObj = { ...tokens, ...credentials };
      // Remove self-referential nested properties if any
      delete tokenObj.tokens;

      if (hasEncryption()) {
        await ref.set(
          {
            tokens: encryptToken(JSON.stringify(tokenObj)),
            hasEncryption: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        await ref.set(
          { ...tokenObj, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    } catch (e) {
      // Fallback or error logging
      console.warn("[YouTube] Error saving refreshed token", e);
      // Try verify legacy save if needed or just skip
    }
    oauth2Client.setCredentials(credentials);
  } catch (err) {
    console.warn("[YouTube] Refresh token failed:", err.message);
  }
  return oauth2Client;
}

async function downloadVideoBuffer(fileUrl) {
  // Protect against SSRF by validating the URL before fetching.
  // Also enforce a sane maximum download size (configurable via env).
  const MAX_BYTES = parseInt(process.env.YT_MAX_VIDEO_BYTES || "52428800", 10); // 50MB default
  const res = await safeFetch(fileUrl, fetch, { requireHttps: true });
  if (!res || !res.ok) throw new Error("Failed to download video asset");
  const lenHeader = res.headers && res.headers.get && res.headers.get("content-length");
  if (lenHeader) {
    const len = parseInt(lenHeader, 10);
    if (!Number.isNaN(len) && len > MAX_BYTES)
      throw new Error("Remote video exceeds maximum allowed size");
  }
  const buf = await res.buffer();
  if (buf && buf.length > MAX_BYTES)
    throw new Error("Downloaded video exceeds maximum allowed size");
  return buf;
}

function deriveShortsMetadata(base) {
  // Basic heuristic: add #shorts if absent and likely vertical clip
  let { title, description } = base;
  if (!/\b#shorts\b/i.test(title)) title = `${title} #shorts`.trim();
  return { title, description };
}

async function uploadVideo({
  uid,
  title,
  description = "",
  fileUrl,
  videoUrl, // legacy alias (backwards compatibility)
  mimeType = "video/mp4",
  contentId,
  shortsMode,
  optimizeMetadata = true,
  contentTags = [],
  forceReupload = false,
  skipIfDuplicate = true,
  payload = {},
}) {
  // Support legacy callers that pass `videoUrl` instead of `fileUrl`
  if (!fileUrl && typeof videoUrl === "string") fileUrl = videoUrl;
  if (!uid) throw new Error("uid required");
  if (!title) throw new Error("title required");
  if (!fileUrl) throw new Error("fileUrl required");
  if (!contentId || typeof contentId !== "string" || !contentId.trim())
    throw new Error("contentId required and must be a non-empty string");
  const connection = await getUserYouTubeConnection(uid);
  if (!connection) throw new Error("YouTube not connected");
  if (!hasRequiredScopes(connection.scope || "")) {
    throw new Error("Stored YouTube connection missing required scopes");
  }

  // Compute deterministic upload hash (idempotency) - lightweight (not downloading file yet)
  const uploadHash = crypto
    .createHash("sha256")
    .update(`${uid}|${fileUrl}|${title}`, "utf8")
    .digest("hex");

  let existingUploadRecord = null;
  if (skipIfDuplicate) {
    try {
      const recordSnap = await db.collection("youtube_uploads").doc(uploadHash).get();
      if (recordSnap.exists) existingUploadRecord = recordSnap.data();
    } catch (_) {}
  }

  // If duplicate and not forcing reupload, short-circuit
  if (existingUploadRecord && !forceReupload) {
    // Optionally attach video mapping into content if missing
    if (contentId) {
      const contentRef = db.collection("content").doc(contentId);
      const cSnap = await contentRef.get();
      const cData = cSnap.exists ? cSnap.data() : {};
      if (!cData.youtube || !cData.youtube.videoId) {
        await contentRef.set(
          {
            youtube: {
              videoId: existingUploadRecord.videoId,
              publishedAt:
                existingUploadRecord.publishedAt ||
                existingUploadRecord.createdAt ||
                new Date().toISOString(),
              title:
                existingUploadRecord.optimizedTitle || existingUploadRecord.originalTitle || title,
              description:
                existingUploadRecord.optimizedDescription ||
                existingUploadRecord.originalDescription ||
                description,
              lastStatsCheck: null,
              stats: null,
              velocity: null,
              uploadHash,
            },
          },
          { merge: true }
        );
      }
    }
    try {
      await recordUploadDuplicate(true);
    } catch (_) {}
    return { success: true, videoId: existingUploadRecord.videoId, duplicate: true, uploadHash };
  }

  const oauth2Client = buildOAuthClient(connection);
  await ensureFreshTokens(oauth2Client, connection, uid);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let finalTitle = title;
  let finalDescription = description;

  // SPONSORSHIP CHECK (Enforce Disclosure)
  if (contentId) {
    try {
      const cSnap = await db.collection("content").doc(contentId).get();
      if (cSnap.exists) {
        const cData = cSnap.data();
        const mon = cData.monetization_settings || {};
        if (mon.is_sponsored) {
          const disclosure = mon.brand_name
            ? ` #ad #${mon.brand_name.replace(/\s+/g, "")}`
            : " #ad #sponsored";
          const promoLink = mon.product_link ? `\n\nCheck it out here: ${mon.product_link}` : "";

          if (!finalDescription.includes("#ad")) {
            finalDescription += "\n\n" + disclosure;
          }
          if (promoLink && !finalDescription.includes(mon.product_link)) {
            finalDescription += promoLink;
          }
        }
      }
    } catch (_) {}
  }

  const optimizer = optimizeMetadata ? require("./metadataOptimizer") : null;
  if (shortsMode) {
    const meta = deriveShortsMetadata({ title: finalTitle, description: finalDescription });
    finalTitle = meta.title;
    finalDescription = meta.description;
  }
  if (optimizer) {
    try {
      const optimized = optimizer.optimize({
        title: finalTitle,
        description: finalDescription,
        tags: contentTags,
        shortsMode,
      });
      finalTitle = optimized.title;
      finalDescription = optimized.description;
    } catch (e) {
      console.warn("[YouTube][optimize] failed:", e.message);
    }
  }

  const videoBuffer = await downloadVideoBuffer(fileUrl);

  const privacyStatus = payload.privacy || "public";
  const ytOptions = (payload && payload.platform_options && payload.platform_options.youtube) || {};
  const selfDeclaredMadeForKids = !!ytOptions.made_for_kids;

  const insertRes = await youtube.videos.insert({
    part: "snippet,status",
    requestBody: {
      snippet: {
        title: finalTitle,
        description: finalDescription,
        tags: contentTags,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids,
      },
    },
    media: { mimeType, body: streamifier.createReadStream(videoBuffer) },
  });

  const videoId = insertRes?.data?.id;
  const publishedAt = insertRes?.data?.snippet?.publishedAt || new Date().toISOString();

  if (contentId && videoId) {
    // Merge existing youtube object if present (retain earlier fields)
    const contentRef = db.collection("content").doc(contentId);
    const existing = await contentRef.get();
    const existingData = existing.exists ? existing.data().youtube || {} : {};
    await contentRef.set(
      {
        youtube: {
          ...existingData,
          videoId,
          publishedAt,
          title: finalTitle,
          description: finalDescription,
          lastStatsCheck: null,
          stats: null,
          velocity: null,
          createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          uploadHash,
          originalTitle: existingData.originalTitle || title,
          originalDescription: existingData.originalDescription || description,
          optimized: optimizeMetadata || shortsMode || existingData.optimized || false,
          optimizedTitle: finalTitle,
          optimizedDescription: finalDescription,
          lastOptimizedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
  }

  // Persist upload hash record for idempotency (best-effort)
  try {
    const uploadDoc = db.collection("youtube_uploads").doc(uploadHash);
    await uploadDoc.create({
      videoId,
      uid,
      contentId,
      fileUrl,
      originalTitle: title,
      originalDescription: description,
      optimizedTitle: finalTitle,
      optimizedDescription: finalDescription,
      publishedAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // If already exists (race), ignore
  }

  try {
    await recordUploadDuplicate(false);
  } catch (_) {}
  return { success: true, videoId, raw: insertRes.data, uploadHash, duplicate: false };
}

module.exports = {
  getUserYouTubeConnection,
  uploadVideo,
  /**
   * Fetch statistics for a single video using stored user credentials
   */
  fetchVideoStats: async function fetchVideoStats({ uid, videoId }) {
    if (!uid) throw new Error("uid required");
    if (!videoId) throw new Error("videoId required");
    const connection = await getUserYouTubeConnection(uid);
    if (!connection) throw new Error("YouTube not connected");
    const oauth2Client = buildOAuthClient(connection);
    await ensureFreshTokens(oauth2Client, connection, uid);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const resp = await youtube.videos.list({ part: "statistics,snippet", id: videoId });
    const item = resp.data.items && resp.data.items[0];
    if (!item) throw new Error("Video not found via API");
    return {
      videoId,
      statistics: item.statistics || {},
      snippet: item.snippet || {},
      fetchedAt: new Date().toISOString(),
    };
  },
  /**
   * Update a content document with latest stats + velocity
   */
  updateContentVideoStats: async function updateContentVideoStats({
    contentDoc,
    uid,
    velocityStrategy = "views_per_hour",
    velocityThreshold,
  }) {
    if (!contentDoc || !contentDoc.id) throw new Error("contentDoc with id required");
    const contentId = contentDoc.id;
    const youtubeInfo = contentDoc.youtube;
    if (!youtubeInfo || !youtubeInfo.videoId) throw new Error("Content has no youtube.videoId");
    const publishedAt = youtubeInfo.publishedAt || youtubeInfo.createdAt;
    let publishedMs = Date.parse(publishedAt || new Date().toISOString());
    if (Number.isNaN(publishedMs)) publishedMs = Date.now();
    const statsPayload = await this.fetchVideoStats({ uid, videoId: youtubeInfo.videoId });
    const views = parseInt(statsPayload.statistics.viewCount || "0", 10);
    const now = Date.now();
    const hoursSince = Math.max((now - publishedMs) / 3600000, 0.0167); // minimum 1 minute to avoid div/0
    let velocity = null;
    switch (velocityStrategy) {
      case "views_per_hour":
      default:
        velocity = views / hoursSince;
    }
    const velocityStatus = velocityThreshold
      ? velocity >= velocityThreshold
        ? "high"
        : "normal"
      : null;
    const contentRef = db.collection("content").doc(contentId);
    await contentRef.set(
      {
        youtube: {
          ...youtubeInfo,
          stats: statsPayload.statistics,
          lastStatsCheck: admin.firestore.FieldValue.serverTimestamp(),
          velocity,
          velocityStatus: velocityStatus || youtubeInfo.velocityStatus || null,
        },
      },
      { merge: true }
    );

    // If velocity crosses threshold (entering 'high') and not previously high, enqueue cross-promotion tasks placeholder
    if (velocityThreshold && velocityStatus === "high" && youtubeInfo.velocityStatus !== "high") {
      try {
        await db.collection("analytics").add({
          type: "velocity_trigger",
          platform: "youtube",
          contentId,
          videoId: youtubeInfo.videoId,
          velocity,
          velocityThreshold,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        try {
          await recordVelocityTrigger();
        } catch (_) {}
        // Enqueue cross-platform promotion tasks (basic set) via task queue
        try {
          const { enqueuePlatformPostTask } = require("./promotionTaskQueue");
          const platforms = ["tiktok", "instagram", "facebook"];
          for (const p of platforms) {
            await enqueuePlatformPostTask({
              contentId,
              uid,
              platform: p,
              reason: "youtube_velocity_high",
              payload: { sourceVideoId: youtubeInfo.videoId, velocity },
            });
          }
        } catch (inner) {
          console.warn("[YouTube][velocity-trigger] enqueue cross-platform failed:", inner.message);
        }
      } catch (e) {
        console.warn("[YouTube][velocity-trigger] logging failed:", e.message);
      }
    }
    return { contentId, videoId: youtubeInfo.videoId, velocity, views, velocityStatus };
  },
};
