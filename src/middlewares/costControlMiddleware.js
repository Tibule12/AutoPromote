// costControlMiddleware.js
// Enforces "Greedy" cost controls: Aggressive compression & limits for free/onboarding users.

const { db } = require("../firebaseAdmin");
const logger = require("../utils/logger");

module.exports = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.uid;
    // Assume user usage/tier info was already attached by usageLimitMiddleware
    const { isPaid, isInOnboarding } = req.userUsage || {};

    // If user is PAID, they get full quality/size limits
    if (isPaid) {
      req.fileOptions = {
        maxSizeBytes: 500 * 1024 * 1024, // 500MB
        compression: "standard", // 1080p allowed
        storageClass: "STANDARD",
      };
      return next();
    }

    // If user is FREE (even during unlimited onboarding), we control COSTS aggressively.
    // "You get unlimited uploads, but we compress them to save money."
    req.fileOptions = {
      maxSizeBytes: 100 * 1024 * 1024, // CAP: 100MB per file
      compression: "aggressive", // Force 720p / High CRF
      storageClass: "STANDARD_IA", // Infrequent Access (cheaper) if supported, or handled by lifecycle
      retentionPolicy: "7d_active", // Move to cold storage if inactive for 7d
    };

    // If file is too big for free tier budget
    const contentLength = parseInt(req.headers["content-length"] || "0");
    if (contentLength > req.fileOptions.maxSizeBytes) {
      return res.status(413).json({
        error: "File too large for Free Tier",
        message:
          "During the free onboarding period, files are limited to 100MB. Upgrade to Pro for 500MB+ uploads.",
      });
    }

    // Attach optimization flags for the upload handler (e.g. videoClippingService) to use
    req.body.optimizationFlags = {
      force720p: true,
      crf: 28, // Lower quality factor (smaller file)
      preset: "faster",
    };

    next();
  } catch (error) {
    logger.error("[CostControl] Error:", error);
    // Fail safe: allow request but log error
    next();
  }
};
