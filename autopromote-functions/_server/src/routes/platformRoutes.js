const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { SUPPORTED_PLATFORMS } = require('../validationMiddleware');
const { db } = require('../firebaseAdmin');
const { encryptToken } = require('../services/secretVault');
const { tokensFromDoc } = require('../services/connectionTokenUtils');
const { safeFetch } = require('../utils/ssrfGuard');
// Engines to warm-up/connect on new platform connections
const smartDistributionEngine = require('../services/smartDistributionEngine');
const admin = require('../firebaseAdmin').admin;
const engagementBoostingService = require('../services/engagementBoostingService');
const { enqueuePlatformPostTask } = require('../services/promotionTaskQueue');
const { postToTelegram } = require('../services/telegramService');
const { searchTracks, getPlaylist, createPlaylist, addTracksToPlaylist } = require('../services/spotifyService');
const rateLimit = require('../middlewares/simpleRateLimit');
const { rateLimiter } = require('../middlewares/globalRateLimiter');

const platformPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'platform_public' });
const platformWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'platform_writes' });
const platformWebhookLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_WEBHOOK || '300', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '50'), windowHint: 'platform_webhook' });
// Throttle repeated warning logs for Telegram webhook invalid/missing secret,
// to avoid noisy logs in production when bots or scanners hit the webhook.
const TELEGRAM_WEBHOOK_WARN_THROTTLE_MS = parseInt(process.env.TELEGRAM_WEBHOOK_WARN_THROTTLE_MS || '300000', 10); // 5 minutes default
const _telegramWebhookWarnCache = new Map();

// Lightweight in-memory cache for platform status checks to reduce duplicate
// Firestore reads when many clients poll /api/:platform/status frequently.
// Keyed by `${uid}:${platform}` with a short TTL. This is process-local and
// intended as a quick mitigation to prevent high request fan-out while we
// consider a more robust central cache (Redis) if needed.
const platformStatusCache = new Map();
const PLATFORM_STATUS_TTL_MS = parseInt(process.env.PLATFORM_STATUS_TTL_MS || '3000', 10);

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

function sanitizeForText(message) {
  return String(message || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendPlain(res, status, message) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(sanitizeForText(message));
}

// Helper: remove sensitive fields from a connection Firestore document before returning
function sanitizeConnectionForApi(doc) {
  if (!doc || typeof doc !== 'object') return {};
  const clone = Object.assign({}, doc);
  // Remove token fields entirely
  delete clone.tokens;
  delete clone.access_token;
  delete clone.accessToken;
  delete clone.refresh_token;
  delete clone.refreshToken;
  delete clone.client_secret;
  delete clone.clientSecret;
  delete clone.private_key;
  delete clone.secret;
  if (clone.meta && typeof clone.meta === 'object') {
    const metaClone = Object.assign({}, clone.meta);
    delete metaClone.tokens;
    delete metaClone.access_token;
    delete metaClone.refresh_token;
    clone.meta = metaClone;
  }
  return clone;
}

// GET /api/:platform/status
router.get('/:platform/status', authMiddleware, rateLimit({ max: 20, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  const uid = req.userId || req.user?.uid;
  if (!uid) return res.json({ ok: true, platform, connected: false });

  const cacheKey = `${uid}:${platform}`;
  const now = Date.now();
  const cached = platformStatusCache.get(cacheKey);
  if (cached && cached.data && (now - cached.ts) < PLATFORM_STATUS_TTL_MS) {
    return res.json(cached.data);
  }

  // GET /api/spotify/metadata - returns playlists/metadata for connected Spotify user
  router.get('/spotify/metadata', authMiddleware, rateLimit({ max: 10, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
    try {
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.collection('connections').doc('spotify').get();
      if (!snap.exists) return res.status(200).json({ ok: true, platform: 'spotify', connected: false, meta: {} });
      const sdata = snap.data() || {};
      const tokens = tokensFromDoc(sdata) || (sdata.meta && sdata.meta.tokens) || null;
      const meta = { ...(sdata.meta || {}) };
      if (tokens && tokens.access_token) {
        try {
          const url = `https://api.spotify.com/v1/me/playlists?limit=50`;
          const r = await safeFetch(url, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${tokens.access_token}` } }, requireHttps: true, allowHosts: ['api.spotify.com'] });
          if (r.ok) {
            const j = await r.json();
            meta.playlists = (j.items || []).map(p => ({ id: p.id, name: p.name, public: !!p.public }));
            await userRef.collection('connections').doc('spotify').set({ meta: { ...(sdata.meta || {}), playlists: meta.playlists }, updatedAt: new Date().toISOString() }, { merge: true });
          }
        } catch (_) {}
      }
      return res.json({ ok: true, platform: 'spotify', connected: !!sdata.connected, meta });
    } catch (e) {
      return res.status(500).json({ ok: false, platform: 'spotify', error: e.message || 'unknown_error' });
    }
  });

  // GET /api/spotify/search - search tracks using Spotify API for the connected user
  router.get('/spotify/search', authMiddleware, rateLimit({ max: 20, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
    try {
      const uid = req.userId || req.user?.uid;
      if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
      const q = String(req.query.q || req.query.query || '').trim();
      if (!q) return res.status(400).json({ ok: false, error: 'query_required' });
      const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 50);
      const results = await searchTracks({ uid, query: q, limit });
      return res.json({ ok: true, query: q, results: results.tracks || [] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'spotify_search_failed' });
    }
  });
  if (cached && cached.inflight) {
    try {
      const d = await cached.inflight;
      return res.json(d);
    } catch (_) {
      // fallthrough to attempt a fresh fetch
    }
  }

  // Create an inflight promise so concurrent callers share the same work
  const inflight = (async () => {
    try {
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.collection('connections').doc(platform).get();
      if (snap.exists) {
        // Sanitize the connection object to avoid leaking tokens or secrets
        const connDoc = snap.data() || {};
        return { ok: true, platform, connected: true, meta: sanitizeConnectionForApi(connDoc) };
      }
      // Fallback: try to infer from top-level user doc
      const userSnap = await userRef.get();
      const u = userSnap.exists ? userSnap.data() || {} : {};
      const inferred = !!(u[`${platform}Token`] || u[`${platform}AccessToken`] || u[`${platform}Identity`] || u[`${platform}Profile`]);
      return { ok: true, platform, connected: inferred, inferred };
    } catch (e) {
      // Return an error-shaped object so callers get the message; avoid throwing to keep inflight promise stable
      return { ok: false, platform, error: e && e.message ? e.message : 'unknown_error' };
    }
  })();

  // Store inflight so others can await it
  platformStatusCache.set(cacheKey, { ts: Date.now(), data: null, inflight });

  try {
    const result = await inflight;
    // Cache the final result (even errors) for a short TTL to avoid tight retry loops
    platformStatusCache.set(cacheKey, { ts: Date.now(), data: result, inflight: null });
    if (result && result.ok === false && result.error) return res.status(500).json(result);
    return res.json(result);
  } catch (e) {
    platformStatusCache.delete(cacheKey);
    return res.status(500).json({ ok: false, platform, error: e && e.message ? e.message : 'unknown_error' });
  }
});

// GET /api/:platform/metadata - return helpful metadata for the connected user (playlist lists, org pages, guilds)
router.get('/:platform/metadata', authMiddleware, rateLimit({ max: 20, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  const uid = req.userId || req.user?.uid;
  if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
  try {
    const connSnap = await db.collection('users').doc(uid).collection('connections').doc(platform).get();
    if (!connSnap.exists) return res.json({ ok: true, platform, connected: false });
    const conn = connSnap.data() || {};
    // If we already have helpful meta stored, return it
    if (conn.meta && Object.keys(conn.meta || {}).length) {
      // Ensure the returned meta doesn't contain tokens
      const sanitizedMeta = Object.assign({}, conn.meta || {});
      delete sanitizedMeta.tokens;
      delete sanitizedMeta.access_token;
      delete sanitizedMeta.refresh_token;
      return res.json({ ok: true, platform, connected: true, meta: sanitizedMeta });
    }
    // Otherwise, try to fetch some metadata from provider using stored tokens (best-effort)
    const tokens = tokensFromDoc(conn) || (conn.meta && conn.meta.tokens) || null;
    const result = { ok: true, platform, connected: true, meta: {} };
    if (!tokens || !tokens.access_token) {
      // Best-effort fallback: return empty meta and let the UI use the session values
      return res.json(result);
    }
    // Add platform-specific metadata endpoints for Spotify
    if (platform === 'spotify') {
      // If connected, fetch playlists to return
      try {
        const uid = req.userId || req.user?.uid;
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.collection('connections').doc('spotify').get();
        if (snap.exists) {
          const sdata = snap.data() || {};
          const tokens = tokensFromDoc(sdata) || (sdata.meta && sdata.meta.tokens) || null;
          if (tokens && tokens.access_token) {
            try {
              const url = `https://api.spotify.com/v1/me/playlists?limit=50`;
              const r = await safeFetch(url, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${tokens.access_token}` } }, requireHttps: true, allowHosts: ['api.spotify.com'] });
              if (r.ok) {
                const j = await r.json();
                result.meta.playlists = (j.items || []).map(p => ({ id: p.id, name: p.name, public: !!p.public }));
                await userRef.collection('connections').doc('spotify').set({ meta: { ...(sdata.meta || {}), playlists: result.meta.playlists }, updatedAt: new Date().toISOString() }, { merge: true });
              }
            } catch (_) {}
          }
        }
        return res.json(result);
      } catch (e) {
        return res.status(500).json({ ok: false, platform, error: e.message || 'unknown_error' });
      }
    }
    const accessToken = tokens.access_token;
    if (platform === 'spotify') {
      // Get user playlists
      try {
        const url = `https://api.spotify.com/v1/me/playlists?limit=50`;
        const r = await safeFetch(url, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } }, requireHttps: true, allowHosts: ['api.spotify.com'] });
        if (r.ok) {
          const j = await r.json();
          result.meta.playlists = (j.items || []).map(p => ({ id: p.id, name: p.name, public: !!p.public }));
          await db.collection('users').doc(uid).collection('connections').doc('spotify').set({ meta: { playlists: result.meta.playlists }, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch (e) { /* non-fatal */ }
    } else if (platform === 'discord') {
      // Try to get guilds the user is a member of
      try {
        const url = `https://discord.com/api/users/@me/guilds`;
        const r = await safeFetch(url, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } }, requireHttps: true, allowHosts: ['discord.com', 'discordapp.com'] });
        if (r.ok) {
          const j = await r.json();
          result.meta.guilds = (j || []).map(g => ({ id: g.id, name: g.name, owner: !!g.owner }));
          await db.collection('users').doc(uid).collection('connections').doc('discord').set({ meta: { guilds: result.meta.guilds }, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch (e) { /* non-fatal */ }
    } else if (platform === 'linkedin') {
      // Attempt to fetch organizations where the user has admin rights
      try {
        const aclUrl = `https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR`;
        const r = await safeFetch(aclUrl, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }, requireHttps: true, allowHosts: ['api.linkedin.com'] });
        if (r.ok) {
          const j = await r.json();
          const orgIds = (j.elements || []).map(el => (el && el.organizationalTarget && el.organizationalTarget.split(':').pop())).filter(Boolean);
          const orgs = [];
          for (const id of orgIds) {
            try {
              const orgReq = await safeFetch(`https://api.linkedin.com/v2/organizations/${id}?projection=(localizedName)`, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }, requireHttps: true, allowHosts: ['api.linkedin.com'] });
              if (orgReq.ok) {
                const orgData = await orgReq.json();
                orgs.push({ id, name: orgData.localizedName || orgData.name || 'Organization' });
              }
            } catch (_) { /* ignore failing org fetch */ }
          }
          result.meta.organizations = orgs;
          await db.collection('users').doc(uid).collection('connections').doc('linkedin').set({ meta: { organizations: orgs }, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch (e) { /* non-fatal */ }
    } else if (platform === 'telegram') {
      // Telegram webhook callback persists a chatId; include that if present
      try {
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.collection('connections').doc('telegram').get();
        if (snap.exists) {
          const d = snap.data() || {};
          if (d.chatId) result.meta.chatId = d.chatId;
          if (d.meta) result.meta = { ...result.meta, ...d.meta };
        }
      } catch (_) { /* ignore */ }
    }
    else if (platform === 'pinterest') {
      try {
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.collection('connections').doc('pinterest').get();
        if (snap.exists) {
          const sdata = snap.data() || {};
          const tokens = tokensFromDoc(sdata) || (sdata.meta && sdata.meta.tokens) || null;
          if (tokens && tokens.access_token) {
            const accessToken = tokens.access_token;
          const url = 'https://api.pinterest.com/v5/boards?limit=50';
          try {
            const r = await safeFetch(url, fetchFn, { fetchOptions: { headers: { Authorization: `Bearer ${accessToken}` } }, requireHttps: true, allowHosts: ['api.pinterest.com'] });
            if (r.ok) {
              const j = await r.json();
              result.meta.boards = (j.items || []).map(b => ({ id: b.id, name: b.name }));
              await userRef.collection('connections').doc('pinterest').set({ meta: { ...(sdata.meta || {}), boards: result.meta.boards }, updatedAt: new Date().toISOString() }, { merge: true });
            }
          } catch (_) {}
          }
        }
      } catch (_) {}
    }

    if (platform === 'pinterest') {
      const clientId = process.env.PINTEREST_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(process.env.PINTEREST_REDIRECT_URI || `${host}/api/pinterest/auth/callback`, { requiredPath: '/api/pinterest/auth/callback' });
      const scope = encodeURIComponent((process.env.PINTEREST_SCOPES || 'pins:read,pins:write,boards:read').split(',').join(','));
      const url = `https://www.pinterest.com/oauth/?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&scope=${scope}&state=${state}`;
      try { console.log('[oauth][prepare][pinterest] authUrlPresent=%s redirectPresent=%s statePresent=%s', !!url, !!redirectUri, !!state); } catch (_) {}
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri });
    }
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, platform, error: e.message || 'unknown_error' });
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
  const baseState = crypto.randomBytes(18).toString('base64url');
  // Support popup flows by appending a marker to the state when requested by the client.
  const wantsPopup = !!(req.body && req.body.popup);
  const state = wantsPopup ? `${baseState}:popup` : baseState;
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
      // Prefer an explicit DISCORD_REDIRECT_URI env var when present (avoids host-guessing mismatches)
      const redirectUri = process.env.DISCORD_REDIRECT_URI || `${host}/api/discord/auth/callback`;
      const scope = encodeURIComponent('identify guilds');
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;
      return res.json({ ok: true, platform, authUrl: url, state });
    }

    if (platform === 'pinterest') {
      const clientId = process.env.PINTEREST_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(process.env.PINTEREST_REDIRECT_URI || `${host}/api/pinterest/auth/callback`, { requiredPath: '/api/pinterest/auth/callback' });
      const scope = encodeURIComponent((process.env.PINTEREST_SCOPES || 'pins:read,pins:write,boards:read').split(',').join(','));
      const url = `https://www.pinterest.com/oauth/?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&scope=${scope}&state=${state}`;
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri });
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
      const webUrl = `https://t.me/${botUser}?start=${encodeURIComponent(state)}`;
      // Native app deep link (tg://) — useful to try opening the Telegram app directly
      const appUrl = `tg://resolve?domain=${encodeURIComponent(botUser)}&start=${encodeURIComponent(state)}`;
      return res.json({ ok: true, platform, authUrl: webUrl, appUrl, state });
    }

    if (platform === 'linkedin') {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const { canonicalizeRedirect } = require('../utils/redirectUri');
      const redirectUri = canonicalizeRedirect(`${host}/api/linkedin/auth/callback`, { requiredPath: '/api/linkedin/auth/callback' });
      const rawScopes = process.env.LINKEDIN_SCOPES || process.env.LINKEDIN_SCOPE;
      const defaultScopes = ['r_liteprofile', 'r_emailaddress'];
      // Only request member social if explicitly enabled to avoid unauthorized_scope_error before approval
      if (process.env.LINKEDIN_ENABLE_SHARING === 'true' || process.env.LINKEDIN_REQUIRE_W_MEMBER_SOCIAL === 'true') {
        defaultScopes.push('w_member_social');
      }
      const scopes = rawScopes ? rawScopes.split(/\s+/).filter(Boolean) : defaultScopes;
      const scope = encodeURIComponent(scopes.join(' '));
      const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
      return res.json({ ok: true, platform, authUrl: url, state, redirect: redirectUri, scopes });
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
  if (!code) return sendPlain(res, 400, 'Missing code');
  try {
    if (!fetchFn) return sendPlain(res, 500, 'Server missing fetch implementation');
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
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), hasEncryption: true, updatedAt: now }, { merge: true });
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
    return sendPlain(res, 200, 'Reddit OAuth callback received. You can close this window.');
  } catch (e) {
    return sendPlain(res, 500, 'Reddit callback error: ' + (e && e.message ? e.message : 'unknown error'));
  }
});

// GET /api/discord/auth/callback
router.get('/discord/auth/callback', async (req, res) => {
  const platform = 'discord';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return sendPlain(res, 400, 'Missing code');
  try {
    if (!fetchFn) return sendPlain(res, 500, 'Server missing fetch implementation');
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/discord/auth/callback`;
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
    // If state was stored with a :popup suffix, normalize it when doing legacy parsing
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];
    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), hasEncryption: true, meta, updatedAt: now }, { merge: true });
      // Persist extra metadata where possible (LinkedIn orgs)
      try {
        if (tokenJson.access_token) {
          const aclUrl = `https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR`;
          const aclRes = await fetchFn(aclUrl, { headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'X-Restli-Protocol-Version': '2.0.0' } });
          if (aclRes.ok) {
            const aclData = await aclRes.json();
            const orgIds = (aclData.elements || []).map(el => (el && el.organizationalTarget && el.organizationalTarget.split(':').pop())).filter(Boolean);
            const orgs = [];
            for (const id of orgIds) {
              try {
                const orgReq = await fetchFn(`https://api.linkedin.com/v2/organizations/${id}?projection=(localizedName)`, { headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'X-Restli-Protocol-Version': '2.0.0' } });
                if (orgReq.ok) {
                  const orgData = await orgReq.json();
                  orgs.push({ id, name: orgData.localizedName || orgData.name || 'Organization' });
                }
              } catch (_) { /* ignore */ }
            }
            if (orgs.length > 0) {
              await userRef.collection('connections').doc(platform).set({ meta: { ...(meta||{}), organizations: orgs } }, { merge: true });
            }
          }
        }
      } catch (e) { /* best-effort */ }
      // Persist extra metadata where possible (guilds for Discord)
      try {
        if (tokenJson.access_token) {
          const guildUrl = 'https://discord.com/api/users/@me/guilds';
          const gRes = await fetchFn(guildUrl, { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
          if (gRes.ok) {
            const gData = await gRes.json();
            const guilds = (gData || []).map(g => ({ id: g.id, name: g.name, owner: !!g.owner }));
            await userRef.collection('connections').doc(platform).set({ meta: { ...(meta||{}), guilds } }, { merge: true });
          }
        }
      } catch (e) { /* best-effort */ }
      // Persist extra metadata where possible (e.g., playlists)
      try {
        if (tokenJson.access_token) {
          // Fetch playlists and augment meta
          const playlistsUrl = 'https://api.spotify.com/v1/me/playlists?limit=50';
          const pRes = await fetchFn(playlistsUrl, { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
          if (pRes.ok) {
            const pData = await pRes.json();
            const playlists = (pData.items || []).map(p=>({ id: p.id, name: p.name, public: !!p.public }));
            await userRef.collection('connections').doc(platform).set({ meta: { ...(meta||{}), playlists } }, { merge: true });
          }
        }
      } catch (e) { /* best-effort */ }
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

    // If the state indicates a popup flow (state ends with ':popup'), return a small HTML
    // page that notifies the opener via postMessage and then closes itself.
    const isPopup = typeof state === 'string' && state.endsWith(':popup');
    if (isPopup) {
      // The page posts a message to window.opener with platform/status to allow the parent window
      // to know the flow completed without polling. Use FRONTEND_URL as the expected origin when possible.
      const frontendOrigin = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : `${req.protocol}://${req.get('host').replace(/^api\./i, '')}`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Discord Connect</title></head><body>
<script>
// Notify the opener (best-effort) and then close this popup. We try several
// tactics because cross-origin restrictions may prevent some approaches in some browsers.
try {
  const payload = { platform: 'discord', status: 'success' };
  // 1) Try targeted postMessage using the expected frontend origin
  try { if (window.opener && !window.opener.closed) window.opener.postMessage(payload, '${frontendOrigin}'); } catch (e) {}
  // 2) Fallback: permissive postMessage
  try { if (window.opener && !window.opener.closed) window.opener.postMessage(payload, '*'); } catch (e) {}
  // 3) Try to directly update the opener location (may throw cross-origin errors)
  try { if (window.opener && !window.opener.closed) window.opener.location.href = '${frontendOrigin}/?oauth=discord&status=success'; } catch (e) {}
} catch (e) {}
// Give the parent a moment then close. If the browser blocks window.close for some reason
// (shouldn't when opened by script), the user will still see the page text.
setTimeout(() => { try { window.close(); } catch (e) { /* ignore */ } }, 400);
</script>
<p>Discord authorization complete. You can close this window.</p>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    // Prefer redirecting back to the frontend app instead of showing a plain text page
    // FRONTEND_URL should be set to your public frontend host (e.g. https://www.autopromote.org)
    // Fallback: try to derive a frontend host by removing a leading "api." from the request host.
    try {
      const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host').replace(/^api\./i, '')}`;
      const successUrl = `${frontendBase}/?oauth=discord&status=success`;
      return res.redirect(successUrl);
    } catch (e) {
      // If redirect fails for any reason, fall back to the plain text response
      return sendPlain(res, 200, 'Discord OAuth callback received. You can close this window.');
    }
  } catch (e) {
    return sendPlain(res, 500, 'Discord callback error: ' + (e && e.message ? e.message : 'unknown error'));
  }
});

// GET /api/spotify/auth/callback
router.get('/spotify/auth/callback', async (req, res) => {
  const platform = 'spotify';
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return sendPlain(res, 400, 'Missing code');
  try {
    if (!fetchFn) return sendPlain(res, 500, 'Server missing fetch implementation');
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
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), hasEncryption: true, meta, updatedAt: now }, { merge: true });
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

    return sendPlain(res, 200, 'Spotify OAuth callback received. You can close this window.');
  } catch (e) {
    return sendPlain(res, 500, 'Spotify callback error: ' + (e && e.message ? e.message : 'unknown error'));
  }
});

// Generic placeholder callback for other platforms
// NOTE: this handler intentionally sits after platform-specific handlers
// below so specific OAuth exchanges (e.g. Spotify, Discord, Pinterest)
// are not intercepted by the placeholder.

// GET /api/linkedin/auth/callback
router.get('/linkedin/auth/callback', async (req, res) => {
  const platform = 'linkedin';
  const code = req.query.code;
  const state = req.query.state;
  const oauthError = req.query.error;
  const oauthErrorDescription = req.query.error_description;
  if (oauthError) {
    let message = oauthErrorDescription || oauthError;
    try { message = decodeURIComponent(message); } catch (_) {}
    return sendPlain(res, 400, `LinkedIn authorization error: ${message}`);
  }
  if (!code) return sendPlain(res, 400, 'Missing authorization code from LinkedIn');
  try {
  if (!fetchFn) return sendPlain(res, 500, 'Server missing fetch implementation');
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
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), hasEncryption: true, meta, updatedAt: now }, { merge: true });
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
    return sendPlain(res, 200, 'LinkedIn OAuth callback received. You can close this window.');
  } catch (e) {
    return sendPlain(res, 500, 'LinkedIn callback error: ' + (e && e.message ? e.message : 'unknown error'));
  }
});

// GET /api/pinterest/auth/callback - Pinterest OAuth v5 code exchange
router.get('/pinterest/auth/callback', async (req, res) => {
  const platform = 'pinterest';
  const code = req.query.code;
  const state = req.query.state;
  const oauthError = req.query.error;
  if (oauthError) return sendPlain(res, 400, `Pinterest error: ${req.query.error_description || oauthError}`);
    if (!code) {
      try { console.warn('[oauth][pinterest] Missing code in callback; queryKeys=%s hostPresent=%s', Object.keys(req.query || {}).length, !!req.get('host')); } catch(_){ }
      return sendPlain(res, 400, 'Missing authorization code from Pinterest');
    }
  try {
    if (!fetchFn) return sendPlain(res, 500, 'Server missing fetch implementation');
    const clientId = process.env.PINTEREST_CLIENT_ID;
    const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
    const host = `${req.protocol}://${req.get('host')}`;
    const { canonicalizeRedirect } = require('../utils/redirectUri');
    const redirectUri = canonicalizeRedirect(process.env.PINTEREST_REDIRECT_URI || `${host}/api/pinterest/auth/callback`, { requiredPath: '/api/pinterest/auth/callback' });
    // Avoid logging sensitive OAuth callback parameters; redact full values and only log presence/length info
    try { console.log('[oauth][pinterest] callback redirectUriPresent=%s queryKeys=%s statePresent=%s', !!redirectUri, Object.keys(req.query || {}).length, !!state); } catch(_){ }
        // try { console.log('[oauth][pinterest] callback redirectUri:', redirectUri, 'query:', req.query, 'state:', state); } catch(_){}
    const tokenUrl = 'https://api.pinterest.com/v5/oauth/token';
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenRes.json();
    let meta = {};
    if (tokenJson.access_token) {
      try {
        // fetch user account and boards
        const accRes = await fetchFn('https://api.pinterest.com/v5/user_account', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
        if (accRes.ok) meta.profile = await accRes.json();
        const boardsRes = await fetchFn('https://api.pinterest.com/v5/boards?limit=50', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
        if (boardsRes.ok) {
          const bd = await boardsRes.json();
          meta.boards = (bd.items || []).map(b => ({ id: b.id, name: b.name }));
        }
      } catch (_) {}
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
    } catch (e) { console.warn('[oauth][pinterest] state lookup failed', e && e.message); }
    if (!uid && state && state.split && state.split(':')[0]) uid = state.split(':')[0];
    if (uid && uid !== 'anon') {
      const userRef = db.collection('users').doc(uid);
      const now = new Date().toISOString();
      await userRef.collection('connections').doc(platform).set({ connected: true, tokens: encryptToken(JSON.stringify(tokenJson)), hasEncryption: true, meta, updatedAt: now }, { merge: true });
      try { await db.collection('events').add({ type: 'platform_connected', uid, platform, at: new Date().toISOString() }); } catch(_){ }
      try { if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) { await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion(platform) }, { merge: true }); } } catch(_){ }
    }
    return sendPlain(res, 200, 'Pinterest OAuth callback received. You can close this window.');
  } catch (e) {
    return sendPlain(res, 500, 'Pinterest callback error: ' + (e && e.message ? e.message : 'unknown error'));
  }
});

// Generic placeholder callback for other platforms — keep as a fallback
// and ensure it's defined after specific platform callback handlers so it
// doesn't intercept platforms that have a proper implementation.
router.get('/:platform/auth/callback', async (req, res, next) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).send('Unsupported platform');
  return sendPlain(res, 200, 'Callback placeholder - implement OAuth exchange for ' + platform);
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

    // POST /api/:platform/boards - create a board for the given platform (Pinterest only)
    router.post('/:platform/boards', authMiddleware, platformWriteLimiter, async (req, res) => {
      const platform = normalize(req.params.platform);
      if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
      try {
        const uid = req.userId || req.user?.uid;
        if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
        if (platform !== 'pinterest') return res.status(400).json({ ok: false, error: 'unsupported_platform_for_boards' });
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const description = String(body.description || body.desc || '') || null;
        if (!name || name.length < 1) return res.status(400).json({ ok: false, error: 'name_required' });
        const userRef = db.collection('users').doc(uid);
        const connSnap = await userRef.collection('connections').doc('pinterest').get();
        const conn = connSnap.exists ? connSnap.data() || {} : {};
        const tokens = tokensFromDoc(conn) || (conn.meta && conn.meta.tokens) || null;
        const hasAccessToken = tokens && tokens.access_token;
        // If user has a token, try to create board using Pinterest API v5
        if (hasAccessToken) {
          try {
            const accessToken = tokens.access_token;
            const postBody = { name };
            if (description) postBody.description = description;
            // Use service helper to create board to centralize logic & testing
            try {
              const { createBoard } = require('../services/pinterestService');
              const result = await createBoard({ name, description, uid });
              if (!result.ok) return res.status(502).json({ ok: false, error: result.error || 'pinterest_api_error' });
              return res.json({ ok: true, board: result.board, simulated: result.simulated || false });
            } catch (e) {
              return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'pinterest_create_failed' });
            }
          } catch (e) {
            return res.status(500).json({ ok: false, error: e.message || 'pinterest_create_failed' });
          }
        }
        // Otherwise, support simulated create (e.g., during tests or dev without token)
        // Simulated creation: use service helper which handles both real & simulated creation
        try {
          const { createBoard } = require('../services/pinterestService');
          const result = await createBoard({ name, description, uid });
          if (!result.ok) return res.status(500).json({ ok: false, error: result.error || 'create_simulated_board_failed' });
          return res.json({ ok: true, board: result.board, simulated: result.simulated || false });
        } catch (e) {
          return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'create_simulated_board_failed' });
        }
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message || 'unknown_error' });
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
        // If silent reject is enabled, return 200 OK without logging details to suppress probes
        if (process.env.TELEGRAM_WEBHOOK_SILENT_REJECT === 'true') return res.status(200).send('ok');
        // Throttle warning logs per requesting IP to avoid flood in logs.
        try {
          const remote = (req.ip || req.get('x-forwarded-for') || 'unknown').toString();
          // Normalize to a simple key
          const key = `tg:webhook:bad_secret:${remote}`;
          const now = Date.now();
          const last = _telegramWebhookWarnCache.get(key) || 0;
          if (now - last > TELEGRAM_WEBHOOK_WARN_THROTTLE_MS) {
            // Log minimally to keep diagnostics available without flooding
            console.warn('[telegram][webhook] invalid or missing secret token (throttled) ip=%s', remote);
            _telegramWebhookWarnCache.set(key, now);
          }
        } catch (_) {
          // If logging throttle errors, skip and continue to return 401
        }
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

// POST /api/spotify/playlists - create a spotify playlist using user's Spotify connection
router.post('/spotify/playlists', authMiddleware, platformWriteLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || req.body.desc || '').trim() || null;
    if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
    const result = await createPlaylist({ uid, name, description, contentId: req.body.contentId });
    if (!result || !result.success) return res.status(502).json({ ok: false, error: result.error || 'spotify_create_playlist_failed' });
    return res.json({ ok: true, playlist: { id: result.playlistId, name: result.name, url: result.url } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'spotify_create_failed' });
  }
});

// POST /api/spotify/playlists/:id/tracks - add tracks to a Spotify playlist
router.post('/spotify/playlists/:id/tracks', authMiddleware, platformWriteLimiter, async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: 'missing_user' });
    const playlistId = String(req.params.id || '').trim();
    if (!playlistId) return res.status(400).json({ ok: false, error: 'playlistId_required' });
    let trackUris = req.body.trackUris || req.body.tracks || null;
    if (!Array.isArray(trackUris) || trackUris.length === 0) return res.status(400).json({ ok: false, error: 'trackUris_required' });
    const result = await addTracksToPlaylist({ uid, playlistId, trackUris });
    if (!result || !result.success) return res.status(502).json({ ok: false, error: result.error || 'spotify_add_tracks_failed' });
    return res.json({ ok: true, snapshotId: result.snapshotId, added: result.tracksAdded });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'spotify_add_tracks_failed' });
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
// Export helper for tests
module.exports.sanitizeConnectionForApi = sanitizeConnectionForApi;
