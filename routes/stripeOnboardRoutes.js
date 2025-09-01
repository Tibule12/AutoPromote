const express = require('express');
const supabase = require('../supabaseClient');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const authMiddleware = require('../authMiddleware');

// POST /api/withdrawals/onboard - Start Stripe Connect onboarding for user
router.post('/onboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    // Create or retrieve Stripe account for user
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, stripe_account_id')
      .eq('id', userId)
      .single();
    if (userError || !user) {
      return res.status(400).json({ error: 'User not found' });
    }
    let accountId = user.stripe_account_id;
    if (!accountId) {
      // Create Stripe Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } }
      });
      accountId = account.id;
      // Save to DB
      await supabase.from('users').update({ stripe_account_id: accountId }).eq('id', userId);
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
    res.status(500).json({ error: 'Stripe onboarding failed', details: error.message });
  }
});

module.exports = router;
