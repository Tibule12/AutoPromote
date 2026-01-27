#!/usr/bin/env node
/* Force single-chunk upload for a content doc: initialize with chunk_size=videoSize, upload one chunk, then publish.
Usage: node -r dotenv/config scripts/tiktok-force-single-chunk.js <contentId>
*/
(async ()=>{
  try{
    const contentId = process.argv[2];
    if(!contentId){ console.error('Usage: node scripts/tiktok-force-single-chunk.js <contentId>'); process.exit(1); }
    const { db } = require('../src/firebaseAdmin');
    const { getValidAccessToken } = require('../src/services/tiktokService');
    const fetch = global.fetch || require('node-fetch');
    // We'll call init/upload/poll directly here since internal helpers are not exported
    const snap = await db.collection('content').doc(contentId).get();
    if(!snap.exists){ console.error('Content not found'); process.exit(1); }
    const data = snap.data();
    const videoUrl = data.mediaUrl || data.url || data.videoUrl || data.media_url;
    if(!videoUrl) { console.error('No video URL on content', contentId); process.exit(1); }
    // Get video buffer and size
    console.log('Downloading video to buffer:', videoUrl.slice(0,120));
    const resp = await fetch(videoUrl, { method: 'GET', redirect:'follow' });
    if(!resp.ok) throw new Error('Failed to download video: '+resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    const size = buf.byteLength;
    console.log('Video size:', size);

    const uid = process.env.TEST_UID || data.uid || data.userId || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const token = await getValidAccessToken(uid);
    if(!token) throw new Error('no token');

    console.log('Initializing upload with single-chunk size=', size);

    // Call init endpoint
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_info: { title: '', privacy_level: 'SELF_ONLY' }, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 } }),
    });
    const initText = await initRes.text().catch(()=>'<no-body>');
    console.log('init status=', initRes.status, 'body=', initText.slice(0,200));
    if(!initRes.ok) throw new Error('init failed: '+initText);
    let initJson = {};
    try { initJson = JSON.parse(initText); } catch(e) { initJson = {}; }
    const publishId = initJson && initJson.data && initJson.data.publish_id;
    const uploadUrl = initJson && initJson.data && initJson.data.upload_url;
    if(!publishId || !uploadUrl) throw new Error('init did not return publish_id/upload_url');

    console.log('Uploading single chunk to uploadUrl (PUT) size=', size);
    const contentRange = `bytes 0-${size-1}/${size}`;
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': '' + size, 'Content-Range': contentRange }, body: buf });
    const putText = await putRes.text().catch(()=>'<no-body>');
    console.log('PUT status=', putRes.status, 'body=', putText && putText.slice(0,200));
    if(!putRes.ok) throw new Error('PUT failed: '+putText);

    console.log('Upload done. Polling publish status...');

    // Poll publish status
    const start = Date.now();
    let pubStatus = null;
    while(Date.now()-start < 120000) {
      await new Promise(r=>setTimeout(r, 3000));
      const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ publish_id: publishId }) });
      const statusText = await statusRes.text().catch(()=>'<no-body>');
      const sJson = await statusRes.json().catch(()=>null);
      pubStatus = sJson && sJson.data ? sJson.data : null;
      console.log('status poll', statusRes.status, pubStatus && pubStatus.status);
      if(pubStatus && (pubStatus.status === 'SUCCESS' || pubStatus.status === 'PUBLISH_COMPLETE')) break;
      if(pubStatus && pubStatus.status === 'FAILED') break;
    }

    await db.collection('content').doc(contentId).set({ tiktok: { publishId, status: pubStatus && pubStatus.status ? pubStatus.status : 'unknown', data: pubStatus } }, { merge: true });
    console.log('Done.');
    console.log('Done.');
    process.exit(0);
  }catch(e){ console.error('Failed:', e && (e.stack || e.message || e)); process.exit(1); }
})();
