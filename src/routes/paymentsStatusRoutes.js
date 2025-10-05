const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=> next(); }
const { composeStatus } = require('../services/payments');

const router = express.Router();

// GET /api/payments/status - combined provider readiness
router.get('/status', authMiddleware, async (req, res) => {
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
router.post('/dev/mock/subscription', authMiddleware, async (req, res) => {
  if (process.env.ALLOW_PAYMENTS_DEV_MOCK !== 'true') return res.status(403).json({ ok:false, error:'dev_mock_disabled' });
  try {
    const { plan='pro', amount=20 } = req.body || {};
    await db.collection('usage_ledger').add({ type:'subscription_fee', userId: req.userId, amount, currency:'USD', createdAt: new Date().toISOString(), meta:{ plan, mock:true } });
    return res.json({ ok:true, simulated:true });
  } catch (e) { return res.status(500).json({ ok:false, error:e.message }); }
});

router.post('/dev/mock/payout', authMiddleware, async (req, res) => {
  if (process.env.ALLOW_PAYMENTS_DEV_MOCK !== 'true') return res.status(403).json({ ok:false, error:'dev_mock_disabled' });
  try {
    const { amount=5 } = req.body || {};
    const ref = await db.collection('payouts').add({ userId: req.userId, amount, currency:'USD', status:'succeeded', simulated:true, createdAt:new Date().toISOString() });
    return res.json({ ok:true, payoutId: ref.id, simulated:true });
  } catch (e) { return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
