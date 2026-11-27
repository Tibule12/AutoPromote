const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const express=require('express');
const {once}=require('node:events');
process.env.COST_TELEMETRY_ENABLED='true';
const telemetry=require('../../src/services/infrastructureTelemetry');
telemetry.install();
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const db=createSandboxDatabase();
const {FieldValue,Timestamp}=require('firebase-admin/firestore');
const {readRetentionDependencies,cleanupPublishedVideos}=require('../../src/services/publishedVideoRetention');
const {createContentUpdateRouter,selectedContentHandlers,createApprovalSchedule}=require('../../src/services/contentUpdateRouter');
const {createMetricRecorder}=require('../../src/services/metricsRecorder');
const report={scope:'Real loopback Firestore and HTTP; controlled fixture authentication. No cloud invocations/publication/deletions. Local CPU/RSS is not hosted Render capacity.',measurements:{}};
const root=process.env.FREE_FIRST_EVIDENCE_DIR||'reports/free-first-waste-20261126';
const totals=()=>telemetry.snapshot().firestore.reduce((s,r)=>({reads:s.reads+r.minimumReadEstimate,writes:s.writes+r.writesCommitted,calls:s.calls+r.calls}),{reads:0,writes:0,calls:0});
async function measure(run){const before=totals(),cpu=process.cpuUsage(),started=performance.now();const value=await run();const after=totals(),used=process.cpuUsage(cpu);return{value,reads:after.reads-before.reads,writes:after.writes-before.writes,calls:after.calls-before.calls,wallMs:performance.now()-started,cpuMs:(used.user+used.system)/1000,rssBytes:process.memoryUsage().rss};}
after(async()=>{report.profile=telemetry.snapshot();fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/local-before-after.json',JSON.stringify(report,null,2)+'\n');await db.terminate();});

test('real SDK attribution observes query/doc/commit operations without recording filter values or issuing telemetry writes',async()=>{
 const key='private-filter-'+Date.now();const ref=db.collection('waste_observation').doc('fixture');
 const result=await telemetry.run('fixture:SDK',()=>measure(async()=>{await ref.set({secret:key});await ref.get();await db.collection('waste_observation').where('secret','==',key).get();}));
 assert.equal(result.writes,1);assert.equal(result.reads,2);
 assert.ok(telemetry.snapshot().firestore.some(r=>r.route==='fixture:SDK'));
 assert.ok(!JSON.stringify(telemetry.snapshot()).includes(key));
});
test('retention preflight batches sparse dependencies without weakening per-record truncation checks',async()=>{
 const ids=Array.from({length:20},(_,i)=>'waste-video-'+i);
 const batch=db.batch();for(const id of ids)batch.set(db.collection('platform_posts').doc(id),{contentId:id,success:true});await batch.commit();
 const collections=['platform_posts','promotion_tasks','promotion_schedules','media_transform_tasks'];
 const before=await measure(async()=>{const all=[];for(const id of ids)all.push(await Promise.all(collections.map(c=>db.collection(c).where('contentId','==',id).limit(200).get())));return all.map(rows=>rows.map(s=>s.docs.map(d=>d.id).sort()));});
 const after=await measure(async()=>{const all=await readRetentionDependencies(db,ids,200);return ids.map(id=>all.get(id).map(s=>s.docs.map(d=>d.id).sort()));});
 assert.deepEqual(after.value,before.value);assert.equal(before.calls,80);assert.equal(after.calls,8);assert.ok(after.reads<before.reads);
 delete before.value;delete after.value;report.measurements.retentionSparse={before,after};
 const crowded=db.batch();for(let i=0;i<5;i++)crowded.set(db.collection('promotion_tasks').doc('waste-crowd-'+i),{contentId:ids[0],status:'queued'});await crowded.commit();
 const result=await readRetentionDependencies(db,ids.slice(0,2),3);
 assert.equal(result.get(ids[0])[1].docs.length,3);assert.equal(result.get(ids[1])[1].docs.length,0);
});
test('non-video and non-owned-publishing-copy retention scans never read dependencies or delete files',async()=>{
 await db.collection('user_billing').doc('waste-owner').set({storageRetention:{publishedVideoHours:24}});
 await db.collection('content').doc('waste-image').set({user_id:'waste-owner',type:'image',url:'https://example.test/a.jpg'});
 await db.collection('content').doc('waste-source-library').set({user_id:'waste-owner',type:'video',url:'https://example.test/source-library.mp4'});
 const result=await measure(()=>cleanupPublishedVideos({db,storage:{bucket:()=>{throw Error('No object operations permitted');}},extractPath:()=>null,dryRun:true}));
 assert.deepEqual(new Set(result.value.map(r=>r.reason)),new Set(['not_video','no_owned_publishing_copy']));
 assert.equal(result.calls,3);report.measurements.retentionIneligible={calls:result.calls,dependencyCalls:0,storageOperations:0};
});
test('unchanged held-source retention state produces no content writes while real state changes persist immediately',async()=>{
 const filename=path.resolve('src/services/storageCleanupService.js');
 const baseline=fs.readFileSync(path.join(__dirname,'baselines/storageCleanupService.before.txt'),'utf8');
 const moduleBefore=new Module(filename+'.baseline.js',module);moduleBefore.filename=filename+'.baseline.js';moduleBefore.paths=Module._nodeModulePaths(path.dirname(filename));
 moduleBefore._compile(baseline+'\nmodule.exports.reconcileRetentionState=reconcileRetentionState;',moduleBefore.filename);
 const current=require('../../src/services/storageCleanupService').reconcileRetentionState;
 const expiry='2026-10-01T00:00:00.000Z',url='https://example.test/owned.mp4',storagePath='uploads/videos/retained.mp4';
 const data={url,storagePath,sourceDeleteAfter:expiry,sourceRetentionDays:14,sourceRetentionStatus:'skipped_referenced'};
 const state={sourceUrl:url,storagePath,deleteAfterIso:expiry},decision={status:'skipped_referenced'};
 const ref=db.collection('content').doc('waste-held-source');await ref.set(data);
 const before=await measure(async()=>{for(let i=0;i<100;i++)await moduleBefore.exports.reconcileRetentionState(ref,data,state,decision);});
 const after=await measure(async()=>{for(let i=0;i<100;i++)await current(ref,data,state,decision);});
 assert.equal(before.writes,100);assert.equal(after.writes,0);assert.equal(after.calls,0);
 const changed=await measure(()=>current(ref,data,state,{status:'skipped_pending_task'}));assert.equal(changed.writes,1);
 const fresh=(await ref.get()).data();assert.equal(fresh.sourceRetentionStatus,'skipped_pending_task');
 assert.equal(fresh.sourceDeleteAfter,expiry);assert.equal(fresh.url,url);assert.equal(fresh.sourceDeletedAt,undefined);
 delete before.value;delete after.value;report.measurements.retentionRepeatedHold={before,after,changedStatusWrites:changed.writes,filesDeleted:0};
});
test('concurrent counter increments preserve all 100 events while coalescing commits',async()=>{
 const recorder=createMetricRecorder(db,v=>FieldValue.increment(v));
 const before=await measure(()=>Promise.all(Array.from({length:100},()=>db.collection('waste_counters').doc('before').set({value:FieldValue.increment(1)},{merge:true}))));
 const after=await measure(()=>Promise.all(Array.from({length:100},()=>recorder('waste-after',1))));
 assert.equal((await db.collection('waste_counters').doc('before').get()).data().value,100);
 assert.equal((await db.collection('system_counters').doc('waste-after').get()).data().value,100);
 assert.equal(before.writes,100);assert.ok(after.writes<=2);
 delete before.value;delete after.value;report.measurements.counterBurst={before,after,eventsRetained:100};
});
test('one content-update dispatcher retains exact relevant-handler selection with four-to-one delivery count',async()=>{
 const names=['createPromotionOnApproval','handleLandingPageIntent','handleSmartLinkIntent','autoRewardCreators'];
 const calls={};const handlers=Object.fromEntries(names.map(n=>[n,async()=>{calls[n]=(calls[n]||0)+1;}]));
 const routed=createContentUpdateRouter(handlers),context={params:{contentId:'fixture'},eventId:'fixture'};
 const events=Array.from({length:1000},(_,progress)=>[{status:'uploaded',userId:'owner',views:0},{status:'uploaded',userId:'owner',views:0,progress}]);
 events.push([{status:'pending'},{status:'approved'}],[{}, {landingPageRequestedAt:'now'}],[{}, {smartLinkRequestedAt:'now',landingPageUrl:'https://owned.test'}],[{views:0},{views:101,userId:'owner'}]);
 for(const [before,after] of events)await routed({before:{data:()=>before},after:{data:()=>after}},context);
 assert.deepEqual(calls,Object.fromEntries(names.map(n=>[n,1])));
 assert.deepEqual(selectedContentHandlers({views:4},{views:4,youtube:{lastStatsCheck:'changed'}}),[]);
 report.measurements.triggerDispatch={fixtureUpdates:events.length,legacyDeliveries:events.length*4,consolidatedDeliveries:events.length,relevantHandlers:4,cloudFunctionsStarted:0};
});
test('approval replay creates exactly one real emulator schedule and preserves a new approval event',async()=>{
 const data={contentId:'waste-approval',isActive:true,status:'pending',startTime:Timestamp.now()};
 const replay=await measure(()=>Promise.all(Array.from({length:20},()=>createApprovalSchedule({db,contentId:data.contentId,eventId:'same-event',data}))));
 assert.equal(replay.value.filter(v=>v.created).length,1);
 assert.equal((await db.collection('promotion_schedules').where('contentId','==',data.contentId).get()).size,1);
 assert.equal((await createApprovalSchedule({db,contentId:data.contentId,eventId:'next-event',data})).created,true);
 await assert.rejects(()=>createApprovalSchedule({db,contentId:data.contentId,data}),/identity/);
 report.measurements.approvalReplay={deliveries:20,schedulesCreated:1,successfulWrites:replay.writes};
});
test('the actual Firebase Functions SDK consolidated export invokes the retained approval handler',async()=>{
 process.env.CONTENT_UPDATE_ROUTER_MODE='survivor';process.env.GCLOUD_PROJECT='demo-autopromote-credits';
 process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-autopromote-credits',storageBucket:'demo-autopromote-credits'});process.env.CI='true';
 const functions=require('../../autopromote-functions/index');
 assert.equal(typeof functions.createPromotionOnApproval.run,'function');
 assert.equal(functions.contentUpdated,undefined);
 for(const name of ['handleLandingPageIntent','handleSmartLinkIntent','autoRewardCreators'])assert.equal(functions[name],undefined);
 const change={before:{data:()=>({status:'draft'})},after:{data:()=>({status:'approved'})}};
 await functions.createPromotionOnApproval.run(change,{params:{contentId:'waste-actual-sdk'},eventId:'waste-sdk-event'});
 await functions.createPromotionOnApproval.run(change,{params:{contentId:'waste-actual-sdk'},eventId:'waste-sdk-event'});
 const schedules=await db.collection('promotion_schedules').where('contentId','==','waste-actual-sdk').get();
 assert.equal(schedules.size,1);assert.equal(schedules.docs[0].data().isActive,true);
 report.measurements.actualFunctionsSdk={consolidatedExport:true,survivingTrigger:'createPromotionOnApproval',additionalTriggerCreated:false,threeRedundantUpdateExportsAbsent:true,deliveries:2,schedules:1};
 await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp());
});
function loadRouter(source,filename){
 const authFile=require.resolve('../../src/authMiddleware'),firebaseFile=require.resolve('../../src/firebaseAdmin');
 const priorAuth=require.cache[authFile],priorFirebase=require.cache[firebaseFile];
 require.cache[authFile]={id:authFile,filename:authFile,loaded:true,exports:(req,res,next)=>{
  const token=req.get('Authorization');if(!token)return res.status(401).json({error:'fixture_auth_required'});
  req.user={uid:token==='Bearer admin-b'?'admin-b':'admin-a',isAdmin:token!=='Bearer ordinary'};next();
 }};
 require.cache[firebaseFile]={id:firebaseFile,filename:firebaseFile,loaded:true,exports:{db,admin:require('firebase-admin')}};
 try{const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source,filename);return m.exports;}
 finally{if(priorAuth)require.cache[authFile]=priorAuth;else delete require.cache[authFile];if(priorFirebase)require.cache[firebaseFile]=priorFirebase;else delete require.cache[firebaseFile];}
}
test('real HTTP admin activity coalesces concurrent pages, reuses users, and keeps authentication before the cache',async()=>{
 await db.collection('users').doc('waste-actor').set({name:'Fixture',email:'fixture@example.test'});
 const batch=db.batch();for(let i=0;i<20;i++)batch.set(db.collection('activities').doc('waste-activity-'+i),{userId:'waste-actor',type:'fixture',timestamp:Timestamp.fromMillis(1700000000000+i)});await batch.commit();
 const filename=path.resolve('src/routes/adminSystemRoutes.js');
 const baseline=fs.readFileSync(path.join(__dirname,'baselines/adminSystemRoutes.before.txt'),'utf8');
 const servers=[];
 try{
  const urls=[];
  for(const [source,suffix] of [[baseline,'.baseline.js'],[fs.readFileSync(filename,'utf8'),'.optimized.js']]){
   const app=express();app.use(telemetry.middleware);app.use('/api/admin/system',loadRouter(source,filename+suffix));
   const server=app.listen(0,'127.0.0.1');await once(server,'listening');servers.push(server);urls.push('http://127.0.0.1:'+server.address().port+'/api/admin/system/activity?limit=20');
  }
  async function pages(url){const latencies=[];const values=await Promise.all(Array.from({length:20},async()=>{const started=performance.now();const r=await fetch(url,{headers:{Authorization:'Bearer admin-a'}});assert.equal(r.status,200);latencies.push(performance.now()-started);return r.json();}));latencies.sort((a,b)=>a-b);return {page:values[0],p95Ms:latencies[18]};}
  const before=await measure(()=>pages(urls[0])),after=await measure(()=>pages(urls[1]));
  assert.deepEqual(after.value.page,before.value.page);assert.equal(before.reads,800);assert.equal(after.reads,21);
  assert.equal((await fetch(urls[1])).status,401);assert.equal((await fetch(urls[1],{headers:{Authorization:'Bearer ordinary'}})).status,403);
  const separate=await measure(()=>fetch(urls[1],{headers:{Authorization:'Bearer admin-b'}}));assert.equal(separate.reads,21);
  before.p95Ms=before.value.p95Ms;after.p95Ms=after.value.p95Ms;delete before.value;delete after.value;
  report.measurements.adminActivity20Concurrent={before,after,identicalResponse:true,authCheckedBeforeCache:true,distinctOwnersHaveSeparateCache:true};
 }finally{await Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve))));}
});
