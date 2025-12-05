// captionRoutes.js
// API routes for AI caption generation

const express = require('express');
const router = express.Router();
const captionService = require('../services/captionGenerationService');
const hashtagService = require('../services/hashtagService');
const { authMiddleware } = require('../authMiddleware');
const rateLimit = require('express-rate-limit');

// Rate limiters
const captionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 min (Premium users)
  message: { error: 'Too many caption generation requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const freeTierLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour (Free users)
  message: { error: 'Free tier limit reached. Upgrade to Premium for unlimited captions.' },
  keyGenerator: (req) => req.user?.uid || req.ip
});

// Middleware to check user plan
const checkPlanLimits = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user's plan from Firestore
    const { db } = require('../firebaseAdmin');
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    
    const plan = userData?.subscription?.plan || 'free';
    
    // Apply appropriate rate limit
    if (plan === 'free') {
      return freeTierLimiter(req, res, next);
    } else {
      return next(); // Premium/Unlimited users skip free tier limit
    }
    
  } catch (error) {
    console.error('[CaptionRoutes] Error checking plan:', error);
    return next(); // Allow request on error
  }
};

/**
 * POST /api/captions/generate
 * Generate AI caption for content
 */
router.post('/generate', authMiddleware, captionLimiter, checkPlanLimits, async (req, res) => {
  try {
    const {
      contentData,
      platform = 'instagram',
      options = {}
    } = req.body;

    // Validate input
    if (!contentData || !contentData.title) {
      return res.status(400).json({
        error: 'Content data with title is required'
      });
    }

    // Generate caption
    const result = await captionService.generateCaption(contentData, platform, options);

    // Log usage
    const { db } = require('../firebaseAdmin');
    await db.collection('ai_usage_logs').add({
      userId: req.user.uid,
      type: 'caption_generation',
      platform,
      timestamp: new Date().toISOString(),
      success: result.success
    });

    res.json(result);

  } catch (error) {
    console.error('[CaptionRoutes] Generate error:', error);
    res.status(500).json({
      error: 'Failed to generate caption',
      message: error.message
    });
  }
});

/**
 * POST /api/captions/variations
 * Generate multiple caption variations for A/B testing
 */
router.post('/variations', authMiddleware, captionLimiter, checkPlanLimits, async (req, res) => {
  try {
    const {
      contentData,
      platform = 'instagram',
      count = 3,
      options = {}
    } = req.body;

    if (!contentData || !contentData.title) {
      return res.status(400).json({
        error: 'Content data with title is required'
      });
    }

    if (count > 5) {
      return res.status(400).json({
        error: 'Maximum 5 variations allowed'
      });
    }

    const result = await captionService.generateVariations(contentData, platform, count, options);

    // Log usage
    const { db } = require('../firebaseAdmin');
    await db.collection('ai_usage_logs').add({
      userId: req.user.uid,
      type: 'caption_variations',
      platform,
      count,
      timestamp: new Date().toISOString()
    });

    res.json(result);

  } catch (error) {
    console.error('[CaptionRoutes] Variations error:', error);
    res.status(500).json({
      error: 'Failed to generate caption variations',
      message: error.message
    });
  }
});

/**
 * POST /api/captions/hashtags
 * Generate optimized hashtags
 */
router.post('/hashtags', authMiddleware, captionLimiter, checkPlanLimits, async (req, res) => {
  try {
    const {
      contentData,
      platform = 'instagram',
      options = {}
    } = req.body;

    if (!contentData) {
      return res.status(400).json({
        error: 'Content data is required'
      });
    }

    const result = await hashtagService.generateHashtags(contentData, platform, options);

    // Log usage
    const { db } = require('../firebaseAdmin');
    await db.collection('ai_usage_logs').add({
      userId: req.user.uid,
      type: 'hashtag_generation',
      platform,
      timestamp: new Date().toISOString()
    });

    res.json(result);

  } catch (error) {
    console.error('[CaptionRoutes] Hashtag error:', error);
    res.status(500).json({
      error: 'Failed to generate hashtags',
      message: error.message
    });
  }
});

/**
 * GET /api/captions/trending/:platform
 * Get trending hashtags for platform
 */
router.get('/trending/:platform', authMiddleware, async (req, res) => {
  try {
    const { platform } = req.params;
    const count = parseInt(req.query.count) || 20;

    const result = await hashtagService.getTrendingHashtags(platform, count);

    res.json(result);

  } catch (error) {
    console.error('[CaptionRoutes] Trending error:', error);
    res.status(500).json({
      error: 'Failed to get trending hashtags',
      message: error.message
    });
  }
});

/**
 * POST /api/captions/complete
 * Generate caption + hashtags in one request
 */
router.post('/complete', authMiddleware, captionLimiter, checkPlanLimits, async (req, res) => {
  try {
    const {
      contentData,
      platform = 'instagram',
      captionOptions = {},
      hashtagOptions = {}
    } = req.body;

    if (!contentData || !contentData.title) {
      return res.status(400).json({
        error: 'Content data with title is required'
      });
    }

    // Generate both caption and hashtags
    const [caption, hashtags] = await Promise.all([
      captionService.generateCaption(contentData, platform, {
        ...captionOptions,
        includeHashtags: false // We'll add them separately
      }),
      hashtagService.generateHashtags(contentData, platform, hashtagOptions)
    ]);

    // Combine results
    const complete = {
      success: caption.success && hashtags.success,
      platform,
      caption: caption.caption,
      hashtags: hashtags.hashtags,
      formatted: `${caption.caption}\n\n${hashtags.formatted}`,
      metadata: {
        captionLength: caption.characterCount,
        hashtagCount: hashtags.count,
        estimatedEngagement: caption.estimatedEngagement,
        estimatedReach: hashtags.estimatedReach,
        generatedAt: new Date().toISOString()
      }
    };

    // Log usage
    const { db } = require('../firebaseAdmin');
    await db.collection('ai_usage_logs').add({
      userId: req.user.uid,
      type: 'complete_caption',
      platform,
      timestamp: new Date().toISOString()
    });

    res.json(complete);

  } catch (error) {
    console.error('[CaptionRoutes] Complete error:', error);
    res.status(500).json({
      error: 'Failed to generate complete caption',
      message: error.message
    });
  }
});

/**
 * GET /api/captions/status
 * Check if AI caption service is available
 */
router.get('/status', async (req, res) => {
  try {
    const openaiConfigured = !!process.env.OPENAI_API_KEY;
    
    res.json({
      available: openaiConfigured,
      service: 'OpenAI GPT-4o',
      features: {
        caption_generation: openaiConfigured,
        hashtag_generation: openaiConfigured,
        variations: openaiConfigured,
        trending: openaiConfigured
      },
      fallback: true,
      message: openaiConfigured 
        ? 'AI caption service is operational' 
        : 'Operating in fallback mode (basic generation)'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to check service status',
      message: error.message
    });
  }
});

module.exports = router;
