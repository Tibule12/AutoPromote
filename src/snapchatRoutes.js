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
  redirect: (process.env.SNAPCHAT_REDIRECT_URI || `${DASHBOARD_URL}/api/snapchat/auth/callback`).toString().trim(),
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

  // Snapchat expects scopes to be space-separated. Using commas can produce
  // an invalid request for some OAuth endpoints and lead to 500/invalid errors.
  const scope = 'snapchat-marketing-api';
  const stateRaw = req.query.state || 'snapchat_oauth_state';
  const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(stateRaw)}`;

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

  let authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

    // Perform a quick server-side probe of the auth URL. Some providers
    // return 5xx for certain scope combinations or misconfigurations; when
    // that happens try a reduced scope fallback automatically so the
    // frontend receives a working auth URL instead of immediately failing.
    try {
      const probe = await fetch(authUrl, { method: 'GET', redirect: 'manual' });
      // Treat 5xx as provider error; 2xx or 3xx are acceptable (redirect to UI)
      if (probe.status >= 500) {
        const fallbackScope = 'snapchat-marketing-api';
        const fallbackUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(fallbackScope)}&state=${encodeURIComponent(state)}`;
        const probe2 = await fetch(fallbackUrl, { method: 'GET', redirect: 'manual' });
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
      console.log('Snapchat OAuth prepare URL:', authUrl);
    }

    res.json({ authUrl, state });
  } catch (err) {
    console.error('Snapchat OAuth prepare error:', err);
    res.status(500).json({ error: 'OAuth prepare failed', details: err.message });
  }
});

// 2. Handle Snapchat OAuth callback and exchange code for access token
// Support both GET (redirect from provider) and POST (programmatic exchange)
router.all('/auth/callback', async (req, res) => {
  // Accept code/state from query (GET) or body (POST)
  const code = (req.method === 'GET') ? req.query.code : req.body.code;
  const state = (req.method === 'GET') ? req.query.state : req.body.state;
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
      // If provider returned an error, include it for debugging
      console.error('snapchat: token exchange failed', tokenData);
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
      console.error('snapchat: profile fetch failed', profileData);
      return res.status(400).json({ error: 'Failed to get user profile', details: profileData });
    }

    // Store connection in Firestore under the resolved userId
    await db.collection('users').doc(userId).collection('connections').doc('snapchat').set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
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
  const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      const r = await fetch(authUrl, { method: 'GET' });
      const text = await r.text().catch(() => '');
      return res.json({ ok: true, url: authUrl, status: r.status, snippet: text.slice(0, 2000) });
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
      const authUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${cfg.key}&redirect_uri=${encodeURIComponent(cfg.redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      const r = await fetch(authUrl, { method: 'GET', redirect: 'manual' });
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      const text = await r.text().catch(() => '');
      return res.json({ ok: true, url: authUrl, status: r.status, headers, snippet: text.slice(0, 5000) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });
}
