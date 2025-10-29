const express = require('express');
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');
const router = express.Router();
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const platformConnectionsPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_CONNECTIONS_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'platform_connections_public' });

// Helper to fetch connection doc if exists
async function getConn(uid, name) {
  try {
    // Validate uid to prevent injection
    if (typeof uid !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
      return { connected: false, error: 'invalid_uid' };
    }
    // Validate name to prevent injection
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return { connected: false, error: 'invalid_name' };
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.collection('connections').doc(name).get();
    if (snap.exists) {
      const data = snap.data();
      return { connected: true, ...data, source: 'subcollection' };
    }
    // Heuristic fallback: inspect top-level user doc for token/identity hints
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const u = userSnap.data() || {};
      const lowerKeys = Object.keys(u).map(k => k.toLowerCase());
      const hasToken = lowerKeys.some(k => k.includes(name) && k.includes('token'));
      const identity = u[`${name}Identity`] || u[`${name}_identity`] || u[`${name}Profile`] || null;
      if (hasToken || identity) {
        return { connected: true, inferred: true, identity, source: 'userDoc' };
      }
    }
    return { connected: false };
  } catch (_) { return { connected: false, error: 'lookup_failed' }; }
}

router.get('/status', authMiddleware, platformConnectionsPublicLimiter, require('../statusInstrument')('platformConnectionsStatus', async (req, res) => {
  const { getCache, setCache } = require('../utils/simpleCache');
  const uid = req.userId || req.user?.uid;
  const cacheKey = `platform_connections_status_${uid}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  // include additional platforms so frontend can query a single status endpoint
  const [twitter, youtube, facebook, tiktok, spotify, reddit, discord, linkedin, telegram, pinterest] = await Promise.all([
    getConn(uid, 'twitter'),
    getConn(uid, 'youtube'),
    getConn(uid, 'facebook'),
    getConn(uid, 'tiktok'),
    getConn(uid, 'spotify'),
    getConn(uid, 'reddit'),
    getConn(uid, 'discord'),
    getConn(uid, 'linkedin'),
    getConn(uid, 'telegram'),
    getConn(uid, 'pinterest')
  ]);
  const summary = {
    twitter: { connected: twitter.connected, username: twitter.identity?.username },
    youtube: { connected: youtube.connected, channelTitle: youtube.channel?.snippet?.title },
    facebook: { connected: facebook.connected, pages: Array.isArray(facebook.pages) ? facebook.pages.map(p=>p.name).slice(0,3) : [] },
    tiktok: { connected: tiktok.connected, display_name: tiktok.display_name },
    spotify: { connected: spotify.connected },
    reddit: { connected: reddit.connected },
    discord: { connected: discord.connected },
    linkedin: { connected: linkedin.connected },
    telegram: { connected: telegram.connected },
    pinterest: { connected: pinterest.connected }
  };
  const payload = { ok: true, summary, raw: { twitter, youtube, facebook, tiktok, spotify, reddit, discord, linkedin, telegram, pinterest } };
  setCache(cacheKey, payload, 7000);
  res.json(payload);
}));

module.exports = router;
