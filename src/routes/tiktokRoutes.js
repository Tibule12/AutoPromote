// tiktokRoutes.js
// TikTok OAuth and API integration
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { admin, db } = require('../../firebaseAdmin');
const authMiddleware = require('../../authMiddleware');

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI; // e.g. https://autopromote.onrender.com/api/tiktok/callback
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote-1.onrender.com';

function ensureTikTokEnv(res) {
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
    return res.status(500).json({ error: 'TikTok is not configured on the server. Missing TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, or TIKTOK_REDIRECT_URI.' });
  }
}

// Health endpoint
router.get('/health', (req, res) => {
  res.json({ ok: true, hasClientKey: !!TIKTOK_CLIENT_KEY, hasRedirect: !!TIKTOK_REDIRECT_URI });
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

// Preferred: prepare OAuth URL securely without exposing id_token in URL
router.post('/auth/prepare', async (req, res) => {
  if (ensureTikTokEnv(res)) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = 'user.info.basic';
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    return res.json({ authUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to prepare TikTok OAuth' });
  }
});

// 1a. Preferred start: accept Firebase ID token via query, verify, set state with uid, and redirect to TikTok
router.get('/auth/start', async (req, res) => {
  if (ensureTikTokEnv(res)) return;
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
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = 'user.info.basic'; // minimal scope for review
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start TikTok OAuth' });
  }
});

// 1b. Legacy: simple redirect without binding to user (kept for compatibility)
router.get('/auth', (req, res) => {
  if (ensureTikTokEnv(res)) return;
  const scope = 'user.info.basic';
  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
  res.redirect(authUrl);
});

// 2. Handle TikTok OAuth callback
router.get('/callback', async (req, res) => {
  if (ensureTikTokEnv(res)) return;
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code from TikTok' });
  try {
    // Attempt to parse uid from state if provided by /auth/start
    let uidFromState;
    if (state && typeof state === 'string' && state.includes('.')) {
      const [uid] = state.split('.');
      uidFromState = uid;
    }
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
    // If we have a uid from state, store tokens under user connections and redirect back to dashboard
    if (uidFromState) {
      try {
        const connRef = db.collection('users').doc(uidFromState).collection('connections').doc('tiktok');
        await connRef.set({
          provider: 'tiktok',
          open_id: tokenData.open_id,
          scope: tokenData.scope,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set('tiktok', 'connected');
        return res.redirect(url.toString());
      } catch (_) {
        // fall back to JSON if persistence fails
      }
    }
    // Fallback: return tokens in JSON (legacy behavior)
    res.json({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, open_id: tokenData.open_id });
  } catch (err) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('tiktok', 'error');
      return res.redirect(url.toString());
    } catch (_) {
      res.status(500).json({ error: 'TikTok token exchange failed', details: err.message });
    }
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

// 4. Status endpoint (auth required) - reports whether a TikTok connection exists and basic profile info best-effort
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ connected: false, error: 'Unauthorized' });
    const snap = await db.collection('users').doc(uid).collection('connections').doc('tiktok').get();
    if (!snap.exists) return res.json({ connected: false });
    const data = snap.data() || {};
    const out = {
      connected: true,
      open_id: data.open_id,
      scope: data.scope,
      obtainedAt: data.obtainedAt,
    };
    // If we have minimal scope and access token, try to fetch basic profile
    if (data.access_token && String(data.scope || '').includes('user.info.basic')) {
      try {
        const infoRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${data.access_token}` }
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          const u = info.data && info.data.user ? info.data.user : info.data || {};
          out.display_name = u.display_name || u.displayName;
          out.avatar_url = u.avatar_url || u.avatarUrl;
        }
      } catch (_) { /* ignore */ }
    }
    return res.json(out);
  } catch (_) {
    return res.status(500).json({ connected: false, error: 'Failed to load status' });
  }
});
