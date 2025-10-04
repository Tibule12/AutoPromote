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

// Raw body middleware for webhook verification
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    if (!stripe) return res.status(400).json({ ok:false, error: 'stripe_not_configured' });
    const sig = req.headers['stripe-signature'];
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      // Fallback: attempt parse without verification (not recommended for prod)
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    return res.status(400).json({ ok:false, error: 'invalid_signature', detail: err.message });
  }
  try {
    if (event?.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const uid = session.client_reference_id;
      const plan = session.metadata?.planTier || null;
      if (uid) {
        await db.collection('users').doc(uid).set({ plan: { tier: plan || 'pro', subscribedAt: new Date().toISOString(), stripeSession: session.id } }, { merge: true });
        try { const { recordUsage } = require('../services/usageLedgerService'); await recordUsage({ type: 'subscription_fee', userId: uid, amount: (session.amount_total||0)/100, currency: session.currency || 'usd', meta: { sessionId: session.id } }); } catch(_){ }
      }
    }
    if (event?.type === 'invoice.payment_succeeded') {
      const invoice = event.data?.object || {};
      const uid = invoice.subscription ? invoice.metadata?.userId : null;
      if (uid) {
        try { const { recordUsage } = require('../services/usageLedgerService'); await recordUsage({ type: 'subscription_fee', userId: uid, amount: (invoice.amount_paid||0)/100, currency: invoice.currency || 'usd', meta: { invoiceId: invoice.id } }); } catch(_){ }
      }
    }
    return res.json({ received: true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

module.exports = router;