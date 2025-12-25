/* eslint-disable no-console */
const express = require("express");
const fetch = require("node-fetch");
const { admin, db } = require("../../firebaseAdmin");
const authMiddleware = require("../../authMiddleware");
const crypto = require("crypto");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const codeqlLimiter = require("../middlewares/codeqlRateLimit");

const router = express.Router();

// Apply CodeQL-detectable write limiter broadly to this router
router.use(codeqlLimiter.writes);

// Small per-route limiters to address missing-rate-limiting findings
const ytWriteLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_YT_WRITES || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "youtube_writes",
});
const ytPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_YT_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "youtube_public",
});

const YT_CLIENT_ID = process.env.YT_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
// Redirect URI configured in environment; example: https://www.autopromote.org/api/youtube/callback (legacy onrender also supported)
const YT_REDIRECT_URI = process.env.YT_REDIRECT_URI;
const { canonicalizeRedirect } = require("../utils/redirectUri");
const YT_REDIRECT_CANON = canonicalizeRedirect(YT_REDIRECT_URI, {
  requiredPath: "/api/youtube/callback",
});
// Prefer custom domain dashboard; fall back to legacy onrender subdomain for backward compatibility
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://www.autopromote.org";

function ensureEnv(res) {
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REDIRECT_URI) {
    return res
      .status(500)
      .json({ error: "YouTube not configured. Missing YT_CLIENT_ID/SECRET/REDIRECT_URI." });
  }
}

router.get("/health", (req, res) => {
  const mask = s => (s ? `${String(s).slice(0, 8)}…${String(s).slice(-4)}` : null);
  res.json({
    ok: true,
    hasClientId: !!YT_CLIENT_ID,
    hasClientSecret: !!YT_CLIENT_SECRET,
    hasRedirect: !!YT_REDIRECT_URI,
    clientIdMasked: mask(YT_CLIENT_ID),
    redirect: YT_REDIRECT_CANON || null,
  });
});

async function getUidFromAuthHeader(req) {
  try {
    const authz = req.headers.authorization || "";
    const [scheme, token] = authz.split(" ");
    if (scheme === "Bearer" && token) {
      const decoded = await admin.auth().verifyIdToken(String(token));
      return decoded.uid;
    }
  } catch (_) {}
  return null;
}

// Preferred: prepare OAuth URL securely
router.post("/auth/prepare", async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    // Light diagnostics (masked)
    try {
      const mask = s => (s ? `${String(s).slice(0, 8)}…${String(s).slice(-4)}` : "missing");
      console.log("[YouTube][prepare] Using client/redirect", {
        clientId: mask(YT_CLIENT_ID),
        redirectPresent: !!YT_REDIRECT_CANON,
      });
    } catch (_) {}
    const nonce = crypto.randomBytes(8).toString("hex");
    const state = `${uid}.${nonce}`;
    await db.collection("users").doc(uid).collection("oauth_state").doc("youtube").set(
      {
        state,
        nonce,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const scope = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ].join(" ");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(YT_CLIENT_ID)}&redirect_uri=${encodeURIComponent(YT_REDIRECT_CANON)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return res.json({ authUrl });
  } catch (e) {
    console.error("Failed to prepare YouTube OAuth", { error: e.message });
    return res.status(500).json({ error: "Failed to prepare YouTube OAuth" });
  }
});

router.get("/auth/start", ytWriteLimiter, async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    // Prefer Authorization header; id_token query is deprecated
    let uid = await getUidFromAuthHeader(req);
    if (!uid) {
      const idToken = req.query.id_token; // deprecated
      if (!idToken) return res.status(401).json({ error: "Unauthorized" });
      const decoded = await admin.auth().verifyIdToken(String(idToken));
      uid = decoded.uid;
    }
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const nonce = crypto.randomBytes(8).toString("hex");
    const state = `${uid}.${nonce}`;
    await db.collection("users").doc(uid).collection("oauth_state").doc("youtube").set(
      {
        state,
        nonce,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const scope = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ].join(" ");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(YT_CLIENT_ID)}&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).json({ error: "Failed to start YouTube OAuth" });
  }
});

router.get("/callback", ytPublicLimiter, async (req, res) => {
  if (ensureEnv(res)) return;
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });
  try {
    // Light diagnostics (masked)
    try {
      const mask = s => (s ? `${String(s).slice(0, 8)}…${String(s).slice(-4)}` : "missing");
      console.log("[YouTube][callback] Exchanging code with", {
        clientId: mask(YT_CLIENT_ID),
        redirectPresent: !!YT_REDIRECT_CANON,
      });
    } catch (_) {}
    let uidFromState;
    if (state && typeof state === "string" && state.includes(".")) {
      const [uid] = state.split(".");
      uidFromState = uid;
    }
    // Use safeFetch for SSRF protection
    const { safeFetch } = require("../utils/ssrfGuard");
    const tokenRes = await safeFetch("https://oauth2.googleapis.com/token", fetch, {
      fetchOptions: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: YT_CLIENT_ID,
          client_secret: YT_CLIENT_SECRET,
          redirect_uri: YT_REDIRECT_CANON,
          grant_type: "authorization_code",
        }),
      },
      requireHttps: true,
      allowHosts: ["oauth2.googleapis.com"],
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      // Redirect back to dashboard with an error hint so the UI can surface it cleanly
      try {
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set("youtube", "error");
        if (tokenData && tokenData.error) url.searchParams.set("reason", String(tokenData.error));
        return res.redirect(url.toString());
      } catch (_) {
        return res.status(400).json({
          error: "Failed to obtain YouTube access token",
          details: { error: tokenData.error },
        });
      }
    }

    // Optional: fetch channel info
    let channel = null;
    try {
      // Use safeFetch for SSRF protection
      const channelRes = await safeFetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        fetch,
        {
          fetchOptions: {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          },
          requireHttps: true,
          allowHosts: ["www.googleapis.com"],
        }
      );
      const channelData = await channelRes.json();
      channel = channelData.items ? channelData.items[0] : null;
    } catch (_) {}

    if (uidFromState) {
      const stored = {
        provider: "youtube",
        channel,
        obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      try {
        const { encryptToken, hasEncryption } = require("../services/secretVault");
        // tokenData may contain: access_token, refresh_token, scope, token_type, expires_in, id_token
        const copyWhitelist = ["scope", "token_type", "expires_in"];
        copyWhitelist.forEach(k => {
          if (tokenData[k] !== undefined) stored[k] = tokenData[k];
        });
        if (hasEncryption()) {
          if (tokenData.access_token)
            stored.encrypted_access_token = encryptToken(tokenData.access_token);
          if (tokenData.refresh_token)
            stored.encrypted_refresh_token = encryptToken(tokenData.refresh_token);
          stored.hasEncryption = true;
        } else {
          if (tokenData.access_token) stored.access_token = tokenData.access_token;
          if (tokenData.refresh_token) stored.refresh_token = tokenData.refresh_token;
          stored.hasEncryption = false;
        }
      } catch (e) {
        // fallback raw store
        if (tokenData.access_token) stored.access_token = tokenData.access_token;
        if (tokenData.refresh_token) stored.refresh_token = tokenData.refresh_token;
      }
      await db
        .collection("users")
        .doc(uidFromState)
        .collection("connections")
        .doc("youtube")
        .set(stored, { merge: true });
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set("youtube", "connected");
      return res.redirect(url.toString());
    }
    // Do not include raw token data in responses; keep public response minimal
    return res.json({ success: true, channel });
  } catch (err) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set("youtube", "error");
      return res.redirect(url.toString());
    } catch (_) {
      res.status(500).json({ error: err.message });
    }
  }
});

router.get(
  "/status",
  authMiddleware,
  ytPublicLimiter,
  require("../statusInstrument")("youtubeStatus", async (req, res) => {
    const { getCache, setCache } = require("../utils/simpleCache");
    const { dedupe } = require("../utils/inFlight");
    const { instrument } = require("../utils/queryMetrics");
    const uid = req.userId || req.user?.uid;
    const cacheKey = `youtube_status_${uid}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true });
    const result = await dedupe(cacheKey, async () =>
      instrument("ytStatusQuery", async () => {
        const snap = await db
          .collection("users")
          .doc(uid)
          .collection("connections")
          .doc("youtube")
          .get();
        if (!snap.exists) {
          const out = { connected: false };
          setCache(cacheKey, out, 5000);
          return out;
        }
        const data = snap.data();
        const out = { connected: true, channel: data.channel || null };
        setCache(cacheKey, out, 7000);
        return out;
      })
    );
    return res.json(result);
  })
);

// Fetch live stats for one video (requires contentId or explicit videoId)
router.get("/stats", authMiddleware, ytPublicLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const { contentId, videoId } = req.query;
    let vId = videoId;
    let contentDoc = null;
    if (contentId) {
      const snap = await db.collection("content").doc(String(contentId)).get();
      if (!snap.exists) return res.status(404).json({ error: "Content not found" });
      contentDoc = { id: snap.id, ...snap.data() };
      vId = vId || (contentDoc.youtube && contentDoc.youtube.videoId);
    }
    if (!vId) return res.status(400).json({ error: "videoId or contentId required" });
    const { fetchVideoStats } = require("../services/youtubeService");
    const stats = await fetchVideoStats({ uid, videoId: vId });
    return res.json({ success: true, stats });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Batch poll (manual trigger) for stale stats & velocity update
router.post("/stats/poll", authMiddleware, ytWriteLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const { velocityThreshold, batchSize } = req.body || {};
    const { pollYouTubeStatsBatch } = require("../services/youtubeStatsPoller");
    const result = await pollYouTubeStatsBatch({
      uid,
      velocityThreshold,
      batchSize: batchSize || 5,
    });
    return res.json({ success: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Upload a video to YouTube given a file URL (Phase 1 unified service)
router.post("/upload", authMiddleware, ytWriteLimiter, async (req, res) => {
  try {
    const {
      title,
      description,
      videoUrl,
      mimeType,
      contentId,
      shortsMode,
      optimizeMetadata = true,
      forceReupload = false,
      skipIfDuplicate = true,
    } = req.body || {};
    if (!title || !videoUrl)
      return res.status(400).json({ error: "title and videoUrl are required" });
    const uid = req.userId || req.user?.uid;
    let tags = [];
    if (contentId) {
      const snap = await db.collection("content").doc(String(contentId)).get();
      if (snap.exists) {
        const cData = snap.data();
        if (Array.isArray(cData.tags)) tags = cData.tags;
      }
    }
    const { uploadVideo } = require("../services/youtubeService");
    const outcome = await uploadVideo({
      uid,
      title,
      description: description || "",
      fileUrl: videoUrl,
      mimeType: mimeType || "video/mp4",
      contentId: contentId || null,
      shortsMode: !!shortsMode,
      optimizeMetadata: !!optimizeMetadata,
      contentTags: tags,
      forceReupload: !!forceReupload,
      skipIfDuplicate: !!skipIfDuplicate,
    });
    return res.json(outcome);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
