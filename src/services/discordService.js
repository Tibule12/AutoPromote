// discordService.js - minimal placeholder implementation
const { db } = require('../firebaseAdmin');

async function postToDiscord({ contentId, payload, reason, uid }) {
  let userTokens = null;
  if (uid) {
    try {
      const snap = await db.collection('users').doc(uid).collection('connections').doc('discord').get();
      if (snap.exists && snap.data().tokens) userTokens = snap.data().tokens;
    } catch (e) {
      // ignore Firestore read errors; fallback to env creds
    }
  }

  const hasCreds = userTokens || (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) || process.env.DISCORD_BOT_TOKEN;
  if (!hasCreds) return { platform: 'discord', simulated: true, reason: 'missing_credentials' };

  // Placeholder: real implementation would post to a channel via a bot or webhook
  return { platform: 'discord', success: true, id: `discord-sim-${Date.now()}`, reason, simulated: !userTokens };
}

module.exports = { postToDiscord };
