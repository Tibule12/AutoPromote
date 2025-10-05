// reconcilePayouts.js - finds stale processing payouts and marks failed (dev utility)
require('dotenv').config();
const { db } = require('../src/firebaseAdmin');

async function run() {
  const hours = parseInt(process.env.RECONCILE_PAYOUT_STALE_HOURS || '24',10);
  const cutoff = Date.now() - hours*3600000;
  const snap = await db.collection('payouts')
    .where('status','==','processing')
    .orderBy('createdAt','desc')
    .limit(1000)
    .get().catch(()=>({ empty:true, docs:[] }));
  let updated=0;
  for (const d of snap.docs) {
    const v=d.data(); const ts= Date.parse(v.createdAt||'')||0;
    if (ts < cutoff) {
      try { await d.ref.update({ status:'failed', updatedAt: new Date().toISOString(), failureReason:'stale_timeout' }); updated++; } catch(_){}
    }
  }
  console.log('Reconciliation complete. Marked stale payouts:', updated);
  process.exit(0);
}
run();
