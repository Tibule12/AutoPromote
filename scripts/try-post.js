require('dotenv').config();
const svc = require('../src/services/twitterService');
(async function(){
  try{
    console.log('[try-post] about to call getValidAccessToken');
    const token = await svc.getValidAccessToken('bf04dPKELvVMivWoUyLsAVyw2sg2');
    console.log('[try-post] got access token:', !!token, token && token.slice && token.slice(0,30));
    console.log('[try-post] about to call postTweet');
    const res = await svc.postTweet({ uid: 'bf04dPKELvVMivWoUyLsAVyw2sg2', text: 'Diagnostic: ' + new Date().toISOString() });
    console.log('[try-post] postTweet result:', JSON.stringify(res, null, 2));
  }catch(e){
    console.error('[try-post] ERROR', e && e.message);
    console.error(e && e.stack);
    process.exit(2);
  }
  process.exit(0);
})();