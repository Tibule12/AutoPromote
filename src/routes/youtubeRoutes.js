const express = require('express');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const streamifier = require('streamifier');
const { admin, db } = require('../../firebaseAdmin');
const authMiddleware = require('../../authMiddleware');

const router = express.Router();

const YT_CLIENT_ID = process.env.YT_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const YT_REDIRECT_URI = process.env.YT_REDIRECT_URI; // e.g., https://autopromote.onrender.com/api/youtube/callback
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote-1.onrender.com';

function ensureEnv(res) {
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REDIRECT_URI) {
    return res.status(500).json({ error: 'YouTube not configured. Missing YT_CLIENT_ID/SECRET/REDIRECT_URI.' });
  }
}

router.get('/health', (req, res) => {
  const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : null);
  res.json({
    ok: true,
    hasClientId: !!YT_CLIENT_ID,
    hasClientSecret: !!YT_CLIENT_SECRET,
    hasRedirect: !!YT_REDIRECT_URI,
    clientIdMasked: mask(YT_CLIENT_ID),
    redirect: YT_REDIRECT_URI || null,
  });
});

async function getUidFromAuthHeader(req) {
  try {
    const authz = req.headers.authorization || '';
    const [scheme, token] = authz.split(' ');
    if (scheme === 'Bearer' && token) {
      const decoded = await admin.auth().verifyIdToken(String(token));
      return decoded.uid;
    }
  } catch (_) {}
  return null;
}

// Preferred: prepare OAuth URL securely
router.post('/auth/prepare', async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    // Light diagnostics (masked)
    try {
      const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : 'missing');
      console.log('[YouTube][prepare] Using client/redirect', { clientId: mask(YT_CLIENT_ID), redirect: YT_REDIRECT_URI });
    } catch (_) {}
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('youtube').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'].join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(YT_CLIENT_ID)}&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return res.json({ authUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to prepare YouTube OAuth' });
  }
});

router.get('/auth/start', async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    // Prefer Authorization header; id_token query is deprecated
    let uid = await getUidFromAuthHeader(req);
    if (!uid) {
      const idToken = req.query.id_token; // deprecated
      if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
      const decoded = await admin.auth().verifyIdToken(String(idToken));
      uid = decoded.uid;
    }
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('youtube').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'].join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(YT_CLIENT_ID)}&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start YouTube OAuth' });
  }
});

router.get('/callback', async (req, res) => {
  if (ensureEnv(res)) return;
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    // Light diagnostics (masked)
    try {
      const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : 'missing');
      console.log('[YouTube][callback] Exchanging code with', { clientId: mask(YT_CLIENT_ID), redirect: YT_REDIRECT_URI });
    } catch (_) {}
    let uidFromState;
    if (state && typeof state === 'string' && state.includes('.')) {
      const [uid] = state.split('.');
      uidFromState = uid;
    }
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
      // Redirect back to dashboard with an error hint so the UI can surface it cleanly
      try {
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set('youtube', 'error');
        if (tokenData && tokenData.error) url.searchParams.set('reason', String(tokenData.error));
        return res.redirect(url.toString());
      } catch (_) {
        return res.status(400).json({ error: 'Failed to obtain YouTube access token', details: tokenData });
      }
    }

    // Optional: fetch channel info
    let channel = null;
    try {
      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const channelData = await channelRes.json();
      channel = channelData.items ? channelData.items[0] : null;
    } catch (_) {}

    if (uidFromState) {
      await db.collection('users').doc(uidFromState).collection('connections').doc('youtube').set({
        provider: 'youtube',
        ...tokenData,
        channel,
        obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('youtube', 'connected');
      return res.redirect(url.toString());
    }
    return res.json({ success: true, ...tokenData, channel });
  } catch (err) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('youtube', 'error');
      return res.redirect(url.toString());
    } catch (_) {
      res.status(500).json({ error: err.message });
    }
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const snap = await db.collection('users').doc(uid).collection('connections').doc('youtube').get();
    if (!snap.exists) return res.json({ connected: false });
    const data = snap.data();
    return res.json({ connected: true, channel: data.channel || null });
  } catch (e) {
    return res.status(500).json({ connected: false, error: 'Failed to load status' });
  }
});

// Upload a video to YouTube given a file URL
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl, mimeType } = req.body || {};
    if (!title || !videoUrl) return res.status(400).json({ error: 'title and videoUrl are required' });
    const uid = req.userId || req.user?.uid;
    const snap = await db.collection('users').doc(uid).collection('connections').doc('youtube').get();
    if (!snap.exists) return res.status(400).json({ error: 'YouTube not connected' });
    const tokenData = snap.data();
    const oauth2Client = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      token_type: tokenData.token_type,
      expiry_date: Date.now() + (tokenData.expires_in * 1000)
    });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const vRes = await fetch(videoUrl);
    if (!vRes.ok) return res.status(400).json({ error: 'Failed to download video' });
    const videoBuffer = await vRes.buffer();
    const insertRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: { snippet: { title, description: description || '' }, status: { privacyStatus: 'public' } },
      media: { mimeType: mimeType || 'video/mp4', body: streamifier.createReadStream(videoBuffer) }
    });
    return res.json({ success: true, result: insertRes.data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
