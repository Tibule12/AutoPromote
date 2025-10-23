// tiktokRoutes.js
// TikTok OAuth and API integration (server-side only) with sandbox/production mode support
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { admin, db } = require('./firebaseAdmin');
const DEBUG_TIKTOK_OAUTH = process.env.DEBUG_TIKTOK_OAUTH === 'true';

// Gather both sandbox & production env sets (prefixed) plus legacy fallbacks
const sandboxConfig = {
  key: (process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '').toString().trim() || null,
  secret: (process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '').toString().trim() || null,
  redirect: (process.env.TIKTOK_SANDBOX_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || '').toString().trim() || null,
};
const productionConfig = {
  key: (process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '').toString().trim() || null,
  secret: (process.env.TIKTOK_PROD_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '').toString().trim() || null,
  redirect: (process.env.TIKTOK_PROD_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI || '').toString().trim() || null,
};

// Mode selection: prefer explicit TIKTOK_ENV; if not provided, automatically
// prefer production when production config appears to be present. This is a
// temporary code-side override to help while deployment env vars are being
// fixed. IMPORTANT: revert this change once Render env is configured and
// TIKTOK_ENV is explicitly set by the deployment environment.
let TIKTOK_ENV;
if (process.env.TIKTOK_ENV) {
  TIKTOK_ENV = process.env.TIKTOK_ENV.toLowerCase() === 'production' ? 'production' : 'sandbox';
} else if (productionConfig.key && productionConfig.redirect) {
  // Prefer production if production credentials + redirect exist
  TIKTOK_ENV = 'production';
} else {
  TIKTOK_ENV = 'sandbox';
}

function activeConfig() {
  return TIKTOK_ENV === 'production' ? productionConfig : sandboxConfig;
}

// For dashboard redirect
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote-1.onrender.com';

function ensureTikTokEnv(res, cfg, opts = { requireSecret: true }) {
  const missing = [];
  if (!cfg.key) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_CLIENT_KEY' : 'TIKTOK_SANDBOX_CLIENT_KEY'} (or fallback TIKTOK_CLIENT_KEY)`);
  if (opts.requireSecret && !cfg.secret) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_CLIENT_SECRET' : 'TIKTOK_SANDBOX_CLIENT_SECRET'} (or fallback TIKTOK_CLIENT_SECRET)`);
  if (!cfg.redirect) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_REDIRECT_URI' : 'TIKTOK_SANDBOX_REDIRECT_URI'} (or fallback TIKTOK_REDIRECT_URI)`);
  if (missing.length) {
    return res.status(500).json({ error: 'tiktok_config_missing', mode: TIKTOK_ENV, missing });
  }
}

function constructAuthUrl(cfg, state, scope) {
  const key = String(cfg.key || '').trim();
  const redirect = String(cfg.redirect || '').trim();
  // Use TikTok sandbox domain for sandbox mode (recommended by TikTok docs)
  const base = (TIKTOK_ENV === 'production')
    ? 'https://www.tiktok.com/v2/auth/authorize/'
    : 'https://sandbox.tiktok.com/platform/oauth/authorize';
  return `${base}?client_key=${encodeURIComponent(key)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`;
}

// Diagnostics: quick config visibility with sandbox/production breakdown
router.get('/config', (req, res) => {
  const cfg = activeConfig();
  const mask = (val) => (val && val.length > 8) ? `${val.slice(0,4)}***${val.slice(-4)}` : (val ? '***' : null);
  const response = {
    ok: true,
    mode: TIKTOK_ENV,
    active: {
      hasClientKey: !!cfg.key,
      hasClientSecret: !!cfg.secret,
      hasRedirect: !!cfg.redirect,
      redirectUri: cfg.redirect || null,
      clientKeyMask: mask(cfg.key)
    },
    sandboxConfigured: !!sandboxConfig.key && !!sandboxConfig.redirect,
    productionConfigured: !!productionConfig.key && !!productionConfig.redirect,
    // Indicate whether legacy fallback vars (unscoped) are supplying values
    usingFallbackLegacy: (
      (TIKTOK_ENV === 'sandbox' && !process.env.TIKTOK_SANDBOX_CLIENT_KEY && !!process.env.TIKTOK_CLIENT_KEY) ||
      (TIKTOK_ENV === 'production' && !process.env.TIKTOK_PROD_CLIENT_KEY && !!process.env.TIKTOK_CLIENT_KEY)
    )
  };
  res.json(response);
});

// Health endpoint to verify mount
router.get('/health', (req, res) => {
  const cfg = activeConfig();
  res.json({ ok: true, mode: TIKTOK_ENV, hasClientKey: !!cfg.key, hasRedirect: !!cfg.redirect });
});

// Helper: extract UID from Authorization: Bearer <firebase id token>
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

// POST /auth/prepare – preferred secure flow used by frontend (returns JSON { authUrl })
// Frontend calls this with Authorization header; server stores state and returns the TikTok OAuth URL
router.post('/auth/prepare', async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const nonce = Math.random().toString(36).slice(2);
    const state = `${uid}.${nonce}`;
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      mode: TIKTOK_ENV
    }, { merge: true });
    const scope = 'user.info.basic';
  const authUrl = constructAuthUrl(cfg, state, scope);
    // Store authUrl for debugging (non-sensitive)
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({ lastAuthUrl: authUrl }, { merge: true });
    if (DEBUG_TIKTOK_OAUTH) {
      console.log('[TikTok][prepare] uid=%s mode=%s state=%s authUrl=%s', uid, TIKTOK_ENV, state, authUrl);
    }
    return res.json({ authUrl, mode: TIKTOK_ENV });
  } catch (e) {
    if (DEBUG_TIKTOK_OAUTH) console.error('[TikTok][prepare][error]', e);
    return res.status(500).json({ error: 'Failed to prepare TikTok OAuth' });
  }
});

// 1) Begin OAuth (requires user auth) — keeps scopes minimal for review
router.get('/auth', authMiddleware, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
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
  const authUrl = constructAuthUrl(cfg, state, scope);
    // Instead of redirecting immediately, render a small HTML page with a button
    // so the user must click to continue. This ensures any deep-linking the
    // provider attempts will be initiated by a user gesture and not blocked by
    // the browser.
    res.set('Content-Type', 'text/html');
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title></head><body style="font-family: system-ui, Arial, sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;max-width:520px;padding:20px;">
        <h2>Connect your TikTok account</h2>
        <p>Click the button below to continue to TikTok and approve the connection.</p>
        <button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
        <p style="margin-top:12px;color:#666;font-size:13px;">If nothing happens, copy-paste this URL into your browser:<br><a href="${authUrl}">${authUrl}</a></p>
      </div>
      <script>
        // Handle potential TikTok SDK errors gracefully
        try {
          window.addEventListener('error', function(e) {
            if (e.message && e.message.includes('read only property')) {
              console.warn('TikTok SDK compatibility issue detected, continuing...');
              e.preventDefault();
            }
            if (e.message && e.message.includes('Break Change')) {
              console.warn('TikTok SDK version compatibility issue detected, continuing...');
              e.preventDefault();
            }
          });
        } catch(e) {}
        document.getElementById('continue').addEventListener('click',function(){
          try {
            window.location.href = ${JSON.stringify(authUrl)};
          } catch(e) {
            console.warn('Navigation failed, trying alternative method');
            window.open(${JSON.stringify(authUrl)}, '_self');
          }
        });
      </script>
    </body></html>`);
  } catch (e) {
    res.status(500).json({ error: 'Failed to start TikTok OAuth', details: e.message });
  }
});

// Alternative start endpoint that accepts an ID token via query when headers aren't available (for link redirects)
router.get('/auth/start', async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
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
    const authUrl = constructAuthUrl(cfg, state, scope);
    // Render a click-to-continue page instead of redirecting immediately.
    res.set('Content-Type', 'text/html');
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title></head><body style="font-family: system-ui, Arial, sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;max-width:520px;padding:20px;">
        <h2>Connect your TikTok account</h2>
        <p>Click the button below to continue to TikTok and approve the connection.</p>
        <button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
        <p style="margin-top:12px;color:#666;font-size:13px;">If nothing happens, copy-paste this URL into your browser:<br><a href="${authUrl}">${authUrl}</a></p>
      </div>
      <script>
        // Handle potential TikTok SDK errors gracefully
        try {
          window.addEventListener('error', function(e) {
            if (e.message && e.message.includes('read only property')) {
              console.warn('TikTok SDK compatibility issue detected, continuing...');
              e.preventDefault();
            }
            if (e.message && e.message.includes('Break Change')) {
              console.warn('TikTok SDK version compatibility issue detected, continuing...');
              e.preventDefault();
            }
          });
        } catch(e) {}
        document.getElementById('continue').addEventListener('click',function(){
          try {
            window.location.href = ${JSON.stringify(authUrl)};
          } catch(e) {
            console.warn('Navigation failed, trying alternative method');
            window.open(${JSON.stringify(authUrl)}, '_self');
          }
        });
      </script>
    </body></html>`);
  } catch (e) {
    return res.status(500).send('Failed to start TikTok OAuth');
  }
});

// Preflight diagnostics (does NOT store state) to help debug client_key rejections
router.get('/auth/preflight', authMiddleware, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  const fakeState = 'preflight.' + Math.random().toString(36).slice(2,10);
  const scope = 'user.info.basic';
  const url = constructAuthUrl(cfg, fakeState, scope);
  const issues = [];
  if (/\s/.test(cfg.key || '')) issues.push('client_key_contains_whitespace');
  if (cfg.key && cfg.key.length < 10) issues.push('client_key_suspicious_length');
  if (!/^https:\/\//.test(cfg.redirect || '')) issues.push('redirect_not_https');
  if (cfg.redirect && /\/$/.test(cfg.redirect)) issues.push('redirect_trailing_slash');
  if (!scope.includes('user.info.basic')) issues.push('scope_missing_user.info.basic');
  if (cfg.key && /[^a-zA-Z0-9]/.test(cfg.key)) issues.push('client_key_non_alphanumeric_chars');
  res.json({
    mode: TIKTOK_ENV,
    constructedAuthUrl: url,
    redirect: cfg.redirect,
    keyFirst4: cfg.key ? cfg.key.slice(0,4) : null,
    keyLast4: cfg.key ? cfg.key.slice(-4) : null,
    scope,
    issues,
    note: 'Use /auth/prepare for real flow; this endpoint only constructs the URL.'
  });
});

// 2) OAuth callback — verify state, exchange code, store tokens under users/{uid}/connections/tiktok
router.get('/callback', async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  const { code, state } = req.query;
  if (DEBUG_TIKTOK_OAUTH) {
    console.log('[TikTok][callback] rawQuery', req.query);
  }
  if (!code || !state) {
    if (DEBUG_TIKTOK_OAUTH) console.warn('[TikTok][callback] Missing code/state. query=%o url=%s', req.query, req.originalUrl);
    return res.status(400).send('Missing code or state');
  }
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
        client_key: cfg.key,
        client_secret: cfg.secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirect
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      if (DEBUG_TIKTOK_OAUTH) console.warn('[TikTok][callback] token exchange failed status=%s body=%o', tokenRes.status, tokenData);
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
      mode: TIKTOK_ENV,
      obtainedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (DEBUG_TIKTOK_OAUTH) console.log('[TikTok][callback] success uid=%s open_id=%s scope=%s', uid, tokenData.open_id, tokenData.scope);
    // redirect back to dashboard with success
    const url = new URL(DASHBOARD_URL);
    url.searchParams.set('tiktok', 'connected');
    res.redirect(url.toString());
  } catch (err) {
    if (DEBUG_TIKTOK_OAUTH) console.error('[TikTok][callback][error]', err);
    try {
      const url = new URL(DASHBOARD_URL);
      url.searchParams.set('tiktok', 'error');
      return res.redirect(url.toString());
    } catch (_) {
      return res.status(500).send('TikTok token exchange failed');
    }
  }
});

// 2.1) Connection status — returns whether TikTok is connected and basic profile info (cached ~7s)
router.get('/status', authMiddleware, require('./src/statusInstrument')('tiktokStatus', async (req, res) => {
  const started = Date.now();
  try {
    const cfg = activeConfig();
    if (ensureTikTokEnv(res, cfg, { requireSecret: false })) return;
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ connected: false, error: 'Unauthorized' });
    const { getCache, setCache } = require('./src/utils/simpleCache');
    const { dedupe } = require('./src/utils/inFlight');
    const { instrument } = require('./src/utils/queryMetrics');
    const cacheKey = `tiktok_status:${uid}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true, ms: Date.now() - started });

    const result = await dedupe(cacheKey, async () => {
      const snap = await instrument('tiktokStatusDoc', () => db.collection('users').doc(uid).collection('connections').doc('tiktok').get());
      if (!snap.exists) return { connected: false };
      const data = snap.data() || {};
      const base = {
        connected: true,
        open_id: data.open_id,
        scope: data.scope,
        obtainedAt: data.obtainedAt,
        storedMode: data.mode || null,
        serverMode: TIKTOK_ENV,
        reauthRequired: !!(data.mode && data.mode !== TIKTOK_ENV)
      };
      if (data.access_token && String(data.scope || '').includes('user.info.basic')) {
        try {
          const info = await instrument('tiktokIdentityFetch', async () => {
            const infoRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
              method: 'GET', headers: { 'Authorization': `Bearer ${data.access_token}` }, timeout: 3500
            });
            if (infoRes.ok) return infoRes.json();
            return null;
          });
          if (info) {
            const u = info.data && info.data.user ? info.data.user : info.data || {};
            base.display_name = u.display_name || u.displayName || undefined;
            base.avatar_url = u.avatar_url || u.avatarUrl || undefined;
          }
        } catch(_) { /* ignore profile errors */ }
      }
      return base;
    });
    setCache(cacheKey, result, 7000);
    return res.json({ ...result, ms: Date.now() - started });
  } catch (e) {
    return res.status(500).json({ connected: false, error: 'Failed to load TikTok status', ms: Date.now() - started });
  }
}));

// Debug endpoint: show last prepared state and auth URL (auth required)
router.get('/debug/state', authMiddleware, async (req, res) => {
  if (!DEBUG_TIKTOK_OAUTH) return res.status(404).json({ error: 'debug_disabled' });
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const doc = await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').get();
    if (!doc.exists) return res.json({ exists: false });
    const data = doc.data();
    res.json({ exists: true, state: data.state, mode: data.mode, lastAuthUrl: data.lastAuthUrl, createdAt: data.createdAt });
  } catch (e) {
    res.status(500).json({ error: 'debug_state_failed' });
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
