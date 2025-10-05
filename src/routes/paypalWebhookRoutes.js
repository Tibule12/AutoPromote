const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const { audit } = require('../services/auditLogger');

// Raw body capture helper for PayPal verification
function rawBodyBuffer(req, _res, buf) { req.rawBody = buf; }

// Middleware: parse JSON but retain raw body
router.post('/webhook', express.json({ limit:'1mb', verify: rawBodyBuffer }), async (req,res) => {
  const transmissionId = req.get('paypal-transmission-id');
  const transmissionTime = req.get('paypal-transmission-time');
  const certUrl = req.get('paypal-cert-url');
  const authAlgo = req.get('paypal-auth-algo');
  const transmissionSig = req.get('paypal-transmission-sig');
  const webhookId = process.env.PAYPAL_WEBHOOK_ID; // must be configured
  const event = req.body || {};

  // Basic presence validation
  if (!webhookId) return res.status(500).json({ ok:false, error:'missing_webhook_id' });
  const missing = [];
  if (!transmissionId) missing.push('paypal-transmission-id');
  if (!transmissionTime) missing.push('paypal-transmission-time');
  if (!authAlgo) missing.push('paypal-auth-algo');
  if (!transmissionSig) missing.push('paypal-transmission-sig');
  if (missing.length) return res.status(400).json({ ok:false, error:'missing_headers', missing });

  // Construct expected signature base: transmissionId|transmissionTime|webhookId|sha256(body)
  let computed;
  try {
    const bodyHash = crypto.createHash('sha256').update(req.rawBody || Buffer.from(JSON.stringify(event),'utf8')).digest('hex');
    const sigBase = `${transmissionId}|${transmissionTime}|${webhookId}|${bodyHash}`;
    // Note: PayPal docs specify using their public cert (certUrl) to verify a signature; here we implement a simpler HMAC fallback if PAYPAL_WEBHOOK_SECRET provided.
    // If PAYPAL_WEBHOOK_SECRET exists use HMAC for deterministic verification in dev; otherwise mark as unverified placeholder.
    if (process.env.PAYPAL_WEBHOOK_SECRET) {
      computed = crypto.createHmac('sha256', process.env.PAYPAL_WEBHOOK_SECRET).update(sigBase).digest('base64');
    }
  } catch (e) {
    return res.status(400).json({ ok:false, error:'sig_compute_failed', detail:e.message });
  }

  let verified = false; let verificationMode = 'none';
  if (computed) {
    verificationMode = 'hmac-dev';
    verified = timingSafeEq(computed, transmissionSig);
  } else {
    verificationMode = 'placeholder-public-cert';
    // For production: implement public cert retrieval + RSA signature verification of transmissionSig using certUrl.
  }

  // Persist log regardless (auditable trail)
  try {
    await db.collection('webhook_logs').add({ provider:'paypal', eventType: event.event_type, verified, verificationMode, headers: { transmissionId, transmissionTime, authAlgo, certUrl }, receivedAt: new Date().toISOString() });
  } catch(_){ }
  audit.log('paypal.webhook.received', { eventType: event.event_type, verified, verificationMode });

  if (!verified && process.env.REQUIRE_PAYPAL_WEBHOOK_VERIFICATION === 'true') {
    return res.status(400).json({ ok:false, error:'signature_verification_failed' });
  }

  // Minimal event routing placeholder
  try {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      await db.collection('payment_events').add({ provider: 'paypal', type: event.event_type, amount: event.resource && event.resource.amount, at: new Date().toISOString(), rawId: event.id });
    }
  } catch(_){ }

  return res.json({ ok:true, received:true, verified, mode: verificationMode });
});

function timingSafeEq(a,b){
  if (!a || !b) return false;
  const buffA = Buffer.from(a);
  const buffB = Buffer.from(b);
  if (buffA.length !== buffB.length) return false;
  return crypto.timingSafeEqual(buffA, buffB);
}

module.exports = router;
