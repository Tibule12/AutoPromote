/*
Stepwise upload to TikTok with verbose logs for debugging
Usage: node -r dotenv/config scripts/tiktok-upload-stepwise.js <contentId>
*/
(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-upload-stepwise.js <contentId>');
      process.exit(1);
    }
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken } = require('../src/services/tiktokService');
    const fetch = global.fetch || require('node-fetch');

    const snap = await db.collection('content').doc(contentId).get();
    const data = snap.data();
    const videoUrl = data.mediaUrl || data.url || data.videoUrl;
    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';

    const token = await getValidAccessToken(uid);
    console.log('token length', token && token.length);

    const videoRes = await fetch(videoUrl, { method: 'GET' });
    if (!videoRes.ok) {
      console.error('Failed to GET video from signed URL', videoRes.status, await videoRes.text());
      process.exit(1);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const videoSize = videoBuffer.length;
    console.log('Video downloaded, size=', videoSize);

    const DEFAULT_CHUNK_SIZE = parseInt(process.env.TIKTOK_CHUNK_SIZE || '5242880', 10);
    const tryInit = async chunkSize => {
      const body = {
        post_info: { title: '', privacy_level: 'SELF_ONLY' },
        source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: chunkSize, total_chunk_count: Math.ceil(videoSize / chunkSize) },
      };
      console.log('Calling init with chunk_size=', chunkSize, 'total_chunks=', Math.ceil(videoSize / chunkSize));
      const r = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      console.log('init status', r.status, 'body', txt);
      return { r, txt };
    };

    // first attempt with DEFAULT_CHUNK_SIZE
    let init = await tryInit(DEFAULT_CHUNK_SIZE);
    if (!init.r.ok && /chunk|total chunk/i.test(init.txt)) {
      console.log('Retrying with single-chunk equal to video size');
      init = await tryInit(videoSize);
      if (!init.r.ok) {
        console.error('Retry init failed', init.r.status, init.txt);
        process.exit(1);
      }
    } else if (!init.r.ok) {
      console.error('Init failed', init.r.status, init.txt);
      process.exit(1);
    }

    const initJson = JSON.parse(init.txt);
    const { upload_url, publish_id } = initJson.data || {};
    console.log('init success upload_url present?', !!upload_url, 'publish_id', publish_id);

    // Upload the single chunk (or chunks if more than one)
    const chunkSize = videoSize; // we'll upload entire file as one chunk
    const start = 0;
    const end = videoSize - 1;
    console.log(`PUT to upload_url bytes ${start}-${end}/${videoSize}`);

    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${videoSize}` },
      body: videoBuffer,
    });
    console.log('PUT status', putRes.status, 'statusText', putRes.statusText);
    if (!putRes.ok) {
      console.error('Upload PUT failed:', await putRes.text());
      process.exit(1);
    }

    // Poll publish status
    console.log('Polling publish status for publish_id=', publish_id);
    const pollPayload = { publish_id: publish_id };
    for (let i = 0; i < 20; i++) {
      const r = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pollPayload),
      });
      const txt = await r.text();
      console.log('poll', i, 'status', r.status, 'body', txt.slice(0, 1000));
      let data;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        data = null;
      }
      if (data && data.data && data.data.status) {
        const s = data.data.status;
        console.log('publish status:', s, data.data);
        if (s === 'SUCCESS' || s === 'FAILED') {
          process.exit(0);
        }
      }
      await new Promise(r => setTimeout(r, 4000));
    }

    console.log('polling timed out');
    process.exit(1);
  } catch (e) {
    console.error('stepwise error', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();