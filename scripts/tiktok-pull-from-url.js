/*
Init a TikTok PULL_FROM_URL upload using the content.url and the owner's access token.
Usage: node -r dotenv/config scripts/tiktok-pull-from-url.js <contentId>
*/

(async () => {
  try {
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken } = require('../src/services/tiktokService');
    const fetch = global.fetch || require('node-fetch');

    const contentId = process.argv[2] || 'KM9rCHI8pV0BuDOzZF6l';
    const contentSnap = await db.collection('content').doc(contentId).get();
    if (!contentSnap.exists) throw new Error('content not found: ' + contentId);
    const content = contentSnap.data();
    const url = content.url;
    if (!url) throw new Error('content.url missing');
    const uid = content.userId || content.userID || content.user_id;
    if (!uid) throw new Error('content.userId missing');

    const accessToken = await getValidAccessToken(uid);
    if (!accessToken) throw new Error('no access token for user: ' + uid);

    console.log('Using access token (truncated):', accessToken.slice(0, 10) + '...');
    console.log('Calling TikTok init with PULL_FROM_URL ->', url.slice(0, 120));

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: content.title || 'AutoPromote video',
          privacy_level: 'SELF_ONLY',
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: url,
        },
      }),
    });

    const initJson = await initRes.json().catch(() => ({}));
    console.log('init status', initRes.status, JSON.stringify(initJson).slice(0, 800));

    if (!initRes.ok) throw new Error('init failed: ' + JSON.stringify(initJson));
    const publishId = initJson?.data?.publish_id;
    if (!publishId) throw new Error('no publish_id returned');

    console.log('publish_id:', publishId);

    // Poll for status
    const start = Date.now();
    while (Date.now() - start < 2 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 4000));
      const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const statusJson = await statusRes.json().catch(() => ({}));
      console.log('status poll', statusRes.status, JSON.stringify(statusJson).slice(0, 400));
      if (statusJson && statusJson.data && statusJson.data.status) {
        const s = statusJson.data.status;
        if (s === 'SUCCESS' || s === 'FAILED' || s === 'PROCESSING') {
          // Write to content doc
          await db
            .collection('content')
            .doc(contentId)
            .set({ tiktok: { publishId, status: s, lastChecked: new Date().toISOString() } }, { merge: true });
          console.log('Final status:', s);
          process.exit(0);
        }
      }
    }

    console.log('Timed out waiting for publish status');
    process.exit(0);
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
