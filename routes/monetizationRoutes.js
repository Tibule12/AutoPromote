const express = require('express');
const { db } = require('../firebaseAdmin');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const monetizationService = require('../monetizationService');

// POST /api/monetization/subscribe - Create user subscription
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { planType } = req.body;
    const userId = req.user.uid;

    const subscription = await monetizationService.createSubscription(userId, planType);

    res.json({
      message: 'Subscription created successfully',
      subscription,
      clientSecret: subscription.clientSecret
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription', details: error.message });
  }
});

// GET /api/monetization/subscription - Get user subscription details
router.get('/subscription', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Get subscription details
    const subscriptionSnapshot = await db.collection('subscriptions')
      .where('userId', '==', userId)
      .where('status', 'in', ['active', 'trialing'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    let subscription = null;
    if (!subscriptionSnapshot.empty) {
      const doc = subscriptionSnapshot.docs[0];
      subscription = { id: doc.id, ...doc.data() };
    }

    res.json({
      subscriptionPlan: userData.subscriptionPlan || 'free',
      subscriptionStatus: userData.subscriptionStatus || 'inactive',
      subscription
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Failed to get subscription details' });
  }
});

// POST /api/monetization/process-transaction - Process promotion transaction
router.post('/process-transaction', authMiddleware, async (req, res) => {
  try {
    const { contentId, amount, type } = req.body;
    const userId = req.user.uid;

    const transaction = await monetizationService.processTransaction(contentId, amount, userId, type);

    res.json({
      message: 'Transaction processed successfully',
      transaction
    });
  } catch (error) {
    console.error('Error processing transaction:', error);
    res.status(500).json({ error: 'Failed to process transaction' });
  }
});

// POST /api/monetization/ad-revenue - Process advertisement revenue
router.post('/ad-revenue', authMiddleware, async (req, res) => {
  try {
    const { contentId, adRevenue, advertiserId } = req.body;

    const result = await monetizationService.processAdRevenue(contentId, adRevenue, advertiserId);

    res.json({
      message: 'Ad revenue processed successfully',
      result
    });
  } catch (error) {
    console.error('Error processing ad revenue:', error);
    res.status(500).json({ error: 'Failed to process ad revenue' });
  }
});

// POST /api/monetization/sponsorship - Process sponsorship revenue
router.post('/sponsorship', authMiddleware, async (req, res) => {
  try {
    const { contentId, sponsorshipAmount, sponsorId } = req.body;

    const result = await monetizationService.processSponsorship(contentId, sponsorshipAmount, sponsorId);

    res.json({
      message: 'Sponsorship processed successfully',
      result
    });
  } catch (error) {
    console.error('Error processing sponsorship:', error);
    res.status(500).json({ error: 'Failed to process sponsorship' });
  }
});

// GET /api/monetization/earnings - Get user earnings and balance
router.get('/earnings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const earnings = await monetizationService.getUserEarnings(userId);

    res.json(earnings);
  } catch (error) {
    console.error('Error getting earnings:', error);
    res.status(500).json({ error: 'Failed to get earnings data' });
  }
});

// GET /api/monetization/revenue-analytics - Get platform revenue analytics (Admin only)
router.get('/revenue-analytics', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin role check
    const { timeframe = 'month' } = req.query;

    const analytics = await monetizationService.getRevenueAnalytics(timeframe);

    res.json(analytics);
  } catch (error) {
    console.error('Error getting revenue analytics:', error);
    res.status(500).json({ error: 'Failed to get revenue analytics' });
  }
});

// GET /api/monetization/transactions - Get user transaction history
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 50, offset = 0 } = req.query;

    const transactionsSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get();

    const transactions = [];
    transactionsSnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });

    res.json({ transactions });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// POST /api/monetization/webhook/stripe - Stripe webhook handler
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook:', error);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

// Helper functions for webhook handling
async function handlePaymentSucceeded(invoice) {
  try {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;

    // Find user by customer ID
    const userSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customerId)
      .get();

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;

      // Update subscription status
      await db.collection('subscriptions').doc(subscriptionId).update({
        status: 'active',
        lastPaymentDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update user subscription status
      await db.collection('users').doc(userId).update({
        subscriptionStatus: 'active',
        updatedAt: new Date().toISOString()
      });

      console.log(`Subscription ${subscriptionId} payment succeeded for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  try {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;

    // Find user by customer ID
    const userSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customerId)
      .get();

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;

      // Update subscription status
      await db.collection('subscriptions').doc(subscriptionId).update({
        status: 'past_due',
        updatedAt: new Date().toISOString()
      });

      // Update user subscription status
      await db.collection('users').doc(userId).update({
        subscriptionStatus: 'past_due',
        updatedAt: new Date().toISOString()
      });

      console.log(`Subscription ${subscriptionId} payment failed for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

async function handleSubscriptionCancelled(subscription) {
  try {
    const customerId = subscription.customer;

    // Find user by customer ID
    const userSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customerId)
      .get();

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;

      // Update subscription status
      await db.collection('subscriptions').doc(subscription.id).update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update user subscription status
      await db.collection('users').doc(userId).update({
        subscriptionStatus: 'cancelled',
        subscriptionPlan: 'free',
        updatedAt: new Date().toISOString()
      });

      console.log(`Subscription ${subscription.id} cancelled for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription cancelled:', error);
  }
}

module.exports = router;
