// userDefaultsCache.js - lightweight in-memory cache for user_defaults docs
// Avoids repeated Firestore reads during bursts of uploads.
// NOT multi-process safe; acceptable for a single instance or as a best-effort optimization.

const { db } = require('../firebaseAdmin');

const TTL_MS = parseInt(process.env.USER_DEFAULTS_CACHE_TTL_MS || '30000', 10); // 30s default
const cache = new Map(); // userId -> { data, ts }

async function fetchUserDefaults(userId) {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && (now - hit.ts) < TTL_MS) return hit.data;
  try {
    const snap = await db.collection('user_defaults').doc(userId).get();
    const data = snap.exists ? snap.data() : {};
    cache.set(userId, { data, ts: now });
    return data;
  } catch (e) {
    return {};
  }
}

function primeUserDefaults(userId, data) {
  cache.set(userId, { data, ts: Date.now() });
}

function getCacheStats() {
  const now = Date.now();
  let valid = 0; let expired = 0; const entries = [];
  for (const [uid, val] of cache.entries()) {
    const age = now - val.ts;
    const isValid = age < TTL_MS;
    if (isValid) valid++; else expired++;
    if (entries.length < 50) entries.push({ userId: uid, ageMs: age, valid });
  }
  return { size: cache.size, valid, expired, ttlMs: TTL_MS, sample: entries };
}

module.exports = { fetchUserDefaults, primeUserDefaults, getCacheStats };
