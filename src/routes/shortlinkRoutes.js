const express = require("express");
const { resolveShortlink } = require("../services/shortlinkService");
const { db } = require("../firebaseAdmin");
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const router = express.Router();

// Public limiter for shortlink redirects to prevent mass scanning/abuse
const shortlinkPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_SHORTLINK_PUBLIC || "240", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "shortlink_public",
});

// GET /s/:code -> redirect with tracking params
router.get("/:code", shortlinkPublicLimiter, async (req, res) => {
  try {
    const { code } = req.params;
    const data = await resolveShortlink(code);
    if (!data) return res.status(404).send("Not found");
    const base = process.env.LANDING_BASE_URL || "/";
    const params = new URLSearchParams();
    if (data.platform) params.set("src", data.platform === "twitter" ? "tw" : data.platform);
    if (data.contentId) params.set("c", data.contentId);
    if (typeof data.variantIndex === "number") params.set("v", String(data.variantIndex));
    if (data.taskId) params.set("t", data.taskId);
    const url = base + (base.includes("?") ? "&" : "?") + params.toString();
    // Fire-and-forget event log
    try {
      const event = {
        type: "shortlink_resolve",
        code,
        ...data,
        createdAt: new Date().toISOString(),
      };
      await db.collection("events").add(event);
      // Attribution updater (legacy path)
      try {
        const { applyShortlinkClick } = require("../services/attributionUpdater");
        applyShortlinkClick(code, data);
      } catch (_) {}
      // Materialized variant stats click increment
      try {
        if (typeof data.variantIndex === "number" && data.usedVariant) {
          const { applyClickAttribution } = require("../services/variantStatsService");
          await applyClickAttribution({
            contentId: data.contentId,
            platform: data.platform,
            variant: data.usedVariant,
            clicks: 1,
          });
        }
      } catch (_) {}
    } catch (_) {}
    return res.redirect(302, url);
  } catch (e) {
    return res.status(500).send("error");
  }
});

module.exports = router;
