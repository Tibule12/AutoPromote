const express = require("express");
const router = express.Router();
// Lightweight engagement routes placeholder.
// Other modules in the project mount this router at /api/engagement.

// Example health endpoint for engagement subsystem
router.get("/status", (req, res) => {
  res.json({ ok: true, service: "engagement", ts: Date.now() });
});

/**
 * POST /api/engagement/track
 * Lightweight tracking endpoint for client-side engagement events
 * Body: { type: 'like'|'share'|'comment'|'view', target: 'live'|'post'|..., id: string, meta?: {} }
 */
router.post("/track", async (req, res) => {
  try {
    const { type, target, id, meta } = req.body || {};
    // Basic validation
    if (!type || !target) return res.status(400).json({ ok: false, error: "missing_fields" });
    // For now: accept and acknowledge. Downstream systems (analytics) may ingest these.
    console.log("[engagement] track:", { type, target, id: id || "-" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[engagement] track error", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Export router
module.exports = router;
