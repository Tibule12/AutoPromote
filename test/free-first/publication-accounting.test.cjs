const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
const { createProcessingService } = require('../../src/services/processingTokens/service');
const runtime = require('../../src/services/processingTokens/runtime');
const db = createSandboxDatabase();
const original = runtime.service;
const id = require.resolve('../../src/firebaseAdmin');
const previous = require.cache[id];
require.cache[id] = { id, filename:id, loaded:true, exports:{db} };
const { withPublication } = require('../../src/services/processingTokens/publication');
process.env.FREE_FIRST_USAGE_ENABLED='true';
const policies={};
for(const p of ['publication-small','publication-large'])policies['publisher.publish@'+p]=
  {tokens:2,maxMicros:p==='publication-small'?70000:350000,maxSeconds:120,resource:'network',retries:0};
const service=createProcessingService({db,entitlement:async()=> 'free',operations:policies});
runtime.service=()=>service;
after(async()=>{runtime.service=original;delete process.env.FREE_FIRST_USAGE_ENABLED;
  if(previous)require.cache[id]=previous;else delete require.cache[id];await db.terminate();});
function fixture(){return{uid:'publish-'+crypto.randomUUID(),taskId:crypto.randomUUID(),contentId:crypto.randomUUID(),
  platform:'youtube',payload:{title:'Private approved qualification',privacy:'private'}};}
test('ordinary publication uses renewable tokens once, replays its receipt and never repeats the provider mutation',async()=>{
 await service.configure({enabled:true});const f=fixture();let calls=0;
 const publish=async()=>{calls++;const p=runtime.current().publication;p.dispatched=true;p.bytes=26797595*2;return{success:true,videoId:'private-video-fixture'};};
 await withPublication(f,publish);await withPublication(f,publish);
 assert.equal(calls,1);const status=await service.status(f.uid);assert.equal(status.remaining,98);assert.equal(status.rollingSpentTokens,2);assert.equal(status.activeJobs,0);
});
test('uncertain provider response restores user tokens, keeps the maximum cash expense and refuses blind resubmission',async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(withPublication(f,async()=>{calls++;runtime.current().publication.dispatched=true;throw Error('response lost');}),{code:'PUBLICATION_UNCONFIRMED'});
 await assert.rejects(withPublication(f,async()=>{calls++;}),{code:'PUBLICATION_UNCONFIRMED'});
 assert.equal(calls,1);assert.equal((await service.status(f.uid)).remaining,100);
});
test('a server-proven legacy publication holds only cash and cannot deduct legacy customer balances or renewable tokens',async()=>{
 const f=fixture();await db.collection('users').doc(f.uid).set({credits:123,foundingTesterCredits:456});
 await withPublication({...f,legacySignedTask:true},async()=>({success:true,videoId:'existing-obligation'}));
 assert.equal((await service.status(f.uid)).remaining,100);
 assert.deepEqual((await db.collection('users').doc(f.uid).get()).data(),{credits:123,foundingTesterCredits:456});
});
