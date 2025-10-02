const express = require('express');
const fetch = require('node-fetch');
const { admin, db } = require('../../firebaseAdmin');
const authMiddleware = require('../../authMiddleware');

const router = express.Router();

const FB_CLIENT_ID = process.env.FB_CLIENT_ID;
const FB_CLIENT_SECRET = process.env.FB_CLIENT_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI; // e.g., https://autopromote.onrender.com/api/facebook/callback
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote-1.onrender.com';

function ensureEnv(res) {
  if (!FB_CLIENT_ID || !FB_CLIENT_SECRET || !FB_REDIRECT_URI) {
    return res.status(500).json({ error: 'Facebook is not configured. Missing FB_CLIENT_ID, FB_CLIENT_SECRET, or FB_REDIRECT_URI.' });
  }
}

router.get('/health', (req, res) => {
  res.json({ ok: true, hasClientId: !!FB_CLIENT_ID, hasRedirect: !!FB_REDIRECT_URI });
});

// Begin OAuth: verify Firebase ID token, bind state to uid, redirect to Facebook
router.get('/auth/start', async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    const idToken = req.query.id_token;
    if (!idToken) return res.status(401).json({ error: 'Missing id_token' });
    const decoded = await admin.auth().verifyIdToken(String(idToken));
    const uid = decoded.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('facebook').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_manage_metadata',
      'instagram_basic',
      'instagram_content_publish'
    ].join(',');
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(FB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start Facebook OAuth' });
  }
});

// OAuth callback: exchange code, fetch pages, store tokens
router.get('/callback', async (req, res) => {
  if (ensureEnv(res)) return;
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    let uidFromState;
    if (state && typeof state === 'string' && state.includes('.')) {
      const [uid] = state.split('.');
      uidFromState = uid;
    }
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(FB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&client_secret=${encodeURIComponent(FB_CLIENT_SECRET)}&code=${encodeURIComponent(code)}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to obtain Facebook access token', details: tokenData });
    }
    // Fetch managed pages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(tokenData.access_token)}`);
    const pagesData = await pagesRes.json();
    const pages = Array.isArray(pagesData.data) ? pagesData.data : [];
    // Try to get Instagram business account from first page (best-effort)
    let igBusinessAccountId = null;
    if (pages.length > 0) {
      try {
        const pageId = pages[0].id;
        const igRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pages[0].access_token)}`);
        const igData = await igRes.json();
        igBusinessAccountId = igData?.instagram_business_account?.id || null;
      } catch (_) {}
    }

    if (uidFromState) {
      await db.collection('users').doc(uidFromState).collection('connections').doc('facebook').set({
        provider: 'facebook',
        user_access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        pages,
        ig_business_account_id: igBusinessAccountId,
        obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('facebook', 'connected');
      return res.redirect(url.toString());
    }
    return res.json({ success: true, access_token: tokenData.access_token, pages });
  } catch (err) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('facebook', 'error');
      return res.redirect(url.toString());
    } catch (_) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Connection status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const snap = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    if (!snap.exists) return res.json({ connected: false });
    const data = snap.data();
    const out = {
      connected: true,
      pages: (data.pages || []).map(p => ({ id: p.id, name: p.name })),
      ig_business_account_id: data.ig_business_account_id || null
    };
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ connected: false, error: 'Failed to load status' });
  }
});

// Upload to a Facebook Page feed/photos/videos
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { pageId, content } = req.body || {};
    if (!pageId || !content) return res.status(400).json({ error: 'pageId and content are required' });
    const uid = req.userId || req.user?.uid;
    const snap = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    if (!snap.exists) return res.status(400).json({ error: 'Facebook not connected' });
    const data = snap.data();
    const page = (data.pages || []).find(p => p.id === pageId);
    if (!page || !page.access_token) return res.status(400).json({ error: 'Page not found or missing access token' });

    // Build endpoint/body
    let endpoint = `https://graph.facebook.com/${encodeURIComponent(pageId)}/feed`;
    let body = { access_token: page.access_token };
    if (content.type === 'image' && content.url) {
      endpoint = `https://graph.facebook.com/${encodeURIComponent(pageId)}/photos`;
      body.url = content.url;
      if (content.title || content.description) body.caption = `${content.title || ''}\n${content.description || ''}`.trim();
    } else if (content.type === 'video' && content.url) {
      endpoint = `https://graph.facebook.com/${encodeURIComponent(pageId)}/videos`;
      body.file_url = content.url;
      body.description = `${content.title || ''}\n${content.description || ''}`.trim();
    } else {
      body.message = `${content.title || ''}\n${content.description || ''}`.trim();
      if (content.url && !body.message.includes(content.url)) body.message += `\n${content.url}`;
    }
    const fbRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const fbData = await fbRes.json();
    if (!fbRes.ok) return res.status(400).json({ error: 'Facebook API error', details: fbData });
    return res.json({ success: true, result: fbData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
