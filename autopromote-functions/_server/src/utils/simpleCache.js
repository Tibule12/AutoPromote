// simpleCache.js - lightweight in-memory TTL cache (per process)
// NOTE: Suitable for single-instance or best-effort caching on multi-instance (no cross-node coherence)

const store = new Map();
const inFlight = new Map();

function setCache(key, value, ttlMs = 5000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function withCache(key, ttlMs, fn) {
  const cached = getCache(key);
  if (cached) return Promise.resolve({ ...cached, _cached: true });
  // Parallel dashboard requests share auth/profile/terms lookups, and multiple
  // notification requests can arrive before the first Firestore read completes.
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = Promise.resolve()
    .then(fn)
    .then(result => {
      setCache(key, result, ttlMs);
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

module.exports = { setCache, getCache, withCache };
