// platformConcurrencyLock.js - optional Redis-based per-platform concurrency limiter
// Usage: app.use('/api/promotion-tasks', platformConcurrencyLock({ maxPerPlatform: 3 }))
const { getRedis } = require("../services/distributed/redisClient");

function platformConcurrencyLock({
  maxPerPlatform = 3,
  keyFn = req => req.body?.platform || req.query.platform,
} = {}) {
  const redis = getRedis();
  if (!redis) return (req, res, next) => next(); // no-op fallback
  return async function (req, res, next) {
    const platform = keyFn(req);
    if (!platform) return next();
    const key = `plock:${platform}`;
    try {
      const ttlSec = 60; // auto-release after 60s safety
      const lua = `local k=KEYS[1]\nlocal cap=tonumber(ARGV[1])\nlocal ttl=tonumber(ARGV[2])\nlocal v=redis.call('GET',k)\nif not v then redis.call('SET',k,1,'EX',ttl) return {1,1}\nend\nlocal n=tonumber(v) or 0\nif n>=cap then return {0,n}\nend\nredis.call('INCR',k)\nredis.call('EXPIRE',k,ttl)\nreturn {1,n+1}`;
      const resp = await redis.eval(lua, 1, key, maxPerPlatform, ttlSec);
      if (resp[0] === 1) {
        // Attach release hook
        res.on("finish", async () => {
          try {
            await redis.eval(
              "local k=KEYS[1] local v=redis.call('DECR',k) if v<=0 then redis.call('DEL',k) end",
              1,
              key
            );
          } catch (_) {}
        });
        return next();
      }
      return res.status(429).json({
        error: "platform_concurrency_limit",
        platform,
        inFlight: resp[1],
        max: maxPerPlatform,
      });
    } catch (e) {
      return next(); // soft fail open
    }
  };
}

module.exports = { platformConcurrencyLock };
