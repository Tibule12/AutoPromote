require('dotenv').config();
process.env.FIREBASE_ADMIN_BYPASS = '1';
(async function(){
  try{
    const { enqueuePlatformPostTask } = require('../src/services/promotionTaskQueue');
    const res = await enqueuePlatformPostTask({ contentId: '9xNxmdWL78jcQBeReoLi', uid: 'bf04dPKELvVMivWoUyLsAVyw2sg2', platform: 'twitter', payload: { message: 'Promo test', videoUrl: 'https://example.com/vid.mp4' } });
    console.log('[test-enqueue] res:', JSON.stringify(res, null, 2));
  }catch(e){
    console.error('[test-enqueue] ERROR', e && e.message); console.error(e && e.stack);
  }
})();