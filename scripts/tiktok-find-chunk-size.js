#!/usr/bin/env node
/*
Find an acceptable chunk_size for TikTok FILE_UPLOAD following the Media Transfer Guide.
Usage: node -r dotenv/config scripts/tiktok-find-chunk-size.js <contentId>

The script will:
- fetch video size via HEAD (or GET fallback)
- compute candidate chunk_sizes between 5MB and 64MB
- filter candidates where total_chunk_count=floor(video_size/chunk_size) is within [1,1000]
  and final chunk rules are satisfied (either leftover==0 || leftover>=5MB || chunk_size+leftover<=128MB)
- test init for each candidate (with small backoff)
- save captures (request/response) under tmp/tiktok-chunk-captures-probe/<id>/

Be careful with rate limits (429). Use sparingly.
*/

(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-find-chunk-size.js <contentId>');
      process.exit(1);
    }
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken } = require('../src/services/tiktokService');
    const fetch = global.fetch || require('node-fetch');
    const fs = require('fs');
    const path = require('path');

    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) {
      console.error('Content doc not found:', contentId);
      process.exit(1);
    }
    const data = snap.data();
    const videoUrl = data.mediaUrl || data.url || data.videoUrl || data.media_url;
    if (!videoUrl) {
      console.error('No video URL on content', contentId);
      process.exit(1);
    }

    // Determine video size
    let size = null;
    try {
      const head = await fetch(videoUrl, { method: 'HEAD' });
      const cl = head.headers && (head.headers.get ? head.headers.get('content-length') : head.headers && head.headers['content-length']);
      size = parseInt(cl, 10) || null;
    } catch (e) {
      /* ignore */
    }
    if (!size || Number.isNaN(size)) {
      console.log('No content-length from HEAD; downloading to compute size');
      const resp = await fetch(videoUrl, { method: 'GET' });
      const buf = Buffer.from(await resp.arrayBuffer());
      size = buf.byteLength;
    }

    console.log('Video size:', size);
    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const token = await getValidAccessToken(uid);

    if (!token) {
      console.error('No access token for uid', uid);
      process.exit(1);
    }

    // Candidate chunk sizes (bytes): inclusive 5MB..64MB; step 1MB to limit requests
    const MB = 1024 * 1024;
    const minChunk = 5 * MB;
    const maxChunk = 64 * MB;

    const candidates = [];
    for (let cs = minChunk; cs <= maxChunk; cs += MB) candidates.push(cs);

    const probeDir = path.join(process.cwd(), 'tmp', 'tiktok-chunk-probes');
    await fs.promises.mkdir(probeDir, { recursive: true });

    for (const cs of candidates) {
      const totalChunks = Math.floor(size / cs);
      if (totalChunks < 1 || totalChunks > 1000) continue;
      const leftover = size - cs * totalChunks; // trailing bytes

      // Acceptance conditions per guide (interpreted):
      // - if leftover === 0 -> OK
      // - if leftover >= 5MB -> OK (final chunk is leftover)
      // - if leftover > 0 and leftover < 5MB -> must be merged into last chunk, so last chunk = cs + leftover must be <=128MB
      const lastChunkSize = leftover === 0 ? cs : (leftover >= 5 * MB ? leftover : cs + leftover);
      if (lastChunkSize < 5 * MB) continue;
      if (lastChunkSize > 128 * MB) continue;

      console.log('Testing chunk_size=', cs, 'totalChunks=', totalChunks, 'leftover=', leftover, 'lastChunk=', lastChunkSize);

      const body = {
        post_info: { title: '', privacy_level: 'SELF_ONLY' },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: cs, total_chunk_count: totalChunks },
      };

      // call init
      try {
        const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const txt = await res.text().catch(() => '<no-body>');

        const id = Date.now().toString() + '-' + cs;
        const dir = path.join(probeDir, id);
        await fs.promises.mkdir(dir);
        await fs.promises.writeFile(path.join(dir, 'request.json'), JSON.stringify(body, null, 2));
        await fs.promises.writeFile(path.join(dir, 'response.txt'), txt);
        await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ chunk_size: cs, totalChunks, leftover, lastChunkSize, status: res.status, ok: res.ok }, null, 2));

        console.log('Init status=', res.status, 'body=', txt.slice(0, 400));
        if (res.ok) {
          console.log('Found acceptable chunk_size:', cs);
          process.exit(0);
        }

        // Respect rate limits: if 429, back off longer
        if (res.status === 429) {
          console.warn('Rate limited; backing off 5s');
          await new Promise(r => setTimeout(r, 5000));
        } else {
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (e) {
        console.error('probe error for cs=', cs, e && (e.message || e));
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log('Probe complete. Checks saved in', probeDir);
    process.exit(0);
  } catch (e) {
    console.error('fatal', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();