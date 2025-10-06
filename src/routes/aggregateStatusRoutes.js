const express = require('express');
const authMiddleware = require('../authMiddleware');
const router = express.Router();

// Aggregate status endpoint combines various lightweight status + progress signals
// Leverages per-endpoint caches where available; adds its own short TTL cache.
// Instrumentation uses statusInstrument wrapper and queryMetrics for any Firestore fallbacks.

router.get('/aggregate', authMiddleware, require('../statusInstrument')('aggregateStatus', async (req, res) => {
  const { getCache, setCache } = require('../utils/simpleCache');
  const { dedupe } = require('../utils/inFlight');
  const { instrument } = require('../utils/queryMetrics');
  const uid = req.userId || req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const cacheKey = `aggregate_status_${uid}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  const result = await dedupe(cacheKey, async () => {
    // Helper fetch function with graceful failure (never throws)
    async function fetchJson(url) {
      try {
        const r = await fetch(url, { headers: { Authorization: req.headers.authorization || '' }, timeout: 4000 });
        if (!r.ok) return { error: 'status_' + r.status };
        return r.json();
      } catch (e) { return { error: 'fetch_failed' }; }
    }
    // Build base URL (assumes same origin/backend host)
    const base = req.protocol + '://' + req.get('host');
    // Parallel fetch existing optimized endpoints (some may already be micro/memory cached)
    const [platform, fb, yt, tw, tk, earnings, progress] = await Promise.all([
      fetchJson(base + '/api/platform/status'),
      fetchJson(base + '/api/facebook/status'),
      fetchJson(base + '/api/youtube/status'),
      fetchJson(base + '/api/twitter/connection/status'),
      fetchJson(base + '/api/tiktok/status'),
      fetchJson(base + '/api/monetization/earnings/summary'),
      fetchJson(base + '/api/users/progress')
    ]);

    // Minimal shape; do not include huge raw docs
    return {
      ok: true,
      at: Date.now(),
      platformConnections: platform.summary || null,
      facebook: fb.connected === undefined ? fb : { connected: fb.connected, pages: fb.pages, identity: fb.identity },
      youtube: yt.connected === undefined ? yt : { connected: yt.connected, channel: yt.channel },
      twitter: tw.connected === undefined ? tw : { connected: tw.connected, identity: tw.identity },
      tiktok: tk.connected === undefined ? tk : { connected: tk.connected, display_name: tk.display_name },
      earnings: earnings.ok ? earnings : null,
      progress: progress.ok ? { contentCount: progress.contentCount, publishedCount: progress.publishedCount, promotionTasks: progress.promotionTasks, earnings: progress.earnings } : null
    };
  });
  setCache(cacheKey, result, 6000); // 6s TTL
  return res.json(result);
}));

module.exports = router;
