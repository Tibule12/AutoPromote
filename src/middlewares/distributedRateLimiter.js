/* eslint-disable no-console */
// distributedRateLimiter.js - Redis-backed token bucket with local fallback
// Usage: const { distributedRateLimiter } = require('./middlewares/distributedRateLimiter');
// app.use('/api/', distributedRateLimiter({ capacity:800, refillPerSec:5 }));

const { getRedis } = require("../services/distributed/redisClient");

function distributedRateLimiter(opts = {}) {
  const {
    capacity = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || "800", 10),
    refillPerSec = parseFloat(process.env.RATE_LIMIT_GLOBAL_REFILL || "5"),
    keyFn = req => req.user?.uid || req.ip,
    windowHint = "global",
  } = opts;
  const redis = getRedis();
  if (!redis) {
    if (process.env.DEBUG_RATE_LIMIT === "true")
      console.log("[rate-limit] Redis unavailable, falling back to in-memory limiter");
    const { rateLimiter } = require("./globalRateLimiter");
    return rateLimiter(opts);
  }
  return async function (req, res, next) {
    const key = `rl:${windowHint}:${keyFn(req)}`;
    try {
      const script = `local key=KEYS[1]\nlocal cap=tonumber(ARGV[1])\nlocal refill=tonumber(ARGV[2])\nlocal now=tonumber(ARGV[3])\nlocal interval=tonumber(ARGV[4])\nlocal bucket=redis.call('HMGET', key, 'tokens','updated')\nlocal tokens=tonumber(bucket[1]) or cap\nlocal updated=tonumber(bucket[2]) or now\nlocal delta=now-updated\nif delta>0 then\n  tokens=math.min(cap, tokens + delta*refill)\nend\nif tokens<1 then\n  local retry=math.ceil((1-tokens)/refill)\n  return {0,retry} \nend\n tokens=tokens-1\nredis.call('HMSET', key, 'tokens', tokens, 'updated', now)\nredis.call('PEXPIRE', key, interval)\nreturn {1,0}`;
      const now = Date.now() / 1000;
      const intervalMs = 3600000; // 1h inactivity expiry
      const result = await redis.eval(script, 1, key, capacity, refillPerSec, now, intervalMs);
      const allowed = result[0] === 1;
      if (!allowed) {
        const retrySec = parseInt(result[1], 10) || 1;
        res.setHeader("Retry-After", retrySec);
        return res
          .status(429)
          .json({ error: "rate_limited", retryAfterSec: retrySec, distributed: true });
      }
      return next();
    } catch (e) {
      if (process.env.DEBUG_RATE_LIMIT === "true")
        console.warn("[rate-limit] redis error fallback", e.message);
      // soft-fail to allow request
      return next();
    }
  };
}

module.exports = { distributedRateLimiter };
