// distributedCache.js - simple get/set JSON cache with TTL using Redis, fallback no-op
const { getRedis } = require('./redisClient');

function createDistributedCache(prefix='cache') {
  const redis = getRedis();
  return {
    async get(key) {
      if (!redis) return null;
      try { const v = await redis.get(`${prefix}:${key}`); return v? JSON.parse(v):null; } catch(_) { return null; }
    },
    async set(key, value, ttlSec=30) {
      const redis = getRedis(); if (!redis) return false;
      try { await redis.set(`${prefix}:${key}`, JSON.stringify(value), 'EX', ttlSec); return true; } catch(_){ return false; }
    },
    async del(key){ const r=getRedis(); if(!r) return false; try { await r.del(`${prefix}:${key}`); return true; } catch(_){ return false; } },
  };
}

module.exports = { createDistributedCache };