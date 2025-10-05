const express = require('express');
const router = express.Router();
const { audit } = require('../services/auditLogger');
const { db } = require('../firebaseAdmin');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e){ /* ignore */ }
}

// We need raw body for Stripe signature verification
function rawBodySaver(req, _res, buf) { req.rawBody = buf; }

router.post('/webhook', express.json({ limit:'2mb', verify: rawBodySaver }), async (req,res) => {
  if (!stripe) return res.status(500).json({ ok:false, error:'stripe_not_configured' });
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) return res.status(500).json({ ok:false, error:'missing_webhook_secret' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    audit.log('stripe.webhook.invalid', { error: err.message });
    return res.status(400).json({ ok:false, error:'signature_verification_failed' });
  }
  try {
    await db.collection('webhook_logs').add({ provider:'stripe', type: event.type, id: event.id, created: event.created, receivedAt: new Date().toISOString() });
  } catch(_){ }
  audit.log('stripe.webhook.received', { type: event.type });
  // Minimal handlers
  try {
    try { const { applyStripeEvent } = require('../services/subscriptionSyncService'); await applyStripeEvent(event); } catch(_){ }
    switch(event.type) {
      case 'checkout.session.completed':
      case 'invoice.paid':
        try { await db.collection('payment_events').add({ provider:'stripe', type: event.type, at: new Date().toISOString(), rawId: event.id }); } catch(_){}
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        try { await db.collection('subscription_events').add({ provider:'stripe', type: event.type, at: new Date().toISOString(), rawId: event.id }); } catch(_){}
        break;
      default:
        break;
    }
  } catch(e) {
    // Non-fatal processing error logging
    audit.log('stripe.webhook.handler_error', { type: event.type, error: e.message });
  }
  return res.json({ ok:true, received:true });
});

module.exports = router;