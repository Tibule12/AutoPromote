const{test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.DOC_SIGNING_SECRET='private-test-key-'+crypto.randomUUID();
const id=require.resolve('../../src/firebaseAdmin'),previous=require.cache[id];let calls=0;
require.cache[id]={id,filename:id,loaded:true,exports:{storage:{bucket:()=>({file:()=>({getSignedUrl:async options=>{
 calls++;assert.equal(options.queryParams.generation,'17');return['https://storage.googleapis.com/owned/immutable?generation=17'];}})})}}};
const{readCapability,workerSources}=require('../../src/services/processingTokens/mediaDelivery');
function cap(uid='owner') {const text=Buffer.from(JSON.stringify({uid,bucket:'owned',path:'processed/owned.mp4',
 generation:'17',size:1000,exp:Date.now()+600000})).toString('base64url');return text+'.'+crypto.createHmac('sha256',process.env.DOC_SIGNING_SECRET).update('processing-media-v1:'+text).digest('base64url');}
after(()=>{if(previous)require.cache[id]=previous;else delete require.cache[id];delete process.env.DOC_SIGNING_SECRET;});
test('tampered media capabilities fail before accessing any storage',()=>{
 assert.throws(()=>readCapability(cap().replace(/^./,'!')),{code:'SOURCE_FORBIDDEN'});assert.equal(calls,0);
});
test('a signed capability belonging to another user cannot become a privileged worker source',async()=>{
 await assert.rejects(workerSources({video_url:'https://api.autopromote.org/api/processing-media/'+cap('other')},'owner'),{code:'SOURCE_FORBIDDEN'});assert.equal(calls,0);
});
test('the owner can reuse an immutable output for another funded edit without a backend media upload',async()=>{
 const result=await workerSources({sources:[{url:'https://api.autopromote.org/api/processing-media/'+cap()}],caption:'https://a headline'},'owner');
 assert.equal(result.sources[0].url,'https://storage.googleapis.com/owned/immutable?generation=17');assert.equal(result.caption,'https://a headline');assert.equal(calls,1);
});
