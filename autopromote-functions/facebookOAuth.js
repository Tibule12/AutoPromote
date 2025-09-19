// facebookOAuth.js
// Facebook OAuth 2.0 flow for Page access token retrieval
// Exposes endpoints to generate Facebook OAuth URL and handle callback

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const region = 'us-central1';

const FB_CLIENT_ID = functions.config().facebook?.client_id || process.env.FB_CLIENT_ID;
const FB_CLIENT_SECRET = functions.config().facebook?.client_secret || process.env.FB_CLIENT_SECRET;
const FB_REDIRECT_URI = functions.config().facebook?.redirect_uri || process.env.FB_REDIRECT_URI;

// 1. Generate Facebook OAuth URL
exports.getFacebookAuthUrl = functions.region(region).https.onRequest((req, res) => {
  if (!FB_CLIENT_ID || !FB_REDIRECT_URI) {
    return res.status(500).json({ error: 'Facebook client ID or redirect URI not set.' });
  }
  const state = req.query.state || Math.random().toString(36).substring(2);
  const scope = 'pages_show_list pages_manage_posts pages_read_engagement pages_manage_metadata';
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

// 2. Facebook OAuth Callback
exports.facebookOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code parameter.' });
  if (!FB_CLIENT_ID || !FB_CLIENT_SECRET || !FB_REDIRECT_URI) {
    return res.status(500).json({ error: 'Facebook OAuth environment variables not set.' });
  }
  try {
    // Exchange code for access token
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${FB_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}` +
      `&client_secret=${FB_CLIENT_SECRET}` +
      `&code=${code}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to obtain Facebook access token', details: tokenData });
    }
    // Get list of pages the user manages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`);
    const pagesData = await pagesRes.json();
    // Store tokens in Firestore (or return to user for manual storage)
    await admin.firestore().collection('facebook_tokens').add({
      access_token: tokenData.access_token,
      pages: pagesData.data || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      state
    });
    res.status(200).json({ success: true, access_token: tokenData.access_token, pages: pagesData.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
