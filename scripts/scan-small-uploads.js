/*
Scan content docs for potentially broken or too-small uploads.
- Queries recent content docs and inspects their `url` fields
- Performs a lightweight HEAD or Range GET to determine content-type and size
- Flags items with content-length < 1KB or non-media content-types

Usage: node ./scripts/scan-small-uploads.js [--limit=500] [--since-days=30] [--write-to-bucket=false]
*/

const fs = require('fs');
const path = require('path');
const { db } = require('../firebaseAdmin');
const fetch = require('node-fetch');

const argv = require('minimist')(process.argv.slice(2));
const LIMIT = parseInt(argv.limit || '500', 10);
const SINCE_DAYS = parseInt(argv['since-days'] || '90', 10);

(async function main() {
  try {
    const cutoff = Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000;

    console.log(`Scanning up to ${LIMIT} recent content docs (created within ${SINCE_DAYS} days)...`);

    // Try to order by createdAt or created_at; fallback to updatedAt
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

    const results = [];
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
      let headOk = false;
      try {
        const head = await fetch(url, { method: 'HEAD' });
        entry.headStatus = head.status;
        entry.contentType = head.headers.get('content-type');
        const cl = head.headers.get('content-length');
        entry.contentLength = cl ? parseInt(cl, 10) : null;
        headOk = head.ok;
      } catch (e) {
        entry.headError = String(e.message || e);
      }

      // If HEAD not available or no content-length, try a small range GET
      if (!entry.contentLength) {
        try {
          const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
          entry.rangeStatus = r.status;
          // some servers return content-range header
          const cr = r.headers.get('content-range');
          if (cr) {
            // content-range like 'bytes 0-1023/12345'
            const match = cr.match(/\/(\d+)$/);
            if (match) entry.contentLength = parseInt(match[1], 10);
          }
          // fallback to content-length
          const cl2 = r.headers.get('content-length');
          if (!entry.contentLength && cl2) entry.contentLength = parseInt(cl2, 10);
          const ct = r.headers.get('content-type');
          if (!entry.contentType && ct) entry.contentType = ct;
        } catch (e) {
          entry.rangeError = String(e.message || e);
        }
      }

      // Mark issues
      entry.issues = [];
      if (entry.contentLength !== null && entry.contentLength < 1024) entry.issues.push('tiny_file');
      const ct = (entry.contentType || '').toLowerCase();
      if (ct && !ct.startsWith('image/') && !ct.startsWith('video/') && !ct.startsWith('audio/')) {
        entry.issues.push('non_media_type');
      }
      // If HEAD/Range both failed
      if (!headOk && !entry.rangeStatus) entry.issues.push('no_head_or_range');

      if (entry.issues.length > 0) results.push(entry);

      // Rate-limit a bit
      await new Promise(r => setTimeout(r, 150));
    }

    console.log(`Inspected ${inspected} items; found ${results.length} problematic items.`);

    const outPath = path.join(process.cwd(), 'scripts', `scan-small-uploads-results-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ inspected, results }, null, 2), 'utf8');

    console.log(`Wrote results to ${outPath}`);

    // Also print a short table
    for (const r of results) {
      console.log(`- ${r.id} user=${r.userId} title=${r.title || ''} issues=${r.issues.join(',')} size=${r.contentLength} type=${r.contentType} url=${r.url}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Scan failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();