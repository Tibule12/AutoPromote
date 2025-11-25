// Simple in-flight promise de-duplication.
// Usage: dedupe(key, () => expensiveAsync())
// Ensures only one underlying call runs per key; others await the same promise.
const map = new Map();

async function dedupe(key, fn) {
  if (map.has(key)) return map.get(key);
  const p = (async () => {
    try {
      return await fn();
    } finally {
      // Slight delay allows chained thens to attach before removal (micro-cache window)
      setTimeout(() => map.delete(key), 0);
    }
  })();
  map.set(key, p);
  return p;
}

module.exports = { dedupe };
