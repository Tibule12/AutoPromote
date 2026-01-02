const axios = require("axios");

const { getAccessToken } = require("./spotifyAuth");

async function fetchTrending({ limit = 20, clientId, clientSecret } = {}) {
  // If clientId/clientSecret are not provided, return a mocked feed for local/dev runs
  if (!clientId || !clientSecret) {
    const mock = [];
    for (let i = 0; i < (limit || 5); i++) {
      mock.push({
        id: `spotify_${Date.now()}_${i}`,
        title: `Top Beat ${i}`,
        duration: 10 + i,
        tags: ["drums", "top"],
        trendingScore: 100 - i,
      });
    }
    return mock;
  }

  // Use client credentials flow to get an access token
  try {
    const token = await getAccessToken(clientId, clientSecret);
    if (!token) return [];
    const res = await axios.get("https://api.spotify.com/v1/browse/featured-playlists", {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit },
    });
    const items = (res.data && res.data.playlists && res.data.playlists.items) || [];
    return items.map(it => ({
      id: it.id,
      title: it.name,
      duration: it.duration_ms ? Math.round(it.duration_ms / 1000) : 0,
      tags: [],
      trendingScore: 0,
    }));
  } catch (err) {
    console.warn("spotifyProvider: fetch failed, returning empty", err && err.message);
    return [];
  }
}

module.exports = { fetchTrending };
