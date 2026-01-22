/*
Bulk-hold content docs that have `uploadIssue` set. Safe by default (dry-run).
Usage:
  node ./scripts/bulk-hold-flagged.js --limit=500 [--ids=id1,id2] [--apply] [--status=held] [--reason-prefix="uploadIssue"]

Behavior:
  - Scans the most recent `limit` content docs (or `--ids`) and finds ones with `uploadIssue`.
  - In DRY-RUN (default) prints what it would update.
  - With --apply, updates `moderationStatus`, `moderationReason`, `moderationHoldBy`, `moderationAt`, and appends a `moderationLog` entry.
  - Writes an audit file ./tmp/hold-applied-<ts>.json when --apply is used.
*/

const { db, admin } = require('../firebaseAdmin');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

const LIMIT = parseInt(argv.limit || '500', 10);
const IDS = (argv.ids || '').split(',').filter(Boolean);
const APPLY = !!argv.apply;
const STATUS = argv.status || 'held';
const REASON_PREFIX = argv['reason-prefix'] || 'uploadIssue';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main() {
  try {
    let docs = [];
    if (IDS.length) {
      for (const id of IDS) {
        const r = await db.collection('content').doc(id).get();
        if (r && r.exists) docs.push({ id, data: r.data() || {} });
      }
    } else {
      const snap = await db.collection('content').orderBy('updatedAt', 'desc').limit(LIMIT).get();
      for (const d of (snap.docs || [])) docs.push({ id: d.id, data: d.data() || {} });
    }

    const toAct = docs.filter(d => d.data && d.data.uploadIssue).map(d => ({ id: d.id, data: d.data }));
    console.log(`Found ${toAct.length} flagged docs to consider (from ${docs.length} scanned). apply=${APPLY}`);
    if (!toAct.length) {
      process.exit(0);
    }

    const applied = [];
    for (const item of toAct) {
      const issues = item.data.uploadIssue && item.data.uploadIssue.issues ? item.data.uploadIssue.issues : [];
      const reason = `${REASON_PREFIX}: ${Array.isArray(issues) ? issues.join(',') : String(issues)}`;
      const update = {
        moderationStatus: STATUS,
        moderationReason: reason,
        moderationHoldBy: 'automated-scan',
        moderationAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const logEntry = {
        action: 'hold',
        by: 'automated-scan',
        at: admin.firestore.FieldValue.serverTimestamp(),
        note: reason,
        issues,
      };

      if (!APPLY) {
        console.log(`DRY-RUN: would update ${item.id} -> ${JSON.stringify(update)} (logEntry: ${JSON.stringify(logEntry)})`);
        continue;
      }

      try {
        // Read existing doc to preserve moderationLog
        const ref = db.collection('content').doc(item.id);
        const cur = await ref.get();
        const curData = cur && cur.exists ? cur.data() || {} : {};
        const existingLog = Array.isArray(curData.moderationLog) ? curData.moderationLog : [];
        const newLog = existingLog.concat([logEntry]);

        await ref.update({ ...update, moderationLog: newLog });
        applied.push({ id: item.id, update, previousModerationStatus: curData.moderationStatus || null });
        console.log(`Applied hold to ${item.id}`);
      } catch (err) {
        console.error(`Failed to apply to ${item.id}:`, err && err.message ? err.message : err);
      }
      await sleep(80); // gentle throttling
    }

    if (APPLY) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = path.join('tmp', `hold-applied-${ts}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({ applied, count: applied.length, ts: new Date().toISOString() }, null, 2), 'utf8');
      console.log(`Wrote audit ${outPath}`);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('bulk-hold failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
