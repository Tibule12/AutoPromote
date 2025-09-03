const express = require('express');
const { db } = require('../firebaseAdmin');

// Initialize Stripe only if key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found. Stripe Connect features will be disabled.');
}

const router = express.Router();
const authMiddleware = require('../authMiddleware');

// POST /api/withdrawals/onboard - Start Stripe Connect onboarding for user
router.post('/onboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    // Create or retrieve Stripe account for user
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let accountId = userData.stripeAccountId;
    
    if (!accountId) {
      // Create Stripe Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        email: userData.email,
        capabilities: { transfers: { requested: true } }
      });
      accountId = account.id;
      
      // Save to Firestore
      await userRef.update({ 
        stripeAccountId: accountId,
        updatedAt: new Date().toISOString()
      });
    }
    
    // Create Stripe onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: process.env.STRIPE_ONBOARD_REFRESH_URL,
      return_url: process.env.STRIPE_ONBOARD_RETURN_URL,
      type: 'account_onboarding',
    });
    
    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Stripe onboarding failed:', error);
    res.status(500).json({ error: 'Stripe onboarding failed', details: error.message });
  }
});

module.exports = router;
