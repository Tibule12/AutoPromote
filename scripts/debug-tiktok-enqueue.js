// debug-tiktok-enqueue.js
// Usage: node scripts/debug-tiktok-enqueue.js

const { db } = require('../src/firebaseAdmin');
const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');

(async function() {
  try {
    const ref = db.collection('content').doc();
    const contentId = ref.id;
    console.log('DEBUG: creating content', contentId);
    await ref.set({
      title: 'Debug TikTok content',
      description: 'Debug run',
      url: 'https://example.com/video.mp4',
      processedUrl: 'https://example.com/video.mp4',
      userId: 'debug-uid',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString(),
    });

    // Mark sponsored
    await db.collection('content').doc(contentId).update({
      platform_options: { tiktok: { role: 'sponsored', sponsor: 'Acme' } }
    });

    console.log('DEBUG: initial enqueue (should be skipped)');
    process.env.TIKTOK_ENABLED = 'true';
    let r1 = await enqueuePlatformPostTask({ contentId, uid: 'debug-uid', platform: 'tiktok', reason: 'manual', payload: {} });
    console.log('DEBUG: r1', r1);

    // set sponsorApproval via dotted update
    await db.collection('content').doc(contentId).update({
      'platform_options.tiktok.sponsorApproval': { status: 'approved', reviewedBy: 'admin-debug', reviewedAt: new Date().toISOString(), sponsor: 'Acme' }
    });

    // wait and poll
    let seen = null;
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const s = await db.collection('content').doc(contentId).get();
      const d = s.data();
      const opts = (d.platform_options && d.platform_options.tiktok) || (d.platformOptions && d.platformOptions.tiktok);
      if (opts && (opts.sponsorApproval || opts.sponsor_approval) && (opts.sponsorApproval || opts.sponsor_approval).status === 'approved') {
        seen = opts.sponsorApproval || opts.sponsor_approval;
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    console.log('DEBUG: sponsorApproval seen?', !!seen, seen);

    const r2 = await enqueuePlatformPostTask({ contentId, uid: 'debug-uid', platform: 'tiktok', reason: 'manual', payload: {} });
    console.log('DEBUG: r2', r2);

    // cleanup
    await db.collection('content').doc(contentId).delete().catch(()=>{});
    await db.collection('promotion_tasks').where('contentId','==',contentId).get().then(snap=>{ const b = db.batch(); snap.forEach(d=>b.delete(d.ref)); return b.commit().catch(()=>{}); }).catch(()=>{});
    process.env.TIKTOK_ENABLED = 'false';

  } catch (e) {
    console.error('DEBUG ERROR', e && e.stack);
    process.exit(1);
  }
})();