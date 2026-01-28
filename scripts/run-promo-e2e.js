require('dotenv').config();
process.env.FIREBASE_ADMIN_BYPASS = '1';
(async function(){
  try{
    const { db } = require('../firebaseAdmin');
    const { enqueuePlatformPostTask, processNextPlatformTask } = require('../src/services/promotionTaskQueue');

    const contentId = '9xNxmdWL78jcQBeReoLi';
    const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';

    console.log('[e2e] enqueueing platform_post (bypass mode)');
    const task = await enqueuePlatformPostTask({ contentId, uid, platform: 'twitter', payload: { message: 'End-to-end promo', videoUrl: 'https://example.com/vid.mp4' } });
    console.log('[e2e] enqueue result:', task);

    console.log('[e2e] processing platform tasks (first run)');
    let processed = await processNextPlatformTask();
    console.log('[e2e] process result:', processed);

    // If no task processed, inspect in-memory DB for queued tasks and run processor again
    if (!processed) {
      console.log('[e2e] no tasks processed; inspecting in-memory DB');
      const mem = global.__AUTOPROMOTE_IN_MEMORY_DB;
      for (const [k,v] of mem.entries()){
        if (k.startsWith('promotion_tasks/')) console.log('MEM TASK', k, v);
      }
      console.log('[e2e] running processor again');
      processed = await processNextPlatformTask();
      console.log('[e2e] process result 2:', processed);
    }

    // Simulate boost fulfillment: find active boost for content
    console.log('[e2e] find boosts for content');
    let boostRef = null;
    try {
      const boostSnap = await db.collection('viral_boosts').where('contentId','==',contentId).where('status','==','active').get();
      if (boostSnap && !boostSnap.empty) {
        boostRef = boostSnap.docs[0];
      }
    } catch (e) {
      // In-memory DB may not support where chaining; fallback to scanning global cache
      console.log('[e2e] where query failed, falling back to in-memory scan');
      const mem = global.__AUTOPROMOTE_IN_MEMORY_DB || new Map();
      for (const [k,v] of mem.entries()){
        if (k.startsWith('viral_boosts/')) {
          if (v && v.contentId === contentId && v.status === 'active') {
            const id = k.split('/')[1];
            boostRef = { id, data: () => v };
            break;
          }
        }
      }
    }

    if (!boostRef) {
      console.log('[e2e] no active boost found - creating one for test');
      const boost = {
        userId: uid,
        contentId,
        packageId: 'free',
        packageName: 'Free Viral Boost',
        targetViews: 10000,
        duration: 48,
        status: 'active',
        paymentType: 'subscription',
        price: 0,
        currentViews: 0,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      const ref = await db.collection('viral_boosts').add(boost);
      boostRef = await db.collection('viral_boosts').doc(ref.id).get();
      console.log('[e2e] created boost', ref.id);
    }

    const bdoc = boostRef; // consistency
    console.log('[e2e] processing boost', bdoc.id, bdoc.data ? bdoc.data() : bdoc);
    const target = (bdoc.data ? bdoc.data().targetViews : bdoc.targetViews) || 10000;
    let progress = (bdoc.data ? bdoc.data().currentViews : bdoc.currentViews) || 0;
    while (progress < target) {
      const inc = Math.min(2000, target - progress);
      await db.collection('viral_boosts').doc(bdoc.id).update({ currentViews: (progress + inc), updatedAt: new Date().toISOString() });
      progress += inc;
      console.log(`[e2e] simulated boost progress ${progress}/${target}`);
      await new Promise(r=>setTimeout(r,500));
    }
    await db.collection('viral_boosts').doc(bdoc.id).update({ status: 'completed', completedAt: new Date().toISOString() });
    console.log('[e2e] boost completed');

    // Report platform_posts (fall back for in-memory DB)
    let postsCount = 0;
    try {
      const postsSnap = await db.collection('platform_posts').where('contentId','==',contentId).get();
      postsCount = postsSnap.size;
    } catch (e) {
      const mem = global.__AUTOPROMOTE_IN_MEMORY_DB || new Map();
      for (const [k,v] of mem.entries()){
        if (k.startsWith('platform_posts/')) {
          if (v && v.contentId === contentId) postsCount++;
        }
      }
    }
    console.log('[e2e] platform_posts count:', postsCount);

    console.log('[e2e] done');
    process.exit(0);
  }catch(e){
    console.error('[e2e] ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();