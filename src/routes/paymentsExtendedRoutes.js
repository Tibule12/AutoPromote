const express = require('express');
const { db } = require('../firebaseAdmin');
let authMiddleware; try { authMiddleware = require('../authMiddleware'); } catch(_) { authMiddleware = (req,res,next)=>next(); }
const adminOnly = require('../middlewares/adminOnly');
const { computeUserBalance } = require('../services/payments/balanceService');
const { audit } = require('../services/auditLogger');

const router = express.Router();

// GET /api/payments/balance
router.get('/balance', authMiddleware, async (req,res) => {
  try {
    if (!req.userId) return res.status(401).json({ ok:false, error:'auth_required' });
  const bal = await computeUserBalance(req.userId);
  audit.log('balance.viewed', { userId: req.userId, provisional: bal.provisional, available: bal.available });
  return res.json({ ok:true, balance: bal, requestId: req.requestId });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/payments/plans (static or env-driven)
router.get('/plans', async (_req,res) => {
  const plans = [
    { id:'free', priceId:null, monthly:0, quota: (process.env.FREE_PLAN_QUOTA||'50') },
  { id:'pro', monthly:29, quota: (process.env.PRO_PLAN_QUOTA||'500') },
  { id:'scale', monthly:99, quota: (process.env.SCALE_PLAN_QUOTA||'5000') },
  ];
  return res.json({ ok:true, plans });
});

// Admin financial overview
router.get('/admin/overview', authMiddleware, adminOnly, async (_req,res) => {
  try {
    const sinceMs = Date.now() - 30*86400000;
    const ledgerSnap = await db.collection('usage_ledger')
      .orderBy('createdAt','desc')
      .limit(8000)
      .get().catch(()=>({ empty:true, docs:[] }));
    let subscription=0, overage=0; const users=new Set();
    ledgerSnap.docs.forEach(d=>{ const v=d.data(); const ts=Date.parse(v.createdAt||'')||0; if (ts>=sinceMs){ if (v.type==='subscription_fee') subscription+=v.amount||0; if (v.type==='overage') overage+=v.amount||0; if (v.userId) users.add(v.userId); }});
    const payoutSnap = await db.collection('payouts').orderBy('createdAt','desc').limit(2000).get().catch(()=>({ empty:true, docs:[] }));
    let payouts30=0; payoutSnap.docs.forEach(d=>{ const v=d.data(); const ts=Date.parse(v.createdAt||'')||0; if (ts>=sinceMs && v.status==='succeeded') payouts30+=v.amount||0; });
  audit.log('admin.overview.viewed', { userId: _req.userId || null, subscription, overage, payouts30 });
  return res.json({ ok:true, windowDays:30, revenue:{ subscription, overage }, payouts:{ succeeded:payouts30 }, activeUsers: users.size, requestId: _req.requestId });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
