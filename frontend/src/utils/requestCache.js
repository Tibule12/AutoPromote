/**
 * Request cache utility to prevent duplicate API calls
 * Implements in-memory caching with TTL and request deduplication
 */

const cache = new Map();
const pendingRequests = new Map();

/**
 * Cached fetch with automatic deduplication
 * @param {string} key - Cache key (usually the URL)
 * @param {Function} fetchFn - Async function that returns the data
 * @param {number} ttl - Time to live in milliseconds (default: 30s)
 * @returns {Promise<any>} - Cached or fresh data
 */
export const cachedFetch = async (key, fetchFn, ttl = 30000) => {
  // Check cache first
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  // Check if request is already in flight
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  // Start new request
  const promise = (async () => {
    try {
      const data = await fetchFn();

      // Store in cache
      cache.set(key, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } finally {
      // Remove from pending requests
      pendingRequests.delete(key);
    }
  })();

  // Store pending request
  pendingRequests.set(key, promise);

  return promise;
};

/**
 * Clear specific cache key or all cache
 * @param {string} key - Cache key to clear (optional)
 */
export const clearCache = (key = null) => {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

/**
 * Batch multiple API calls with delay between each
 * @param {Array<Function>} calls - Array of async functions to call
 * @param {number} delayMs - Delay between calls in milliseconds (default: 100ms)
 * @returns {Promise<Array>} - Array of results
 */
export const batchWithDelay = async (calls, delayMs = 100) => {
  const results = [];

  for (let i = 0; i < calls.length; i++) {
    try {
      results.push(await calls[i]());
    } catch (error) {
      results.push({ error: error.message });
    }

    // Add delay between calls (except after last one)
    if (i < calls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
};
