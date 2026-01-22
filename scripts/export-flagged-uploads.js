/*
Export all content docs with an `uploadIssue` field into JSON or CSV for triage.
Usage:
  node ./scripts/export-flagged-uploads.js --limit=500 --format=json
Options:
  --limit: number of recent docs to scan (default 500)
  --format: json|csv (default json)
  --out: path to output file (default ./tmp/flagged-uploads-<ts>.<ext>)
*/

const { db } = require('../firebaseAdmin');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

const LIMIT = parseInt(argv.limit || '500', 10);
const FORMAT = (argv.format || 'json').toLowerCase();
const OUT = argv.out || null;

(async function main() {
  try {
    const snap = await db.collection('content').orderBy('updatedAt', 'desc').limit(LIMIT).get();
    const items = [];
    for (const doc of (snap.docs || [])) {
      const d = doc.data() || {};
      if (!d.uploadIssue) continue;
      items.push({
        id: doc.id,
        userId: d.userId || d.user_id || null,
        title: d.title || null,
        url: d.url || null,
        issues: d.uploadIssue && d.uploadIssue.issues ? d.uploadIssue.issues : (Array.isArray(d.uploadIssue) ? d.uploadIssue : null),
        contentType: d.uploadIssue && d.uploadIssue.contentType ? d.uploadIssue.contentType : null,
        contentLength: d.uploadIssue && typeof d.uploadIssue.contentLength !== 'undefined' ? d.uploadIssue.contentLength : null,
        scannedAt: d.uploadIssue && d.uploadIssue.scannedAt ? (d.uploadIssue.scannedAt.toDate ? d.uploadIssue.scannedAt.toDate().toISOString() : d.uploadIssue.scannedAt) : null,
      });
    }

    if (!items.length) {
      console.log('No flagged items found in the most recent', LIMIT, 'docs.');
      process.exit(0);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join('tmp', `flagged-uploads-${ts}.${FORMAT === 'csv' ? 'csv' : 'json'}`);
    const outPath = OUT || defaultPath;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    if (FORMAT === 'csv') {
      const headers = ['id','userId','title','url','issues','contentType','contentLength','scannedAt'];
      const lines = [headers.join(',')];
      for (const it of items) {
        const row = headers.map(h => {
          const val = it[h];
          if (val === null || typeof val === 'undefined') return '';
          if (Array.isArray(val)) return `"${val.join('|').replace(/"/g,'""')}"`;
          return `"${String(val).replace(/"/g,'""')}"`;
        });
        lines.push(row.join(','));
      }
      fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    } else {
      fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
    }

    console.log(`Exported ${items.length} flagged items to ${outPath}`);
    process.exit(0);
  } catch (err) {
    console.error('Export failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
