// usageLedgerService.js - records billable usage & subscription events
// Document shape (collection: usage_ledger):
// { type: 'task'|'upload'|'subscription_fee'|'overage'|'ai', userId, amount, currency, meta, createdAt }

const { db, admin } = require('../firebaseAdmin');

async function recordUsage({ type, userId, amount = 0, currency = 'USD', meta = {} }) {
  if (!type || !userId) return;
  try {
    await db.collection('usage_ledger').add({
      type,
      userId,
      amount,
      currency,
      meta,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
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

module.exports = { recordUsage, aggregateUsageSince };