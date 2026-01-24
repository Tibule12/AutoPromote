/*
Check how many content docs were held by the automated scan and show sample docs.
Usage:
  node scripts/check-held.js --limit=10
*/
const { db } = require('../src/firebaseAdmin');
const argv = require('minimist')(process.argv.slice(2));
const LIMIT = parseInt(argv.limit || '10', 10);
(async function main() {
  try {
    const q = db.collection('content').where('moderationHoldBy', '==', 'automated-scan');
    const snap = await q.get();
    console.log('Total held by automated-scan:', snap.size || (snap.docs && snap.docs.length) || 0);
    let i = 0;
    for (const d of (snap.docs || []).slice(0, LIMIT)) {
      const data = d.data() || {};
      console.log(`- ${d.id} | status=${data.moderationStatus} | reason=${data.moderationReason} | issues=${(data.uploadIssue&&data.uploadIssue.issues)||''}`);
      i++;
    }
    if (snap.size > LIMIT) console.log(`(showing ${LIMIT} of ${snap.size})`);
    process.exit(0);
  } catch (err) {
    console.error('check-held failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
