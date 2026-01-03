const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { issueToken, redeemToken, revokeToken, verifyToken } = require("../services/liveTokens");
const { db } = require("../firebaseAdmin");
const { signPlaybackUrl } = require("../services/cdnSigner");

// Create a private token for a live stream (streamer only)
router.post("/:liveId/create-token", authMiddleware, async (req, res) => {
  try {
    const { liveId } = req.params;
    const { maxUses = 0, ttlSeconds } = req.body || {};
    const streamerId = req.userId;
    const token = await issueToken({ liveId, streamerId, maxUses, ttlSeconds });
    const base = process.env.APP_BASE_URL || "";
    const url = base
      ? `${base.replace(/\/$/, "")}/live/${encodeURIComponent(liveId)}?token=${encodeURIComponent(token)}`
      : `/live/${encodeURIComponent(liveId)}?token=${encodeURIComponent(token)}`;
    return res.json({ ok: true, token, url });
  } catch (e) {
    console.error("create-token error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Redeem a token after viewer passes age-gate
router.post("/redeem", async (req, res) => {
  try {
    const { token, ageConfirmed } = req.body || {};
    if (!token) return res.status(400).json({ error: "token required" });
    if (!ageConfirmed) return res.status(403).json({ error: "age_confirmation_required" });
    const viewerMeta = { ip: req.ip, ua: req.headers["user-agent"] || null };
    try {
      const result = await redeemToken(token, viewerMeta);
      return res.json({ ok: true, token: result.token });
    } catch (err) {
      return res.status(400).json({ error: "invalid_token", reason: err.message });
    }
  } catch (e) {
    console.error("redeem error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Revoke a token (streamer only)
router.post("/:token/revoke", authMiddleware, async (req, res) => {
  try {
    const { token } = req.params;
    const info = await verifyToken(token);
    if (!info.valid) return res.status(404).json({ error: "token_not_found" });
    const data = info.data || {};
    if (data.streamerId !== req.userId && !(req.user && req.user.isAdmin)) {
      return res.status(403).json({ error: "not_allowed" });
    }
    await revokeToken(token);
    return res.json({ ok: true });
  } catch (e) {
    console.error("revoke error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// List tokens for a live (streamer only)
router.get("/:liveId/tokens", authMiddleware, async (req, res) => {
  try {
    const { liveId } = req.params;
    const q = await db
      .collection("live_tokens")
      .where("streamerId", "==", req.userId)
      .where("liveId", "==", liveId)
      .get();
    const tokens = q.docs.map(d => {
      const data = d.data() || {};
      return {
        token: data.token || d.id,
        uses: data.uses || 0,
        maxUses: data.maxUses || 0,
        createdAt: data.createdAt || null,
        expiresAt: data.expiresAt || null,
        revoked: !!data.revoked,
      };
    });
    return res.json({ ok: true, tokens });
  } catch (e) {
    console.error("list tokens error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Validate token endpoint (public) — useful for player readiness checks
router.get("/validate", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-live-token"];
    if (!token) return res.status(400).json({ error: "token required" });
    const v = await verifyToken(token);
    if (!v.valid) return res.status(400).json({ valid: false, reason: v.reason });
    const data = v.data || {};
    // Optionally generate a signed playback URL when CDN_SIGNING_SECRET is configured
    let playbackUrl = null;
    try {
      const ttl = parseInt(process.env.PLAYBACK_URL_TTL_SECONDS || "300", 10);
      playbackUrl = signPlaybackUrl({ liveId: data.liveId, token, ttlSeconds: ttl });
    } catch (e) {
      playbackUrl = null;
    }
    return res.json({ valid: true, data, playbackUrl });
  } catch (e) {
    console.error("validate token error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
