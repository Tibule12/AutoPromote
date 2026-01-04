// codeqlRateLimit.js
// Thin wrappers around express-rate-limit so static analyzers (e.g., CodeQL)
// positively detect rate limiting on our API. We still keep our distributed
// limiter in place; these are additive and conservative to avoid user impact.

const rateLimit = require("express-rate-limit");

function keyGenerator(req) {
  try {
    return String(req.userId || (req.user && req.user.uid) || req.ip || "anon");
  } catch (_) {
    return req.ip || "anon";
  }
}

// General API limiter: broad, lenient
const general = rateLimit({
  windowMs: parseInt(process.env.RL_API_WINDOW_MS || "60000", 10), // 1 minute
  max: parseInt(process.env.RL_API_MAX || "300", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// Auth-sensitive limiter: stricter
const auth = rateLimit({
  windowMs: parseInt(process.env.RL_AUTH_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RL_AUTH_MAX || "30", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// Write-heavy limiter: moderate
const writes = rateLimit({
  windowMs: parseInt(process.env.RL_WRITES_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RL_WRITES_MAX || "120", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// Webhook limiter: IP-based, higher burst but still bounded
const webhooks = rateLimit({
  windowMs: parseInt(process.env.RL_WEBHOOK_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RL_WEBHOOK_MAX || "600", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip || "anon",
});

module.exports = { general, auth, writes, webhooks };
