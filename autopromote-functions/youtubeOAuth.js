// youtubeOAuth.js
// YouTube OAuth 2.0 flow for access token retrieval
// Exposes endpoints to generate YouTube OAuth URL and handle callback

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const region = 'us-central1';

const YT_CLIENT_ID = functions.config().youtube?.client_id || process.env.YT_CLIENT_ID;
const YT_CLIENT_SECRET = functions.config().youtube?.client_secret || process.env.YT_CLIENT_SECRET;
const YT_REDIRECT_URI = functions.config().youtube?.redirect_uri || process.env.YT_REDIRECT_URI;

// 1. Generate YouTube OAuth URL
exports.getYouTubeAuthUrl = functions.region(region).https.onRequest((req, res) => {
  if (!YT_CLIENT_ID || !YT_REDIRECT_URI) {
    return res.status(500).json({ error: 'YouTube client ID or redirect URI not set.' });
  }
  const state = req.query.state || Math.random().toString(36).substring(2);
  const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YT_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&state=${state}`;
  res.redirect(authUrl);
});

// 2. YouTube OAuth Callback
exports.youtubeOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code parameter.' });
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REDIRECT_URI) {
    return res.status(500).json({ error: 'YouTube OAuth environment variables not set.' });
  }
  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: YT_CLIENT_ID,
        client_secret: YT_CLIENT_SECRET,
        redirect_uri: YT_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to obtain YouTube access token', details: tokenData });
    }
    // Optionally get channel info
    const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const channelData = await channelRes.json();
    // Store tokens in Firestore (or return to user for manual storage)
    const { encryptToken } = require('./secretVault');
    await admin.firestore().collection('youtube_tokens').add({
      tokenJson: encryptToken(JSON.stringify(tokenData)),
      channel: channelData.items ? channelData.items[0] : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      state
    });
    res.status(200).json({ success: true, channel: channelData.items ? channelData.items[0] : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
