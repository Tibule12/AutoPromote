// spotifyService.js - Spotify Web API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

/**
 * Get user's Spotify connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserSpotifyConnection(uid) {
  const snap = await db.collection("users").doc(uid).collection("connections").doc("spotify").get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserSpotifyConnection(uid);
  if (!connection || !connection.tokens) return null;

  const tokens = connection.tokens;
  const now = Date.now();

  // Check if token is still valid (Spotify tokens last 1 hour)
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + tokens.expires_in * 1000;
    if (now < expiresAt - 300000) {
      // 5 min buffer
      return tokens.access_token;
    }
  }

  // Try to refresh token
  if (tokens.refresh_token) {
    try {
      const refreshed = await refreshToken(uid, tokens.refresh_token);
      return refreshed.access_token;
    } catch (e) {
      console.warn("[Spotify] Token refresh failed:", e.message);
      // If client credentials are not configured, bubble up to surface a clear error
      if (e.message && e.message.includes("client credentials")) {
        throw e;
      }
    }
  }

  return tokens.access_token;
}

/**
 * Refresh Spotify access token
 */
async function refreshToken(uid, refreshToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify client credentials not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await safeFetch("https://accounts.spotify.com/api/token", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
    requireHttps: true,
    allowHosts: ["accounts.spotify.com"],
  });

  if (!response.ok) {
    throw new Error("Spotify token refresh failed");
  }

  const tokens = await response.json();

  // Store refreshed tokens
  const ref = db.collection("users").doc(uid).collection("connections").doc("spotify");
  try {
    const { encryptToken, hasEncryption } = require("./secretVault");
    if (hasEncryption()) {
      await ref.set(
        {
          tokens: encryptToken(JSON.stringify({ ...tokens, refresh_token: refreshToken })),
          hasEncryption: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          tokens: { ...tokens, refresh_token: refreshToken },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    // fallback to plain storage if something goes wrong
    await ref.set(
      {
        tokens: { ...tokens, refresh_token: refreshToken },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return tokens;
}

/**
 * Get current user's Spotify profile
 */
async function getUserProfile(accessToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const response = await safeFetch("https://api.spotify.com/v1/me", fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    requireHttps: true,
    allowHosts: ["api.spotify.com"],
  });

  if (!response.ok) {
    throw new Error("Failed to get Spotify profile");
  }

  const profile = await response.json();
  return profile;
}

/**
 * Create a new playlist
 */
async function createPlaylist({ uid, name, description, isPublic = true, contentId }) {
  if (!uid) throw new Error("uid required");
  if (!name) throw new Error("name required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Spotify access token");

  const profile = await getUserProfile(accessToken);
  const userId = profile.id;

  const response = await safeFetch(
    `https://api.spotify.com/v1/users/${userId}/playlists`,
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.substring(0, 100), // Spotify limit
          description: description ? description.substring(0, 300) : "",
          public: isPublic,
        }),
      },
      requireHttps: true,
      allowHosts: ["api.spotify.com"],
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify playlist creation failed: ${error}`);
  }

  const playlist = await response.json();

  // Store playlist info in Firestore if contentId provided
  if (contentId && playlist.id) {
    try {
      const contentRef = db.collection("content").doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().spotify || {} : {};

      await contentRef.set(
        {
          spotify: {
            ...existingData,
            playlistId: playlist.id,
            playlistName: playlist.name,
            playlistUrl: playlist.external_urls.spotify,
            createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[Spotify] Failed to store playlist info in Firestore:", e.message);
    }
  }

  return {
    success: true,
    platform: "spotify",
    playlistId: playlist.id,
    name: playlist.name,
    url: playlist.external_urls.spotify,
    raw: playlist,
  };
}

/**
 * Add tracks to a playlist
 */
async function addTracksToPlaylist({ uid, playlistId, trackUris }) {
  if (!uid) throw new Error("uid required");
  if (!playlistId) throw new Error("playlistId required");
  if (!trackUris || !Array.isArray(trackUris) || trackUris.length === 0) {
    throw new Error("trackUris array required");
  }
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Spotify access token");

  // Spotify allows max 100 tracks per request
  const uris = trackUris.slice(0, 100);

  const response = await safeFetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris,
        }),
      },
      requireHttps: true,
      allowHosts: ["api.spotify.com"],
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add tracks to Spotify playlist: ${error}`);
  }

  const result = await response.json();

  return {
    success: true,
    snapshotId: result.snapshot_id,
    tracksAdded: uris.length,
  };
}

/**
 * Fetch track metadata and analytics (popularity) in batch
 * Maps to user requirement: fetch_spotify_track_data
 */
async function getTracksBatch({ uid, trackIds }) {
  if (!uid) throw new Error("uid required");
  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) return [];
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Spotify access token");

  // Spotify batch limit is 50
  const chunks = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    chunks.push(trackIds.slice(i, i + 50));
  }

  const allTracks = [];

  for (const chunk of chunks) {
    try {
      const idsParam = chunk.join(",");
      const response = await safeFetch(
        `https://api.spotify.com/v1/tracks?ids=${idsParam}`,
        fetchFn,
        {
          fetchOptions: {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
          requireHttps: true,
          allowHosts: ["api.spotify.com"],
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.tracks) {
          allTracks.push(...data.tracks.filter(Boolean));
        }
      }
    } catch (e) {
      console.warn("[Spotify] Batch fetch failed:", e.message);
    }
  }

  // Map to simplified metric object
  return allTracks.map(t => ({
    id: t.id,
    name: t.name,
    popularity: t.popularity, // 0-100 proxy for streams/engagement
    artist: t.artists.map(a => a.name).join(", "),
    album: t.album.name,
    url: t.external_urls.spotify,
  }));
}

/**
 * Search for tracks on Spotify
 */
async function searchTracks({ uid, query, limit = 10 }) {
  if (!uid) throw new Error("uid required");
  if (!query) throw new Error("query required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Spotify access token");

  const params = new URLSearchParams({
    q: query,
    type: "track,album,playlist,show,episode", // Expanded to include podcasts and episodes
    limit: Math.min(limit, 10).toString(),
  });

  const response = await safeFetch(`https://api.spotify.com/v1/search?${params}`, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    requireHttps: true,
    allowHosts: ["api.spotify.com"],
  });

  if (!response.ok) {
    throw new Error("Spotify search failed");
  }

  const data = await response.json();

  return formatSearchResults(data);
}

/**
 * Normalize raw Spotify search response into results array
 */
function formatSearchResults(data) {
  const tracks = (data.tracks?.items || []).filter(Boolean).map(track => ({
    type: "track",
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: (track.artists || []).map(a => a.name),
    album: track.album?.name || null,
    url: track.external_urls?.spotify || null,
    preview_url: track.preview_url || null,
    popularity: track.popularity || 0,
    image: track.album?.images?.[0]?.url || null,
  }));

  const albums = (data.albums?.items || []).filter(Boolean).map(album => ({
    type: "album",
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: (album.artists || []).map(a => a.name),
    url: album.external_urls?.spotify || null,
    image: album.images?.[0]?.url || null,
    release_date: album.release_date || null,
  }));

  const playlists = (data.playlists?.items || []).filter(Boolean).map(playlist => ({
    type: "playlist",
    id: playlist.id,
    uri: playlist.uri,
    name: playlist.name,
    owner: playlist.owner?.display_name || null,
    url: playlist.external_urls?.spotify || null,
    image: playlist.images?.[0]?.url || null,
    total_tracks: playlist.tracks?.total || 0,
  }));

  const shows = (data.shows?.items || []).filter(Boolean).map(show => ({
    type: "show",
    id: show.id,
    uri: show.uri,
    name: show.name,
    publisher: show.publisher || null,
    url: show.external_urls?.spotify || null,
    image: show.images?.[0]?.url || null,
    total_episodes: show.total_episodes || 0,
  }));

  const episodes = (data.episodes?.items || []).filter(Boolean).map(episode => ({
    type: "episode",
    id: episode.id,
    uri: episode.uri,
    name: episode.name,
    show_name: episode.show?.name || "Podcast Episode",
    url: episode.external_urls?.spotify || null,
    image: episode.images?.[0]?.url || null,
    release_date: episode.release_date || null,
    duration_ms: episode.duration_ms || 0,
  }));

  return {
    results: [...tracks, ...albums, ...playlists, ...shows, ...episodes],
  };
}

/**
 * Get playlist details
 */
async function getPlaylist({ uid, playlistId }) {
  if (!uid) throw new Error("uid required");
  if (!playlistId) throw new Error("playlistId required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Spotify access token");

  const response = await safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    requireHttps: true,
    allowHosts: ["api.spotify.com"],
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Spotify playlist");
  }

  const playlist = await response.json();

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    public: playlist.public,
    followers: playlist.followers.total,
    tracks: playlist.tracks.total,
    url: playlist.external_urls.spotify,
  };
}

/**
 * Main posting function for Spotify (creates playlist)
 */
async function postToSpotify({ uid, name, description, trackUris, contentId }) {
  if (!uid) throw new Error("uid required");
  if (!name) throw new Error("name required");

  // Create playlist
  const playlist = await createPlaylist({ uid, name, description, contentId });

  // Add tracks if provided
  if (trackUris && trackUris.length > 0) {
    try {
      await addTracksToPlaylist({ uid, playlistId: playlist.playlistId, trackUris });
    } catch (e) {
      console.warn("[Spotify] Failed to add tracks to playlist:", e.message);
    }
  }

  return playlist;
}

module.exports = {
  getUserSpotifyConnection,
  getValidAccessToken,
  refreshToken,
  getUserProfile,
  createPlaylist,
  addTracksToPlaylist,
  searchTracks,
  formatSearchResults,
  getPlaylist,
  postToSpotify,
  getTracksBatch,
};
