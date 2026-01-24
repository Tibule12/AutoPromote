/*
Probe TikTok /video/init for a range of chunk_size values to find an accepted configuration.
Usage: node -r dotenv/config scripts/tiktok-probe-chunk-sizes.js <contentId>
*/
(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-probe-chunk-sizes.js <contentId>');
      process.exit(1);
    }
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken } = require('../src/services/tiktokService');

    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) {
      console.error('Content doc not found:', contentId);
      process.exit(1);
    }
    const data = snap.data();
    const videoUrl = data.mediaUrl || data.url || data.videoUrl;
    if (!videoUrl) {
      console.error('No signed url on content. Run scripts/generate-signed-url-and-write.js first');
      process.exit(1);
    }

    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const token = await getValidAccessToken(uid);
    if (!token) {
      console.error('No access token for uid', uid);
      process.exit(1);
    }

    // Download the video to determine size
    const fetch = global.fetch || require('node-fetch');
    const res = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = res.headers.get ? res.headers.get('content-length') : res.headers && res.headers['content-length'];
    const size = parseInt(contentLength, 10) || null;
    console.log('Video size:', size);

    const probe = [1048576, 2097152, 3145728, 4194304, 5242880, 6291456, 7340032, 8388608, 10485760, size];

    for (const chunkSize of probe) {
      try {
        console.log('\nProbing chunk_size=', chunkSize);
        const body = {
          post_info: { title: '', privacy_level: 'SELF_ONLY' },
          source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: Math.ceil(size / chunkSize) },
        };
        const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const txt = await initRes.text();
        console.log('status=', initRes.status, 'body=', txt.slice(0, 1000));
      } catch (e) {
        console.error('probe error', e && (e.stack || e.message || e));
      }
    }

    process.exit(0);
  } catch (e) {
    console.error(e && (e.stack || e.message || e));
    process.exit(1);
  }
})();