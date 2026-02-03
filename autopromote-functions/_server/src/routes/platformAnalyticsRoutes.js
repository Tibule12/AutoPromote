const express = require('express');
const authMiddleware = require('../authMiddleware');
const { postToPinterest } = require('../services/pinterestService');
const { getPostStats: getLinkedInPostStats } = require('../services/linkedinService');
const { getPostInfo: getRedditPostInfo } = require('../services/redditService');
const { getPinInfo } = require('../services/pinterestService');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const analyticsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// LinkedIn post stats: provide shareId
router.get('/linkedin/post/:shareId/stats', authMiddleware, analyticsRateLimiter, async (req, res) => {
  try {
    const { shareId } = req.params;
    if (!shareId) return res.status(400).json({ ok: false, error: 'shareId_required' });
    const uid = req.userId || req.user?.uid;
    const stats = await getLinkedInPostStats({ uid, shareId });
    return res.json({ ok: true, stats });
  } catch (e) {
    console.error('/analytics/linkedin error', e && e.message);
    return res.status(500).json({ ok: false, error: 'linkedin_stats_failed', reason: e.message });
  }
});

// Reddit post info
router.get('/reddit/post/:postId', authMiddleware, analyticsRateLimiter, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId) return res.status(400).json({ ok: false, error: 'postId_required' });
    const uid = req.userId || req.user?.uid;
    const info = await getRedditPostInfo({ uid, postId });
    return res.json({ ok: true, info });
  } catch (e) {
    console.error('/analytics/reddit error', e && e.message);
    return res.status(500).json({ ok: false, error: 'reddit_post_info_failed', reason: e.message });
  }
});

// Pinterest pin info
router.get('/pinterest/pin/:pinId', authMiddleware, analyticsRateLimiter, async (req, res) => {
  try {
    const { pinId } = req.params;
    if (!pinId) return res.status(400).json({ ok: false, error: 'pinId_required' });
    const uid = req.userId || req.user?.uid;
    const info = await getPinInfo({ uid, pinId });
    return res.json({ ok: true, info });
  } catch (e) {
    console.error('/analytics/pinterest error', e && e.message);
    return res.status(500).json({ ok: false, error: 'pinterest_pin_info_failed', reason: e.message });
  }
});

module.exports = router;
