const axios = require("axios");

async function fetchTrending({ limit = 20, apiKey } = {}) {
  // TikTok doesn't expose a public trending sounds API in many cases; this adapter allows
  // a mocked feed when no apiKey is given, or a custom provider webhook when configured.
  if (!apiKey) {
    const mock = [];
    for (let i = 0; i < (limit || 5); i++) {
      mock.push({
        id: `tiktok_${Date.now()}_${i}`,
        title: `TikTok Sound ${i}`,
        duration: 6 + i,
        tags: ["viral", "short"],
        trendingScore: 120 - i,
      });
    }
    return mock;
  }

  try {
    // If you have a configured vendor service for TikTok trends, call it here
    const res = await axios.get("https://api.tiktok.com/trending/sounds", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { limit },
    });
    const items = res.data && res.data.sounds ? res.data.sounds : [];
    return items.map(it => ({
      id: it.id,
      title: it.title,
      duration: it.duration || 0,
      tags: it.tags || [],
      trendingScore: it.score || 0,
    }));
  } catch (err) {
    console.warn("tiktokProvider: fetch failed", err && err.message);
    return [];
  }
}

module.exports = { fetchTrending };
