const express = require("express");
const router = express.Router();
const revenueEngine = require("../services/revenueEngine");
const { db } = require("../firebaseAdmin");

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
    if (!type || !target || !id)
      return res.status(400).json({ ok: false, error: "missing_fields" });

    // For now: accept and acknowledge. Downstream systems (analytics) may ingest these.
    console.log("[engagement] track:", { type, target, id: id || "-" });

    // Lookup content owner to credit engagement
    let creatorId = null;
    let contentId = id;

    // Optimistic lookup: try to find content doc
    let monetization = {}; // Default metadata
    try {
      const doc = await db.collection("content").doc(String(contentId)).get();
      if (doc.exists) {
        const data = doc.data();
        creatorId = data.userId || data.uid; // Support both field styles

        // Extract "TikTok Card" settings if present
        if (data.monetization_settings) {
          monetization = {
            niche: data.monetization_settings.niche,
            isSponsored: data.monetization_settings.is_sponsored,
            brand: data.monetization_settings.brand_name,
          };
        }
      }
    } catch (ignore) {
      // Content might not exist if tracking generic events, skip revenue logging
    }

    if (creatorId) {
      // Map types to values
      const VALUES = { view: 0.1, like: 1, comment: 2, share: 5, click: 3 };
      const value = VALUES[type] || 0.1;

      // Async fire-and-forget to Revenue Engine
      // Pass the extracted monetization metadata (Niche/Brand)
      revenueEngine
        .logEngagement(creatorId, contentId, type, value, monetization)
        .catch(err => console.error("[Engagement] Revenue log failed", err));
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[engagement] track error", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// Export router
module.exports = router;
