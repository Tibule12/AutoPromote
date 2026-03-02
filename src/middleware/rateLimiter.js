// src/middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");

/**
 * Basic memory-based rate limiter (resets on server restart).
 * For production with multi-instance scaling, use Redis store.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    error: "Too many requests, please try again later.",
  },
});

// Stricter limiter for sensitive routes like payments/auth
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    status: 429,
    error: "Too many attempts, please try again later.",
  },
});

module.exports = { apiLimiter, strictLimiter };
