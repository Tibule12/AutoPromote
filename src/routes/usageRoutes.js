// usageRoutes.js
// API endpoints for checking usage stats and limits

const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { getUserUsageStats } = require('../middlewares/usageLimitMiddleware');
const { db } = require('../firebaseAdmin');

/**
 * GET /api/usage/stats
 * Get current user's usage statistics
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await getUserUsageStats(userId);
    
    res.json({
      success: true,
      userId,
      stats: {
        ...stats,
        percentUsed: stats.limit === Infinity ? 0 : Math.round((stats.used / stats.limit) * 100),
        canUpload: stats.remaining > 0 || stats.isPaid,
        needsUpgrade: !stats.isPaid && stats.remaining === 0
      }
    });
  } catch (error) {
    console.error('[usageRoutes] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

/**
 * POST /api/usage/upgrade
 * Upgrade user to premium (placeholder for payment integration)
 */
router.post('/upgrade', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tier, paymentMethodId } = req.body;

    // Validate tier
    const validTiers = ['premium', 'pro'];
    if (!tier || !validTiers.includes(tier)) {
      return res.status(400).json({ 
        error: 'Invalid tier',
        message: 'Please select a valid subscription tier: premium or pro'
      });
    }

    // TODO: Integrate with Stripe or payment processor
    // For now, just update the user's subscription status
    
    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      subscriptionTier: tier,
      isPaid: true,
      unlimited: true,
      upgradedAt: new Date().toISOString(),
      paymentMethod: paymentMethodId ? 'stripe' : 'manual'
    }, { merge: true });

    // Log subscription event
    await db.collection('subscription_events').add({
      userId,
      type: 'upgrade',
      tier,
      timestamp: new Date().toISOString(),
      paymentMethodId: paymentMethodId || null
    });

    res.json({
      success: true,
      message: `Successfully upgraded to ${tier} tier`,
      subscription: {
        tier,
        unlimited: true,
        upgradedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[usageRoutes] Error upgrading:', error);
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

/**
 * GET /api/usage/pricing
 * Get pricing information
 */
router.get('/pricing', async (req, res) => {
  try {
    res.json({
      success: true,
      tiers: {
        free: {
          name: 'Free',
          price: 0,
          currency: 'USD',
          period: 'month',
          limits: {
            uploads: 10,
            promotions: 10,
            platforms: 'all',
            viralOptimization: true,
            analytics: 'basic'
          },
          features: [
            '10 content uploads per month',
            'Automatic promotion to all platforms',
            'AI-powered viral optimization',
            'Basic analytics',
            'Hashtag generation',
            'Optimal posting times'
          ]
        },
        premium: {
          name: 'Premium',
          price: 19.99,
          currency: 'USD',
          period: 'month',
          limits: {
            uploads: Infinity,
            promotions: Infinity,
            platforms: 'all',
            viralOptimization: true,
            analytics: 'advanced',
            priority: true
          },
          features: [
            'Unlimited content uploads',
            'Unlimited promotions',
            'Advanced analytics & insights',
            'Priority processing',
            'A/B testing',
            'Custom branding',
            'Email support'
          ],
          popular: true
        },
        pro: {
          name: 'Pro',
          price: 49.99,
          currency: 'USD',
          period: 'month',
          limits: {
            uploads: Infinity,
            promotions: Infinity,
            platforms: 'all',
            viralOptimization: true,
            analytics: 'enterprise',
            priority: 'highest',
            teamMembers: 5
          },
          features: [
            'Everything in Premium',
            'Team collaboration (5 members)',
            'White-label reporting',
            'API access',
            'Dedicated account manager',
            'Custom integrations',
            'Priority support'
          ]
        }
      }
    });
  } catch (error) {
    console.error('[usageRoutes] Error getting pricing:', error);
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

module.exports = router;
