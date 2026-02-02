require('dotenv').config();
(async function(){
  try{
    const { db, admin } = require('../firebaseAdmin');
    const { enqueuePlatformPostTask, processNextPlatformTask } = require('../src/services/promotionTaskQueue');

    const uid = process.env.TEST_PROMO_UID || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const publicImage = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg';

    // Create content doc (image post)
    const contentPayload = {
      title: 'AutoPromote — Pinterest Promo Demo',
      description: 'Demo pin to validate Pinterest promotion (simulated)',
      type: 'image',
      imageUrl: publicImage,
      url: publicImage,
      user_id: uid,
      userId: uid,
      created_at: new Date().toISOString(),
      duration: 0,
      viral_optimized: true,
      status: 'approved'
    };
    const contentRef = await db.collection('content').add(contentPayload);
    console.log('[pinterest-promo] created content', contentRef.id);
    const contentDoc = await contentRef.get();
    const content = { id: contentRef.id, ...contentDoc.data() };

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
      paymentType: 'demo',
      price: 0,
      currentViews: 0,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + boostPackage.duration * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    const boostRef = await db.collection('viral_boosts').add(boost);
    await db.collection('content').doc(content.id).update({ boosted: true, boostId: boostRef.id, updatedAt: new Date().toISOString() });
    console.log('[pinterest-promo] boost activated', boostRef.id);

    // Enqueue a pinterest post task
    const message = "AutoPromote Pinterest demo — simulated post 🚀";
    // Use a placeholder boardId so platform-specific logic can find a value if needed
    const placeholderBoardId = 'board_simulated_1234';
    console.log('[pinterest-promo] enqueue platform post (pinterest)');
    const task = await enqueuePlatformPostTask({ contentId: content.id, uid, platform: 'pinterest', payload: { message, platformOptions: { pinterest: { boardId: placeholderBoardId } }, imageUrl: publicImage } });
    console.log('[pinterest-promo] enqueued task', task.id);

    // Force simulated Pinterest flow locally (avoid calling external API)
    process.env.PINTEREST_CLIENT_ID = '';
    process.env.PINTEREST_CLIENT_SECRET = '';

    // Process one platform task immediately
    console.log('[pinterest-promo] processing platform task once (simulated posting)');
    const processed = await processNextPlatformTask();
    console.log('[pinterest-promo] processed:', JSON.stringify(processed, null, 2));

    // Inspect platform_posts created for this content
    const postsSnap = await db.collection('platform_posts').where('contentId','==',content.id).get();
    console.log('[pinterest-promo] platform_posts count:', postsSnap.size);
    postsSnap.forEach(p => console.log(' -', p.id, p.data()));

    console.log('[pinterest-promo] done. Content ID:', content.id, 'Boost ID:', boostRef.id);
    process.exit(0);
  }catch(e){
    console.error('ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();