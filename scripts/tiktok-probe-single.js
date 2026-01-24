/*
Probe single chunk_size equal to content video size
Usage: node -r dotenv/config scripts/tiktok-probe-single.js <contentId>
*/
(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-probe-single.js <contentId>');
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
    const fetch = global.fetch || require('node-fetch');
    const head = await fetch(videoUrl, { method: 'HEAD' });
    const size = parseInt(head.headers.get('content-length'), 10);
    console.log('Video size:', size);
    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const token = await getValidAccessToken(uid);
    console.log('Using token length:', token && token.length);
    const body = {
      post_info: { title: '', privacy_level: 'SELF_ONLY' },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    };
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await initRes.text();
    console.log('status=', initRes.status, 'body=', txt);
    process.exit(0);
  } catch (e) {
    console.error(e && (e.stack || e.message || e));
    process.exit(1);
  }
})();