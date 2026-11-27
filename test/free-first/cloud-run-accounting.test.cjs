const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const express=require('express'),http=require('supertest');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {createProcessingService}=require('../../src/services/processingTokens/service');
const {createCloudRunAdapter}=require('../../src/services/processingTokens/cloudRunAdapter');
const {digest}=require('../../src/services/unifiedCredits/workerVerification');
const {createProcessingGuard}=require('../../src/middlewares/processingBudgetMiddleware');
const {GoogleAuth}=require('google-auth-library');
let transport;const originalGetClient=GoogleAuth.prototype.getClient;
GoogleAuth.prototype.getClient=async()=>({request:config=>transport(config)});
const cloud=require('../../src/services/cloudRunJobService');
const db=createSandboxDatabase();process.env.FREE_FIRST_USAGE_ENABLED='true';
after(async()=>{GoogleAuth.prototype.getClient=originalGetClient;delete process.env.FREE_FIRST_USAGE_ENABLED;await db.terminate();});
async function fixture({qualified=true}={}) {
 const uid='cloud-'+crypto.randomUUID(),requestId='request-'+crypto.randomUUID(),nativeJobId='native-'+crypto.randomUUID();
 const profile={id:'cam-test-'+crypto.randomBytes(4).toString('hex'),operation:'multicam.render',requestScope:'manual-two-camera-60s',job:'projects/autopromote-staging-qualification/locations/us-central1/jobs/cam-qualified',image:'us-docker.pkg.dev/autopromote-staging-qualification/workers/cam@sha256:'+'a'.repeat(64),serviceAccount:'cam@autopromote-staging-qualification.iam.gserviceaccount.com',device:'cpu',qualificationId:'qualification-'+crypto.randomBytes(5).toString('hex'),maxMicros:80000,maxSeconds:360,cpuMilli:4000,memoryBytes:4*1024**3,inputMaxBytes:200000000,outputMaxBytes:100000000,networkMaxBytes:300000000,storageMaxByteHours:300000000,rateMicrosPerSecond:80,fixedCostMicros:40000};
 const service=createProcessingService({db,entitlement:async()=> 'free',operations:{'multicam.render':{maxMicros:profile.maxMicros,maxSeconds:profile.maxSeconds,resource:'cpu',retries:0}}});await service.configure({enabled:true});
 const template={containers:[{image:profile.image,resources:{limits:{cpu:'4',memory:'4Gi'}}}],serviceAccount:profile.serviceAccount,maxRetries:0,timeout:'360s'};
 const job={name:profile.job,etag:'immutable-job-etag',template:{taskCount:1,parallelism:1,template}};
 let submitted,executions=[],calls=[];
 const request=async config=>{calls.push({method:config.method,url:config.url});if(config.method==='POST'){submitted=config.data;return {data:{name:'projects/autopromote-staging-qualification/locations/us-central1/operations/one',metadata:{name:profile.job+'/executions/one'}}};}if(config.url.includes('/executions'))return {data:{executions}};return {data:job};};transport=request;
 if(qualified)await db.collection('processing_worker_qualifications').doc(profile.qualificationId).set({approved:true,profileDigest:digest(profile),expiresAt:new Date(Date.now()+3600000).toISOString(),workerContract:'renewable-cam-v1',sourceAndOutputBoundsVerified:true,networkAndStorageBoundsVerified:true,terminationAndHostLossVerified:true});
 await db.collection('video_edits').doc(nativeJobId).set({userId:uid,status:'queued',multicamRequest:{sources:[{url:'gs://owned/a'},{url:'gs://owned/b'}],overlap_duration:60,segments:[{start:0,end:60}]},creditReceipt:{processingTokens:true,deferredSettlement:true,requestId}});
 const adapter=createCloudRunAdapter({db,profile,request,inspectOutput:async()=>({generation:'verified-generation',bytes:26000000})});
 const app=express();app.use(express.json());app.use(createProcessingGuard({service,adapters:{'multicam.render':adapter},authenticate:(q,r,n)=>{q.user={uid,claims:{email_verified:true}};q.userId=uid;n();}}));
 app.post('/api/media/render-multicam',async(q,r)=>{try{const result=await cloud.executeMulticamRenderJob({jobId:nativeJobId,dispatchToken:'owned-dispatch-token-at-least-16',preferredDevice:'cpu'});r.json({jobId:nativeJobId,...result});}catch(error){r.status(error.status||503).json({error:error.code||error.message});}});
 const submit=(changes={})=>http(app).post('/api/media/render-multicam').set('Idempotency-Key',requestId).set('X-Processing-Tokens-Approved','80').send({sources:[{url:'owned-a'},{url:'owned-b'}],overlap_duration:60,segments:[{start:0,end:60}],...changes});
 return {uid,requestId,nativeJobId,profile,service,adapter,job,template,calls,submit,get submitted(){return submitted;},finish:async(success=true)=>{executions=[{name:profile.job+'/executions/one',job:profile.job,uid:'provider-execution-uid',taskCount:1,template:{...template,containers:[{...template.containers[0],env:submitted.overrides.containerOverrides[0].env}]},createTime:new Date(Date.now()-1000).toISOString(),completionTime:new Date().toISOString(),succeededCount:success?1:0,failedCount:success?0:1,conditions:[{type:'Completed',state:success?'CONDITION_SUCCEEDED':'CONDITION_FAILED'}]}];await db.collection('video_edits').doc(nativeJobId).set({status:success?'completed':'failed'},{merge:true});}};
}
test('unqualified production adapter refuses before any run RPC and releases only the undispatched reservation',async()=>{
 const f=await fixture({qualified:false});const response=await f.submit();assert.equal(response.status,503);assert.equal(response.body.error,'PRODUCTION_QUALIFICATION_REQUIRED');assert.equal(f.calls.filter(c=>c.method==='POST').length,0);assert.equal((await f.service.status(f.uid)).activeJobs,0);
});
test('real Cloud Run dispatcher binds a one-task/no-retry immutable profile; uncertainty holds liability and terminal proof reconciles once',async()=>{
 const f=await fixture();const r=await f.submit();assert.equal(r.status,200);assert.equal(f.submitted.etag,'immutable-job-etag');assert.equal(f.submitted.overrides.taskCount,1);assert.equal(f.submitted.overrides.timeout,'360s');
 assert.equal((await f.submit()).status,409);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 await f.adapter.reconcilePending(f.service,f.uid);assert.equal((await f.service.status(f.uid)).activeJobs,1);
 await f.finish();await f.adapter.reconcilePending(f.service,f.uid);const status=await f.service.status(f.uid);assert.equal(status.activeJobs,0);assert.equal(status.remaining,55);assert.equal(status.rollingSpentTokens,45);
 await f.adapter.reconcilePending(f.service,f.uid);assert.equal((await f.service.status(f.uid)).remaining,55);
});
test('verified failure refunds user tokens while retaining platform expense and changed job allocations refuse dispatch',async()=>{
 const f=await fixture();assert.equal((await f.submit()).status,200);await f.finish(false);await f.adapter.reconcilePending(f.service,f.uid);const status=await f.service.status(f.uid);assert.equal(status.remaining,100);assert.equal(status.rollingSpentTokens,45);
 const drift=await fixture();drift.job.template.template.containers[0].resources.limits.cpu='20';assert.equal((await drift.submit()).status,503);assert.equal(drift.calls.filter(c=>c.method==='POST').length,0);
});
test('a bounded manual profile cannot admit unqualified long or automatic-camera work',async()=>{
 const f=await fixture();for(const changes of [{overlap_duration:3600},{autoSwitch:true},{burnCaptions:true}])assert.equal((await f.submit(changes)).status,409);
 assert.equal(f.calls.length,0);assert.equal((await f.service.status(f.uid)).activeJobs,0);
});
