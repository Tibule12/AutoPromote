// spotifyService.js - minimal placeholder implementation
const { db } = require('../firebaseAdmin');

async function postToSpotify({ contentId, payload, reason, uid }) {
  // Try to read user-scoped tokens first
  let userTokens = null;
  if (uid) {
    try {
      const snap = await db.collection('users').doc(uid).collection('connections').doc('spotify').get();
      if (snap.exists && snap.data().tokens) userTokens = snap.data().tokens;
    } catch (_) {}
  }
  const hasCreds = userTokens || (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  if (!hasCreds) return { platform: 'spotify', simulated: true, reason: 'missing_credentials' };
  // Placeholder: real implementation would create an episode/playlist item or share link
  return { platform: 'spotify', success: true, id: `spotify-sim-${Date.now()}`, reason, simulated: !userTokens };
}

module.exports = { postToSpotify };
