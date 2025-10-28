const rateLimit = require('express-rate-limit');
const MemoryStore = require('express-rate-limit/lib/memory-store');

function rateLimiter(options = {}) {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || options.windowMs || '60000', 10); // 1 minute default
  const max = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || options.max || '100', 10); // 100 req per window default
  const message = options.message || { error: 'too_many_requests', message: 'Rate limit exceeded' };
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    store: new MemoryStore()
  });
}

module.exports = { rateLimiter };
// globalRateLimiter - pluggable distributed-ready rate limiter facade.
// Default: in-memory token bucket. Replace storage layer with Redis / Firestore as needed.

const buckets = new Map();

function defaultKey(req) { return req.user?.uid || req.ip; }

function rateLimiter(options = {}) {
  const {
    capacity = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '800', 10),
    refillPerSec = parseFloat(process.env.RATE_LIMIT_GLOBAL_REFILL || '5'),
    keyFn = defaultKey,
    windowHint = 'global'
  } = options;
  return function(req,res,next){
    const key = keyFn(req) + ':' + windowHint;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) { b = { tokens: capacity, updated: now }; buckets.set(key, b); }
    const elapsed = (now - b.updated)/1000;
    if (elapsed > 0) {
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.updated = now;
    }
    if (b.tokens < 1) {
      const retrySec = Math.ceil(Math.max(1, (1 - b.tokens) / refillPerSec));
      res.setHeader('Retry-After', retrySec);
      return res.status(429).json({ error:'rate_limited', retryAfterSec: retrySec });
    }
    b.tokens -= 1;
    next();
  };
}

module.exports = { rateLimiter };