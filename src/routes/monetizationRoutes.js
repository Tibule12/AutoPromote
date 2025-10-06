const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebaseAdmin');
const { getCache, setCache } = require('../utils/simpleCache');
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');
const { rateLimit } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');

// Revenue analytics endpoint
router.get('/revenue-analytics', authMiddleware, async (req, res) => {
  try {
    // Only allow admins
    if (!req.user || !(req.user.role === 'admin' || req.user.isAdmin === true)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch all content documents
    const contentSnapshot = await db.collection('content').get();
    const content = [];
    contentSnapshot.forEach(doc => content.push(doc.data()));

    // Calculate revenue analytics
    const totalRevenue = content.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const revenueToday = content.filter(item => {
      if (!item.created_at) return false;
      const created = new Date(item.created_at._seconds ? item.created_at._seconds * 1000 : item.created_at);
      return created >= today;
    }).reduce((sum, item) => sum + (item.revenue || 0), 0);
    const avgRevenuePerContent = content.length > 0 ? totalRevenue / content.length : 0;
    // For demo: avg revenue per user is 0 (unless you want to fetch users)
    const avgRevenuePerUser = 0;
    const projectedMonthlyRevenue = totalRevenue * 1.2;
    // Simple daily breakdown for the last 7 days
    const dailyBreakdown = Array.from({ length: 7 }).map((_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayRevenue = content.filter(item => {
        if (!item.created_at) return false;
        const created = new Date(item.created_at._seconds ? item.created_at._seconds * 1000 : item.created_at);
        return created >= day && created < new Date(day.getTime() + 24 * 60 * 60 * 1000);
      }).reduce((sum, item) => sum + (item.revenue || 0), 0);
      return { date: day.toISOString().split('T')[0], revenue: dayRevenue };
    }).reverse();

    res.json({
      totalRevenue,
      revenueToday,
      avgRevenuePerContent,
      avgRevenuePerUser,
      projectedMonthlyRevenue,
      dailyBreakdown
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// Earnings event ingestion (admin only for now)
router.post('/earnings/event', authMiddleware, adminOnly, validateBody({
  userId: { type: 'string', required: true },
  contentId: { type: 'string', required: false },
  amount: { type: 'number', required: true },
  source: { type: 'string', required: true, maxLength: 64 }
}), async (req, res) => {
  try {
    const { userId, contentId, amount, source } = req.body;
    if (amount <= 0) return res.status(400).json({ error: 'amount_positive_required' });
    const doc = await db.collection('earnings_events').add({
      userId,
      contentId: contentId || null,
      amount,
      source,
      createdAt: new Date().toISOString(),
      processed: false
    });
    return res.json({ ok: true, id: doc.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Aggregate unprocessed earnings events into user pendingEarnings (atomic increments)
router.post('/earnings/aggregate', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const { aggregateUnprocessed } = require('../services/earningsService');
    const result = await aggregateUnprocessed({ batchSize: 500 });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// User earnings summary (self)
router.get('/earnings/summary', authMiddleware, rateLimit({ field: 'earningsSummary', perMinute: 10 }), require('../statusInstrument')('earningsSummary', async (req, res) => {
  const cacheKey = `earnings_summary_${req.userId}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  const userRef = await db.collection('users').doc(req.userId).get();
  if (!userRef.exists) return res.status(404).json({ ok: false, error: 'user_not_found' });
  const u = userRef.data();
  const minPayout = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '0');
  const pending = u.pendingEarnings || 0;
  const payload = {
    ok: true,
    pendingEarnings: pending,
    totalEarnings: u.totalEarnings || 0,
    revenueEligible: u.revenueEligible || false,
    contentCount: u.contentCount || 0,
    minPayoutAmount: minPayout,
    payoutEligible: (u.revenueEligible || false) && pending >= minPayout
  };
  setCache(cacheKey, payload, 7000); // ~7s TTL
  return res.json(payload);
}));

// Self payout route: moves all pendingEarnings to totalEarnings and creates a payout record
router.post('/earnings/payout/self', authMiddleware, async (req, res) => {
  try {
    const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '0');
    const userRef = db.collection('users').doc(req.userId);
    let payoutAmount = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error('user_not_found');
      const data = snap.data();
      const pending = Number(data.pendingEarnings || 0);
      if (!data.revenueEligible) throw new Error('not_revenue_eligible');
      if (pending <= 0) throw new Error('nothing_to_payout');
      if (pending < MIN_PAYOUT) throw new Error('below_min_payout');
      payoutAmount = pending;
      tx.update(userRef, {
        pendingEarnings: admin.firestore.FieldValue.increment(-pending),
        totalEarnings: admin.firestore.FieldValue.increment(pending),
        lastPayoutAt: new Date().toISOString()
      });
    });
    // Record payout document (best-effort; failure here does not rollback transaction)
    try {
      await db.collection('earnings_payouts').add({
        userId: req.userId,
        amount: payoutAmount,
        createdAt: new Date().toISOString(),
        status: 'completed'
      });
      // Notification (best-effort)
      await db.collection('notifications').add({
        user_id: req.userId,
        type: 'payout_completed',
        title: 'Payout Completed',
        amount: payoutAmount,
        message: `A payout of ${payoutAmount} has been recorded.`,
        created_at: new Date(),
        read: false
      });
    } catch (e) {
      console.warn('[payout] could not record payout doc:', e.message);
    }
    return res.json({ ok: true, amount: payoutAmount });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// List recent payout history (self)
router.get('/earnings/payouts', authMiddleware, async (req, res) => {
  try {
    const cacheKey = `earnings_payouts_${req.userId}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true });
    let snap;
    try {
      snap = await db.collection('earnings_payouts')
        .where('userId','==', req.userId)
        .orderBy('createdAt','desc')
        .limit(25)
        .get();
    } catch (e) {
      // Fallback if composite index missing
      if (/needs to create an index/i.test(e.message) || /FAILED_PRECONDITION/i.test(e.message)) {
        snap = await db.collection('earnings_payouts')
          .where('userId','==', req.userId)
          .limit(25)
          .get();
      } else throw e;
    }
    const payouts = [];
    snap.forEach(d => payouts.push({ id: d.id, ...d.data() }));
    const payload = { ok: true, payouts };
    setCache(cacheKey, payload, 7000);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
