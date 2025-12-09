// viralGrowthRoutes.js
// AutoPromote Viral Growth API Routes
// Additional endpoints for viral optimization and growth tracking

const express = require('express');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const authMiddleware = require('../authMiddleware');
const rateLimit = require('../middlewares/simpleRateLimit');
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const codeqlLimiter = require('../middlewares/codeqlRateLimit');

const viralPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_VIRAL_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'viral_public' });
const viralWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_VIRAL_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'viral_writes' });

// Import viral engines
const hashtagEngine = require('../services/hashtagEngine');
const smartDistributionEngine = require('../services/smartDistributionEngine');
const boostChainEngine = require('../services/boostChainEngine');
const viralImpactEngine = require('../services/viralImpactEngine');
const algorithmExploitationEngine = require('../services/algorithmExploitationEngine');

// Helper function to clean objects
function cleanObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

// Apply CodeQL-detectable write limiter at router level
router.use(codeqlLimiter.writes);

// POST /api/viral/generate-hashtags - Generate custom hashtags for content
router.post('/generate-hashtags', authMiddleware, viralWriteLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content, platform, customTags, growthGuarantee } = req.body;

    if (!content || !content.title) {
      return res.status(400).json({ error: 'Content with title required' });
    }

    const hashtagOptimization = await hashtagEngine.generateCustomHashtags({
      content,
      platform: platform || 'tiktok',
      customTags: customTags || [],
      growthGuarantee: growthGuarantee !== false
    });

    // Track hashtag generation
    await db.collection('hashtag_generations').add(cleanObject({
      userId,
      contentId: content.id,
      platform,
      hashtags: hashtagOptimization.hashtags,
      generatedAt: new Date().toISOString()
    }));

    res.json({
      success: true,
      hashtags: hashtagOptimization,
      platform,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[VIRAL] Hashtag generation error:', error);
    res.status(500).json({ error: 'Failed to generate hashtags', details: error.message });
  }
});

// POST /api/viral/optimize-content - Full viral optimization for content
router.post('/optimize-content', authMiddleware, viralWriteLimiter, rateLimit({ max: 5, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content, platforms, options } = req.body;

    if (!content || !platforms || !Array.isArray(platforms)) {
      return res.status(400).json({ error: 'Content and platforms array required' });
    }

    console.log('🔥 [VIRAL] Running full content optimization...');

    // Generate hashtags
    const hashtagOptimization = await hashtagEngine.generateCustomHashtags({
      content,
      platform: platforms[0],
      customTags: options?.customTags || [],
      growthGuarantee: options?.growthGuarantee !== false
    });

    // Create distribution strategy
    const distributionStrategy = await smartDistributionEngine.generateDistributionStrategy(
      content,
      platforms,
      { timezone: options?.timezone || 'UTC', growthGuarantee: options?.growthGuarantee !== false }
    );

    // Apply algorithm exploitation
    const algorithmOptimization = algorithmExploitationEngine.optimizeForAlgorithm(
      content,
      platforms[0]
    );

    // Generate viral preview
    const viralPreview = {
      original: {
        title: content.title,
        description: content.description,
        hashtags: []
      },
      optimized: {
        title: algorithmOptimization.hook ? `${algorithmOptimization.hook} - ${content.title}` : content.title,
        description: distributionStrategy.platforms?.[0]?.caption?.caption || content.description,
        hashtags: hashtagOptimization.hashtags
      },
      improvements: {
        hook_added: !!algorithmOptimization.hook,
        hashtags_added: hashtagOptimization.hashtags.length,
        caption_optimized: !!distributionStrategy.platforms?.[0]?.caption?.caption,
        peak_time_scheduled: !!distributionStrategy.platforms?.[0]?.timing?.optimalTime
      }
    };

    // Save optimization session
    const optimizationRef = await db.collection('content_optimizations').add(cleanObject({
      userId,
      contentId: content.id,
      platforms,
      hashtagOptimization,
      distributionStrategy,
      algorithmOptimization,
      viralPreview,
      optimizedAt: new Date().toISOString()
    }));

    res.json({
      success: true,
      optimizationId: optimizationRef.id,
      content: viralPreview,
      metrics: {
        optimization_score: algorithmOptimization.optimizationScore,
        hashtag_count: hashtagOptimization.hashtags.length,
        platforms_optimized: platforms.length,
        peak_time_score: distributionStrategy.platforms?.[0]?.timing?.score || 0
      },
      recommendations: algorithmOptimization.recommendations || [],
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[VIRAL] Content optimization error:', error);
    res.status(500).json({ error: 'Failed to optimize content', details: error.message });
  }
});

// POST /api/viral/create-boost-chain - Create viral boost chain
router.post('/create-boost-chain', authMiddleware, viralWriteLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentId, platforms, squadUserIds } = req.body;

    if (!contentId) {
      return res.status(400).json({ error: 'Content ID required' });
    }

    // Get content
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Create boost chain
    const boostChain = await viralImpactEngine.orchestrateBoostChain(
      content,
      platforms || ['tiktok'],
      { userId, squadUserIds: squadUserIds || [] }
    );

    res.json({
      success: true,
      boostChain,
      message: `Boost chain created with ${boostChain.squadSize} members`,
      viral_potential: boostChain.squadSize * 1000 // Estimated reach
    });
  } catch (error) {
    console.error('[VIRAL] Boost chain creation error:', error);
    res.status(500).json({ error: 'Failed to create boost chain', details: error.message });
  }
});

// GET /api/viral/viral-velocity/:contentId - Get viral velocity for content
router.get('/viral-velocity/:contentId', authMiddleware, viralPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contentId = req.params.contentId;

    // Get content
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (!contentDoc.exists || contentDoc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Get current metrics (mock for now - integrate with real analytics)
    const crypto = require('crypto');
    const currentMetrics = {
      views: content.views || crypto.randomInt(0, 10000),
      engagements: content.engagements || crypto.randomInt(0, 1000),
      shares: content.shares || crypto.randomInt(0, 100)
    };

    // Calculate viral velocity
    const viralVelocity = viralImpactEngine.calculateViralVelocity(content, currentMetrics);

    // Update content with latest velocity
    await db.collection('content').doc(contentId).update({
      viral_velocity: viralVelocity,
      last_velocity_check: new Date().toISOString()
    });

    res.json({
      success: true,
      contentId,
      viralVelocity,
      currentMetrics,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[VIRAL] Viral velocity check error:', error);
    res.status(500).json({ error: 'Failed to check viral velocity', details: error.message });
  }
});

// GET /api/viral/growth-report/:contentId - Generate growth report
router.get('/growth-report/:contentId', authMiddleware, viralPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contentId = req.params.contentId;

    // Get content with viral optimization data
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (!contentDoc.exists || contentDoc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Generate growth report
    const growthReport = {
      contentId,
      title: content.title,
      createdAt: content.created_at,
      viralOptimization: content.viral_optimization,
      currentMetrics: {
        views: content.views || 0,
        engagements: content.engagements || 0,
        viral_velocity: content.viral_velocity,
        growth_guarantee_badge: content.growth_guarantee_badge
      },
      performance: {
        optimization_score: content.viral_optimization?.algorithm?.optimizationScore || 0,
        hashtag_performance: content.viral_optimization?.hashtags?.hashtags?.length || 0,
        boost_chain_active: !!content.viral_optimization?.boost_chain?.chainId,
        seeding_success: content.viral_optimization?.seeding?.success || false
      },
      recommendations: [
        {
          type: 'engagement',
          message: 'Monitor engagement in first 24 hours for viral potential',
          priority: 'high'
        },
        {
          type: 'boost_chain',
          message: 'Share with growth squad members for amplified reach',
          priority: 'medium'
        },
        {
          type: 'analytics',
          message: 'Track viral velocity daily to optimize future content',
          priority: 'low'
        }
      ],
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      growthReport
    });
  } catch (error) {
    console.error('[VIRAL] Growth report generation error:', error);
    res.status(500).json({ error: 'Failed to generate growth report', details: error.message });
  }
});

// POST /api/viral/track-repost - Track manual repost for growth tracking
router.post('/track-repost', authMiddleware, viralWriteLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentId, platform, repostUrl, repostType } = req.body;

    if (!contentId || !platform) {
      return res.status(400).json({ error: 'Content ID and platform required' });
    }

    // Record repost
    const repostRef = await db.collection('manual_reposts').add(cleanObject({
      userId,
      contentId,
      platform,
      repostUrl,
      repostType: repostType || 'manual',
      trackedAt: new Date().toISOString(),
      status: 'pending_verification'
    }));

    // Update boost chain if exists
    const boostChainQuery = await db.collection('boost_chains')
      .where('contentId', '==', contentId)
      .limit(1)
      .get();

    if (!boostChainQuery.empty) {
      const boostChainDoc = boostChainQuery.docs[0];
      const boostChain = { id: boostChainDoc.id, ...boostChainDoc.data() };

      // Add repost event to boost chain
      const updatedChain = boostChainEngine.addBoostChainEvent(boostChain, userId, 'manual_repost', {
        platform,
        repostUrl,
        repostType
      });

      await db.collection('boost_chains').doc(boostChainDoc.id).update({
        chainEvents: updatedChain.chainEvents,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      repostId: repostRef.id,
      message: 'Repost tracked successfully',
      boost_chain_updated: !boostChainQuery.empty
    });
  } catch (error) {
    console.error('[VIRAL] Repost tracking error:', error);
    res.status(500).json({ error: 'Failed to track repost', details: error.message });
  }
});

// GET /api/viral/trending-sounds/:platform - Get trending sounds for platform
router.get('/trending-sounds/:platform', authMiddleware, viralPublicLimiter, async (req, res) => {
  try {
    const platform = req.params.platform;
    const category = req.query.category || 'general';

    const trendingSounds = algorithmExploitationEngine.matchTrendingSound(
      { category },
      platform
    );

    res.json({
      success: true,
      platform,
      category,
      trendingSounds: [trendingSounds], // Return as array for consistency
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[VIRAL] Trending sounds fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch trending sounds', details: error.message });
  }
});

// POST /api/viral/ab-test - Create A/B test for content variations
router.post('/ab-test', authMiddleware, viralWriteLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentId, variations, platform, testDuration } = req.body;

    if (!contentId || !variations || !Array.isArray(variations)) {
      return res.status(400).json({ error: 'Content ID and variations array required' });
    }

    // Create A/B test
    const abTestRef = await db.collection('ab_tests').add(cleanObject({
      userId,
      contentId,
      platform: platform || 'tiktok',
      variations,
      testDuration: testDuration || 24, // hours
      status: 'active',
      createdAt: new Date().toISOString(),
      results: {
        variation_a: { views: 0, engagements: 0 },
        variation_b: { views: 0, engagements: 0 }
      }
    }));

    res.json({
      success: true,
      abTestId: abTestRef.id,
      message: `A/B test created with ${variations.length} variations`,
      testDuration: testDuration || 24,
      platform: platform || 'tiktok'
    });
  } catch (error) {
    console.error('[VIRAL] A/B test creation error:', error);
    res.status(500).json({ error: 'Failed to create A/B test', details: error.message });
  }
});

// GET /api/viral/referral-stats - Get user's referral and viral growth stats
router.get('/referral-stats', authMiddleware, viralPublicLimiter, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's boost chains
    const boostChainsQuery = await db.collection('boost_chains')
      .where('initiatorId', '==', userId)
      .get();

    const boostChains = [];
    boostChainsQuery.forEach(doc => {
      boostChains.push({ id: doc.id, ...doc.data() });
    });

    // Calculate viral stats
    const totalChains = boostChains.length;
    const totalMembers = boostChains.reduce((sum, chain) => sum + (chain.squadUserIds?.length || 0), 0);
    const activeChains = boostChains.filter(chain => chain.status === 'active').length;

    // Get user's content viral performance
    const userContentQuery = await db.collection('content')
      .where('user_id', '==', userId)
      .get();

    let totalViralViews = 0;
    let totalViralEngagements = 0;
    let viralContentCount = 0;

    userContentQuery.forEach(doc => {
      const content = doc.data();
      if (content.viral_optimized) {
        totalViralViews += content.views || 0;
        totalViralEngagements += content.engagements || 0;
        viralContentCount++;
      }
    });

    res.json({
      success: true,
      userId,
      viralStats: {
        boost_chains: {
          total: totalChains,
          active: activeChains,
          total_members: totalMembers
        },
        content_performance: {
          viral_content_count: viralContentCount,
          total_viral_views: totalViralViews,
          total_viral_engagements: totalViralEngagements,
          avg_views_per_content: viralContentCount > 0 ? Math.round(totalViralViews / viralContentCount) : 0
        },
        viral_score: Math.min(100, Math.round((totalMembers * 10) + (viralContentCount * 5))),
        growth_multiplier: Math.max(1, Math.round(totalMembers / 10) + 1)
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[VIRAL] Referral stats error:', error);
    res.status(500).json({ error: 'Failed to get referral stats', details: error.message });
  }
});

// POST /api/viral/join-growth-squad - Join or create growth squad
router.post('/join-growth-squad', authMiddleware, viralWriteLimiter, rateLimit({ max: 5, windowMs: 60000, key: r => r.userId || r.ip }), async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { squadId, contentId } = req.body;

    if (squadId) {
      // Join existing squad
      const squadDoc = await db.collection('growth_squads').doc(squadId).get();
      if (!squadDoc.exists) {
        return res.status(404).json({ error: 'Growth squad not found' });
      }

      const squad = squadDoc.data();
      if (!squad.userIds.includes(userId)) {
        squad.userIds.push(userId);
        await db.collection('growth_squads').doc(squadId).update({
          userIds: squad.userIds,
          updatedAt: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        action: 'joined',
        squadId,
        message: 'Successfully joined growth squad'
      });
    } else if (contentId) {
      // Create new squad for content
      const squadRef = await db.collection('growth_squads').add(cleanObject({
        contentId,
        userIds: [userId],
        createdBy: userId,
        createdAt: new Date().toISOString(),
        status: 'active'
      }));

      res.json({
        success: true,
        action: 'created',
        squadId: squadRef.id,
        message: 'Growth squad created for content'
      });
    } else {
      return res.status(400).json({ error: 'Either squadId or contentId required' });
    }
  } catch (error) {
    console.error('[VIRAL] Growth squad join error:', error);
    res.status(500).json({ error: 'Failed to join growth squad', details: error.message });
  }
});

module.exports = router;
