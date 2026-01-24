(async()=>{
  try{
    const { db } = require('../src/firebaseAdmin');
    const { attachSignature } = require('../src/utils/docSigner');
    const contentId = process.argv[2] || 'KM9rCHI8pV0BuDOzZF6l';
    const uid = process.env.TEST_UID || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const baseTask = {
      type: 'platform_post',
      status: 'queued',
      platform: 'tiktok',
      contentId,
      uid,
      reason: 'manual',
      payload: { message: 'Auto-publish test' },
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const task = attachSignature ? attachSignature(baseTask) : baseTask;
    const ref = db.collection('promotion_tasks').doc();
    await ref.set(task);
    console.log('wrote task', ref.id);
  }catch(e){ console.error(e && e.stack?e.stack:e); process.exit(1);} 
})();
