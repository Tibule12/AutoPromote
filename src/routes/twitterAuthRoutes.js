const express = require('express');
const authMiddleware = require('../authMiddleware');
const { generatePkcePair, createAuthStateDoc, buildAuthUrl, consumeAuthState, exchangeCode, storeUserTokens, getValidAccessToken } = require('../services/twitterService');
const fetch = require('node-fetch');
const { db, admin } = require('../firebaseAdmin');
const { enqueuePlatformPostTask } = require('../services/promotionTaskQueue');

const router = express.Router();

// Start OAuth (PKCE)
router.get('/oauth/start', authMiddleware, async (req, res) => {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = process.env.TWITTER_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).json({ error: 'twitter_client_config_missing' });
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const url = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    return res.redirect(url);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Prepare OAuth (returns JSON authUrl to allow frontend fetch + redirect with auth header)
router.post('/oauth/prepare', authMiddleware, async (req, res) => {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = process.env.TWITTER_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).json({ error: 'twitter_client_config_missing' });
    const { code_verifier, code_challenge } = generatePkcePair();
    const state = await createAuthStateDoc({ uid: req.userId || req.user?.uid, code_verifier });
    const authUrl = buildAuthUrl({ clientId, redirectUri, state, code_challenge });
    return res.json({ authUrl, state });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// OAuth callback
router.get('/oauth/callback', async (req, res) => {
  const { state, code, error } = req.query;
  if (error) return res.status(400).send(`Twitter auth error: ${error}`);
  if (!state || !code) return res.status(400).send('Missing state or code');
  try {
    const stored = await consumeAuthState(state);
    if (!stored) return res.status(400).send('Invalid or expired state');
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = process.env.TWITTER_REDIRECT_URI;
    const tokens = await exchangeCode({ code, code_verifier: stored.code_verifier, redirectUri, clientId });
    await storeUserTokens(stored.uid, tokens);
    return res.send('<html><body><h2>Twitter connected successfully.</h2><p>You can close this window.</p></body></html>');
  } catch (e) {
    return res.status(500).send('Exchange failed: ' + e.message);
  }
});

module.exports = router;

// -------------------------------------------------------
// Additional Twitter utility endpoints (status, disconnect,
// test tweet enqueue). These are additive and keep the file
// backward compatible with existing mounts.
// -------------------------------------------------------

// Connection status
router.get('/connection/status', authMiddleware, async (req, res) => {
  try {
    const ref = db.collection('users').doc(req.userId).collection('connections').doc('twitter');
    const snap = await ref.get();
    if (!snap.exists) return res.json({ connected: false });
    const data = snap.data();
    let identity = null;
    try {
      const token = await getValidAccessToken(req.userId);
      if (token) {
        const r = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const j = await r.json();
            if (j?.data) identity = { id: j.data.id, name: j.data.name, username: j.data.username };
        }
      }
    } catch (_) { /* ignore identity errors */ }
    res.json({
      connected: true,
      scope: data.scope,
      expires_at: data.expires_at || null,
      willRefreshInMs: data.expires_at ? Math.max(0, data.expires_at - Date.now()) : null,
      identity
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disconnect (revoke local tokens; note: full revocation via Twitter API not implemented here)
router.post('/connection/disconnect', authMiddleware, async (req, res) => {
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
router.post('/tweet/test', authMiddleware, async (req, res) => {
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
router.post('/tweet/immediate', authMiddleware, async (req, res) => {
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

