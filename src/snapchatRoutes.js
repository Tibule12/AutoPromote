// Snapchat OAuth and API integration (server-side only)
// Note: Snapchat does not have a sandbox environment - only production
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { admin, db } = require('./firebaseAdmin');
const DEBUG_SNAPCHAT_OAUTH = process.env.DEBUG_SNAPCHAT_OAUTH === 'true';

// Snapchat only supports production environment
const config = {
  key: (process.env.SNAPCHAT_CLIENT_ID || '').toString().trim() || null,
  secret: (process.env.SNAPCHAT_CLIENT_SECRET || '').toString().trim() || null,
  redirect: (process.env.SNAPCHAT_REDIRECT_URI || '').toString().trim() || null,
};

function activeConfig() {
  return config;
}

// For dashboard redirect
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote-1.onrender.com';

function ensureSnapchatEnv(res, cfg, opts = { requireSecret: true }) {
  const missing = [];
  if (!cfg.key) missing.push('SNAPCHAT_CLIENT_ID');
  if (opts.requireSecret && !cfg.secret) missing.push('SNAPCHAT_CLIENT_SECRET');
  if (!cfg.redirect) missing.push('SNAPCHAT_REDIRECT_URI');

  if (missing.length > 0) {
    return res.status(500).json({
      error: 'Snapchat environment not configured',
      missing: missing,
      message: 'Please configure the required Snapchat environment variables. Note: Snapchat only supports production environment.'
    });
  }
}

// 1. Get Snapchat OAuth authorization URL (redirect)
router.get('/auth', (req, res) => {
  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  const scope = 'snapchat-marketing-api,ads-api';
  const state = encodeURIComponent(req.query.state || 'snapchat_oauth_state');
  const authUrl = `https://accounts.snapchat.com/login/oauth2/authorize?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

  if (DEBUG_SNAPCHAT_OAUTH) {
    console.log('Snapchat OAuth URL:', authUrl);
  }

  res.json({ authUrl });
});

// 2. Prepare Snapchat OAuth (returns JSON authUrl for frontend)
router.post('/oauth/prepare', authMiddleware, async (req, res) => {
  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  try {
    const scope = 'snapchat-marketing-api,ads-api';
    const state = require('crypto').randomUUID();
    const userId = req.userId || 'anonymous';

    // Store state temporarily in Firestore
    await db.collection('oauth_states').doc(state).set({
      uid: userId,
      platform: 'snapchat',
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    const authUrl = `https://accounts.snapchat.com/login/oauth2/authorize?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

    if (DEBUG_SNAPCHAT_OAUTH) {
      console.log('Snapchat OAuth prepare URL:', authUrl);
    }

    res.json({ authUrl, state });
  } catch (err) {
    console.error('Snapchat OAuth prepare error:', err);
    res.status(500).json({ error: 'OAuth prepare failed', details: err.message });
  }
});

// 2. Handle Snapchat OAuth callback and exchange code for access token
router.post('/auth/callback', async (req, res) => {
  const { code, state } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: cfg.redirect
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).json({ error: 'Failed to exchange code for token', details: tokenData });
    }

    // Get user profile information
    const profileRes = await fetch('https://adsapi.snapchat.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const profileData = await profileRes.json();
    if (!profileRes.ok) {
      return res.status(400).json({ error: 'Failed to get user profile', details: profileData });
    }

    // Store connection in Firestore
    const userId = req.userId || 'anonymous'; // Assuming authMiddleware sets req.userId
    await db.collection('users').doc(userId).collection('connections').doc('snapchat').set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      profile: profileData,
      connectedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Snapchat connected successfully',
      profile: profileData
    });
  } catch (err) {
    console.error('Snapchat OAuth callback error:', err);
    res.status(500).json({ error: 'OAuth callback failed', details: err.message });
  }
});

// 3. Get Snapchat connection status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.userId).collection('connections').doc('snapchat').get();
    if (!snap.exists) return res.json({ connected: false });

    const data = snap.data();
    const isExpired = data.expiresAt && data.expiresAt < Date.now();

    res.json({
      connected: !isExpired,
      profile: data.profile,
      expiresAt: data.expiresAt,
      connectedAt: data.connectedAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get Snapchat status', details: err.message });
  }
});

// 4. Create Snapchat ad creative (placeholder - Snapchat Creative Kit API)
router.post('/creative', authMiddleware, async (req, res) => {
  try {
    const { title, description, media_url, campaign_id } = req.body;
    if (!title || !media_url) {
      return res.status(400).json({ error: 'Title and media_url are required' });
    }

    // Get Snapchat connection
    const snap = await db.collection('users').doc(req.userId).collection('connections').doc('snapchat').get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Snapchat not connected' });
    }

    const connection = snap.data();
    if (connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Snapchat token expired' });
    }

    // Create creative via Snapchat Marketing API
    const creativeRes = await fetch('https://adsapi.snapchat.com/v1/adaccounts/{ad_account_id}/creatives', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: title,
        type: 'SNAP_AD',
        headline: title,
        description: description,
        media: {
          type: 'IMAGE',
          url: media_url
        },
        campaign_id: campaign_id
      })
    });

    const creativeData = await creativeRes.json();
    if (!creativeRes.ok) {
      return res.status(400).json({ error: 'Failed to create Snapchat creative', details: creativeData });
    }

    res.json({ success: true, creative: creativeData });
  } catch (err) {
    res.status(500).json({ error: 'Snapchat creative creation failed', details: err.message });
  }
});

// 5. Get Snapchat ad performance metrics
router.get('/analytics/:creativeId', authMiddleware, async (req, res) => {
  try {
    const { creativeId } = req.params;

    // Get Snapchat connection
    const snap = await db.collection('users').doc(req.userId).collection('connections').doc('snapchat').get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Snapchat not connected' });
    }

    const connection = snap.data();
    if (connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Snapchat token expired' });
    }

    // Get analytics data
    const analyticsRes = await fetch(`https://adsapi.snapchat.com/v1/creatives/${creativeId}/stats`, {
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`
      }
    });

    const analyticsData = await analyticsRes.json();
    if (!analyticsRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch Snapchat analytics', details: analyticsData });
    }

    res.json({ analytics: analyticsData });
  } catch (err) {
    res.status(500).json({ error: 'Snapchat analytics fetch failed', details: err.message });
  }
});

module.exports = router;
