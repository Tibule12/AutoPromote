// repostRoutes.js
// API routes for repost-driven promotion features

const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const repostDrivenEngine = require('../services/repostDrivenEngine');

// POST /track - Track manual repost with markers
router.post('/track', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId, platform, repostUrl, markers } = req.body;

    if (!contentId || !platform || !repostUrl) {
      return res.status(400).json({ error: 'ContentId, platform, and repostUrl are required' });
    }

    const tracking = await repostDrivenEngine.trackManualRepost(contentId, {
      platform,
      repostUrl,
      userId,
      markers
    });

    res.json({
      success: true,
      tracking,
      trackedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error tracking repost:', error);
    res.status(500).json({ error: 'Failed to track repost' });
  }
});

// GET /performance/:contentId - Get repost performance summary
router.get('/performance/:contentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId } = req.params;

    const summary = await repostDrivenEngine.getRepostPerformanceSummary(contentId);

    res.json({
      success: true,
      summary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting repost performance:', error);
    res.status(500).json({ error: 'Failed to get repost performance' });
  }
});

// GET /timing/:contentId/:platform - Suggest optimal repost timing
router.get('/timing/:contentId/:platform', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId, platform } = req.params;

    const suggestions = await repostDrivenEngine.suggestRepostTiming(
      contentId,
      platform
    );

    res.json({
      success: true,
      suggestions,
      contentId,
      platform,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error suggesting repost timing:', error);
    res.status(500).json({ error: 'Failed to suggest repost timing' });
  }
});

// POST /scrape/:repostId - Manually trigger metric scraping
router.post('/scrape/:repostId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { repostId } = req.params;

    // Get repost data
    const { db } = require('../firebaseAdmin');
    const repostDoc = await db.collection('manual_reposts').doc(repostId).get();

    if (!repostDoc.exists) {
      return res.status(404).json({ error: 'Repost not found' });
    }

    const repost = repostDoc.data();

    // Trigger scraping
    await repostDrivenEngine.scrapeRepostMetrics(
      repostId,
      repost.platform,
      repost.repostUrl
    );

    // Get updated metrics
    const updatedRepostDoc = await db.collection('manual_reposts').doc(repostId).get();
    const updatedRepost = updatedRepostDoc.data();

    res.json({
      success: true,
      repostId,
      metrics: updatedRepost.metrics,
      lastScraped: updatedRepost.lastScraped,
      scrapedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error scraping repost metrics:', error);
    res.status(500).json({ error: 'Failed to scrape repost metrics' });
  }
});

// POST /actions/trigger/:contentId - Trigger growth actions based on performance
router.post('/actions/trigger/:contentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId } = req.params;
    const { repostMetrics } = req.body;

    if (!repostMetrics) {
      return res.status(400).json({ error: 'Repost metrics are required' });
    }

    const actions = await repostDrivenEngine.triggerGrowthActions(
      contentId,
      repostMetrics
    );

    res.json({
      success: true,
      actions,
      triggeredAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering growth actions:', error);
    res.status(500).json({ error: 'Failed to trigger growth actions' });
  }
});

// GET /fingerprint/:contentId - Get content fingerprint for tracking
router.get('/fingerprint/:contentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId } = req.params;

    const fingerprint = repostDrivenEngine.generateContentFingerprint(contentId);

    res.json({
      success: true,
      contentId,
      fingerprint,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating fingerprint:', error);
    res.status(500).json({ error: 'Failed to generate fingerprint' });
  }
});

// POST /markers/generate/:contentId/:platform - Generate tracking markers
router.post('/markers/generate/:contentId/:platform', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId, platform } = req.params;

    const markers = repostDrivenEngine.generateTrackingMarkers(contentId, platform);

    res.json({
      success: true,
      contentId,
      platform,
      markers,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating tracking markers:', error);
    res.status(500).json({ error: 'Failed to generate tracking markers' });
  }
});

module.exports = router;
