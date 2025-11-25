const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const { composeStatus } = require('../services/payments');
const { audit } = require('../services/auditLogger');
let rateLimit; try { rateLimit = require('../middlewares/simpleRateLimit'); } catch(_) { rateLimit = ()=> (req,res,next)=> next(); }
const { rateLimiter } = require('../middlewares/globalRateLimiter');

// Protect payments status endpoints with a light public limiter
const paymentsPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_PAYMENTS_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'payments_public' });

const router = express.Router();

// GET /api/payments/status - combined provider readiness
router.get('/status', authMiddleware, paymentsPublicLimiter, async (req, res) => {
  try {
    let userDoc = null;
    if (req.userId) {
      const snap = await db.collection('users').doc(req.userId).get();
      userDoc = snap.exists ? snap.data() : null;
    }
    const status = await composeStatus(userDoc);
    return res.json({ ok:true, ...status });
  } catch (e) { return res.status(500).json({ ok:false, error:e.message }); }
});

// DEV ONLY mock endpoints (guard with env)
router.post('/dev/mock/subscription', authMiddleware, rateLimit({ max:10, windowMs:3600000, key: r=> r.userId||r.ip }), async (req, res) => {
  if (process.env.ALLOW_PAYMENTS_DEV_MOCK !== 'true') return res.status(403).json({ ok:false, error:'dev_mock_disabled' });
  try {
    const { plan='pro', amount=20 } = req.body || {};
  const doc = { type:'subscription_fee', userId: req.userId, amount, currency:'USD', createdAt: new Date().toISOString(), meta:{ plan, mock:true } };
  await db.collection('usage_ledger').add(doc);
  audit.log('dev.subscription_fee.mocked', { userId: req.userId, amount, plan });
  return res.json({ ok:true, simulated:true, requestId: req.requestId });
  } catch (e) { return res.status(500).json({ ok:false, error:e.message }); }
});

router.post('/dev/mock/payout', authMiddleware, rateLimit({ max:10, windowMs:3600000, key: r=> r.userId||r.ip }), async (req, res) => {
  if (process.env.ALLOW_PAYMENTS_DEV_MOCK !== 'true') return res.status(403).json({ ok:false, error:'dev_mock_disabled' });
  try {
    const { amount=5 } = req.body || {};
  const payout = { userId: req.userId, amount, currency:'USD', status:'succeeded', simulated:true, createdAt:new Date().toISOString() };
  const ref = await db.collection('payouts').add(payout);
  audit.log('dev.payout.mocked', { userId: req.userId, amount, payoutId: ref.id });
  return res.json({ ok:true, payoutId: ref.id, simulated:true, requestId: req.requestId });
  } catch (e) { return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
