#!/usr/bin/env node
const { db, admin } = require('../src/firebaseAdmin');

const PAGE_SIZE = 500;
const SNAKE_FIELDS = ['user_id', 'created_at', 'approved_at', 'rejected_at', 'updated_at'];
const apply = process.argv.includes('--apply');

(async function main() {
  console.log('Remove-snake-fields started. apply=', apply);
  let last = null;
  let checked = 0;
  let toRemove = [];

  while (true) {
    let q = db.collection('content').orderBy('__name__').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      checked++;
      const data = doc.data() || {};
      const toDel = {};
      for (const f of SNAKE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data, f)) {
          toDel[f] = true;
        }
      }
      if (Object.keys(toDel).length) {
        toRemove.push({ ref: doc.ref, fields: Object.keys(toDel) });
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log('Checked:', checked, 'Docs with snake fields:', toRemove.length);
  if (!toRemove.length) return process.exit(0);

  if (!apply) {
    console.log('Dry run. Re-run with --apply to remove the fields. Example: node scripts/remove-snake-fields.js --apply');
    toRemove.slice(0, 20).forEach(r => console.log('Would remove from', r.ref.path, r.fields.join(', ')));
    console.log('...');
    return process.exit(0);
  }

  for (let i = 0; i < toRemove.length; i += 500) {
    const chunk = toRemove.slice(i, i + 500);
    const batch = db.batch();
    for (const r of chunk) {
      const upd = {};
      for (const f of r.fields) upd[f] = admin.firestore.FieldValue.delete();
      batch.update(r.ref, upd);
    }
    await batch.commit();
    console.log('Committed chunk of', chunk.length);
  }

  console.log('Removal complete. Removed from docs:', toRemove.length);
  process.exit(0);
})().catch(err => {
  console.error('Failed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
