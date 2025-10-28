const express = require('express');
const authMiddleware = require('../authMiddleware');
const { generatePkcePair, createAuthStateDoc, buildAuthUrl, consumeAuthState, exchangeCode, storeUserTokens, getValidAccessToken } = require('../services/twitterService');
const fetch = require('node-fetch');
const { db, admin } = require('../firebaseAdmin');
const { enqueuePlatformPostTask } = require('../services/promotionTaskQueue');

const router = express.Router();
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const twitterPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TWITTER_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'twitter_public' });
const twitterWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TWITTER_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'twitter_writes' });

// Helper to resolve Twitter env config with fallbacks (covers common typos / alt names)
function resolveTwitterConfig() {
  const clientId = process.env.TWITTER_CLIENT_ID || null;
  // Accept both canonical TWITTER_REDIRECT_URI and an alternate TWITTER_CLIENT_REDIRECT_URI (found in screenshot)
  const redirectUri = process.env.TWITTER_REDIRECT_URI || process.env.TWITTER_CLIENT_REDIRECT_URI || null;
  // Secret not currently required for PKCE start, but detect both correct and common misspelling SECTRET
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECTRET || null;
  return { clientId, redirectUri, clientSecret };
}

// Diagnostic: report whether required Twitter OAuth env vars are present (with fallbacks)
router.get('/oauth/config', (req, res) => {
  const cfg = resolveTwitterConfig();
  return res.json({
    ok: true,
    hasClientId: !!cfg.clientId,
    hasRedirectUri: !!cfg.redirectUri,
    hasClientSecret: !!cfg.clientSecret,
    redirectUri: cfg.redirectUri,
    // Indicate if fallback names were used so user can clean up naming
    usedFallbackRedirect: !process.env.TWITTER_REDIRECT_URI && !!process.env.TWITTER_CLIENT_REDIRECT_URI,
    usedFallbackSecret: !process.env.TWITTER_CLIENT_SECRET && !!process.env.TWITTER_CLIENT_SECTRET
  });
});

// Helper: log only if DEBUG_TWITTER_OAUTH enabled
function debugLog(...args) {
  if (process.env.DEBUG_TWITTER_OAUTH) {
    console.log('[Twitter][routes]', ...args);
  }
}

// Lightweight in-memory usage metrics (best-effort)
let oauthStartCount = 0;
let oauthPrepareCount = 0;
let oauthPreflightCount = 0;

// GET /oauth/preflight - does NOT create state; surfaces config + sample (non-usable) auth URL for diagnostics
router.get('/oauth/preflight', twitterPublicLimiter, (req, res) => {
  try {
    oauthPreflightCount++;
    const { clientId, redirectUri, clientSecret } = resolveTwitterConfig();
    const issues = [];
    if (!clientId) issues.push('missing_client_id');
    if (!redirectUri) issues.push('missing_redirect_uri');
    // Build a preview URL with placeholder state & PKCE (not persisted)
    let previewAuthUrl = null;
    if (clientId && redirectUri) {
      const { code_verifier, code_challenge } = generatePkcePair(); // ephemeral
      previewAuthUrl = buildAuthUrl({ clientId, redirectUri, state: 'PREVIEW_STATE', code_challenge });
    }
    debugLog('preflight', { issues, havePreview: !!previewAuthUrl });
    return res.json({
      ok: issues.length === 0,
      mode: 'diagnostic',
      clientIdPresent: !!clientId,
      redirectUriPresent: !!redirectUri,
      clientSecretPresent: !!clientSecret,
      usedFallbackRedirect: !process.env.TWITTER_REDIRECT_URI && !!process.env.TWITTER_CLIENT_REDIRECT_URI,
      usedFallbackSecret: !process.env.TWITTER_CLIENT_SECRET && !!process.env.TWITTER_CLIENT_SECTRET,
      previewAuthUrl,
      issues,
      metrics: { oauthPreflightCount, oauthStartCount, oauthPrepareCount }
    });
  } catch (e) {
    return res.status(500).json({ error: 'preflight_failed', detail: e.message });
  }
});

// Start OAuth (PKCE) - redirects user agent
router.get('/oauth/start', authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    oauthStartCount++;
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog('start missing config', { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).json({ error: 'twitter_client_config_missing', detail: { clientId: !!clientId, redirectUri: !!redirectUri } });
    }
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const url = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    debugLog('start redirect', { state });
    return res.redirect(url);
  } catch (e) {
    debugLog('start error', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Prepare OAuth (returns JSON authUrl to allow frontend fetch + redirect with auth header)
router.post('/oauth/prepare', authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    oauthPrepareCount++;
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog('prepare missing config', { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).json({ error: 'twitter_client_config_missing', detail: { clientId: !!clientId, redirectUri: !!redirectUri } });
    }
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const authUrl = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    debugLog('prepare generated', { state });
    return res.json({ authUrl, state });
  } catch (e) {
    debugLog('prepare error', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// OAuth callback
router.get('/oauth/callback', twitterPublicLimiter, async (req, res) => {
  const { state, code, error } = req.query;
  if (error) {
    debugLog('callback error param', error);
    return res.status(400).send(`Twitter auth error: ${error}`);
  }
  if (!state || !code) {
    debugLog('callback missing param', { state: !!state, code: !!code });
    return res.status(400).send('Missing state or code');
  }
  try {
    const stored = await consumeAuthState(state);
    if (!stored) {
      debugLog('callback invalid/expired state', state);
      return res.status(400).send('Invalid or expired state');
    }
    const { clientId, redirectUri } = resolveTwitterConfig();
    if (!clientId || !redirectUri) {
      debugLog('callback missing config', { clientId: !!clientId, redirectUri: !!redirectUri });
      return res.status(500).send('Server missing client config');
    }
    const tokens = await exchangeCode({ code, code_verifier: stored.code_verifier, redirectUri, clientId });
    await storeUserTokens(stored.uid, tokens);
    debugLog('callback success for uid', stored.uid);
    return res.send('<html><body><h2>Twitter connected successfully.</h2><p>You can close this window.</p></body></html>');
  } catch (e) {
    debugLog('callback exchange error', e.message);
    return res.status(500).send('Exchange failed: ' + e.message);
  }
});

module.exports = router;

// -------------------------------------------------------
// Additional Twitter utility endpoints (status, disconnect,
// test tweet enqueue). These are additive and keep the file
// backward compatible with existing mounts.
// -------------------------------------------------------

// Connection status (instrumented + in-flight dedupe)
router.get('/connection/status', authMiddleware, twitterPublicLimiter, require('../statusInstrument')('twitterStatus', async (req, res) => {
  try {
    const { getCache, setCache } = require('../utils/simpleCache');
    const { dedupe } = require('../utils/inFlight');
    const { instrument } = require('../utils/queryMetrics');
    const uid = req.userId;
    const cacheKey = `twitter_status_${uid}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true });

    const payload = await dedupe(cacheKey, async () => {
      // Firestore fetch instrumented
      const snap = await instrument('twitterStatusDoc', () => db.collection('users').doc(uid).collection('connections').doc('twitter').get());
      if (!snap.exists) {
        return { connected: false };
      }
      const data = snap.data();
      let identity = null;
      // External call instrumented separately (best-effort)
      try {
        const token = await getValidAccessToken(uid);
        if (token) {
          const idJson = await instrument('twitterIdentityFetch', async () => {
            const r = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${token}` } });
            if (r.ok) return r.json();
            return null;
          });
          if (idJson?.data) identity = { id: idJson.data.id, name: idJson.data.name, username: idJson.data.username };
        }
      } catch (_) { /* ignore identity errors */ }
      return {
        connected: true,
        scope: data.scope,
        expires_at: data.expires_at || null,
        willRefreshInMs: data.expires_at ? Math.max(0, data.expires_at - Date.now()) : null,
        identity
      };
    });
    setCache(cacheKey, payload, 7000);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}));

// Disconnect (revoke local tokens; note: full revocation via Twitter API not implemented here)
router.post('/connection/disconnect', authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    const ref = db.collection('users').doc(req.userId).collection('connections').doc('twitter');
    await ref.delete();
    res.json({ disconnected: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enqueue a test tweet via promotion task queue
// Body: { message?: string, contentId?: string }
router.post('/tweet/test', authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    // Ensure connection exists (attempt token retrieval)
    const token = await getValidAccessToken(req.userId).catch(()=>null);
    if (!token) return res.status(400).json({ error: 'not_connected' });
    const { message, contentId } = req.body || {};
    const payload = { message: message || 'Test tweet from AutoPromote' };
    const r = await enqueuePlatformPostTask({
      platform: 'twitter',
      contentId: contentId || null,
      uid: req.userId,
      reason: 'manual_test',
      payload,
      skipIfDuplicate: false // allow repeated manual tests
    });
    res.json({ queued: true, task: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Immediate tweet (bypasses queue) - admin / testing convenience
router.post('/tweet/immediate', authMiddleware, twitterWriteLimiter, async (req, res) => {
  try {
    const token = await getValidAccessToken(req.userId).catch(()=>null);
    if (!token) return res.status(400).json({ error: 'not_connected' });
    const { message } = req.body || {};
    const text = (message || 'Immediate tweet from AutoPromote').slice(0, 280);
    const twRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const bodyText = await twRes.text();
    let json; try { json = JSON.parse(bodyText); } catch (_) { json = { raw: bodyText }; }
    if (!twRes.ok) return res.status(twRes.status).json({ error: 'tweet_failed', details: json });
    res.json({ success: true, tweet: json });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

