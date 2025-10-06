const express = require('express');
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');
const router = express.Router();

// Helper to fetch connection doc if exists
async function getConn(uid, name) {
  try {
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

router.get('/status', authMiddleware, require('../statusInstrument')('platformConnectionsStatus', async (req, res) => {
  const { getCache, setCache } = require('../utils/simpleCache');
  const uid = req.userId || req.user?.uid;
  const cacheKey = `platform_connections_status_${uid}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  const [twitter, youtube, facebook, tiktok] = await Promise.all([
    getConn(uid, 'twitter'),
    getConn(uid, 'youtube'),
    getConn(uid, 'facebook'),
    getConn(uid, 'tiktok')
  ]);
  const summary = {
    twitter: { connected: twitter.connected, username: twitter.identity?.username },
    youtube: { connected: youtube.connected, channelTitle: youtube.channel?.snippet?.title },
    facebook: { connected: facebook.connected, pages: Array.isArray(facebook.pages) ? facebook.pages.map(p=>p.name).slice(0,3) : [] },
    tiktok: { connected: tiktok.connected, display_name: tiktok.display_name }
  };
  const payload = { ok: true, summary, raw: { twitter, youtube, facebook, tiktok } };
  setCache(cacheKey, payload, 7000);
  res.json(payload);
}));

module.exports = router;
