/*
Flag problematic uploads in Firestore based on the same heuristics used by the scan script.
Usage:
  node ./scripts/flag-bad-uploads.js --limit=200 --since-days=365 [--apply]

By default the script runs in dry-run mode and will print the documents it would flag.
If --apply is provided, the script will write an `uploadIssue` field to each problematic content doc with details.
*/

const { db, admin } = require('../firebaseAdmin');
const fetch = require('node-fetch');
const argv = require('minimist')(process.argv.slice(2));

const LIMIT = parseInt(argv.limit || '500', 10);
const SINCE_DAYS = parseInt(argv['since-days'] || '90', 10);
const APPLY = !!argv.apply;

(async function main() {
  try {
    const cutoff = Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000;

    console.log(`Running flagger (limit=${LIMIT} since_days=${SINCE_DAYS}) apply=${APPLY}`);

    // Gather recent docs similar to scan script
    let snap = null;
    try {
      snap = await db.collection('content').orderBy('createdAt', 'desc').limit(LIMIT).get();
    } catch (e) {
      try {
        snap = await db.collection('content').orderBy('created_at', 'desc').limit(LIMIT).get();
      } catch (e2) {
        snap = await db.collection('content').orderBy('updatedAt', 'desc').limit(LIMIT).get();
      }
    }

    const problems = [];
    let inspected = 0;

    for (const doc of (snap.docs || [])) {
      const data = doc.data() || {};
      const created = (data.createdAt && data.createdAt.toDate) ? data.createdAt.toDate().getTime() : (data.created_at && data.created_at.toDate ? data.created_at.toDate().getTime() : null);
      if (created && created < cutoff) continue; // skip older
      if (!data.url) continue;
      inspected++;

      const url = data.url;
      const id = doc.id;

      const entry = { id, url, title: data.title || null, userId: data.userId || data.user_id || null };

      // Attempt HEAD
      try {
        const head = await fetch(url, { method: 'HEAD' });
        entry.headStatus = head.status;
        entry.contentType = head.headers.get('content-type');
        const cl = head.headers.get('content-length');
        entry.contentLength = cl ? parseInt(cl, 10) : null;
      } catch (e) {
        entry.headError = String(e.message || e);
      }

      // Try range GET if needed
      if (!entry.contentLength) {
        try {
          const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
          entry.rangeStatus = r.status;
          const cr = r.headers.get('content-range');
          if (cr) {
            const match = cr.match(/\/(\d+)$/);
            if (match) entry.contentLength = parseInt(match[1], 10);
          }
          const cl2 = r.headers.get('content-length');
          if (!entry.contentLength && cl2) entry.contentLength = parseInt(cl2, 10);
          const ct = r.headers.get('content-type');
          if (!entry.contentType && ct) entry.contentType = ct;
        } catch (e) {
          entry.rangeError = String(e.message || e);
        }
      }

      entry.issues = [];
      if (entry.contentLength !== null && entry.contentLength < 1024) entry.issues.push('tiny_file');
      const ct = (entry.contentType || '').toLowerCase();
      if (ct && !ct.startsWith('image/') && !ct.startsWith('video/') && !ct.startsWith('audio/')) {
        entry.issues.push('non_media_type');
      }
      if (!entry.headStatus && !entry.rangeStatus) entry.issues.push('no_head_or_range');

      if (entry.issues.length > 0) problems.push(entry);

      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Inspected ${inspected} items; will flag ${problems.length} items.`);

    if (!APPLY) {
      for (const p of problems) {
        console.log(`DRY-RUN: would flag ${p.id} user=${p.userId} title=${p.title || ''} issues=${p.issues.join(',')} size=${p.contentLength} type=${p.contentType} url=${p.url}`);
      }
      console.log('Run again with --apply to write flags to Firestore.');
      process.exit(0);
    }

    // Apply flags
    for (const p of problems) {
      try {
        const contentRef = db.collection('content').doc(p.id);
        await contentRef.update({
          uploadIssue: {
            issues: p.issues,
            contentType: p.contentType || null,
            contentLength: p.contentLength || null,
            scannedAt: admin.firestore.FieldValue.serverTimestamp(),
            note: 'Detected by automated scan: file small or non-media type',
          },
        });
        console.log(`Flagged ${p.id} (${p.issues.join(',')})`);
      } catch (e) {
        console.error(`Failed to flag ${p.id}:`, e && e.message ? e.message : e);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Flagger failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();