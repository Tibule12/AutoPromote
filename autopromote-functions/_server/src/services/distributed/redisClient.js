// redisClient.js - lazy singleton Redis (ioredis) client. Optional.
let Redis;
try {
  Redis = require("ioredis");
} catch (_) {
  /* dependency optional until installed */
}
let client = null;

function getRedis() {
  if (!Redis) return null;
  if (process.env.REDIS_DISABLED === "true") return null;
  if (!client) {
    const url = process.env.REDIS_URL || null;
    try {
      client = url
        ? new Redis(url)
        : new Redis({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
          });
      client.on("error", e => {
        if (process.env.DEBUG_REDIS === "true") console.warn("[redis] error", e.message);
      });
      client.on("connect", () => console.log("[redis] connected"));
    } catch (e) {
      if (process.env.DEBUG_REDIS === "true") console.warn("[redis] init failed", e.message);
      client = null;
    }
  }
  return client;
}

module.exports = { getRedis };
