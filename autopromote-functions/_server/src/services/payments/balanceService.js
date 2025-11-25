// balanceService.js - compute provisional & available balances per user
// Provisional: all subscription_fee + overage (platform revenue share) minus payouts recorded
// Available: provisional minus hold for recent earnings (< HOLD_DAYS)

const { db } = require('../../firebaseAdmin');

const HOLD_DAYS = parseInt(process.env.PAYOUT_HOLD_DAYS || '7', 10);

async function computeUserBalance(userId) {
  const sinceMs = Date.now() - 90*86400000; // 90 day window for sampling
  const ledgerSnap = await db.collection('usage_ledger')
    .where('userId','==', userId)
    .orderBy('createdAt','desc')
    .limit(3000)
    .get().catch(()=>({ empty:true, docs:[] }));
  let gross = 0; const earnings = []; // positive revenues
  ledgerSnap.docs.forEach(d => { const v=d.data(); const ts=Date.parse(v.createdAt||'')||0; if (ts>=sinceMs) { if (v.type==='subscription_fee' || v.type==='overage') { gross += v.amount||0; earnings.push({ amount:v.amount||0, ts }); } } });
  const payoutSnap = await db.collection('payouts')
    .where('userId','==', userId)
    .orderBy('createdAt','desc')
    .limit(1000)
    .get().catch(()=>({ empty:true, docs:[] }));
  let paid = 0; payoutSnap.docs.forEach(d => { const v=d.data(); if (['succeeded','processing'].includes(v.status)) paid += v.amount||0; });
  const provisional = Math.max(0, gross - paid);
  const cutoff = Date.now() - HOLD_DAYS*86400000;
  let held = 0; earnings.forEach(e => { if (e.ts>cutoff) held += e.amount; });
  const available = Math.max(0, provisional - held);
  return { userId, provisional, available, held, lifetimeGross: gross, lifetimePayouts: paid, holdDays: HOLD_DAYS };
}

module.exports = { computeUserBalance };
