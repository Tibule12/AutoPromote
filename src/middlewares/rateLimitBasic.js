// rateLimitBasic.js - simple in-memory token bucket per key (process scoped)
const buckets = new Map();

function rateLimitBasic({ windowMs = 60000, max = 60, key = (req)=> req.userId || req.ip }) {
  return (req, res, next) => {
    const k = key(req);
    if (!k) return next();
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || (now - b.start) > windowMs) {
      b = { start: now, count: 0 };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({ ok:false, error: 'rate_limited' });
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    next();
  };
}

module.exports = rateLimitBasic;