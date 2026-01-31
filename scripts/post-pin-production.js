#!/usr/bin/env node
require('dotenv').config();
(async function(){
  try{
    const admin = require('firebase-admin');
    admin.initializeApp({credential: admin.credential.cert(require('../service-account-key.json'))});
    const db = admin.firestore();
    const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const boardId = process.argv[3] || '1099582133960862560';
    const imageUrl = process.argv[4] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg';
    const message = process.argv[5] || 'AutoPromote: Real Pinterest post (approved by owner)';

    console.log('[post-pin] creating content for uid', uid);
    const contentPayload = {
      title: 'AutoPromote — Pinterest Production Post',
      description: 'Posting to Pinterest from AutoPromote production flow',
      type: 'image',
      imageUrl,
      url: imageUrl,
      user_id: uid,
      userId: uid,
      created_at: new Date().toISOString(),
      status: 'approved'
    };
    const ref = await db.collection('content').add(contentPayload);
    const contentId = ref.id;
    console.log('[post-pin] content created', contentId);

    const { enqueuePlatformPostTask, processNextPlatformTask } = require('../src/services/promotionTaskQueue');

    console.log('[post-pin] enqueueing pinterest post task for board', boardId);
    const task = await enqueuePlatformPostTask({
      contentId,
      uid,
      platform: 'pinterest',
      reason: 'manual_production_post',
      payload: { message, platformOptions: { pinterest: { boardId } }, imageUrl }
    });
    console.log('[post-pin] enqueued task id', task.id);

    console.log('[post-pin] processing next platform task (this will attempt to post to Pinterest)');
    const result = await processNextPlatformTask();
    console.log('[post-pin] processed result', JSON.stringify(result, null, 2));

    // Look up created platform_posts
    const postsSnap = await db.collection('platform_posts').where('contentId', '==', contentId).where('platform', '==', 'pinterest').get();
    if (postsSnap.empty) {
      console.log('[post-pin] no platform_posts found for content', contentId);
    } else {
      postsSnap.forEach(doc => {
        const d = doc.data();
        // safe summary: do not print tokens
        console.log('[post-pin] platform_post:', doc.id, {
          success: d.success,
          externalId: d.externalId || null,
          simulated: d.simulated || false,
          rawOutcomeSummary: d.rawOutcome && (d.rawOutcome.reason || d.rawOutcome.error || 'ok')
        });
      });
    }

    console.log('[post-pin] done');
    process.exit(0);
  }catch(e){
    console.error('ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();