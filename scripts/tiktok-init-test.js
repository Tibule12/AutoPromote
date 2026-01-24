/*
Test initializeVideoUpload via tiktokService directly
Usage: node -r dotenv/config scripts/tiktok-init-test.js <contentId>
*/
(async () => {
  try {
    const contentId = process.argv[2];
    if (!contentId) {
      console.error('Usage: node scripts/tiktok-init-test.js <contentId>');
      process.exit(1);
    }
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken, initializeVideoUpload } = require('../src/services/tiktokService');
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
    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const token = await getValidAccessToken(uid);
    console.log('Video size:', size, 'token length:', token && token.length);

    const res = await initializeVideoUpload({ accessToken: token, videoSize: size, chunkSize: size });
    console.log('init response', res);
    process.exit(0);
  } catch (e) {
    console.error('init test failed:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();