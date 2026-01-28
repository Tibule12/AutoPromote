require('dotenv').config();
const path = require('path');
const fs = require('fs');
(async function(){
  try{
    const { db, admin } = require('../firebaseAdmin');
    const viralImpact = require('../src/services/viralImpactEngine');
    const { enqueuePlatformPostTask, processNextPlatformTask } = require('../src/services/promotionTaskQueue');

    const uid = process.env.TEST_PROMO_UID || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const srcFile = path.resolve(__dirname, '..', 'test', 'e2e', 'playwright', 'test-assets', 'test.mp4');
    if (!fs.existsSync(srcFile)) throw new Error('Source video not found: ' + srcFile);

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET; // may be undefined; bucket() will use default
    const bucket = admin.storage ? admin.storage().bucket(bucketName) : null;
    if (!bucket) throw new Error('Storage bucket not available');

    const destPath = `uploads/promos/promo-${Date.now()}.mp4`;
    console.log('[promo] uploading', srcFile, '->', destPath);
    await bucket.upload(srcFile, { destination: destPath, metadata: { contentType: 'video/mp4' } });
    const file = bucket.file(destPath);
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24*3600*1000 });
    console.log('[promo] signed url', signedUrl.slice(0,80),'...');

    // Create content doc
    const contentPayload = {
      title: 'AutoPromote — Promo Demo',
      description: 'Demo promo to validate viral boost pipeline',
      type: 'video',
      url: signedUrl,
      user_id: uid,
      created_at: new Date().toISOString(),
      duration: 15,
      viral_optimized: true,
      status: 'approved'
    };
    const contentRef = await db.collection('content').add(contentPayload);
    console.log('[promo] created content', contentRef.id);
    const contentDoc = await contentRef.get();
    const content = { id: contentRef.id, ...contentDoc.data() };

    // Run viral seeding & boost chain orchestration
    console.log('[promo] seeding content to visibility zones (twitter)');
    const seedRes = await viralImpact.seedContentToVisibilityZones(content, 'twitter', { forceAll: true });
    console.log('[promo] seeding result:', JSON.stringify(seedRes, null, 2));

    console.log('[promo] orchestrating boost chain (empty squad)');
    const boostChain = await viralImpact.orchestrateBoostChain(content, ['twitter'], { userId: uid, squadUserIds: [] });
    console.log('[promo] boost chain:', boostChain);

    // Create a free viral boost record to simulate activation
    const boostPackage = { id: 'free', name: 'Free Viral Boost', views: 10000, duration: 48 };
    const boost = {
      userId: uid,
      contentId: content.id,
      packageId: boostPackage.id,
      packageName: boostPackage.name,
      targetViews: boostPackage.views,
      duration: boostPackage.duration,
      status: 'active',
      paymentType: 'subscription',
      price: 0,
      currentViews: 0,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + boostPackage.duration * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    const boostRef = await db.collection('viral_boosts').add(boost);
    await db.collection('content').doc(content.id).update({ boosted: true, boostId: boostRef.id, updatedAt: new Date().toISOString() });
    console.log('[promo] boost activated', boostRef.id);

    // Enqueue a twitter post task
    const caption = "Check out AutoPromote — publish smarter, grow faster 🚀 #AutoPromote";
    console.log('[promo] enqueue platform post (twitter)');
    const task = await enqueuePlatformPostTask({ contentId: content.id, uid, platform: 'twitter', payload: { message: caption, videoUrl: signedUrl } });
    console.log('[promo] enqueued task', task.id);

    // Process one platform task immediately (will post to Twitter)
    console.log('[promo] processing platform task once (posting)');
    const processed = await processNextPlatformTask();
    console.log('[promo] processed:', JSON.stringify(processed, null, 2));

    // Kick off a basic monitor to watch boost progress for a short time
    console.log('[promo] starting short monitor (15s)');
    for (let i=0;i<5;i++){
      const bSnap = await db.collection('viral_boosts').doc(boostRef.id).get();
      const b = bSnap.exists ? bSnap.data() : {};
      const pSnap = await db.collection('platform_posts').where('contentId','==',content.id).get();
      console.log(`[monitor] iteration ${i+1}: boost progress ${b.currentViews||0}/${b.targetViews} | posts: ${pSnap.size}`);
      await new Promise(r=>setTimeout(r,3000));
    }

    console.log('[promo] done. Content ID:', content.id, 'Boost ID:', boostRef.id);
    process.exit(0);
  }catch(e){
    console.error('ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();