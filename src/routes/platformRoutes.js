const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { SUPPORTED_PLATFORMS } = require('../validationMiddleware');
const { db } = require('../firebaseAdmin');

function normalize(name){ return String(name||'').toLowerCase(); }

// GET /api/:platform/status
router.get('/:platform/status', authMiddleware, async (req, res) => {
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

// GET /api/:platform/auth/start
router.get('/:platform/auth/start', async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).json({ ok: false, error: 'unsupported_platform' });
  // Placeholder: return a client-side redirect URL or an OAuth start url when implemented.
  // For now, return a lightweight JSON payload the frontend can use to open a popup.
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/${platform}/auth/callback`;
  return res.json({ ok: true, platform, url: callbackUrl, note: 'placeholder_auth_start' });
});

// GET /api/:platform/auth/callback
router.get('/:platform/auth/callback', async (req, res) => {
  const platform = normalize(req.params.platform);
  if (!SUPPORTED_PLATFORMS.includes(platform)) return res.status(404).send('Unsupported platform');
  // Placeholder callback handler. Real implementations should exchange codes/tokens
  // and persist user connection metadata in users/{uid}/connections/{platform}.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send('Callback placeholder - implement OAuth exchange for ' + platform);
});

module.exports = router;
