#!/usr/bin/env node
const { db, admin } = require('../src/firebaseAdmin');

const PAGE_SIZE = 500;
const FIELD_MAP = {
  user_id: 'userId',
  created_at: 'createdAt',
  approved_at: 'approvedAt',
  rejected_at: 'rejectedAt',
  updated_at: 'updatedAt',
};

const apply = process.argv.includes('--apply');

function toTimestampIfProto(v) {
  if (!v) return v;
  if (typeof v === 'object' && '_seconds' in v && '_nanoseconds' in v) {
    const ms = v._seconds * 1000 + Math.floor(v._nanoseconds / 1e6);
    return admin.firestore.Timestamp.fromMillis(ms);
  }
  if (typeof v === 'string' && !isNaN(Date.parse(v))) {
    return admin.firestore.Timestamp.fromDate(new Date(v));
  }
  return v;
}

(async function main() {
  console.log('Migration started. apply=', apply);
  let last = null;
  let checked = 0;
  let toUpdate = 0;

  while (true) {
    let q = db.collection('content').orderBy('__name__').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const updates = [];

    for (const doc of snap.docs) {
      checked++;
      const data = doc.data() || {};
      const update = {};
      for (const [oldKey, newKey] of Object.entries(FIELD_MAP)) {
        if (oldKey in data && !(newKey in data)) {
          update[newKey] = toTimestampIfProto(data[oldKey]);
        }
      }
      if (Object.keys(update).length) {
        toUpdate++;
        updates.push({ ref: doc.ref, update });
      }
    }

    if (updates.length) {
      if (!apply) {
        updates.forEach(u => console.log('Would update', u.ref.path, u.update));
      } else {
        // Commit in chunks of 500
        for (let i = 0; i < updates.length; i += 500) {
          const chunk = updates.slice(i, i + 500);
          const batch = db.batch();
          for (const u of chunk) batch.update(u.ref, u.update);
          await batch.commit();
          console.log('Committed chunk of', chunk.length);
        }
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log('Migration complete. Checked:', checked, 'Updated:', toUpdate);
  if (!apply) console.log('Dry run — re-run with --apply to perform updates.');
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
