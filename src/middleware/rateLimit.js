// Simple Firestore-backed daily rate limiting (per uid) + in-memory short-term burst control
// Not cryptographically precise but sufficient to prevent abuse spikes.

const { db } = require('../firebaseAdmin');

const IN_MEMORY_WINDOW_MS = 60 * 1000; // 1 minute
const memoryBuckets = new Map(); // key: uid -> { count, windowStart }

function rateLimit(options = {}) {
  const {
    dailyLimit = parseInt(process.env.DAILY_API_LIMIT || '2000', 10),
    field = 'apiCalls',
    weight = 1
  } = options;
  return async (req, res, next) => {
    try {
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'unauthorized' });

      // Burst window (in-memory)
      const now = Date.now();
      const bucket = memoryBuckets.get(uid) || { count: 0, windowStart: now };
      if (now - bucket.windowStart > IN_MEMORY_WINDOW_MS) {
        bucket.count = 0; bucket.windowStart = now;
      }
      bucket.count += weight;
      memoryBuckets.set(uid, bucket);
      if (bucket.count > (options.perMinute || parseInt(process.env.PER_MINUTE_LIMIT || '120', 10))) {
        return res.status(429).json({ error: 'rate_limited', scope: 'minute', retryAfterMs: bucket.windowStart + IN_MEMORY_WINDOW_MS - now });
      }

      const todayKey = new Date().toISOString().slice(0,10); // YYYY-MM-DD
      const usageRef = db.collection('usage_daily').doc(todayKey).collection('users').doc(uid);
      const snap = await usageRef.get();
      const existing = snap.exists ? (snap.data()[field] || 0) : 0;
      if (existing + weight > dailyLimit) {
        const resetAt = new Date(new Date(todayKey).getTime() + 24*3600*1000).toISOString();
        return res.status(429).json({ error: 'rate_limited', scope: 'day', limit: dailyLimit, resetAt });
      }
      await usageRef.set({ [field]: existing + weight, updatedAt: new Date().toISOString() }, { merge: true });
      next();
    } catch (e) {
      // On error, do not block completely, but log minimal
      console.warn('[rateLimit] failure', e.message);
      next();
    }
  };
}

module.exports = { rateLimit };