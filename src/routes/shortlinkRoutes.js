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
    // If data indicates a platform redirect, check if we should serve the Monetized Landing Page
    // "Landing Page" strategy: Serve HTML with AdSense/Affiliates first, then redirect or embed content.
    if (data.contentId) {
      // Fetch content metadata to populate the landing page
      const contentSnap = await db.collection("content").doc(data.contentId).get();
      const content = contentSnap.exists ? contentSnap.data() : {};

      // Sanitize inputs for HTML context
      const escapeHtml = str => {
        if (!str) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const safeTitle = escapeHtml(content.title || "Shared Content");
      const safeOgTitle = escapeHtml(content.title || "Check this out!");
      const safeDescription = escapeHtml(
        content.description || "Check out this amazing content shared via AutoPromote"
      );
      const safeUrl = escapeHtml(content.url || "");
      const safeThumbnail = escapeHtml(content.thumbnail || "");

      // Sanitize for Script context to prevent Reflected XSS
      const trackingPayload = JSON.stringify({
        type: "landing_view",
        code: code,
        contentId: data.contentId,
      });
      // Escape </script> tag break attempts in JSON string
      const safeTrackingJson = trackingPayload.replace(/</g, "\\u003c");

      // Simple HTML template with AdSense (Placeholder ID) and Affiliate Links
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <meta property="og:title" content="${safeOgTitle}">
    <meta property="og:description" content="${safeDescription}">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; margin: 0; display: flex; flex-direction: column; align-items: center; }
        .container { max-width: 600px; width: 100%; padding: 20px; background: white; margin-top: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .ad-slot { width: 100%; height: 250px; background: #eee; margin: 20px 0; display: flex; align-items: center; justify-content: center; color: #666; font-size: 0.8rem; border: 1px dashed #ccc; }
        .video-container { width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 10px; }
        .powered-by { margin-top: 40px; color: #999; font-size: 0.8rem; }
    </style>
    <!-- AdSense Script -->
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
</head>
<body>

    <div class="ad-slot">
         <!-- Top Banner Ad -->
         <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
             data-ad-slot="1234567890"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
         <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
         <span style="position:absolute;">Advertisement</span>
    </div>

    <div class="container">
        <h1>${safeTitle}</h1>
        
        <div class="video-container">
            ${
              content.url
                ? content.type === "video"
                  ? `<video src="${safeUrl}" controls style="max-width:100%; max-height:100%" poster="${safeThumbnail}"></video>`
                  : `<img src="${safeUrl}" style="max-width:100%; object-fit:contain" />`
                : "<p>Content loading...</p>"
            }
        </div>

        <p>${escapeHtml(content.description || "")}</p>
        
        <div style="margin-top:20px; padding:15px; background:#f9f9f9; border-radius:6px;">
            <h3>Recommended Gear</h3>
            <p>Make content like this using our affiliate partners:</p>
            <a href="https://amazon.com?tag=autopromote-20" class="btn" target="_blank">Shop Creator Gear</a>
        </div>
    </div>

    <div class="ad-slot">
         <!-- Bottom Banner Ad -->
         <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
             data-ad-slot="9876543210"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
         <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
         <span style="position:absolute;">Advertisement</span>
    </div>

    <div class="powered-by">
        Powered by <a href="/">AutoPromote</a> - Viral Growth Engine
    </div>

    <script>
        // Analytics tracking
        // Safe injection of JSON payload to prevent XSS
        const trackingPayload = ${safeTrackingJson};
        
        fetch('/api/events/track', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(trackingPayload)
        }).catch(e => {});
    </script>
</body>
</html>
        `;

      return res.send(html);
    }

    // Default legacy redirect behavior
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
