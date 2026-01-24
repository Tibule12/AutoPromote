/*
Report recent content docs with moderationStatus == 'held' and show moderationLog + uploadIssue summary.
Usage:
  node ./scripts/report-held.js --limit=20
*/
const argv = require('minimist')(process.argv.slice(2));
const { db } = require('../firebaseAdmin');
const LIMIT = parseInt(argv.limit || '20', 10);

(async function main() {
  try {
    // Count total held
    let countSnap;
    try {
      countSnap = await db.collection('content').where('moderationStatus', '==', 'held').count().get();
      const total = (countSnap && countSnap.data && countSnap.data().count) || 0;
      console.log('Total moderationStatus==held:', total);
    } catch (e) {
      // Fallback when count() not supported in stub/emulator
      const s = await db.collection('content').where('moderationStatus', '==', 'held').get();
      console.log('Total moderationStatus==held (fallback):', s.size || (s.docs && s.docs.length) || 0);
    }

    // Show recent held docs ordered by moderationAt desc
    let recentSnap = null;
    try {
      recentSnap = await db.collection('content').where('moderationStatus', '==', 'held').orderBy('moderationAt', 'desc').limit(LIMIT).get();
    } catch (e) {
      // Order by might fail if moderationAt missing; fallback to simple query
      recentSnap = await db.collection('content').where('moderationStatus', '==', 'held').limit(LIMIT).get();
    }

    if (!recentSnap || (recentSnap.size || (recentSnap.docs && recentSnap.docs.length)) === 0) {
      console.log('No recent held docs found.');
      return process.exit(0);
    }

    console.log(`Showing up to ${LIMIT} recent held docs:`);
    for (const doc of (recentSnap.docs || [])) {
      const d = doc.data() || {};
      const modAt = (d.moderationAt && d.moderationAt.toDate) ? d.moderationAt.toDate().toISOString() : (d.moderationAt || null);
      const lastLog = Array.isArray(d.moderationLog) && d.moderationLog.length ? d.moderationLog[d.moderationLog.length-1] : null;
      const issues = d.uploadIssue && d.uploadIssue.issues ? d.uploadIssue.issues : null;
      console.log(`- ${doc.id} | status=${d.moderationStatus} | reason=${d.moderationReason || ''} | by=${d.moderationHoldBy || ''} | at=${modAt}`);
      if (issues) console.log(`    uploadIssue: ${JSON.stringify(issues)} type=${d.uploadIssue.contentType || ''} size=${d.uploadIssue.contentLength || ''}`);
      if (lastLog) console.log(`    lastLog: ${JSON.stringify(lastLog)}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('report-held failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
