/*
Refresh TikTok tokens for a user using stored refresh_token.
Usage: node -r dotenv/config scripts/refresh-tiktok-token.js --uid <uid>

This will attempt to decrypt stored tokens when encryption is enabled and call tiktokService.refreshToken(uid, refreshToken).
*/

const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid || argv.u || process.env.TEST_UID;

if (!uid) {
  console.error('Usage: node scripts/refresh-tiktok-token.js --uid <uid>');
  process.exit(1);
}

(async () => {
  try {
    const { db } = require('../src/firebaseAdmin');
    const { decryptToken } = require('../src/services/secretVault');
    const { refreshToken } = require('../src/services/tiktokService');

    const connRef = db.collection('users').doc(uid).collection('connections').doc('tiktok');
    const snap = await connRef.get();
    if (!snap.exists) {
      console.error('No tiktok connection doc found for uid:', uid);
      process.exit(2);
    }

    const data = snap.data();
    let refresh = null;

    if (data.hasEncryption && data.tokens) {
      // tokens may be stored as encrypted JSON string
      try {
        const dec = decryptToken(data.tokens);
        const parsed = JSON.parse(dec);
        refresh = parsed.refresh_token || parsed.refreshToken || null;
      } catch (e) {
        console.warn('Failed to parse decrypted tokens:', e && e.message);
      }
    }

    // Fallbacks for legacy fields
    if (!refresh) refresh = data.refresh_token || (data.tokens && data.tokens.refresh_token) || null;

    if (!refresh) {
      console.error('No refresh token found for user', uid);
      process.exit(3);
    }

    console.log('Attempting refresh for uid:', uid);
    try {
      const res = await refreshToken(uid, refresh);
      console.log('Refresh result:', JSON.stringify(res, null, 2));
      process.exit(0);
    } catch (e) {
      console.error('Refresh failed:', e && (e.stack || e.message || e));
      process.exit(4);
    }
  } catch (e) {
    console.error('Unexpected failure:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();
