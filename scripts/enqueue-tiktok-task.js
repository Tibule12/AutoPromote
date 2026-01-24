/*
Enqueue a platform_post task for TikTok for a specific contentId and user
Usage: node -r dotenv/config scripts/enqeue-tiktok-task.js <contentId>
*/
(async ()=>{
  try{
    const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');
    const contentId = process.argv[2] || 'KM9rCHI8pV0BuDOzZF6l';
    const uid = process.env.TEST_UID || 'bf04dPKELvVMivWoUyLsAVyw2sg2';
    const payload = { message: 'Auto-publish test', videoUrl: null };
    const res = await enqueuePlatformPostTask({ contentId, uid, platform: 'tiktok', reason: 'manual', payload });
    console.log('enqueue result:', res);
  }catch(e){ console.error(e && e.stack?e.stack:e); process.exit(1);} 
})();
