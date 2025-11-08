const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { SUPPORTED_PLATFORMS } = require('../validationMiddleware');
const { db } = require('../firebaseAdmin');
// Engines to warm-up/connect on new platform connections
const smartDistributionEngine = require('../services/smartDistributionEngine');
const admin = require('../firebaseAdmin').admin;
const engagementBoostingService = require('../services/engagementBoostingService');
const { enqueuePlatformPostTask } = require('../services/promotionTaskQueue');
const { postToTelegram } = require('../services/telegramService');
const rateLimit = require('../middlewares/simpleRateLimit');
const { rateLimiter } = require('../middlewares/globalRateLimiter');

const platformPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'platform_public' });
const platformWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'platform_writes' });
const platformWebhookLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_WEBHOOK || '300', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '50'), windowHint: 'platform_webhook' });

// Try to use global fetch (Node 18+). Fall back to node-fetch if available.
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // eslint-disable-next-line global-require
    fetchFn = require('node-fetch');
  } catch (e) {
    fetchFn = null;
  }
}

function normalize(name){
  // Validate input to prevent injection
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return '';
  }
  return String(name||'').toLowerCase();
}

// GET /api/:platform/status
router.get('/:platform/status', authMiddleware, rateLimit({ max: 20, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  const uid = req.userId || req.user?.uid;
  if (!uid) return res.json({ ok: true, platform, connected: false });
  try {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.collection('connections').doc(platform).get();
    if (snap.exists) {
      return res.json({ ok: true, platform, connected: true, meta: snap.data() });
    }
    // Fallback: try to infer from top-level user doc
    const userSnap = await userRef.get();
    const u = userSnap.exists ? userSnap.data() || {} : {};
    const inferred = !!(u[`${platform}Token`] || u[`${platform}AccessToken`] || u[`${platform}Identity`] || u[`${platform}Profile`]);
    return res.json({ ok: true, platform, connected: inferred, inferred });
  } catch (e) {
    return res.status(500).json({ ok: false, platform, error: e.message });
  }
});

// POST /api/:platform/auth/prepare
// Auth required endpoint that returns an OAuth start URL (authUrl) for the frontend to open.
// Stores a random state token in Firestore at `oauth_states/{state}` mapping to uid/platform for later validation.
router.post('/:platform/auth/prepare', authMiddleware, platformWriteLimiter, async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  try {
    const host = `${req.protocol}://${req.get('host')}`;
    const uid = req.userId || req.user?.uid || null;
    const crypto = require('crypto');
    const state = crypto.randomBytes(18).toString('base64url');
    const now = Date.now();
    const expiresAt = new Date(now + (5 * 60 * 1000)).toISOString(); // 5 minutes

    // persist state mapping (best-effort)
    try {
      await db.collection('oauth_states').doc(state).set({ uid: uid || null, platform, createdAt: new Date(now).toISOString(), expiresAt }, { merge: false });
    } catch (e) {
      console.warn('[oauth] failed to persist state mapping', e && e.message);
      // continue — we still return a state token but callbacks will fallback to legacy parsing
    }

    if (platform === 'reddit') {
      const clientId = process.env.REDDIT_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(`${host}/api/reddit/auth/callback`, { requiredPath: '/api/reddit/auth/callback' });
      // Scopes: adjust as needed
      const scope = encodeURIComponent('identity read submit save');
      const url = `https://www.reddit.com/api/v1/authorize?client_id=${clientId}&response_type=code&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&duration=permanent&scope=${scope}`;
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri });
    }
    if (platform === 'discord') {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const redirectUri = `${host}/api/discord/auth/callback`;
      const scope = encodeURIComponent('identify guilds');
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
      return res.json({ ok: true, platform, authUrl: url, state });
    }

    if (platform === 'spotify') {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(`${host}/api/spotify/auth/callback`, { requiredPath: '/api/spotify/auth/callback' });
      // scopes: adjust later as needed when you register the app
      const scope = encodeURIComponent('user-read-email playlist-modify-public playlist-modify-private');
      const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&show_dialog=true`;
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri });
    }

    if (platform === 'telegram') {
      // For Telegram we use the t.me/<bot>?start=<state> pattern.
      // The frontend will open this URL and the user must press Start in the bot.
      const botUser = process.env.TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_NAME;
      if (!botUser) return res.status(500).json({ ok: false, error: 'telegram_bot_not_configured' });
      const url = `https://t.me/${botUser}?start=${encodeURIComponent(state)}`;
      return res.json({ ok: true, platform, authUrl: url, state });
    }

    if (platform === 'linkedin') {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(`${host}/api/linkedin/auth/callback`, { requiredPath: '/api/linkedin/auth/callback' });
      // Basic scopes for profile + email, expand as needed
      const scope = encodeURIComponent('r_liteprofile r_emailaddress w_member_social');
      const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri });
    }

    // Default: return placeholder callback URL so frontend can open something
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/${platform}/auth/callback`;
    return res.json({ ok: true, platform, authUrl: callbackUrl, state, note: 'placeholder_auth_start' });
  } catch (e) {
    return res.status(500).json({ ok: false, platform, error: e.message });
  }
});

// GET /api/:platform/auth/start (public) - returns a URL the frontend can open.
router.get('/:platform/auth/start', platformPublicLimiter, async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  // Return the prepare URL (client should POST to prepare when authenticated), or a callback placeholder.
  const prepareUrl = `${req.protocol}://${req.get('host')}/api/${platform}/auth/prepare`;
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/${platform}/auth/callback`;
  return res.json({ ok: true, platform, prepareUrl, callbackUrl, note: 'use_prepare_post_with_auth' });
});

// POST /api/:platform/auth/simulate - create a fake connected document for testing (auth required)
router.post('/:platform/auth/simulate', authMiddleware, platformWriteLimiter, async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(400).json({ ok: false, error: 'missing_user' });
    const userRef = db.collection('users').doc(uid);
    const now = new Date().toISOString();
    const fakeMeta = Object.assign({ display_name: `${platform} test user`, simulated: true }, req.body.meta || {});
    await userRef.collection('connections').doc(platform).set({ connected: true, meta: fakeMeta, simulated: true, updatedAt: now }, { merge: true });

    // Post-connection hooks: create event, update user's connectedPlatforms list and write lightweight recommendations
    try {
      await db.collection('events').add({ type: 'platform_connected', uid, platform, simulated: true, at: new Date().toISOString() });
      // add platform to user's connectedPlatforms array
      try {
        if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
          await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true });
        } else {
          // fallback: best-effort append (may create duplicates)
          const existing = (await userRef.get()).data() || {};
          const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
          if (!arr.includes(platform)) arr.push(platform);
          await userRef.set({ connectedPlatforms: arr }, { merge: true });
        }
      } catch(_){ }
      // Generate a recommended posting time and a sample caption to help the user get started
      try {
        const rec = smartDistributionEngine.calculateOptimalPostingTime(platform, /* timezone */ (fakeMeta.timezone || 'UTC'));
        const captionExample = engagementBoostingService.generateViralCaption({ title: 'My first post', description: '' }, platform, {});
        await userRef.collection('connections').doc(platform).set({ recommendations: { posting: rec, captionExample }, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        // non-fatal
        console.warn('[platform][simulate] recommendation generation failed', e && e.message);
      }
    } catch (e) {
      console.warn('[platform][simulate] post-connection hooks failed', e && e.message);
    }

    return res.json({ ok: true, platform, simulated: true });
  } catch (e) {
    return res.status(500).json({ ok: false, platform, error: e.message });
  }
});

// OAuth callbacks - handle code exchange for supported platforms
// GET /api/reddit/auth/callback
router.get('/reddit/auth/callback', async (req, res) => {
  const platform = 'reddit';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!fetchFn) return res.status(500).send('Server missing fetch implementation');
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const { canonicalizeRedirect } = require('../utils/redirectUri');
  const host = `${req.protocol}://${req.get('host')}`;
  const redirectUri = canonicalizeRedirect(`${host}/api/reddit/auth/callback`, { requiredPath: '/api/reddit/auth/callback' });
    const tokenUrl = 'https://www.reddit.com/api/v1/access_token';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    // Resolve user from stored state mapping (Firestore) where possible, fallback to legacy parsing
    let uid = null;
    try {
      if (state) {
        const sd = await db.collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data();
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) {
            uid = s.uid || null;
          }
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){}
        }
      }
    } catch (e) {
      console.warn('[oauth][reddit] state lookup failed', e && e.message);
    }
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];
    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: tokenJson, updatedAt: now }, { merge: true });
      // Post-connection hooks: queue light-weight recommendations and event for downstream engines
      try {
        await db.collection('events').add({ type: 'platform_connected', uid, platform, at: new Date().toISOString() });
        try {
          const rec = smartDistributionEngine.calculateOptimalPostingTime(platform, 'UTC');
          const captionExample = engagementBoostingService.generateViralCaption({ title: 'Welcome post', description: '' }, platform, {});
          await userRef.collection('connections').doc(platform).set({ recommendations: { posting: rec, captionExample }, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (e) { console.warn('[platform][reddit] recommendation generation failed', e && e.message); }
        try {
          if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
            await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true });
          } else {
            const existing = (await userRef.get()).data() || {};
            const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
            if (!arr.includes(platform)) arr.push(platform);
            await userRef.set({ connectedPlatforms: arr }, { merge: true });
          }
        } catch(_){ }
      } catch (e) {
        console.warn('[platform][reddit] post-connection hooks failed', e && e.message);
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('Reddit OAuth callback received. You can close this window.');
  } catch (e) {
    return res.status(500).send('Reddit callback error: ' + e.message);
  }
});

// GET /api/discord/auth/callback
router.get('/discord/auth/callback', async (req, res) => {
  const platform = 'discord';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!fetchFn) return res.status(500).send('Server missing fetch implementation');
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/discord/auth/callback`;
    const tokenUrl = 'https://discord.com/api/oauth2/token';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
    const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    // Fetch user identity to store helpful meta
    let meta = {};
    if (tokenJson.access_token) {
      const identityRes = await fetchFn('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
      if (identityRes.ok) meta = await identityRes.json();
    }
    // Resolve user from stored state mapping (Firestore) where possible, fallback to legacy parsing
    let uid = null;
    try {
      if (state) {
        const sd = await db.collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data();
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) {
            uid = s.uid || null;
          }
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){}
        }
      }
    } catch (e) {
      console.warn('[oauth][discord] state lookup failed', e && e.message);
    }
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];
    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: tokenJson, meta, updatedAt: now }, { merge: true });
      // Post-connection hooks: create event, add recommendations
      try {
        await db.collection('events').add({ type: 'platform_connected', uid, platform, at: new Date().toISOString() });
        try {
          const rec = smartDistributionEngine.calculateOptimalPostingTime(platform, 'UTC');
          const captionExample = engagementBoostingService.generateViralCaption({ title: 'Welcome post', description: '' }, platform, {});
          await userRef.collection('connections').doc(platform).set({ recommendations: { posting: rec, captionExample }, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (e) { console.warn('[platform][discord] recommendation generation failed', e && e.message); }
        try {
          if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
            await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true });
          } else {
            const existing = (await userRef.get()).data() || {};
            const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
            if (!arr.includes(platform)) arr.push(platform);
            await userRef.set({ connectedPlatforms: arr }, { merge: true });
          }
        } catch(_){ }
      } catch (e) {
        console.warn('[platform][discord] post-connection hooks failed', e && e.message);
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('Discord OAuth callback received. You can close this window.');
  } catch (e) {
    return res.status(500).send('Discord callback error: ' + e.message);
  }
});

// GET /api/spotify/auth/callback
router.get('/spotify/auth/callback', async (req, res) => {
  const platform = 'spotify';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!fetchFn) return res.status(500).send('Server missing fetch implementation');
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const { canonicalizeRedirect } = require('../utils/redirectUri');
  const host = `${req.protocol}://${req.get('host')}`;
  const redirectUri = canonicalizeRedirect(`${host}/api/spotify/auth/callback`, { requiredPath: '/api/spotify/auth/callback' });
    const tokenUrl = 'https://accounts.spotify.com/api/token';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();

    // Fetch user profile if we have an access token
    let meta = {};
    if (tokenJson.access_token) {
      try {
        const profileRes = await fetchFn('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
        if (profileRes.ok) meta = await profileRes.json();
      } catch (_) { /* non-fatal */ }
    }

    // Resolve user from stored state mapping (Firestore) where possible, fallback to legacy parsing
    let uid = null;
    try {
      if (state) {
        const sd = await db.collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data();
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) {
            uid = s.uid || null;
          }
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){ }
        }
      }
    } catch (e) {
      console.warn('[oauth][spotify] state lookup failed', e && e.message);
    }
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];

    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: tokenJson, meta, updatedAt: now }, { merge: true });
      // Post-connection hooks: event, recs, add to connectedPlatforms
      try {
        await db.collection('events').add({ type: 'platform_connected', uid, platform, at: new Date().toISOString() });
        try {
          const rec = smartDistributionEngine.calculateOptimalPostingTime(platform, 'UTC');
          const captionExample = engagementBoostingService.generateViralCaption({ title: 'Welcome post', description: '' }, platform, {});
          await userRef.collection('connections').doc(platform).set({ recommendations: { posting: rec, captionExample }, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (e) { console.warn('[platform][spotify] recommendation generation failed', e && e.message); }
        try {
          if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
            await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true });
          } else {
            const existing = (await userRef.get()).data() || {};
            const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
            if (!arr.includes(platform)) arr.push(platform);
            await userRef.set({ connectedPlatforms: arr }, { merge: true });
          }
        } catch(_){ }
      } catch (e) {
        console.warn('[platform][spotify] post-connection hooks failed', e && e.message);
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('Spotify OAuth callback received. You can close this window.');
  } catch (e) {
    return res.status(500).send('Spotify callback error: ' + e.message);
  }
});

// Generic placeholder callback for other platforms
router.get('/:platform/auth/callback', async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).send('Unsupported platform');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send('Callback placeholder - implement OAuth exchange for ' + platform);
});

// GET /api/linkedin/auth/callback
router.get('/linkedin/auth/callback', async (req, res) => {
  const platform = 'linkedin';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return res.status(400).send('Missing code');
  try {
    if (!fetchFn) return res.status(500).send('Server missing fetch implementation');
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const host = `${req.protocol}://${req.get('host')}`;
    const { canonicalizeRedirect } = require('../utils/redirectUri');
    const redirectUri = canonicalizeRedirect(`${host}/api/linkedin/auth/callback`, { requiredPath: '/api/linkedin/auth/callback' });
    // Exchange authorization code for access token
    const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
    const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    let meta = {};
    // Fetch basic profile if access token acquired
    if (tokenJson.access_token) {
      try {
        const profileRes = await fetchFn('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
        if (profileRes.ok) meta.profile = await profileRes.json();
        const emailRes = await fetchFn('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
        if (emailRes.ok) meta.email = await emailRes.json();
      } catch (_) { /* non-fatal */ }
    }
    // Resolve user from stored state mapping
    let uid = null;
    try {
      if (state) {
        const sd = await db.collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data();
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) uid = s.uid || null;
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){ }
        }
      }
    } catch (e) { console.warn('[oauth][linkedin] state lookup failed', e && e.message); }
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];
    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: tokenJson, meta, updatedAt: now }, { merge: true });
      try {
        await db.collection('events').add({ type: 'platform_connected', uid, platform, at: new Date().toISOString() });
        try {
          const rec = smartDistributionEngine.calculateOptimalPostingTime(platform, 'UTC');
          const captionExample = engagementBoostingService.generateViralCaption({ title: 'Welcome post', description: '' }, platform, {});
          await userRef.collection('connections').doc(platform).set({ recommendations: { posting: rec, captionExample }, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (e) { console.warn('[platform][linkedin] recommendation generation failed', e && e.message); }
        try {
          if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
            await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true });
          } else {
            const existing = (await userRef.get()).data() || {};
            const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
            if (!arr.includes(platform)) arr.push(platform);
            await userRef.set({ connectedPlatforms: arr }, { merge: true });
          }
        } catch(_){ }
      } catch (e) {
        console.warn('[platform][linkedin] post-connection hooks failed', e && e.message);
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('LinkedIn OAuth callback received. You can close this window.');
  } catch (e) {
    return res.status(500).send('LinkedIn callback error: ' + e.message);
  }
});

// POST /api/:platform/sample-promote - enqueue a sample platform_post for testing (auth required)
router.post('/:platform/sample-promote', authMiddleware, platformWriteLimiter, async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
    let { contentId } = req.body || {};
    // If no contentId provided, attempt to pick the latest content for the user
    if (!contentId) {
      try {
        const snap = await db.collection('content').where('user_id','==', uid).orderBy('created_at','desc').limit(1).get();
        if (!snap.empty) contentId = snap.docs[0].id;
      } catch(_){}
    }
    if (!contentId) return res.status(400).json({ ok: false, error: 'content_required' });
    const payload = req.body.payload || { message: 'Sample promotion', link: null };
    const result = await enqueuePlatformPostTask({ contentId, uid, platform, reason: 'sample_promote', payload, skipIfDuplicate: false, forceRepost: true });
    return res.json({ ok: true, enqueued: !!result.id, result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/telegram/webhook
// Telegram will POST updates here when the bot receives messages. We support
// validating an optional secret token (set via TELEGRAM_WEBHOOK_SECRET). When
// a user opens the bot via t.me/<bot>?start=<state> we resolve the state to a
// uid and persist users/{uid}/connections/telegram so the app can message them.
router.post('/telegram/webhook', platformWebhookLimiter, async (req, res) => {
  try {
    // Optional secret header check. When you call setWebhook you can provide
    // a `secret_token` which Telegram will include as the
    // 'X-Telegram-Bot-Api-Secret-Token' header on each delivery. Configure
    // TELEGRAM_WEBHOOK_SECRET in Render/ENV to enable this protection.
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET || null;
    if (configuredSecret) {
      const incoming = req.get('X-Telegram-Bot-Api-Secret-Token') || req.get('x-telegram-bot-api-secret-token') || req.get('x-telegram-secret-token');
      if (!incoming || String(incoming) !== String(configuredSecret)) {
        console.warn('[telegram][webhook] invalid or missing secret token');
        return res.status(401).send('invalid_secret');
      }
    }

    const update = req.body || {};
    const message = update.message || update.edited_message || (update.callback_query && update.callback_query.message) || null;
    if (!message) return res.status(200).send('ok');

    const chat = message.chat || {};
    const chatId = chat.id;
    const text = (message.text || '').trim();
    let state = null;
    if (text) {
      const parts = text.split(/\s+/);
      if (parts[0] === '/start' && parts[1]) state = parts.slice(1).join(' ');
      else if (parts[0].startsWith('/start')) {
        const tail = parts[0].slice('/start'.length);
        if (tail) state = tail;
      }
    }

    // Attempt to resolve state -> uid
    let uid = null;
    try {
      if (state) {
        const sd = await db.collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data() || {};
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) {
            uid = s.uid || null;
          }
          try { await db.collection('oauth_states').doc(state).delete(); } catch(_){ }
        }
      }
    } catch (e) {
      console.warn('[telegram][webhook] state lookup failed', e && e.message);
    }
    // legacy: allow uid encoded as prefix in state (used by other callbacks)
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];

    // If we can't resolve a uid, reply with guidance but do not persist
    if (!uid || uid === 'anon') {
      try {
        // send guidance message back to user (best-effort) if bot token configured
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          await postToTelegram({ payload: { text: 'Thanks for contacting AutoPromote. Please connect your account from the app so we can link your Telegram.' }, chatId });
        }
      } catch (_) { }
      return res.status(200).send('ok');
    }

    // Persist connection info for the user
    try {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      const meta = {
        chatId,
        username: (message.from && message.from.username) || null,
        firstName: (message.from && message.from.first_name) || null,
        lastName: (message.from && message.from.last_name) || null,
        platform: 'telegram'
      };
      await userRef.collection('connections').doc('telegram').set({ connected: true, chatId, meta, updatedAt: now }, { merge: true });

      // Add to connectedPlatforms array on user doc
      try {
        if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) {
          await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion('telegram') }, { merge: true });
        } else {
          const existing = (await userRef.get()).data() || {};
          const arr = Array.isArray(existing.connectedPlatforms) ? existing.connectedPlatforms : [];
          if (!arr.includes('telegram')) arr.push('telegram');
          await userRef.set({ connectedPlatforms: arr }, { merge: true });
        }
      } catch (_){ }

      // Fire an event for downstream engines
      try { await db.collection('events').add({ type: 'platform_connected', uid, platform: 'telegram', at: now }); } catch (_){ }

      // Confirm connection via bot message if possible
      try {
        await postToTelegram({ uid, payload: { text: 'AutoPromote: your Telegram account is now connected. You will receive notifications here.' } });
      } catch (_) { }
    } catch (e) {
      console.warn('[telegram][webhook] persist failed', e && e.message);
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.warn('[telegram][webhook] unexpected error', e && e.message);
    return res.status(200).send('ok');
  }
});

// Admin/test endpoint: send a one-off Telegram message to a chatId or uid
// POST /api/telegram/admin/send-test
// Body: { uid?: string, chatId?: string|number, text: string }
router.post('/telegram/admin/send-test', authMiddleware, platformWriteLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const text = body.text || body.message || 'Test message from AutoPromote';
    let chatId = body.chatId || null;
    const uid = body.uid || null;
    // If uid provided but no chatId, try to read it from Firestore
    if (!chatId && uid) {
      try { const snap = await db.collection('users').doc(uid).collection('connections').doc('telegram').get(); if (snap.exists) { const d = snap.data()||{}; chatId = d.chatId || (d.meta && d.meta.chatId) || null; } } catch(_){}
    }
    if (!chatId) return res.status(400).json({ ok: false, error: 'missing_chatId_or_uid' });
    // Use postToTelegram which supports payload.chatId override
    const result = await postToTelegram({ uid: uid || null, payload: { text, chatId } });
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
