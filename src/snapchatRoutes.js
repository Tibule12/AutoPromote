// Snapchat OAuth and API integration (server-side only)
// Note: Snapchat does not have a sandbox environment - only production
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const { admin, db } = require('./firebaseAdmin');
const { safeFetch } = require('./utils/ssrfGuard');
const { rateLimiter } = require('./middlewares/globalRateLimiter');
const DEBUG_SNAPCHAT_OAUTH = process.env.DEBUG_SNAPCHAT_OAUTH === 'true';

// Normalize/canonicalize redirect URIs to our custom domain
function canonicalizeRedirectUri(uri) {
  const { CANONICAL_HOST } = require('./utils/redirectUri');
  try {
    const u = new URL((uri || '').toString().trim());
    const legacyHosts = new Set([
      'autopromote.onrender.com',
      'autopromote-1.onrender.com',
      'autopromote-1.onrender.com:443'
    ]);
    if (legacyHosts.has(u.host) || u.host !== CANONICAL_HOST) {
      u.protocol = 'https:';
      u.host = CANONICAL_HOST;
    }
    if (!u.pathname || !u.pathname.startsWith('/api/snapchat/auth/callback')) {
      u.pathname = '/api/snapchat/auth/callback';
    }
    return u.toString();
  } catch (_) {
    return `https://${process.env.CANONICAL_OAUTH_HOST || process.env.CANONICAL_HOST || 'www.autopromote.org'}/api/snapchat/auth/callback`;
  }
}

// Snapchat only supports production environment
const _rawRedirectEnv = (process.env.SNAPCHAT_REDIRECT_URI || '').toString().trim();
const _effectiveRedirect = canonicalizeRedirectUri(_rawRedirectEnv || `https://www.autopromote.org/api/snapchat/auth/callback`);
if (_rawRedirectEnv && _effectiveRedirect !== _rawRedirectEnv) {
  try {
    const _u = new URL(_effectiveRedirect);
    console.warn('snapchat: SNAPCHAT_REDIRECT_URI points to legacy/non-canonical host or path; auto-upgraded to host=%s path=%s', _u.host, _u.pathname);
  } catch(_) {
    console.warn('snapchat: SNAPCHAT_REDIRECT_URI points to legacy/non-canonical host or path; auto-upgraded');
  }
}
// Support explicit env vars to avoid mixing Public vs Confidential IDs.
// - `SNAPCHAT_PUBLIC_CLIENT_ID` is used for building the authorize URL (browser step).
// - `SNAPCHAT_CONFIDENTIAL_CLIENT_ID` + `SNAPCHAT_CLIENT_SECRET` are used for the server-side token exchange.
// For backwards compatibility, `SNAPCHAT_CLIENT_ID` will be used as a fallback for both roles.
const config = {
  publicClientId: (process.env.SNAPCHAT_PUBLIC_CLIENT_ID || process.env.SNAPCHAT_CLIENT_ID || '').toString().trim() || null,
  confidentialClientId: (process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID || process.env.SNAPCHAT_CLIENT_ID || '').toString().trim() || null,
  secret: (process.env.SNAPCHAT_CLIENT_SECRET || '').toString().trim() || null,
  // Prefer custom domain; retain legacy env but auto-upgrade to canonical host
  redirect: _effectiveRedirect,
};

function activeConfig() {
  return config;
}

// For dashboard redirect
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://www.autopromote.org';

function ensureSnapchatEnv(res, cfg, opts = { requireSecret: true }) {
  const missing = [];
  // Require a public client id for authorize URL construction. If absent
  // the confidentialClientId will be used as a fallback.
  if (!cfg.publicClientId && !cfg.confidentialClientId) missing.push('SNAPCHAT_PUBLIC_CLIENT_ID or SNAPCHAT_CLIENT_ID');
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

// Lightweight health for diagnostics
router.get('/health', (req, res) => {
  try {
    const cfg = activeConfig();
    const mask = (s) => (s ? `${String(s).slice(0,8)}…${String(s).slice(-4)}` : null);
    return res.json({
      ok: !!((cfg.publicClientId || cfg.confidentialClientId) && (cfg.secret || process.env.ALLOW_NO_SECRET === 'true') && cfg.redirect),
      hasPublicClientId: !!cfg.publicClientId,
      hasConfidentialClientId: !!cfg.confidentialClientId,
      hasClientSecret: !!cfg.secret,
      redirect: cfg.redirect,
      publicClientIdMasked: mask(cfg.publicClientId),
      confidentialClientIdMasked: mask(cfg.confidentialClientId)
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// 1. Get Snapchat OAuth authorization URL (redirect)
router.get('/auth', (req, res) => {
  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  // Snapchat expects scopes to be space-separated. Using commas can produce
  // an invalid request for some OAuth endpoints and lead to 500/invalid errors.
  const scope = 'snapchat-marketing-api';
  const stateRaw = req.query.state || 'snapchat_oauth_state';
  // Prefer explicit public client id for the browser authorize URL; fall back
  // to the confidential client id if no public id provided (back-compat).
  const clientIdForAuthorize = cfg.publicClientId || cfg.confidentialClientId;
  const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(stateRaw)}`;

  if (DEBUG_SNAPCHAT_OAUTH) {
    console.log('Snapchat OAuth URL present=%s', !!authUrl);
  }

  res.json({ authUrl });
});

// 2. Prepare Snapchat OAuth (returns JSON authUrl for frontend)
// Apply a modest per-user rate limit to OAuth prepare to mitigate abuse
const oauthPrepareLimiter = rateLimiter({ capacity: parseInt(process.env.SNAPCHAT_OAUTH_PREPARE_CAP || '60', 10), refillPerSec: 5, windowHint: 'snapchat_oauth_prepare' });
router.post('/oauth/prepare', authMiddleware, oauthPrepareLimiter, async (req, res) => {
  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  try {
  // Use space separated scopes per Snapchat OAuth requirements
  const scope = 'snapchat-marketing-api';
    const { v4: uuidv4 } = require('../lib/uuid-compat');
    const state = uuidv4();
    const userId = req.userId || 'anonymous';

    // Store state temporarily in Firestore
    await db.collection('oauth_states').doc(state).set({
      uid: userId,
      platform: 'snapchat',
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

  const clientIdForAuthorize = cfg.publicClientId || cfg.confidentialClientId;
  let authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

    // Perform a quick server-side probe of the auth URL. Some providers
    // return 5xx for certain scope combinations or misconfigurations; when
    // that happens try a reduced scope fallback automatically so the
    // frontend receives a working auth URL instead of immediately failing.
    try {
      // Probe the provider URL, but validate destination first to avoid SSRF.
      const probe = await safeFetch(authUrl, fetch, { allowHosts: ['accounts.snapchat.com'], requireHttps: true, fetchOptions: { method: 'GET', redirect: 'manual' } });
      // Treat 5xx as provider error; 2xx or 3xx are acceptable (redirect to UI)
      if (probe.status >= 500) {
        const fallbackScope = 'snapchat-marketing-api';
        const fallbackUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(fallbackScope)}&state=${encodeURIComponent(state)}`;
        const probe2 = await safeFetch(fallbackUrl, fetch, { allowHosts: ['accounts.snapchat.com'], requireHttps: true, fetchOptions: { method: 'GET', redirect: 'manual' } });
        if (probe2.status < 500) {
          if (DEBUG_SNAPCHAT_OAUTH) console.log('snapchat: primary auth URL returned', probe.status, 'using fallback scope; probe2=', probe2.status);
          authUrl = fallbackUrl;
        } else {
          if (DEBUG_SNAPCHAT_OAUTH) console.warn('snapchat: both primary and fallback auth URLs returned 5xx', probe.status, probe2.status);
          // leave authUrl as primary; frontend will receive it and can show provider error
        }
      } else {
        if (DEBUG_SNAPCHAT_OAUTH) console.log('snapchat: auth URL probe OK status=', probe.status);
      }
    } catch (probeErr) {
      // Network/probe error — don't block the flow, return the constructed URL
      if (DEBUG_SNAPCHAT_OAUTH) console.warn('snapchat: auth URL probe failed', probeErr.message);
    }

    if (DEBUG_SNAPCHAT_OAUTH) {
      // Mask client id for safe logging (show first & last 4 chars)
      const mask = (s) => { try { if (!s) return null; const st = String(s); return st.length > 8 ? `${st.slice(0,8)}…${st.slice(-4)}` : st; } catch (_) { return null; } };
      console.log('Snapchat OAuth prepare URL present=%s', !!authUrl);
      console.log('snapchat: auth prepare clientId=%s redirect=%s authUrlSnippet=%s', mask(clientIdForAuthorize), cfg.redirect, authUrl.slice(0, 200));
    }

    res.json({ authUrl, state });
  } catch (err) {
    console.error('Snapchat OAuth prepare error:', err);
    res.status(500).json({ error: 'OAuth prepare failed', details: err.message });
  }
});

// Public preflight (no auth): report constructed auth URL and provider status (no secrets leaked)
router.get('/oauth/preflight', rateLimiter({ capacity: 60, refillPerSec: 10, windowHint: 'snapchat_preflight' }), async (req, res) => {
  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg, { requireSecret: false });
  if (res.headersSent) return;
  try {
    const state = require('../lib/uuid-compat').v4();
    const scope = 'snapchat-marketing-api';
    const clientIdForAuthorize = cfg.publicClientId || cfg.confidentialClientId;
    const url = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
    let status = null; let location = null;
    try {
      const r = await safeFetch(url, fetch, { allowHosts: ['accounts.snapchat.com'], requireHttps: true, fetchOptions: { method: 'GET', redirect: 'manual' } });
      status = r.status;
      location = r.headers.get ? r.headers.get('location') : null;
    } catch (e) {
      status = 'probe_error';
    }
    if (DEBUG_SNAPCHAT_OAUTH) {
      const mask = (s) => { try { if (!s) return null; const st = String(s); return st.length > 8 ? `${st.slice(0,8)}…${st.slice(-4)}` : st; } catch (_) { return null; } };
      console.log('snapchat: preflight authUrl clientId=%s redirect=%s probe=%s', mask(clientIdForAuthorize), cfg.redirect, status);
    }
    res.json({ ok: true, authUrl: url, probeStatus: status, location });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 2. Handle Snapchat OAuth callback and exchange code for access token
// Support both GET (redirect from provider) and POST (programmatic exchange)
// Public callback from Snapchat - rate limit to mitigate abuse/forgery
const callbackLimiter = rateLimiter({ capacity: parseInt(process.env.SNAPCHAT_CALLBACK_CAP || '300', 10), refillPerSec: 10, windowHint: 'snapchat_callback' });
router.all('/auth/callback', callbackLimiter, async (req, res) => {
  // Accept code/state from query (GET) or body (POST)
  const code = (req.method === 'GET') ? req.query.code : req.body.code;
  const state = (req.method === 'GET') ? req.query.state : req.body.state;
  if (DEBUG_SNAPCHAT_OAUTH) {
    const mask = (s) => { try { if (!s) return null; const st = String(s); return st.length > 8 ? `${st.slice(0,8)}…${st.slice(-4)}` : st; } catch (_) { return null; } };
    try {
      console.log('snapchat: callback invoked method=%s remote=%s', req.method, req.ip || req.connection?.remoteAddress || 'unknown');
      // Log query/body with masking for tokens
      const q = Object.assign({}, req.query || {});
      const b = Object.assign({}, req.body || {});
      if (q.client_id) q.client_id = mask(q.client_id);
      if (b.client_id) b.client_id = mask(b.client_id);
      if (q.code) q.code = mask(q.code);
      if (b.code) b.code = mask(b.code);
      if (q.error) q.error = String(q.error).slice(0, 200);
      if (b.error) b.error = String(b.error).slice(0, 200);
      console.log('snapchat: callback query=%o', q);
      console.log('snapchat: callback body=%o', b);
    } catch (e) { console.warn('snapchat: callback debug log failed', e && e.message); }
  }
  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  const cfg = activeConfig();
  ensureSnapchatEnv(res, cfg);
  if (res.headersSent) return;

  try {
    // Look up the oauth state document to recover the original uid (if any)
    let userId = (req.userId || null);
    if (state) {
      try {
        const st = await db.collection('oauth_states').doc(state).get();
        if (st.exists) {
          const v = st.data() || {};
          if (v.uid) userId = v.uid;
          // Clean up state after use
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){}
        }
      } catch (e) {
        // ignore state lookup errors - proceed with available userId
        console.warn('snapchat: oauth state lookup failed:', e.message);
      }
    }
    if (!userId) userId = 'anonymous';

    // Exchange code for access token (validated host)
    const tokenRes = await safeFetch('https://accounts.snapchat.com/login/oauth2/access_token', fetch, {
      allowHosts: ['accounts.snapchat.com'],
      requireHttps: true,
      fetchOptions: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Use the confidential client id for the token exchange. If a
          // dedicated confidential client id is not provided, fall back to
          // the legacy client id value.
          'Authorization': `Basic ${Buffer.from(`${cfg.confidentialClientId}:${cfg.secret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: cfg.redirect
        })
      }
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      // If provider returned an error, include it for debugging
      console.error('snapchat: token exchange failed', { error: tokenData.error, error_description: tokenData.error_description });
      // Avoid returning token/secret details; only return minimal error info
      return res.status(400).json({ error: 'Failed to exchange code for token', details: { error: tokenData.error, error_description: tokenData.error_description } });
    }

    // Get user profile information
    // Fetch profile from Snapchat Ads API (validate host)
    const profileRes = await safeFetch('https://adsapi.snapchat.com/v1/me', fetch, {
      allowHosts: ['adsapi.snapchat.com'],
      requireHttps: true,
      fetchOptions: {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      }
    });

    const profileData = await profileRes.json();
    if (!profileRes.ok) {
      console.error('snapchat: profile fetch failed', profileData);
      return res.status(400).json({ error: 'Failed to get user profile', details: profileData });
    }

    const { encryptToken } = require('./services/secretVault');
    // Store connection in Firestore under the resolved userId (encrypt tokens)
    await db.collection('users').doc(userId).collection('connections').doc('snapchat').set({
      tokens: encryptToken(JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_in: tokenData.expires_in })),
      hasEncryption: true,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      profile: profileData,
      connectedAt: new Date().toISOString()
    });

    // If this was a browser redirect (GET), redirect back to the dashboard
    if (req.method === 'GET') {
      // Check if this was initiated as a popup flow
      const stateDocRef = await db.collection('oauth_states').doc(state).get();
      const stateDataRef = stateDocRef.exists ? stateDocRef.data() : null;
      const isPopup = stateDataRef?.platform === 'snapchat' && stateDataRef?.uid; // Assume popup if we have state data

      if (isPopup) {
        res.set('Content-Type', 'text/html');
        return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Snapchat Connected</title></head><body>
          <script>
            if (window.opener) {
              window.opener.postMessage('snapchat_oauth_complete', '${DASHBOARD_URL}');
              window.close();
            } else {
              window.location.href = '${DASHBOARD_URL}?snapchat=connected';
            }
          </script>
        </body></html>`);
      } else {
        const successUrl = `${DASHBOARD_URL}?snapchat=connected`;
        return res.redirect(successUrl);
      }
    }

    // Otherwise return JSON for programmatic callers
    return res.json({ success: true, message: 'Snapchat connected successfully', profile: profileData });
  } catch (err) {
    console.error('Snapchat OAuth callback error:', err);
    if (req.method === 'GET') {
      // Redirect to dashboard with error on GET flows
      return res.redirect(`${DASHBOARD_URL}?snapchat=error&message=${encodeURIComponent(err.message || 'oauth_failed')}`);
    }
    return res.status(500).json({ error: 'OAuth callback failed', details: err.message });
  }
});

// 3. Get Snapchat connection status
router.get('/status', authMiddleware, rateLimiter({ capacity: parseInt(process.env.SNAPCHAT_STATUS_CAP || '300', 10), refillPerSec: 20, windowHint: 'snapchat_status' }), async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.userId).collection('connections').doc('snapchat').get();
    if (!snap.exists) return res.json({ connected: false });

    const data = snap.data();
    const isExpired = data.expiresAt && data.expiresAt < Date.now();

    res.json({
      connected: !isExpired,
      profile: data.profile,
      expiresAt: data.expiresAt,
      connectedAt: data.connectedAt,
      message: isExpired ? 'Token expired - please reconnect' : 'Connected to Snapchat'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get Snapchat status', details: err.message });
  }
});

// 4. Create Snapchat ad creative (placeholder - Snapchat Creative Kit API)
const apiActionLimiter = rateLimiter({ capacity: parseInt(process.env.SNAPCHAT_API_ACTION_CAP || '120', 10), refillPerSec: 10, windowHint: 'snapchat_api' });
router.post('/creative', authMiddleware, apiActionLimiter, async (req, res) => {
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
    const { tokensFromDoc } = require('./services/connectionTokenUtils');
    const tokens = tokensFromDoc(connection) || (connection.tokens || null);
    const accessToken = tokens && tokens.access_token;
    if (connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Snapchat token expired' });
    }

    // Create creative via Snapchat Marketing API (validate host)
    const creativeRes = await safeFetch('https://adsapi.snapchat.com/v1/adaccounts/{ad_account_id}/creatives', fetch, {
      allowHosts: ['adsapi.snapchat.com'],
      requireHttps: true,
      fetchOptions: {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
      }
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
router.get('/analytics/:creativeId', authMiddleware, apiActionLimiter, async (req, res) => {
  try {
    const { creativeId } = req.params;

    // Get Snapchat connection
    const snap = await db.collection('users').doc(req.userId).collection('connections').doc('snapchat').get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Snapchat not connected' });
    }

    const connection = snap.data();
    const { tokensFromDoc } = require('./services/connectionTokenUtils');
    const tokens = tokensFromDoc(connection) || (connection.tokens || null);
    const accessToken = tokens && tokens.access_token;
    if (connection.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Snapchat token expired' });
    }

    // Get analytics data (validate host)
    const analyticsRes = await safeFetch(`https://adsapi.snapchat.com/v1/creatives/${creativeId}/stats`, fetch, {
      allowHosts: ['adsapi.snapchat.com'],
      requireHttps: true,
      fetchOptions: {
        headers: { 'Authorization': `Bearer ${accessToken}` }
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

// Debug probe (only when DEBUG_SNAPCHAT_OAUTH=true)
// Performs a server-side GET to the Snapchat authorize endpoint to capture status and a short body
if (DEBUG_SNAPCHAT_OAUTH) {
  router.get('/_debug/authorize_probe', async (req, res) => {
    try {
      const cfg = activeConfig();
      ensureSnapchatEnv(res, cfg, { requireSecret: false });
      if (res.headersSent) return;
  const state = req.query.state || require('../lib/uuid-compat').v4();
  const scope = 'snapchat-marketing-api';
  const clientIdForAuthorize = cfg.publicClientId || cfg.confidentialClientId;
  const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      const r = await safeFetch(authUrl, fetch, { allowHosts: ['accounts.snapchat.com'], requireHttps: true, fetchOptions: { method: 'GET' } });
      const text = await r.text().catch(() => '');
      return res.json({ ok: true, url: authUrl, status: r.status, snippet: text.slice(0, 1000) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });
}

// Public debug probe (guarded by environment) to inspect provider responses
// Set SNAPCHAT_DEBUG_ALLOW=true in the environment to enable.
if (process.env.SNAPCHAT_DEBUG_ALLOW === 'true') {
  router.get('/_debug/authorize_probe_public', async (req, res) => {
    try {
      const cfg = activeConfig();
      ensureSnapchatEnv(res, cfg, { requireSecret: false });
      if (res.headersSent) return;
      const state = req.query.state || require('../lib/uuid-compat').v4();
      const scope = 'snapchat-marketing-api';
      const clientIdForAuthorize = cfg.publicClientId || cfg.confidentialClientId;
      const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientIdForAuthorize}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      const r = await safeFetch(authUrl, fetch, { allowHosts: ['accounts.snapchat.com'], requireHttps: true, fetchOptions: { method: 'GET', redirect: 'manual' } });
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      const text = await r.text().catch(() => '');
      return res.json({ ok: true, url: authUrl, status: r.status, headers, snippet: text.slice(0, 1000) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });
}
