const express = require('express');
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');
const router = express.Router();

// Helper to fetch connection doc if exists
async function getConn(uid, name) {
  try {
    const snap = await db.collection('users').doc(uid).collection('connections').doc(name).get();
    if (!snap.exists) return { connected: false };
    const data = snap.data();
    return { connected: true, ...data };
  } catch (_) { return { connected: false }; }
}

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const [twitter, youtube, facebook, tiktok] = await Promise.all([
      getConn(req.userId, 'twitter'),
      getConn(req.userId, 'youtube'),
      getConn(req.userId, 'facebook'),
      getConn(req.userId, 'tiktok')
    ]);
    // Derive high-level summary fields
    const summary = {
      twitter: { connected: twitter.connected, username: twitter.identity?.username },
      youtube: { connected: youtube.connected, channelTitle: youtube.channel?.snippet?.title },
      facebook: { connected: facebook.connected, pages: Array.isArray(facebook.pages) ? facebook.pages.map(p=>p.name).slice(0,3) : [] },
      tiktok: { connected: tiktok.connected, display_name: tiktok.display_name }
    };
    res.json({ summary, raw: { twitter, youtube, facebook, tiktok } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
