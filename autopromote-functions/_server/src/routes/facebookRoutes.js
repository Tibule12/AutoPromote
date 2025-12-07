const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { admin, db } = require('../../firebaseAdmin');
const authMiddleware = require('../../authMiddleware');

const router = express.Router();

const FB_CLIENT_ID = process.env.FB_CLIENT_ID;
const FB_CLIENT_SECRET = process.env.FB_CLIENT_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI; // e.g., https://www.autopromote.org/api/facebook/callback (legacy onrender accepted)
const { canonicalizeRedirect } = require('../utils/redirectUri');
const FB_REDIRECT_CANON = canonicalizeRedirect(FB_REDIRECT_URI, { requiredPath: '/api/facebook/callback' });
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://www.autopromote.org';

function ensureEnv(res) {
  if (!FB_CLIENT_ID || !FB_CLIENT_SECRET || !FB_REDIRECT_URI) {
    return res.status(500).json({ error: 'Facebook is not configured. Missing FB_CLIENT_ID, FB_CLIENT_SECRET, or FB_REDIRECT_URI.' });
  }
}

// Centralized list of permissions we request
const REQUESTED_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish'
];

router.get('/health', (req, res) => {
  const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : null);
  res.json({
    ok: true,
    hasClientId: !!FB_CLIENT_ID,
    hasClientSecret: !!FB_CLIENT_SECRET,
    hasRedirect: !!FB_REDIRECT_URI,
    clientIdMasked: mask(FB_CLIENT_ID),
    redirect: FB_REDIRECT_CANON || null,
  });
});

// Diagnostics: show the exact scopes we request and redirect URL
router.get('/requirements', (req, res) => {
  const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : null);
  res.json({
    ok: !!(FB_CLIENT_ID && FB_CLIENT_SECRET && FB_REDIRECT_URI),
    clientIdMasked: mask(FB_CLIENT_ID),
    redirect: FB_REDIRECT_URI || null,
    requestedScopes: REQUESTED_SCOPES,
    notes: 'Ensure these permissions are added under App Review → Permissions and features, and add the Instagram Graph API product to unlock instagram_*.'
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

function appsecretProofFor(token) {
  try {
    if (!FB_CLIENT_SECRET || !token) return null;
    return crypto.createHmac('sha256', String(FB_CLIENT_SECRET)).update(String(token)).digest('hex');
  } catch (e) { return null; }
}

// Preferred: prepare OAuth URL without exposing id_token in query
router.post('/auth/prepare', async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    // Light diagnostics (masked)
    try {
      const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : 'missing');
      console.log('[Facebook][prepare] Using client/redirect', { clientId: mask(FB_CLIENT_ID), redirectPresent: !!FB_REDIRECT_CANON });
    } catch (_) {}
    const nonce = crypto.randomBytes(8).toString('hex');
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('facebook').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = REQUESTED_SCOPES.join(',');
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(FB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_CANON)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&auth_type=rerequest`;
    return res.json({ authUrl });
  } catch (e) {
    console.error('Failed to prepare Facebook OAuth', { error: e.message });
    return res.status(500).json({ error: 'Failed to prepare Facebook OAuth' });
  }
});

// Begin OAuth: verify Firebase ID token, bind state to uid, redirect to Facebook
router.get('/auth/start', async (req, res) => {
  if (ensureEnv(res)) return;
  try {
    // Prefer Authorization header; id_token query is deprecated and will be removed
    let uid = await getUidFromAuthHeader(req);
    if (!uid) {
      const idToken = req.query.id_token; // deprecated
      if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
      const decoded = await admin.auth().verifyIdToken(String(idToken));
      uid = decoded.uid;
    }
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = crypto.randomBytes(8).toString('hex');
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('facebook').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const scope = REQUESTED_SCOPES.join(',');
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(FB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_CANON)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&auth_type=rerequest`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start Facebook OAuth' });
  }
});

// OAuth callback: exchange code, fetch pages, store tokens
router.get('/callback', async (req, res) => {
  if (ensureEnv(res)) return;
  const { code, state, error, error_description, error_message, error_reason, error_code } = req.query;
  // If Facebook returned an error (e.g., Invalid Scopes), surface it cleanly in the dashboard
  if (error || error_message || error_description) {
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('facebook', 'error');
      const msg = String(error_message || error_description || error || 'oauth_error');
      // Normalize a few common reasons
      const reason = /invalid\s*scopes?/i.test(msg) ? 'invalid_scopes' : (error_reason || 'oauth_error');
      url.searchParams.set('reason', reason);
      if (error_code) url.searchParams.set('code', String(error_code));
      return res.redirect(url.toString());
    } catch (_) {
      return res.status(400).json({ error: 'OAuth error', details: { error, error_description, error_message, error_reason, error_code } });
    }
  }
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    // Light diagnostics (masked)
    try {
      const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : 'missing');
  console.log('[Facebook][callback] Exchanging code with', { clientId: mask(FB_CLIENT_ID), redirectPresent: !!FB_REDIRECT_CANON });
    } catch (_) {}
    let uidFromState;
    if (state && typeof state === 'string' && state.includes('.')) {
      const [uid] = state.split('.');
      uidFromState = uid;
    }
  const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(FB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_CANON)}&client_secret=${encodeURIComponent(FB_CLIENT_SECRET)}&code=${encodeURIComponent(code)}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      // Redirect back to dashboard with an error flag so the UI can surface it cleanly
      try {
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set('facebook', 'error');
        if (tokenData && tokenData.error && tokenData.error.code) url.searchParams.set('reason', String(tokenData.error.code));
        return res.redirect(url.toString());
      } catch (_) {
        return res.status(400).json({ error: 'Failed to obtain Facebook access token', details: { error: tokenData.error } });
      }
    }
    // Fetch managed pages
    const proof = appsecretProofFor(tokenData.access_token);
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(tokenData.access_token)}${proof ? `&appsecret_proof=${proof}` : ''}`);
    const pagesData = await pagesRes.json();
    const pages = Array.isArray(pagesData.data) ? pagesData.data : [];
    // Try to get Instagram business account from first page (best-effort)
    let igBusinessAccountId = null;
    if (pages.length > 0) {
      try {
        const pageId = pages[0].id;
        const proofP = appsecretProofFor(pages[0].access_token);
        const igRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pages[0].access_token)}${proofP ? `&appsecret_proof=${proofP}` : ''}`);
        const igData = await igRes.json();
        igBusinessAccountId = igData?.instagram_business_account?.id || null;
      } catch (_) {}
    }

    if (uidFromState) {
      let stored = {
        provider: 'facebook',
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        pages,
        ig_business_account_id: igBusinessAccountId,
        obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      try {
        const { encryptToken, hasEncryption } = require('../services/secretVault');
        if (hasEncryption()) {
          stored.encrypted_user_access_token = encryptToken(tokenData.access_token);
          stored.user_access_token = admin.firestore.FieldValue.delete();
          stored.hasEncryption = true;
        } else {
          stored.user_access_token = tokenData.access_token;
          stored.hasEncryption = false;
        }
      } catch (e) {
        stored.user_access_token = tokenData.access_token; // fallback
      }
      await db.collection('users').doc(uidFromState).collection('connections').doc('facebook').set(stored, { merge: true });
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('facebook', 'connected');
      return res.redirect(url.toString());
    }
    // Avoid returning full page objects (which may contain page.access_token)
    const safePages = (pages || []).map(p => ({ id: p.id, name: p.name || p?.name || null }));
    return res.json({ success: true, pages: safePages });
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

// Connection status (cached ~7s)
router.get('/status', authMiddleware, require('../statusInstrument')('facebookStatus', async (req, res) => {
  const { getCache, setCache } = require('../utils/simpleCache');
  const { dedupe } = require('../utils/inFlight');
  const { instrument } = require('../utils/queryMetrics');
  const uid = req.userId || req.user?.uid;
  const cacheKey = `facebook_status_${uid}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  const result = await dedupe(cacheKey, async () => {
    return instrument('fbStatusQuery', async () => {
      const snap = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
      if (!snap.exists) {
        const out = { connected: false };
        setCache(cacheKey, out, 5000);
        return out;
      }
      const data = snap.data();
      const suppressMigration = process.env.SUPPRESS_STATUS_TOKEN_MIGRATION === 'true';
      if (!suppressMigration && data.user_access_token && !data.encrypted_user_access_token) {
        try {
          const { encryptToken, hasEncryption } = require('../services/secretVault');
          if (hasEncryption()) {
            await snap.ref.set({ encrypted_user_access_token: encryptToken(data.user_access_token), user_access_token: admin.firestore.FieldValue.delete(), hasEncryption: true }, { merge: true });
          }
        } catch (_) { /* ignore */ }
      }
      const out = {
        connected: true,
        pages: (data.pages || []).map(p => ({ id: p.id, name: p.name })),
        ig_business_account_id: data.ig_business_account_id || null
      };
      setCache(cacheKey, out, 7000);
      return out;
    });
  });
  return res.json(result);
}));

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
    // Add appsecret_proof for page access token safety (if we have secret)
    const proofP = appsecretProofFor(page.access_token);
    const finalEndpoint = proofP ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}appsecret_proof=${proofP}` : endpoint;
    const fbRes = await fetch(finalEndpoint, {
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

// Deauthorize callback - Facebook calls this when user removes app
router.post('/deauthorize', express.json(), async (req, res) => {
  try {
    const signedRequest = req.body.signed_request;
    if (!signedRequest) {
      console.warn('[Facebook] Deauthorize callback: missing signed_request');
      return res.json({ success: true });
    }
    
    // Parse signed_request (format: signature.payload)
    const [encodedSig, encodedPayload] = signedRequest.split('.');
    if (!encodedPayload) {
      console.warn('[Facebook] Deauthorize callback: invalid signed_request format');
      return res.json({ success: true });
    }
    
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
    const userId = payload.user_id; // Facebook user ID
    
    console.log('[Facebook] Deauthorize callback received for user:', userId);
    
    // Find and remove connection for this Facebook user
    // Note: We store by our internal uid, not Facebook user_id, so we need to query
    const connectionsSnap = await db.collectionGroup('connections')
      .where('provider', '==', 'facebook')
      .get();
    
    for (const doc of connectionsSnap.docs) {
      const data = doc.data();
      // Check if this connection matches the Facebook user ID (stored in pages data)
      if (data.pages && data.pages.some(p => String(p.id) === String(userId))) {
        await doc.ref.delete();
        console.log('[Facebook] Removed connection for Facebook user:', userId);
      }
    }
    
    // Return confirmation URL as per Facebook requirements
    const confirmationCode = `${userId}_${Date.now()}`;
    return res.json({
      url: `${DASHBOARD_URL}/facebook-data-deletion?confirmation_code=${confirmationCode}`,
      confirmation_code: confirmationCode
    });
  } catch (e) {
    console.error('[Facebook] Deauthorize callback error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Data deletion callback - same as deauthorize for our purposes
router.post('/data-deletion', express.json(), async (req, res) => {
  // Facebook uses same format as deauthorize
  return router.handle({ ...req, method: 'POST', url: '/deauthorize' }, res);
});

module.exports = router;
