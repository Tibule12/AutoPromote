// tiktokRoutes.js
// TikTok OAuth and API integration (server-side only) with sandbox/production mode support
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { admin, db } = require('./firebaseAdmin');
const { rateLimiter } = require('./src/middlewares/globalRateLimiter');
const DEBUG_TIKTOK_OAUTH = process.env.DEBUG_TIKTOK_OAUTH === 'true';
const rateLimit = require('./src/middlewares/simpleRateLimit');
const { validateUrl, safeFetch } = require('./src/utils/ssrfGuard');

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
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://autopromote.onrender.com';

function ensureTikTokEnv(res, cfg, opts = { requireSecret: true }) {
  const missing = [];
  if (!cfg.key) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_CLIENT_KEY' : 'TIKTOK_SANDBOX_CLIENT_KEY'} (or fallback TIKTOK_CLIENT_KEY)`);
  if (opts.requireSecret && !cfg.secret) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_CLIENT_SECRET' : 'TIKTOK_SANDBOX_CLIENT_SECRET'} (or fallback TIKTOK_CLIENT_SECRET)`);
  if (!cfg.redirect) missing.push(`${TIKTOK_ENV === 'production' ? 'TIKTOK_PROD_REDIRECT_URI' : 'TIKTOK_SANDBOX_REDIRECT_URI'} (or fallback TIKTOK_REDIRECT_URI)`);
  if (missing.length) {
    return res.status(500).json({ error: 'tiktok_config_missing', mode: TIKTOK_ENV, missing });
  }
}

// Client-side suppression snippet (safe, non-invasive). Insert into the
// HTML pages that initiate OAuth. This avoids attempting to override
// fundamental built-ins (e.g. Function.prototype.call) while still
// reducing noisy vendor warnings for demo/debug pages.
const SUPPRESSION_SNIPPET = `
<script>(function(){'use strict';
  try {
    const oWarn = console.warn.bind(console);
    const oError = console.error.bind(console);
    const oLog = console.log.bind(console);

    function shouldSuppress(text){
      if(!text) return false;
      const s = String(text).toLowerCase();
      return s.includes('break change') ||
             s.includes('read only property') ||
             s.includes('cannot assign to read only property') ||
             s.includes('bytedance://dispatch_message') ||
             s.includes('not allowed to launch') ||
             s.includes('user gesture is required') ||
             s.includes('8237.1fc60c50.js') ||
             s.includes('collect.js') ||
             s.includes('slardar');
    }

    console.warn = function(...args){
      if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
      return oWarn(...args);
    };
    console.error = function(...args){
      if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
      return oError(...args);
    };
    console.log = function(...args){
      if(args.some(a => typeof a === 'string' && shouldSuppress(a))) return;
      return oLog(...args);
    };

    const origOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, err){
      if(typeof message === 'string' && shouldSuppress(message)) return true;
      if(origOnError) return origOnError.call(this, message, source, lineno, colno, err);
      return false;
    };

    const origUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = function(ev){
      try{
        const reason = ev && (typeof ev.reason === 'string' ? ev.reason : (ev.reason && ev.reason.message) || '');
        if(shouldSuppress(reason)){
          ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
          return true;
        }
      }catch(e){}
      if(origUnhandled) return origUnhandled.call(this, ev);
      return false;
    };
  } catch(e) { /* Don't let suppression throw */ }
})();</script>`;

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
// Attach a light public limiter to health to reduce noisy scans
const ttPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TT_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'tiktok_public' });
const ttWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TT_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'tiktok_writes' });
router.get('/health', ttPublicLimiter, (req, res) => {
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
router.post('/auth/prepare', rateLimit({ max: 10, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  try {
    const uid = await getUidFromAuthHeader(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex'); // Increased to 16 bytes for better security
    const state = `${uid}.${nonce}`;
    const isPopup = req.query.popup === 'true';
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({
      state,
      nonce,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      mode: TIKTOK_ENV,
      isPopup
    }, { merge: true });
    const scope = 'user.info.basic';
    const authUrl = constructAuthUrl(cfg, state, scope);
    // Store authUrl for debugging (non-sensitive)
    await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').set({ lastAuthUrl: authUrl }, { merge: true });
    if (DEBUG_TIKTOK_OAUTH) {
      console.log('[TikTok][prepare] uid=%s mode=%s state=%s authUrl=%s popup=%s', uid, TIKTOK_ENV, state, authUrl, isPopup);
    }
    return res.json({ authUrl, mode: TIKTOK_ENV });
  } catch (e) {
    if (DEBUG_TIKTOK_OAUTH) console.error('[TikTok][prepare][error]', e);
    return res.status(500).json({ error: 'Failed to prepare TikTok OAuth' });
  }
});

// 1) Begin OAuth (requires user auth) — keeps scopes minimal for review
fix/dependabot/webpack-dev-server-override
router.get('/auth', authMiddleware, ttWriteLimiter, async (req, res) => {
router.get('/auth', rateLimit({ max: 10, windowMs: 60000, key: r => r.userId || r.ip }), authMiddleware, async (req, res) => {
 main
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex'); // Use cryptographically secure random
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
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title>
      ${SUPPRESSION_SNIPPET}
      <style>body{font-family:system-ui,Arial,sans-serif} .card{max-width:720px;padding:20px;border-radius:8px;text-align:left} .muted{color:#666;font-size:13px}</style>
    </head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div class="card" style="background:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.06)">
        <h2 style="margin-top:0">Connect your TikTok account</h2>
        <p class="muted">Click the button below to continue to TikTok and approve the connection. If your browser blocks the provider deep-link, use the copy button to paste the URL into your browser.</p>
        <div style="display:flex;gap:8px;align-items:center;margin:12px 0;">
          <button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
          <button id="copy" style="font-size:14px;padding:8px 12px;border-radius:6px;cursor:pointer;">Copy URL</button>
        </div>
        <label class="muted">OAuth URL (shown for diagnostics):</label>
        <input id="authUrl" type="text" readonly value=${JSON.stringify(authUrl)} style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:6px;font-size:13px"/>
        <p class="muted" style="margin-top:12px">If nothing happens after clicking continue, copy the URL above and paste it into a new browser window. Attach HAR and screenshots when submitting for review.</p>
      </div>
      <script>
        (function(){
          const auth = ${JSON.stringify(authUrl)};
          document.getElementById('continue').addEventListener('click',function(){
            try { window.location.href = auth; } catch(e) { window.open(auth, '_self'); }
          });
          document.getElementById('copy').addEventListener('click', async function(){
            try { await navigator.clipboard.writeText(auth); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
            catch(e){ const inp=document.getElementById('authUrl'); inp.select(); document.execCommand('copy'); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
          });
        })();
      </script>
    </body></html>`);
  } catch (e) {
    res.status(500).json({ error: 'Failed to start TikTok OAuth', details: e.message });
  }
});

// Debug-only: return the same HTML page served by /auth so we can inspect
// the script content without requiring an authenticated session. Enabled
// when TIKTOK_DEBUG_ALLOW=true in environment. This is useful to confirm
// the injected script no longer contains unsafe overrides.
if (process.env.TIKTOK_DEBUG_ALLOW === 'true') {
  router.get('/_debug/page', ttPublicLimiter, async (req, res) => {
    try {
      const cfg = activeConfig();
      if (ensureTikTokEnv(res, cfg, { requireSecret: false })) return;
      const uid = req.query.uid || 'debug-uid';
      const nonce = 'debug-nonce';
      const state = `${uid}.${nonce}`;
      const scope = 'user.info.basic';
      const authUrl = constructAuthUrl(cfg, state, scope);
      res.set('Content-Type', 'text/html');
      return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok (debug)</title><script>/* debug-only page */</script></head><body><a href="${authUrl}">${authUrl}</a></body></html>`);
    } catch (e) {
      return res.status(500).send('debug unavailable');
    }
  });
}

// Alternative start endpoint that accepts an ID token via query when headers aren't available (for link redirects)
router.get('/auth/start', ttWriteLimiter, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  try {
    const idToken = req.query.id_token;
    if (!idToken) return res.status(401).send('Missing id_token');
    // Verify Firebase token manually and derive uid
    const decoded = await admin.auth().verifyIdToken(String(idToken));
    const uid = decoded.uid;
    if (!uid) return res.status(401).send('Unauthorized');
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex'); // Use cryptographically secure random
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
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Continue to TikTok</title>${SUPPRESSION_SNIPPET}<style>body{font-family:system-ui,Arial,sans-serif} .card{max-width:720px;padding:20px;border-radius:8px;text-align:left} .muted{color:#666;font-size:13px}</style></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div class="card" style="background:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.06)">
        <h2 style="margin-top:0">Connect your TikTok account</h2>
        <p class="muted">Click the button below to continue to TikTok and approve the connection. If your browser blocks the provider deep-link, use the copy button to paste the URL into your browser.</p>
        <div style="display:flex;gap:8px;align-items:center;margin:12px 0;">
          <button id="continue" style="font-size:16px;padding:10px 18px;border-radius:6px;cursor:pointer;">Continue to TikTok</button>
          <button id="copy" style="font-size:14px;padding:8px 12px;border-radius:6px;cursor:pointer;">Copy URL</button>
        </div>
        <label class="muted">OAuth URL (shown for diagnostics):</label>
        <input id="authUrl" type="text" readonly value=${JSON.stringify(authUrl)} style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:6px;font-size:13px"/>
        <p class="muted" style="margin-top:12px">If nothing happens after clicking continue, copy the URL above and paste it into a new browser window. Attach HAR and screenshots when submitting for review.</p>
      </div>
      <script>
        (function(){
          const auth = ${JSON.stringify(authUrl)};
          document.getElementById('continue').addEventListener('click',function(){
            try { window.location.href = auth; } catch(e) { window.open(auth, '_self'); }
          });
          document.getElementById('copy').addEventListener('click', async function(){
            try { await navigator.clipboard.writeText(auth); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
            catch(e){ const inp=document.getElementById('authUrl'); inp.select(); document.execCommand('copy'); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy URL',1500); }
          });
        })();
      </script>
    </body></html>`);
  } catch (e) {
    return res.status(500).send('Failed to start TikTok OAuth');
  }
});

// Preflight diagnostics (does NOT store state) to help debug client_key rejections
router.get('/auth/preflight', authMiddleware, ttPublicLimiter, async (req, res) => {
  const cfg = activeConfig();
  if (ensureTikTokEnv(res, cfg, { requireSecret: true })) return;
  const crypto = require('crypto');
  const fakeState = 'preflight.' + crypto.randomBytes(8).toString('hex'); // Use cryptographically secure random
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
router.get('/callback', rateLimit({ max: 10, windowMs: 60000, key: r => r.ip }), async (req, res) => {
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

  // Validate inputs to prevent injection
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).send('Invalid input types');
  }

  // Validate state format to prevent injection
  if (!/^[a-zA-Z0-9_.]+$/.test(state)) {
    return res.status(400).send('Invalid state format');
  }

  try {
    const [uid, nonce] = String(state).split('.');
    if (!uid || !nonce || !/^[a-f0-9]+$/.test(nonce)) return res.status(400).send('Invalid state');
    const stateDocRef = await db.collection('users').doc(uid).collection('oauth_state').doc('tiktok').get();
    const stateData = stateDocRef && stateDocRef.exists ? stateDocRef.data() : null;
    // Verify stored nonce matches the state to prevent CSRF/forgery
    if (!stateData || stateData.nonce !== nonce) {
      if (DEBUG_TIKTOK_OAUTH) console.warn('[TikTok][callback] state mismatch or missing stored state', { uid, expectedNonce: stateData && stateData.nonce, nonce });
      return res.status(400).send('Invalid or expired state');
    }
    // Exchange code
    const tokenRes = await safeFetch('https://open.tiktokapis.com/v2/oauth/token/', fetch, { fetchOptions: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: cfg.key,
        client_secret: cfg.secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirect
      })
    }, allowHosts: ['open.tiktokapis.com'] });
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
    // Check if this was initiated as a popup flow
    const isPopup = stateDataRef?.isPopup === true;

    if (isPopup) {
      res.set('Content-Type', 'text/html');
      return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>TikTok Connected</title></head><body>
        <script>
          if (window.opener) {
            window.opener.postMessage('tiktok_oauth_complete', '${DASHBOARD_URL}');
            window.close();
          } else {
            window.location.href = '${url.toString()}';
          }
        </script>
      </body></html>`);
    } else {
      res.redirect(url.toString());
    }
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
router.post('/upload', rateLimit({ max: 5, windowMs: 3600000, key: r => r.ip }), async (req, res) => {
  const { access_token, open_id, video_url, title } = req.body;
  if (!access_token || !open_id || !video_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate video_url to prevent SSRF
  try {
    const url = new URL(video_url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).json({ error: 'Invalid video URL protocol' });
    }
    // Prevent access to internal/private networks
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') || hostname.startsWith('172.') ||
        hostname.includes('internal') || hostname.includes('local')) {
      return res.status(400).json({ error: 'Access to internal/private URLs not allowed' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid video URL format' });
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
    // Use safeFetch to validate that video_url is not pointing to private IPs or local addresses
    await validateUrl(video_url, { requireHttps: false });
    const videoFileRes = await safeFetch(video_url, fetch, { fetchOptions: { timeout: 30000, headers: { 'User-Agent': 'AutoPromote/1.0' } } });
    if (!videoFileRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch video from provided URL' });
    }
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
router.post('/analytics', rateLimit({ max: 20, windowMs: 3600000, key: r => r.ip }), async (req, res) => {
  const { access_token, open_id, video_id } = req.body;
  if (!access_token || !open_id || !video_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate inputs to prevent injection
  if (typeof access_token !== 'string' || typeof open_id !== 'string' || typeof video_id !== 'string') {
    return res.status(400).json({ error: 'Invalid input types' });
  }

  // Basic validation for video_id format (should be alphanumeric)
  if (!/^[a-zA-Z0-9_-]+$/.test(video_id)) {
    return res.status(400).json({ error: 'Invalid video_id format' });
  }

  try {
    const analyticsRes = await fetch(`https://open.tiktokapis.com/v2/video/data/?open_id=${encodeURIComponent(open_id)}&video_id=${encodeURIComponent(video_id)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      },
      timeout: 10000 // 10 second timeout
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
