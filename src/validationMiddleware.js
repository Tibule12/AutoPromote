// src/validationMiddleware.js
// Lightweight validation middleware used by backend routes.
// It performs basic checks and rejects unsupported platforms early.

const SUPPORTED_PLATFORMS = [
  'tiktok',
  'spotify',
  'reddit',
  'discord',
  'linkedin',
  'telegram',
  'pinterest'
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
      return sendBadRequest(res, 'Content must include `text` or `mediaUrl`.');
    }
    // Optional: limit lengths to defend against abuse
    if (body.text && typeof body.text === 'string' && body.text.length > 5000) {
      return sendBadRequest(res, '`text` is too long (max 5000 chars).');
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
      return sendBadRequest(res, '`platform` is required for promotions.');
    }
    const platform = String(body.platform).toLowerCase();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return sendBadRequest(res, `Unsupported platform: ${body.platform}`);
    }

    // Minimal platform-specific expectations
    // e.g., Discord may require `channelId`, LinkedIn may require `companyId`, etc.
    switch (platform) {
      case 'discord':
        if (!body.channelId) return sendBadRequest(res, '`channelId` is required for Discord promotions.');
        break;
      case 'linkedin':
        // either companyId or personId
        if (!body.companyId && !body.personId) return sendBadRequest(res, '`companyId` or `personId` is required for LinkedIn promotions.');
        break;
      case 'telegram':
        if (!body.chatId) return sendBadRequest(res, '`chatId` is required for Telegram promotions.');
        break;
      case 'pinterest':
        if (!body.boardId) return sendBadRequest(res, '`boardId` is recommended for Pinterest promotions.');
        break;
      // spotify, reddit, tiktok: keep flexible for now
      default:
        break;
    }

    return next();
  },

  // Basic rate-limit placeholder (no-op). Integrate real limiter as needed.
  validateRateLimit: (req, res, next) => next(),

  // Simple sanitization: trim strings in the body (shallow)
  sanitizeInput: (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      Object.keys(req.body).forEach((k) => {
        if (typeof req.body[k] === 'string') req.body[k] = req.body[k].trim();
      });
    }
    return next();
  }
  // Note: this file intentionally keeps validation lightweight. For
  // production, expand checks per-platform (auth tokens, URL formats,
  // rate limits, content policies) and add unit tests.
};
