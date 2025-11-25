const { db, admin } = require('../firebaseAdmin');

async function aggregateUnprocessed({ batchSize = 500 } = {}) {
  const snap = await db.collection('earnings_events')
    .where('processed','==', false)
    .limit(batchSize)
    .get();
  if (snap.empty) return { processedEvents: 0, usersUpdated: 0 };
  const perUser = {};
  snap.forEach(d => { const ev = d.data(); perUser[ev.userId] = (perUser[ev.userId] || 0) + ev.amount; });
  const batch = db.batch();
  Object.entries(perUser).forEach(([uid, amt]) => {
    batch.set(db.collection('users').doc(uid), { pendingEarnings: admin.firestore.FieldValue.increment(amt) }, { merge: true });
  });
  snap.docs.forEach(d => batch.update(d.ref, { processed: true, processedAt: new Date().toISOString() }));
  await batch.commit();
  return { processedEvents: snap.size, usersUpdated: Object.keys(perUser).length };
}

module.exports = { aggregateUnprocessed };
