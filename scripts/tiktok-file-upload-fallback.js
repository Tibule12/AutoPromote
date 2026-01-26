/*
Server-side FILE_UPLOAD fallback for TikTok using existing signed URL on a content doc.
Usage: node -r dotenv/config scripts/tiktok-file-upload-fallback.js <contentId>
*/
(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-file-upload-fallback.js <contentId>');
      process.exit(1);
    }

    const { db } = require('../src/firebaseAdmin');
    const { uploadTikTokVideo } = require('../src/services/tiktokService');

    const snap = await db.collection('content').doc(contentId).get();
    if (!snap.exists) {
      console.error('Content doc not found:', contentId);
      process.exit(1);
    }
    const data = snap.data();
    const videoUrl = data.mediaUrl || data.url || data.videoUrl || data.media_url;
    if (!videoUrl) {
      console.error('No signed url found on content. Run scripts/generate-signed-url-and-write.js first');
      process.exit(1);
    }

    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';

    console.log('Starting FILE_UPLOAD fallback for', contentId, 'uid=', uid);

    // First, perform an explicit init test to observe TikTok response in this runtime
    const fetch = global.fetch || require('node-fetch');
    // Try HEAD to get content-length; if missing, do a GET to compute size
    let size = null;
    try {
      const head = await fetch(videoUrl, { method: 'HEAD' });
      size = parseInt(head.headers.get('content-length'), 10);
    } catch (e) {
      // ignore and try GET below
    }
    if (!size || Number.isNaN(size)) {
      console.log('No content-length from HEAD; downloading to compute size');
      const resp = await fetch(videoUrl, { method: 'GET' });
      const buf = await resp.arrayBuffer();
      size = buf.byteLength;
    }
    console.log('Video size:', size);

    const token = await require('../src/services/tiktokService').getValidAccessToken(uid);
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

    const initText = await initRes.text();
    console.log('init status=', initRes.status, 'body=', initText);

    // If init succeeded, proceed to full upload via existing helper
    if (initRes.ok) {
      const res = await uploadTikTokVideo({ contentId, payload: { videoUrl }, uid });
      console.log('Result:', res);
      process.exit(0);
    } else {
      console.log('Init failed; not proceeding to upload.');
      process.exit(1);
    }
  } catch (e) {
    console.error('Failed:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();