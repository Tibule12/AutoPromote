const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require('node-fetch');

const region = 'us-central1';

// TikTok OAuth config (must be set in environment variables)
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
  throw new Error('TikTok OAuth environment variables not set. Please set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI.');
}
// 1. Generate TikTok OAuth URL
exports.getTikTokAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const state = data.state || Math.random().toString(36).substring(2);
  const scope = 'user.info.basic,video.list,video.upload';
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
  return { url };
});

// 2. Handle TikTok OAuth callback and exchange code for access token
exports.tiktokOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
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
    await admin.firestore().collection('tiktok_tokens').doc('default').set({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      obtained_at: Date.now(),
      scope: tokenData.scope,
      open_id: tokenData.open_id
    });
    return res.status(200).send('TikTok authentication successful! You can close this window.');
  } catch (error) {
    console.error('TikTok OAuth error:', error);
    return res.status(500).send('TikTok OAuth failed: ' + error.message);
  }
});
