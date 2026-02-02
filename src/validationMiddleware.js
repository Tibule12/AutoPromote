// src/validationMiddleware.js
// Lightweight validation middleware used by backend routes.
// It performs basic checks and rejects unsupported platforms early.

const SUPPORTED_PLATFORMS = [
  "linkedin",
  "twitter",
  "spotify",
  "youtube",
  "tiktok",
  "facebook",
  "reddit",
  "discord",
  "telegram",
  "pinterest",
  "snapchat",
];

function sendBadRequest(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = {
  SUPPORTED_PLATFORMS,

  // Validate content payloads (basic shape checks)
  validateContentData: (req, res, next) => {
    const body = req.body || {};
    // Require either `text` or `mediaUrl` for content items
    if (!body.text && !body.mediaUrl) {
      return sendBadRequest(res, "Content must include `text` or `mediaUrl`.");
    }
    // Optional: limit lengths to defend against abuse
    if (body.text && typeof body.text === "string" && body.text.length > 5000) {
      return sendBadRequest(res, "`text` is too long (max 5000 chars).");
    }
    return next();
  },

  // Validate analytics requests (no-op placeholder but keeps contract)
  validateAnalyticsData: (req, res, next) => {
    // Example: require `platform` when requesting platform-specific analytics
    const body = req.body || {};
    if (body.platform && !SUPPORTED_PLATFORMS.includes(body.platform.toLowerCase())) {
      return sendBadRequest(res, `Unsupported platform: ${body.platform}`);
    }
    return next();
  },

  // Validate promotion creation/update requests
  validatePromotionData: (req, res, next) => {
    const body = req.body || {};
    if (!body.platform) {
      return sendBadRequest(res, "`platform` is required for promotions.");
    }
    const platform = String(body.platform).toLowerCase();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return sendBadRequest(res, `Unsupported platform: ${body.platform}`);
    }

    // Minimal platform-specific expectations
    // e.g., Discord may require `channelId`, LinkedIn may require `companyId`, etc.
    switch (platform) {
      case "discord":
        if (
          !body.channelId &&
          !(
            body.platform_options &&
            body.platform_options.discord &&
            body.platform_options.discord.channelId
          )
        )
          return sendBadRequest(res, "`channelId` is required for Discord promotions.");
        break;
      case "linkedin":
        // either companyId or personId (allow passing via platform_options)
        if (
          !body.companyId &&
          !body.personId &&
          !(
            body.platform_options &&
            body.platform_options.linkedin &&
            (body.platform_options.linkedin.companyId || body.platform_options.linkedin.personId)
          )
        )
          return sendBadRequest(
            res,
            "`companyId` or `personId` is required for LinkedIn promotions."
          );
        break;
      case "telegram":
        if (
          !body.chatId &&
          !(
            body.platform_options &&
            body.platform_options.telegram &&
            body.platform_options.telegram.chatId
          )
        )
          return sendBadRequest(res, "`chatId` is required for Telegram promotions.");
        break;
      case "pinterest":
        if (
          !body.boardId &&
          !(
            body.platform_options &&
            body.platform_options.pinterest &&
            body.platform_options.pinterest.boardId
          )
        )
          return sendBadRequest(res, "`boardId` is recommended for Pinterest promotions.");
        break;
      case "youtube":
      case "facebook":
      case "tiktok":
        // Enforce role-based requirements if role is provided via platform_options
        const role = (body.role || (body.platform_options && body.platform_options[platform] && body.platform_options[platform].role) || "").toLowerCase();
        if (role === "sponsored") {
          const sponsor = body.sponsor || (body.platform_options && body.platform_options[platform] && body.platform_options[platform].sponsor);
          if (!sponsor) return sendBadRequest(res, "`sponsor` is required when role=\"sponsored\".");
        }
        if (role === "boosted") {
          const budget = body.boostBudget || (body.platform_options && body.platform_options[platform] && body.platform_options[platform].boostBudget);
          const target = body.targetViews || (body.platform_options && body.platform_options[platform] && body.platform_options[platform].targetViews);
          if (!budget && !target) return sendBadRequest(res, "`boostBudget` or `targetViews` is required when role=\"boosted\".");
        }
        break;
      case "reddit":
        if (
          !body.subreddit &&
          !(
            body.platform_options &&
            body.platform_options.reddit &&
            body.platform_options.reddit.subreddit
          )
        )
          return sendBadRequest(res, "`subreddit` is required for Reddit promotions.");
        break;
      case "spotify":
        if (
          !body.name &&
          !(
            body.platform_options &&
            body.platform_options.spotify &&
            body.platform_options.spotify.name
          )
        )
          return sendBadRequest(res, "`name` is required for Spotify playlist promotions.");
        break;
      // spotify, reddit, tiktok: keep flexible for now
      default:
        break;
    }

    return next();
  },

  // Basic rate-limit middleware: enforce conservative per-user write limits
  // This function attempts a Firestore lookup to count recent operations from
  // the same user and prevents abuse by returning HTTP 429 when limits are
  // exceeded. It's intentionally conservative (only enforced for authenticated
  // users) and is used as a last-defense when route-level rate-limiting may not
  // be present. We map HTTP methods to an operation key to allow collection
  // specific limits (create vs update/delete).
  validateRateLimit: async (req, res, next) => {
    try {
      const { db } = require("../firebaseAdmin");
      const userId = req.userId || (req.user && req.user.uid) || null;
      if (!userId) return next(); // don't rate-limit unauthenticated callers here

      // Create a map from HTTP method -> operation type
      const method = String(req.method || "").toLowerCase();
      const methodToOp = {
        post: "create",
        put: "write",
        patch: "write",
        delete: "write",
        get: "read",
      };
      const operation = methodToOp[method] || "write";

      // Extract collection name from the base url, e.g. /api/content -> content
      const collectionName = (req.baseUrl || "").split("/").filter(Boolean).pop() || null;
      if (!collectionName) return next();

      // Define conservative rate limits per collection and operation
      const rateLimits = {
        content: {
          create: {
            max: parseInt(process.env.RATE_LIMIT_CONTENT_CREATE || "1", 10),
            windowMs: 21 * 24 * 60 * 60 * 1000,
          },
        },
        analytics: {
          create: {
            max: parseInt(process.env.RATE_LIMIT_ANALYTICS_CREATE || "100", 10),
            windowMs: 60 * 1000,
          },
        },
        promotion_tasks: {
          create: {
            max: parseInt(process.env.RATE_LIMIT_PROMO_CREATE || "10", 10),
            windowMs: 24 * 60 * 60 * 1000,
          },
        },
        promotions: {
          create: {
            max: parseInt(process.env.RATE_LIMIT_PROMO_CREATE || "10", 10),
            windowMs: 24 * 60 * 60 * 1000,
          },
        },
      };

      const limit = (rateLimits[collectionName] || {})[operation];
      if (!limit) return next();

      const cutoff = Date.now() - (limit.windowMs || 0);
      // Use known timestamp field names when present (`created_at` or `createdAt`)
      const query = db
        .collection(collectionName)
        .where("user_id", "==", userId)
        .where("created_at", ">=", new Date(cutoff).toISOString())
        .limit(limit.max + 1);

      // If the collection doesn't store created_at, try createdAt as a fallback
      let recent = null;
      try {
        recent = await query.get();
      } catch (_e) {
        try {
          recent = await db
            .collection(collectionName)
            .where("user_id", "==", userId)
            .where("createdAt", ">=", new Date(cutoff).toISOString())
            .limit(limit.max + 1)
            .get();
        } catch (e) {
          /* ignore and allow */
        }
      }

      if (recent && recent.size >= limit.max) {
        return res
          .status(429)
          .json({
            error: "rate_limit_exceeded",
            message: `Too many ${operation} operations on ${collectionName}. Try again later.`,
          });
      }
      return next();
    } catch (e) {
      // If rate-limiting fails for any reason, allow the request to proceed
      console.warn("[rateLimit] validation failed:", e && e.message ? e.message : e);
      return next();
    }
  },

  // Simple sanitization: trim strings in the body (shallow)
  sanitizeInput: (req, res, next) => {
    if (req.body && typeof req.body === "object") {
      Object.keys(req.body).forEach(k => {
        if (typeof req.body[k] === "string") req.body[k] = req.body[k].trim();
      });
    }
    return next();
  },
  // Note: this file intentionally keeps validation lightweight. For
  // production, expand checks per-platform (auth tokens, URL formats,
  // rate limits, content policies) and add unit tests.
};
