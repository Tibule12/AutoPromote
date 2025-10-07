const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();
const { db } = require('../firebaseAdmin');
const { audit } = require('../services/auditLogger');
let paypalSdk;
try { paypalSdk = require('@paypal/paypal-server-sdk'); } catch(_) { /* optional */ }
const authMiddleware = require('../authMiddleware');

// Polyfill / select fetch implementation (Render may run Node < 18 in some cases)
let fetchFn = (typeof fetch === 'function') ? fetch : null;
if (!fetchFn) {
  try { fetchFn = require('node-fetch'); } catch (e) {
    console.warn('⚠️ node-fetch not available and global fetch missing; PayPal routes will fail until fetch is provided.');
  }
}

// Minimal in-memory OAuth token cache (because we already keep secrets in env)
let __tokenCache = { token:null, expiresAt:0 };
async function getAccessToken(){
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new Error('paypal_creds_missing');
  const now = Date.now();
  if (__tokenCache.token && __tokenCache.expiresAt > now + 5000) return __tokenCache.token;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const base = process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  if (!fetchFn) throw new Error('fetch_unavailable');
  const res = await fetchFn(base + '/v1/oauth2/token', {
    method:'POST',
    headers:{ 'Authorization': `Basic ${basic}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error('token_http_'+res.status);
  const json = await res.json();
  __tokenCache = { token: json.access_token, expiresAt: now + (json.expires_in*1000) };
  return __tokenCache.token;
}

async function createOrder({ amount, currency='USD', internalId, userId }){
  const base = process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const access = await getAccessToken();
  const body = {
    intent:'CAPTURE',
    purchase_units:[{ amount:{ currency_code: currency, value: amount.toFixed(2) }, reference_id: internalId }],
    application_context:{ shipping_preference:'NO_SHIPPING', user_action:'PAY_NOW' }
  };
  if (!fetchFn) throw new Error('fetch_unavailable');
  const res = await fetchFn(base + '/v2/checkout/orders', {
    method:'POST', headers:{ 'Authorization':`Bearer ${access}`,'Content-Type':'application/json' }, body: JSON.stringify(body)
  });
  const json = await res.json();
  if (res.status >=400) throw new Error(json.message || 'order_create_failed');
  // Persist initial payment doc
  try {
    await db.collection('payments').doc(json.id).set({
      provider:'paypal', providerOrderId: json.id, status:'created', amount: body.purchase_units[0].amount.value,
      currency: body.purchase_units[0].amount.currency_code, userId, internalId, createdAt: new Date().toISOString()
    }, { merge:true });
  } catch(_){ }
  return json;
}

async function captureOrder(orderId){
  const base = process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const access = await getAccessToken();
  if (!fetchFn) throw new Error('fetch_unavailable');
  const res = await fetchFn(base + `/v2/checkout/orders/${orderId}/capture`, {
    method:'POST', headers:{ 'Authorization':`Bearer ${access}`,'Content-Type':'application/json' }
  });
  const json = await res.json();
  if (res.status >=400) throw new Error(json.message || 'capture_failed');
  const capture = json.purchase_units && json.purchase_units[0] && json.purchase_units[0].payments && json.purchase_units[0].payments.captures && json.purchase_units[0].payments.captures[0];
  try {
    await db.collection('payments').doc(orderId).set({ status:'captured', capturedAt: new Date().toISOString(), captureId: capture && capture.id }, { merge:true });
  } catch(_){ }
  return json;
}

// Route: Create PayPal order
router.post('/create-order', authMiddleware, express.json(), async (req,res) => {
  const started = Date.now();
  try {
    const { amount, currency } = req.body || {};
    if (typeof amount !== 'number' || amount <=0) return res.status(400).json({ ok:false, error:'invalid_amount' });
    // randomUUID may not exist on very old Node versions
    const internalId = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const order = await createOrder({ amount, currency: currency || 'USD', internalId, userId: req.user.uid });
    return res.json({ ok:true, id: order.id, status: order.status, approveLinks: (order.links||[]).filter(l=>l.rel==='approve').map(l=>l.href), internalId, ms: Date.now()-started });
  } catch(e){
    console.error('[PayPal] create-order error:', e && e.stack || e);
    return res.status(500).json({ ok:false, error:e.message, code: (e.message||'').split(' ')[0], ms: Date.now()-started });
  }
});

// Route: Capture PayPal order (server-side)
router.post('/capture-order/:id', authMiddleware, async (req,res) => {
  const started = Date.now();
  try {
    const orderId = req.params.id;
    if (!orderId) return res.status(400).json({ ok:false, error:'missing_order_id' });
    const result = await captureOrder(orderId);
    return res.json({ ok:true, orderId, status: result.status, raw: result, ms: Date.now()-started });
  } catch(e){
    console.error('[PayPal] capture-order error:', e && e.stack || e);
    return res.status(500).json({ ok:false, error:e.message, code:(e.message||'').split(' ')[0], ms: Date.now()-started });
  }
});

// Lightweight debug endpoint to introspect PayPal integration health
router.get('/debug/status', authMiddleware, async (req,res) => {
  const hasClientId = !!process.env.PAYPAL_CLIENT_ID;
  const hasSecret = !!process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox(default)';
  const webhookIdPresent = !!process.env.PAYPAL_WEBHOOK_ID;
  const tokenCached = !!__tokenCache.token && __tokenCache.expiresAt > Date.now();
  return res.json({
    ok:true,
    env:{ hasClientId, hasSecret, mode, webhookIdPresent },
    runtime:{ node: process.version, fetchAvailable: !!fetchFn, fetchType: fetchFn && fetchFn.name },
    token:{ cached: tokenCached, expiresInMs: tokenCached ? (__tokenCache.expiresAt - Date.now()) : null }
  });
});

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
      const amount = event.resource && event.resource.amount && event.resource.amount.value;
      const currency = event.resource && event.resource.amount && event.resource.amount.currency_code;
      const captureId = event.resource && event.resource.id;
      const orderId = event.resource && event.resource.supplementary_data && event.resource.supplementary_data.related_ids && event.resource.supplementary_data.related_ids.order_id;
      await db.collection('payment_events').add({ provider: 'paypal', type: event.event_type, amount, currency, captureId, orderId, at: new Date().toISOString(), rawId: event.id });
      if (orderId) {
        await db.collection('payments').doc(orderId).set({ status:'captured', captureId, amount, currency, updatedAt: new Date().toISOString() }, { merge:true });
      }
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
