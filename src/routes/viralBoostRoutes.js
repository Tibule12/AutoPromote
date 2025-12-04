// viralBoostRoutes.js
// Viral boost purchase system for community monetization

const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');
const { audit } = require('../services/auditLogger');
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const paypalClient = require('../paypalClient');
const paypal = require('@paypal/paypal-server-sdk');

// Apply rate limiting
const boostLimiter = rateLimiter({ 
  capacity: parseInt(process.env.RATE_LIMIT_BOOST || '100', 10), 
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), 
  windowHint: 'viral_boost' 
});

router.use(boostLimiter);

// Boost packages configuration
const BOOST_PACKAGES = {
  starter: {
    id: 'starter',
    name: 'Starter Boost',
    views: 1000,
    duration: 24, // hours
    price: 4.99,
    features: ['1K guaranteed views', '24h promotion', 'Trending tab placement']
  },
  growth: {
    id: 'growth',
    name: 'Growth Boost',
    views: 10000,
    duration: 48,
    price: 29.99,
    features: ['10K guaranteed views', '48h promotion', 'Featured placement', 'Analytics report']
  },
  viral: {
    id: 'viral',
    name: 'Viral Boost',
    views: 100000,
    duration: 168, // 7 days
    price: 249.99,
    features: ['100K guaranteed views', '7 days promotion', 'Homepage featured', 'Priority support', 'Detailed analytics']
  }
};

/**
 * GET /api/viral-boost/packages
 * Get available boost packages
 */
router.get('/packages', async (req, res) => {
  try {
    res.json({
      success: true,
      packages: Object.values(BOOST_PACKAGES)
    });
  } catch (error) {
    console.error('[ViralBoost] Get packages error:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

/**
 * POST /api/viral-boost/purchase
 * Purchase a viral boost
 */
router.post('/purchase', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { packageId, contentId } = req.body;

    if (!userId || !packageId || !contentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const boostPackage = BOOST_PACKAGES[packageId];
    if (!boostPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }

    // Check if content exists
    const contentDoc = await db.collection('community_posts').doc(contentId).get();
    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = contentDoc.data();
    if (content.userId !== userId) {
      return res.status(403).json({ error: 'Not your content' });
    }

    // Check subscription for free boost allowance
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const subscription = userData.subscriptionTier || 'free';

    // Calculate period start
    const periodStart = userData.subscriptionPeriodStart 
      ? new Date(userData.subscriptionPeriodStart) 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Check existing boosts this period
    const boostsSnap = await db.collection('viral_boosts')
      .where('userId', '==', userId)
      .where('createdAt', '>=', periodStart.toISOString())
      .get();

    const freeBoostsUsed = boostsSnap.docs.filter(doc => doc.data().paymentType === 'subscription').length;

    // Check if user has free boosts available
    const freeBoostLimits = {
      free: 0,
      premium: 1,
      pro: 5,
      enterprise: Infinity
    };

    const freeBoostsAvailable = (freeBoostLimits[subscription] || 0) - freeBoostsUsed;

    // If free boost available, use it
    if (freeBoostsAvailable > 0) {
      const boost = {
        userId,
        contentId,
        packageId,
        packageName: boostPackage.name,
        targetViews: boostPackage.views,
        duration: boostPackage.duration,
        status: 'active',
        paymentType: 'subscription',
        price: 0,
        currentViews: 0,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + boostPackage.duration * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };

      const boostRef = await db.collection('viral_boosts').add(boost);

      // Update content with boost flag
      await db.collection('community_posts').doc(contentId).update({
        boosted: true,
        boostId: boostRef.id,
        updatedAt: new Date().toISOString()
      });

      audit.log('viral_boost.activated_free', { userId, contentId, packageId });

      return res.json({
        success: true,
        boost: { id: boostRef.id, ...boost },
        paymentType: 'subscription',
        message: 'Free boost activated from your subscription'
      });
    }

    // Create PayPal order for paid boost
    const request = new paypal.orders.OrdersCreateRequest();
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: contentId,
        description: `${boostPackage.name} - ${boostPackage.views.toLocaleString()} views`,
        custom_id: userId,
        amount: {
          currency_code: 'USD',
          value: boostPackage.price.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: boostPackage.price.toFixed(2)
            }
          }
        },
        items: [{
          name: boostPackage.name,
          description: boostPackage.features.join(', '),
          unit_amount: {
            currency_code: 'USD',
            value: boostPackage.price.toFixed(2)
          },
          quantity: '1'
        }]
      }],
      application_context: {
        brand_name: 'AutoPromote',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL}/dashboard?boost=success&contentId=${contentId}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard?boost=cancelled`
      }
    });

    const client = paypalClient.client();
    const order = await client.execute(request);

    // Store boost intent
    await db.collection('boost_intents').doc(order.result.id).set({
      userId,
      contentId,
      packageId,
      paypalOrderId: order.result.id,
      amount: boostPackage.price,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    audit.log('viral_boost.order_created', { userId, contentId, orderId: order.result.id });

    // Get approval URL
    const approvalLink = order.result.links.find(link => link.rel === 'approve');

    res.json({
      success: true,
      orderId: order.result.id,
      approvalUrl: approvalLink?.href,
      amount: boostPackage.price
    });

  } catch (error) {
    console.error('[ViralBoost] Purchase error:', error);
    res.status(500).json({ error: 'Failed to create boost order' });
  }
});

/**
 * POST /api/viral-boost/activate
 * Activate boost after PayPal payment
 */
router.post('/activate', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { orderId } = req.body;

    if (!userId || !orderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get boost intent
    const intentDoc = await db.collection('boost_intents').doc(orderId).get();
    if (!intentDoc.exists) {
      return res.status(404).json({ error: 'Boost order not found' });
    }

    const intent = intentDoc.data();
    if (intent.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Capture PayPal payment
    const client = paypalClient.client();
    const captureRequest = new paypal.orders.OrdersCaptureRequest(orderId);
    const capture = await client.execute(captureRequest);

    if (capture.result.status !== 'COMPLETED') {
      return res.status(400).json({ 
        error: 'Payment not completed',
        status: capture.result.status
      });
    }

    const boostPackage = BOOST_PACKAGES[intent.packageId];

    // Create active boost
    const boost = {
      userId: intent.userId,
      contentId: intent.contentId,
      packageId: intent.packageId,
      packageName: boostPackage.name,
      targetViews: boostPackage.views,
      duration: boostPackage.duration,
      status: 'active',
      paymentType: 'paypal',
      paypalOrderId: orderId,
      paypalCaptureId: capture.result.id,
      price: intent.amount,
      currentViews: 0,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + boostPackage.duration * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    const boostRef = await db.collection('viral_boosts').add(boost);

    // Update content
    await db.collection('community_posts').doc(intent.contentId).update({
      boosted: true,
      boostId: boostRef.id,
      updatedAt: new Date().toISOString()
    });

    // Update intent
    await db.collection('boost_intents').doc(orderId).update({
      status: 'activated',
      boostId: boostRef.id,
      activatedAt: new Date().toISOString()
    });

    audit.log('viral_boost.activated_paid', { 
      userId, 
      contentId: intent.contentId, 
      packageId: intent.packageId,
      amount: intent.amount
    });

    res.json({
      success: true,
      boost: { id: boostRef.id, ...boost },
      message: `${boostPackage.name} activated successfully!`
    });

  } catch (error) {
    console.error('[ViralBoost] Activate error:', error);
    res.status(500).json({ error: 'Failed to activate boost' });
  }
});

/**
 * GET /api/viral-boost/active
 * Get user's active boosts
 */
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const snapshot = await db.collection('viral_boosts')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .get();

    const boosts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      boosts
    });

  } catch (error) {
    console.error('[ViralBoost] Get active boosts error:', error);
    res.status(500).json({ error: 'Failed to fetch active boosts' });
  }
});

/**
 * GET /api/viral-boost/stats/:contentId
 * Get boost stats for specific content
 */
router.get('/stats/:contentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.user?.uid;
    const { contentId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get boost
    const snapshot = await db.collection('viral_boosts')
      .where('contentId', '==', contentId)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No boost found for this content' });
    }

    const boost = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    // Get content stats
    const contentDoc = await db.collection('community_posts').doc(contentId).get();
    const content = contentDoc.data() || {};

    const stats = {
      boost,
      content: {
        views: content.viewsCount || 0,
        likes: content.likesCount || 0,
        comments: content.commentsCount || 0,
        shares: content.sharesCount || 0
      },
      progress: {
        viewsProgress: boost.targetViews > 0 
          ? Math.min((boost.currentViews / boost.targetViews) * 100, 100)
          : 0,
        timeProgress: boost.startedAt && boost.expiresAt
          ? Math.min(((Date.now() - new Date(boost.startedAt).getTime()) / 
             (new Date(boost.expiresAt).getTime() - new Date(boost.startedAt).getTime())) * 100, 100)
          : 0
      }
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[ViralBoost] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch boost stats' });
  }
});

module.exports = router;
