const{test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.DOC_SIGNING_SECRET='private-test-key-'+crypto.randomUUID();
const id=require.resolve('../../src/firebaseAdmin'),previous=require.cache[id];let calls=0,activeBucket;
require.cache[id]={id,filename:id,loaded:true,exports:{storage:{bucket:()=>activeBucket||({file:()=>({getSignedUrl:async options=>{
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
test('only an owner-proven exact source generation receives worker read access; duplicate references do not duplicate ACL writes',async()=>{
 let reads=0,adds=0;const acl=[{entity:'user-original-owner',role:'OWNER'}];
 activeBucket={name:'owned',file:(name,options)=>({
  getMetadata:async()=>{reads++;return[{generation:'17',metadata:{ownerUid:name.includes('/other/')?'other':'owner'}}];},
  acl:{get:async()=>[acl],add:async entry=>{assert.equal(options.generation,'17');adds++;acl.push(entry);}},
  getSignedUrl:async options=>{assert.equal(options.queryParams.generation,'17');return['https://storage.googleapis.com/owned/'+name+'?generation=17'];}
 })};
 try{
  const body={video_url:'https://storage.googleapis.com/owned/studio/sources/owner/one.mp4?signature=existing',timeline:[{url:'https://storage.googleapis.com/owned/studio/sources/owner/one.mp4?signature=existing'}]};
  const result=await workerSources(body,'owner',{serviceAccount:'native@example.test'});
  assert.equal(result.video_url,result.timeline[0].url);assert.equal(reads,1);assert.equal(adds,1);
  assert.deepEqual(acl[0],{entity:'user-original-owner',role:'OWNER'});
  assert.deepEqual(acl[1],{entity:'user-native@example.test',role:'READER'});
  await workerSources(body,'owner',{serviceAccount:'native@example.test'});assert.equal(adds,1);
  await assert.rejects(workerSources({video_url:'https://storage.googleapis.com/owned/studio/sources/other/private.mp4'},'owner',{serviceAccount:'native@example.test'}),{code:'SOURCE_FORBIDDEN'});
  assert.equal(adds,1);
  await assert.rejects(workerSources({video_url:'https://storage.googleapis.com/owned/studio/sources/owner/one.mp4?generation=16'},'owner',{serviceAccount:'native@example.test'}),{code:'SOURCE_GENERATION_CHANGED'});
  acl.push({entity:'allUsers',role:'READER'});
  const publicUrl='https://storage.googleapis.com/owned/studio/sources/other/public.mp4';
  assert.equal((await workerSources({video_url:publicUrl},'owner',{serviceAccount:'native@example.test'})).video_url,publicUrl);
  assert.equal(adds,1,'shared public sources need no new grants');
 }finally{activeBucket=undefined;}
});
