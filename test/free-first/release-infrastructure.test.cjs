const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {createTelemetryReadCache}=require('../../src/middlewares/telemetryReadCache');
const {createMetricRecorder}=require('../../src/services/metricsRecorder');
const {reconcileRetentionState}=require('../../src/services/storageCleanupService');
const db=createSandboxDatabase();after(()=>db.terminate());
test('independent retention fix preserves unchanged source metadata and writes actual state transitions',async()=>{
 const deadline='2026-11-01T00:00:00.000Z',source='https://storage.googleapis.com/demo-autopromote-credits/uploads/sources/retained.mp4';
 const data={type:'video',url:source,createdAt:'2026-10-01T00:00:00.000Z',sourceDeleteAfter:deadline,sourceRetentionDays:14,sourceRetentionStatus:'skipped_referenced',storagePath:'uploads/sources/retained.mp4',sourceRetentionUpdatedAt:'original'};
 const state={sourceUrl:source,storagePath:data.storagePath,retentionDays:14,deleteAfterIso:deadline};
 const ref=db.collection('content').doc('release-held');await ref.set(data);
 for(let i=0;i<100;i++)assert.equal(await reconcileRetentionState(ref,data,state,{status:'skipped_referenced'}),false);
 assert.equal((await ref.get()).data().sourceRetentionUpdatedAt,'original');
 await reconcileRetentionState(ref,data,state,{status:'skipped_pending_task'});
 assert.equal((await ref.get()).data().sourceRetentionStatus,'skipped_pending_task');assert.equal((await ref.get()).data().url,source);
});
test('independent counter coalescing retains every concurrent increment',async()=>{
 const recorder=createMetricRecorder(db,value=>require('firebase-admin/firestore').FieldValue.increment(value));
 await Promise.all(Array.from({length:100},()=>recorder('release-counter',1)));assert.equal((await db.collection('system_counters').doc('release-counter').get()).data().value,100);
});
test('independent diagnostic cache coalesces, expires, separates owners and never caches failures or bypasses authentication',async()=>{
 const express=require('express');let time=1000,loads=0,fail=false;const cache=createTelemetryReadCache({now:()=>time});const app=express();
 app.use((q,r,n)=>{if(!q.get('X-Fixture-Owner'))return r.sendStatus(401);q.user={uid:q.get('X-Fixture-Owner')};n();});
 app.get('/fixture',cache.middleware,async(q,r)=>{loads++;await new Promise(resolve=>setTimeout(resolve,10));r.status(fail?503:200).json({success:!fail,owner:q.user.uid});});
 const server=app.listen(0,'127.0.0.1');await require('node:events').once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/fixture';const get=(owner='owner')=>fetch(url,{headers:{'X-Fixture-Owner':owner}});
 try{
  const responses=await Promise.all(Array.from({length:20},()=>get()));assert.equal(loads,1);for(const response of responses)assert.equal((await response.json()).owner,'owner');
  assert.equal((await fetch(url)).status,401);await get('other');assert.equal(loads,2);
  time+=10001;fail=true;assert.equal((await get()).status,503);fail=false;assert.equal((await get()).status,200);assert.equal(loads,4);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
