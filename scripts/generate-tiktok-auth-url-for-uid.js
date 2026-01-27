// Usage: node -r dotenv/config scripts/generate-tiktok-auth-url-for-uid.js <uid>
// Generates a TikTok OAuth URL requesting analytics scopes and stores oauth state in Firestore for the given uid.

(async () => {
  try {
    const uid = process.argv[2];
    if (!uid) {
      console.error('Usage: node scripts/generate-tiktok-auth-url-for-uid.js <uid>');
      process.exit(1);
    }
    const { db } = require('../src/firebaseAdmin');
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = `${uid}.${nonce}`;

    const cfg = process.env.TIKTOK_ENV === 'production'
      ? { key: process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY, redirect: process.env.TIKTOK_PROD_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI }
      : { key: process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY, redirect: process.env.TIKTOK_SANDBOX_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI };

    const scopeArr = ['user.info.profile','video.list','video.data','video.upload','video.publish'];
    const scope = scopeArr.join(',');
    const base = process.env.TIKTOK_ENV === 'production' ? 'https://www.tiktok.com/v2/auth/authorize/' : 'https://sandbox.tiktok.com/platform/oauth/authorize';
    const authUrl = `${base}?client_key=${encodeURIComponent(cfg.key)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(cfg.redirect)}&state=${encodeURIComponent(state)}`;

    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({ state, nonce, createdAt: require('../src/firebaseAdmin').admin.firestore.FieldValue.serverTimestamp(), mode: process.env.TIKTOK_ENV || 'sandbox', requestedScopes: scope }, { merge: true });

    console.log('Auth URL (open this in the browser to re-authorize):');
    console.log(authUrl);
    console.log('Stored state for uid:', uid, 'in users/<uid>/oauth_state/tiktok');
  } catch (e) {
    console.error('Failed:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();