const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require('node-fetch');

const region = 'us-central1';

// TikTok OAuth config with sandbox/production switching
const TIKTOK_ENV = (process.env.TIKTOK_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
const sandboxConfig = {
  key: process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || null,
  secret: process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || null,
  redirect: process.env.TIKTOK_SANDBOX_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || null,
};
const productionConfig = {
  key: process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || null,
  secret: process.env.TIKTOK_PROD_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || null,
  redirect: process.env.TIKTOK_PROD_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || null,
};
function activeConfig() { return TIKTOK_ENV === 'production' ? productionConfig : sandboxConfig; }
const { key: TIKTOK_CLIENT_KEY, secret: TIKTOK_CLIENT_SECRET, redirect: TIKTOK_REDIRECT_URI } = activeConfig();

function isTikTokConfigValid() {
  return !!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REDIRECT_URI);
}
// 1. Generate TikTok OAuth URL
exports.getTikTokAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  if (!isTikTokConfigValid()) {
    throw new functions.https.HttpsError('failed-precondition', `TikTok OAuth environment variables not set for mode ${TIKTOK_ENV}.`);
  }
  const state = data.state || Math.random().toString(36).substring(2);
  // Keep function scope broad here; frontend route uses narrower initial scope
  const DEFAULT_TIKTOK_SCOPES = 'user.info.profile video.upload video.publish video.data';
  const scope = (process.env.TIKTOK_OAUTH_SCOPES || DEFAULT_TIKTOK_SCOPES).trim();
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
  return { url, mode: TIKTOK_ENV };
});

// 2. Handle TikTok OAuth callback and exchange code for access token
exports.tiktokOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  if (!isTikTokConfigValid()) {
    return res.status(500).send(`TikTok OAuth environment variables not set for mode ${TIKTOK_ENV}.`);
  }
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.message || 'No access token');
    // Store access token in Firestore (or your preferred store)
    const { encryptToken } = require('./secretVault');
    await admin.firestore().collection('tiktok_tokens').doc('default').set({
      tokenJson: encryptToken(JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_in: tokenData.expires_in, scope: tokenData.scope, open_id: tokenData.open_id })),
      obtained_at: Date.now()
    });
    return res.status(200).send('TikTok authentication successful! You can close this window.');
  } catch (error) {
    console.error('TikTok OAuth error:', error);
    return res.status(500).send('TikTok OAuth failed: ' + error.message);
  }
});
