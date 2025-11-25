// usageLedgerService.js - records billable usage & subscription events
// Document shape (collection: usage_ledger):
// { type: 'task'|'upload'|'subscription_fee'|'overage'|'ai', userId, amount, currency, meta, createdAt }

const { db, admin } = require('../firebaseAdmin');

async function recordUsage({ type, userId, amount = 0, currency = 'USD', meta = {} }) {
  if (!type || !userId) return;
  try {
    let doc = { type, userId, amount, currency, meta, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    // Sign financial-impacting records
    if (['subscription_fee','overage','payout','adjustment'].includes(type)) {
      try { const { attachSignature } = require('../utils/docSigner'); doc = attachSignature(doc); } catch(_){ }
    }
    await db.collection('usage_ledger').add(doc);
  } catch (_) { /* silent */ }
}

async function aggregateUsageSince({ sinceMs }) {
  const snap = await db.collection('usage_ledger')
    .orderBy('createdAt','desc')
    .limit(4000)
    .get().catch(()=>({ empty: true, docs: [] }));
  const out = { task:0, upload:0, subscription_fee:0, overage:0, ai:0 };
  snap.docs.forEach(d => {
    const v = d.data();
    const ts = v.createdAt?.toMillis ? v.createdAt.toMillis() : 0;
    if (sinceMs && ts && ts < sinceMs) return;
    if (typeof v.amount === 'number' && out[v.type] !== undefined) out[v.type] += v.amount;
  });
  return out;
}

async function countUsageRecords({ userId, type, sinceMs }) {
  if (!userId || !type) return 0;
  const snap = await db.collection('usage_ledger')
    .where('userId','==', userId)
    .where('type','==', type)
    .orderBy('createdAt','desc')
    .limit(500)
    .get().catch(()=>({ empty:true, docs: [] }));
  let count = 0;
  snap.docs.forEach(d => {
    const v = d.data();
    const ts = v.createdAt?.toMillis ? v.createdAt.toMillis() : 0;
    if (sinceMs && ts && ts < sinceMs) return;
    count += 1;
  });
  return count;
}

module.exports = { recordUsage, aggregateUsageSince, countUsageRecords };