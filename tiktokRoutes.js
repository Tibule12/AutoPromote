// tiktokRoutes.js
// TikTok OAuth and API integration (server-side only)
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { admin, db } = require('./firebaseAdmin');

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI; // e.g., https://autopromote.onrender.com/api/tiktok/callback
// Default dashboard URL to Render domain to ensure redirects land on the live app unless overridden
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote.onrender.com';

function ensureTikTokEnv(res) {
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
    return res.status(500).json({ error: 'TikTok is not configured on the server. Missing TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, or TIKTOK_REDIRECT_URI.' });
  }
}

// 1) Begin OAuth (requires user auth) — keeps scopes minimal for review
router.get('/auth', authMiddleware, async (req, res) => {
  if (ensureTikTokEnv(res)) return;
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // Request minimal scope for initial approval; can expand later (video.upload requires program access)
    const scope = 'user.info.basic';
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    res.redirect(authUrl);
  } catch (e) {
    res.status(500).json({ error: 'Failed to start TikTok OAuth', details: e.message });
  }
});

// Alternative start endpoint that accepts an ID token via query when headers aren't available (for link redirects)
router.get('/auth/start', async (req, res) => {
  if (ensureTikTokEnv(res)) return;
  try {
    const idToken = req.query.id_token;
    if (!idToken) return res.status(401).send('Missing id_token');
    // Verify Firebase token manually and derive uid
    const decoded = await admin.auth().verifyIdToken(String(idToken));
    const uid = decoded.uid;
    if (!uid) return res.status(401).send('Unauthorized');
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = 'user.info.basic';
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).send('Failed to start TikTok OAuth');
  }
});

// 2) OAuth callback — verify state, exchange code, store tokens under users/{uid}/connections/tiktok
router.get('/callback', async (req, res) => {
  if (ensureTikTokEnv(res)) return;
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state');
  try {
    const [uid, nonce] = String(state).split('.');
    if (!uid || !nonce) return res.status(400).send('Invalid state');
    const stateDoc = await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').get();
    const stateData = stateDoc.exists ? stateDoc.data() : null;
    if (!stateData || stateData.state !== state) {
      return res.status(400).send('State mismatch');
    }
    // Exchange code
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
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(400).send('Failed to get TikTok access token');
    }
    // Store tokens securely under user
    const connRef = db.collection('users').doc(uid).collection('connections').doc('tiktok');
    await connRef.set({
      provider: 'tiktok',
      open_id: tokenData.open_id,
      scope: tokenData.scope,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // redirect back to dashboard with success
    const url = new URL(DASHBOARD_URL);
    url.searchParams.set('tiktok', 'connected');
    res.redirect(url.toString());
  } catch (err) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('tiktok', 'error');
      return res.redirect(url.toString());
    } catch (_) {
      return res.status(500).send('TikTok token exchange failed');
    }
  }
});

// 2.1) Connection status — returns whether TikTok is connected and basic profile info
router.get('/status', authMiddleware, async (req, res) => {
  try {
    if (ensureTikTokEnv(res)) return;
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ connected: false, error: 'Unauthorized' });
    const snap = await db.collection('users').doc(uid).collection('connections').doc('tiktok').get();
    if (!snap.exists) {
      return res.json({ connected: false });
    }
    const data = snap.data() || {};
    const result = {
      connected: true,
      open_id: data.open_id,
      scope: data.scope,
      obtainedAt: data.obtainedAt,
    };
    // Try to fetch basic user info if we have an access token and scope allows
    if (data.access_token && String(data.scope || '').includes('user.info.basic')) {
      try {
        const infoRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${data.access_token}` }
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          const u = info.data && info.data.user ? info.data.user : info.data || {};
          result.display_name = u.display_name || u.displayName || undefined;
          result.avatar_url = u.avatar_url || u.avatarUrl || undefined;
        }
      } catch (_) { /* ignore */ }
    }
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ connected: false, error: 'Failed to load TikTok status' });
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
      },
      body: JSON.stringify({ open_id })
    });
    const uploadData = await uploadRes.json();
    if (!uploadData.data || !uploadData.data.upload_url) {
      return res.status(400).json({ error: 'Failed to get TikTok upload URL', details: uploadData });
    }
    // Step 2: Upload video file to TikTok (video_url must be a direct link to the file)
    const videoFileRes = await fetch(video_url);
    const videoBuffer = await videoFileRes.arrayBuffer();
    const uploadToTikTokRes = await fetch(uploadData.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: Buffer.from(videoBuffer)
    });
    if (!uploadToTikTokRes.ok) {
      return res.status(400).json({ error: 'Failed to upload video to TikTok', details: await uploadToTikTokRes.text() });
    }
    // Step 3: Create video post on TikTok
    const createRes = await fetch('https://open.tiktokapis.com/v2/video/publish/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        open_id,
        video_id: uploadData.data.video_id,
        title: title || 'AutoPromote Video'
      })
    });
    const createData = await createRes.json();
    if (!createData.data || !createData.data.video_id) {
      return res.status(400).json({ error: 'Failed to publish video on TikTok', details: createData });
    }
    res.json({ success: true, video_id: createData.data.video_id });
  } catch (err) {
    res.status(500).json({ error: 'TikTok video upload failed', details: err.message });
  }
});

// 4. Fetch TikTok video analytics
// Expects: { access_token, open_id, video_id }
router.post('/analytics', async (req, res) => {
  const { access_token, open_id, video_id } = req.body;
  if (!access_token || !open_id || !video_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const analyticsRes = await fetch(`https://open.tiktokapis.com/v2/video/data/?open_id=${open_id}&video_id=${video_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    const analyticsData = await analyticsRes.json();
    if (!analyticsData.data) {
      return res.status(400).json({ error: 'Failed to fetch TikTok analytics', details: analyticsData });
    }
    res.json({ analytics: analyticsData.data });
  } catch (err) {
    res.status(500).json({ error: 'TikTok analytics fetch failed', details: err.message });
  }
});

module.exports = router;
