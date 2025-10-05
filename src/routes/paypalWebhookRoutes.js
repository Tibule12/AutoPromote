const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const { audit } = require('../services/auditLogger');

// Simple in-memory cert cache (expires after TTL)
const certCache = new Map(); // key: certUrl -> { pem, expiresAt }
const CERT_TTL_MS = parseInt(process.env.PAYPAL_CERT_TTL_MS || '3600000', 10); // 1h

function fetchCert(certUrl) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//i.test(certUrl)) return reject(new Error('invalid_cert_url'));
    const cached = certCache.get(certUrl);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return resolve(cached.pem);
    https.get(certUrl, res => {
      if (res.statusCode !== 200) return reject(new Error('cert_http_' + res.statusCode));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        certCache.set(certUrl, { pem: data, expiresAt: now + CERT_TTL_MS });
        resolve(data);
      });
    }).on('error', reject);
  });
}

function verifyRSASignature({ signature, sigBase, certPem, algorithm }) {
  try {
    if (!signature || !sigBase || !certPem) return false;
    // PayPal header paypal-auth-algo e.g. 'SHA256withRSA'
    const algo = (algorithm || 'SHA256withRSA').toUpperCase();
    let digest = 'sha256';
    if (algo.includes('SHA512')) digest = 'sha512';
    const verifier = crypto.createVerify(digest.toUpperCase());
    verifier.update(sigBase, 'utf8');
    verifier.end();
    const sigBuf = Buffer.from(signature, 'base64');
    return verifier.verify(certPem, sigBuf);
  } catch (e) {
    return false;
  }
}

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
  let computed; let sigBase; let verified = false; let verificationMode = 'none';
  try {
    const bodyHash = crypto.createHash('sha256').update(req.rawBody || Buffer.from(JSON.stringify(event),'utf8')).digest('hex');
    sigBase = `${transmissionId}|${transmissionTime}|${webhookId}|${bodyHash}`;
    if (process.env.PAYPAL_WEBHOOK_SECRET) {
      computed = crypto.createHmac('sha256', process.env.PAYPAL_WEBHOOK_SECRET).update(sigBase).digest('base64');
      verificationMode = 'hmac-dev';
      verified = timingSafeEq(computed, transmissionSig);
    } else if (certUrl) {
      verificationMode = 'rsa-cert';
      try {
        const pem = await fetchCert(certUrl);
        verified = verifyRSASignature({ signature: transmissionSig, sigBase, certPem: pem, algorithm: authAlgo });
      } catch (ce) {
        verificationMode = 'rsa-cert-error';
      }
    } else {
      verificationMode = 'no-verification';
    }
  } catch (e) {
    return res.status(400).json({ ok:false, error:'sig_compute_failed', detail:e.message });
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
