// simpleRateLimit - naive in-memory rate limiter for low-volume dev/testing.
// NOT for production scale. Resets each process restart.
// Usage: simpleRateLimit({ windowMs: 3600000, max: 20, key: req => req.userId || req.ip })

module.exports = function simpleRateLimit(opts = {}) {
  const windowMs = opts.windowMs || 3600000; // 1h default
  const max = opts.max || 20;
  const keyFn = opts.key || (req => req.ip);
  const buckets = new Map();
  return function (req, res, next) {
    const key = keyFn(req) || "anon";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      const retrySec = Math.ceil((bucket.reset - now) / 1000);
      return res.status(429).json({ error: "rate_limited", retryAfterSec: retrySec });
    }
    next();
  };
};
