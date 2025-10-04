const express = require('express');
const authMiddleware = require('../authMiddleware');
const { db } = require('../firebaseAdmin');
let stripe = null; try { if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(_){}

const router = express.Router();

// Create a checkout session for a plan
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ ok:false, error: 'stripe_not_configured' });
    const { priceId, successUrl, cancelUrl } = req.body || {};
    if (!priceId) return res.status(400).json({ ok:false, error: 'priceId required' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || process.env.STRIPE_SUCCESS_URL,
      cancel_url: cancelUrl || process.env.STRIPE_CANCEL_URL,
      client_reference_id: req.userId,
      metadata: { userId: req.userId }
    });
    return res.json({ ok: true, url: session.url });
  } catch (e) { return res.status(500).json({ ok:false, error: e.message }); }
});

// Webhook (placeholder – just logs event; secure with raw body parser in production)
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body; // Not verifying signature here (TODO in production)
    if (event?.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const uid = session.client_reference_id;
      const plan = session.display_items?.[0]?.plan?.id || session.metadata?.planId || null;
      if (uid) {
        await db.collection('users').doc(uid).set({ plan: { tier: plan || 'pro', subscribedAt: new Date().toISOString(), stripeSession: session.id } }, { merge: true });
        try { const { recordUsage } = require('../services/usageLedgerService'); await recordUsage({ type: 'subscription_fee', userId: uid, amount: session.amount_total/100, currency: session.currency || 'usd', meta: { sessionId: session.id } }); } catch(_){ }
      }
    }
    return res.json({ received: true });
  } catch (e) { return res.status(500).json({ ok:false, error: e.message }); }
});

module.exports = router;