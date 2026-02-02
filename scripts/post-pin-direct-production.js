#!/usr/bin/env node
require('dotenv').config();
(async function(){
  try{
    const admin = require('firebase-admin');
    admin.initializeApp({credential: admin.credential.cert(require('../service-account-key.json'))});
    const db = admin.firestore();
    const uid = process.argv[2] || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    let contentId = process.argv[3] || null;
    const boardId = process.argv[4] || '1099582133960862560';
    const imageUrl = process.argv[5] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg';
    const message = process.argv[6] || 'AutoPromote: Real Pinterest direct post (approved by owner)';

    if (!contentId) {
      // find latest content for user
      const snap = await db.collection('content').where('userId','==',uid).orderBy('created_at','desc').limit(1).get();
      if (!snap.empty) contentId = snap.docs[0].id;
      if (!contentId) throw new Error('No content found for user; pass contentId as arg');
    }

    const { dispatchPlatformPost } = require('../src/services/platformPoster');
    const { recordPlatformPost } = require('../src/services/platformPostsService');

    const payload = { message, platformOptions: { pinterest: { boardId } }, imageUrl };
    console.log('[post-direct] calling dispatchPlatformPost for content', contentId);
    const outcome = await dispatchPlatformPost({ platform: 'pinterest', contentId, payload, reason: 'manual_direct_post', uid });
    console.log('[post-direct] outcome (safe):', { platform: outcome.platform, success: outcome.success, simulated: outcome.simulated, reason: outcome.reason || null, postId: outcome.pinId || outcome.postId || outcome.externalId || null });

    console.log('[post-direct] recording platform post');
    const rec = await recordPlatformPost({ platform: 'pinterest', contentId, uid, reason: 'manual_direct_post', payload, outcome });
    console.log('[post-direct] recorded platform_post id', rec.id, 'success:', rec.success);

    console.log('[post-direct] done');
    process.exit(0);
  }catch(e){
    console.error('ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();