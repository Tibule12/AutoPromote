// tiktokRoutes.js
// TikTok OAuth and API integration
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

// 1. Redirect user to TikTok for OAuth
router.get('/auth', (req, res) => {
  const scope = 'user.info.basic,video.list,video.upload';
  const state = Math.random().toString(36).substring(2, 15); // random string for CSRF protection
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
  res.redirect(authUrl);
});

// 2. Handle TikTok OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code from TikTok' });
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
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to get TikTok access token', details: tokenData });
    }
    // Save access_token and refresh_token as needed (e.g., in DB, session, etc.)
    // For demo, just return them
    res.json({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, open_id: tokenData.open_id });
  } catch (err) {
    res.status(500).json({ error: 'TikTok token exchange failed', details: err.message });
  }
});

// 3. Upload video to TikTok
// Expects: { access_token, open_id, video_url, title }
router.post('/upload', async (req, res) => {
  const { access_token, open_id, video_url, title } = req.body;
  if (!access_token || !open_id || !video_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Step 1: Get upload URL from TikTok
    const uploadRes = await fetch('https://open.tiktokapis.com/v2/video/upload/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
      // ... add body and other fetch options as needed
    });
    // Handle TikTok upload response here
    res.json({ message: 'Upload simulated (complete implementation needed)' });
  } catch (err) {
    res.status(500).json({ error: 'TikTok upload failed', details: err.message });
  }
});

module.exports = router;
