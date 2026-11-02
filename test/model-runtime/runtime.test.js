const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {ModelCapabilityRuntime}=require('../../src/modelRuntime/router');
const {FileStore,FileArtifactStore}=require('../../src/modelRuntime/stores');
const {request,selectModel,hash,registry}=require('../../src/modelRuntime/contract');
const {verifyArtifact}=require('../../src/modelRuntime/artifacts');
const {validateRequestCoverage}=require('../../src/modelRuntime/artifacts');
const base=()=>({schemaVersion:1,requestId:'request-001',projectId:'runtime-test-project',projectRevision:1,
 sourceAssetId:'source-1',sourceSha256:'a'.repeat(64),sourceStoragePath:'studio/sources/owner/source.mp4',
 sourceRange:{space:'source',startTick:0,endTick:270000},capability:'understand_video',
 parameters:{sampleCount:4,question:'Describe visible subjects.'},dependencyHashes:[]});
async function fixture(t,{lost=false,terminal=true,corrupt=false,identity=false,stale=false,staleBeforeDispatch=false,cancelDuringVerify=false}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'model-runtime-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const jobs=new FileStore(root),artifacts=new FileArtifactStore(path.join(root,'artifacts'));
 let dispatches=0,cancellations=0,authorized=0;const results=new Map();
 const worker={image:'test-contract-only@sha256:'+'b'.repeat(64),async dispatch(job){dispatches++;
   results.set(job.id,{status:'completed',jobId:identity?'wrong-job':job.id,attemptToken:job.attemptToken,requestHash:job.requestHash,
    modelId:job.model.id,revision:job.model.revision,output:{summary:'Synthetic test fixture. Not model evidence.',subjects:[{id:'s1',label:'fixture',description:'test',observedFrameIndices:[0]}],
    observations:[{frameIndex:0,sourceTick:0,description:'test'}],coverageBasis:'sampled_frames_only',confidence:null},
    files:[{name:'scene_understanding.json',sha256:'c'.repeat(64),bytes:100,mediaType:'application/json'}],
    metrics:{runtimeSeconds:1,peakVramBytes:1,gpuCount:1,device:'test_double'},provenance:{implementationSha256:'d'.repeat(64),executionKind:'test_double'}});
   if(lost)throw new Error('Ambiguous network timeout');return {name:'test-execution'};},
   async poll(job){return {terminal,result:results.get(job.id)};},async verifyFiles(job){if(corrupt)throw new Error('Checksum failed');if(cancelDuringVerify)await runtime.cancel({ownerUid:'owner',jobId:job.id});},async cancel(){cancellations++;}};
 const runtime=new ModelCapabilityRuntime({jobs,artifacts,workers:{'vision-understanding':worker},authorize:async({request:r})=>{
   authorized++;if((stale && authorized>2) || (staleBeforeDispatch && authorized>1))throw Object.assign(new Error('Stale'),{statusCode:409});
   if(r.sourceSha256!=='a'.repeat(64))throw Object.assign(new Error('Source differs'),{statusCode:409});
   return {sha256:r.sourceSha256,generation:'123',storagePath:r.sourceStoragePath};}});
 return {runtime,jobs,artifacts,root,counts:()=>({dispatches,cancellations})};
}
test('five capability schemas and six immutable model locks; unavailable TAP cannot route',()=>{
 for(const [cap,id] of Object.entries(registry.defaults))assert.equal(selectModel(cap).id,id);
 assert.throws(()=>selectModel('track_object',{modelId:'tapnextpp-v1'}),/UNAVAILABLE/);
 for(const model of registry.models){assert.match(model.revision,/^[a-f0-9]{40}$/);assert.ok(model.inputSchema&&model.outputSchema&&model.license&&model.retryPolicy&&model.workerRuntime);}
});
test('client cannot choose checkpoint or implementation',()=>{assert.throws(()=>request({...base(),model:'pretend'}),/INVALID/);});
test('bounded source range, finite parameters and source paths',()=>{
 assert.throws(()=>request({...base(),sourceRange:{space:'source',startTick:9,endTick:8}}),/RANGE/);
 assert.throws(()=>request({...base(),parameters:{sampleCount:NaN,question:'x'}}),/INVALID/);
 assert.throws(()=>request({...base(),sourceStoragePath:'studio/sources/owner/../other.mp4'}),/SOURCE/);
});
test('checkpoint/model entry change without changing capability contract',()=>{
 const models=structuredClone(registry);models.models.find(m=>m.id===models.defaults.understand_video).revision='e'.repeat(40);
 assert.equal(selectModel('understand_video',{models}).revision,'e'.repeat(40));assert.equal(request(base()).capability,'understand_video');
});
test('successful receipt persists immutable versioned source-bound provenance',async t=>{
 const f=await fixture(t),j=await f.runtime.submit({ownerUid:'owner',input:base()});assert.equal(j.status,'running');
 const done=await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId});assert.equal(done.status,'completed');
 const {artifact,evidence}=await f.runtime.getArtifact({ownerUid:'owner',jobId:j.jobId});
 assert.equal(artifact.sourceSha256,base().sourceSha256);assert.equal(artifact.revision,selectModel('understand_video').revision);
 assert.equal(evidence.artifactHash,artifact.artifactHash);assert.equal(artifact.provenance.executionKind,'test_double');
 await assert.rejects(f.artifacts.put({...artifact,metrics:{...artifact.metrics,runtimeSeconds:2}}),/HASH/);
 assert.throws(()=>verifyArtifact({...artifact,model:'forged'}),/HASH/);
});
test('same request is never dispatched twice, including concurrent callers',async t=>{
 const f=await fixture(t);const jobs=await Promise.all(Array.from({length:5},()=>f.runtime.submit({ownerUid:'owner',input:base()})));
 assert.equal(new Set(jobs.map(j=>j.jobId)).size,1);assert.equal(f.counts().dispatches,1);
});
test('request ID cannot be rebound to changed parameters',async t=>{
 const f=await fixture(t);await f.runtime.submit({ownerUid:'owner',input:base()});
 await assert.rejects(f.runtime.submit({ownerUid:'owner',input:{...base(),parameters:{sampleCount:2,question:'changed'}}}),/CONFLICT/);
});
test('source hash rejected before paid dispatch',async t=>{
 const f=await fixture(t);await assert.rejects(f.runtime.submit({ownerUid:'owner',input:{...base(),sourceSha256:'e'.repeat(64)}}));assert.equal(f.counts().dispatches,0);
});
test('internal resolved registry reports the exact configured image digest',async t=>{
 const f=await fixture(t),resolved=f.runtime.resolvedRegistry();
 assert.match(resolved.models.find(m=>m.capabilityId==='understand_video').workerImage,/@sha256:[a-f0-9]{64}$/);
 assert.equal(resolved.models.find(m=>m.capabilityId==='understand_video').deploymentConfigured,true);
});
test('lost response reconciles without submitting or retrying generation',async t=>{
 const f=await fixture(t,{lost:true}),j=await f.runtime.submit({ownerUid:'owner',input:base()});assert.equal(j.status,'dispatch_uncertain');
 await f.runtime.submit({ownerUid:'owner',input:base()});assert.equal(f.counts().dispatches,1);
 assert.equal((await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId})).status,'completed');
});
test('single GPU lease fences a second worker until first cloud task is terminal',async t=>{
 const f=await fixture(t,{terminal:false});const a=await f.runtime.submit({ownerUid:'owner',input:base()});
 const b=await f.runtime.submit({ownerUid:'owner',input:{...base(),requestId:'second'}});assert.equal(b.status,'queued');
 await f.runtime.reconcile({ownerUid:'owner',jobId:a.jobId});assert.equal(f.counts().dispatches,1);
 assert.ok(await fs.stat(path.join(f.root,'gpu-capacity.json')));
});
test('wrong owner cannot read, reconcile or cancel a job/artifact',async t=>{
 const f=await fixture(t),j=await f.runtime.submit({ownerUid:'owner',input:base()});
 for(const action of ['getArtifact','reconcile','cancel'])await assert.rejects(f.runtime[action]({ownerUid:'other',jobId:j.jobId}),/MISSING/);
});
test('cancel is pending until worker is actually terminated',async t=>{
 const f=await fixture(t,{terminal:false}),j=await f.runtime.submit({ownerUid:'owner',input:base()});
 assert.equal((await f.runtime.cancel({ownerUid:'owner',jobId:j.jobId})).status,'cancelling');
 assert.equal((await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId})).status,'cancelling');
 assert.ok(await fs.stat(path.join(f.root,'gpu-capacity.json')));
});
test('cancelled worker cannot publish a late successful artifact',async t=>{
 const f=await fixture(t),j=await f.runtime.submit({ownerUid:'owner',input:base()});await f.runtime.cancel({ownerUid:'owner',jobId:j.jobId});
 assert.equal((await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId})).status,'cancelled');
 assert.equal((await f.jobs.get(j.jobId)).artifactHash,null);
});
test('stale revision retains result but cannot silently apply it',async t=>{
 const f=await fixture(t,{stale:true}),j=await f.runtime.submit({ownerUid:'owner',input:base()});
 assert.equal((await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId})).status,'stale');
 assert.equal((await f.runtime.getArtifact({ownerUid:'owner',jobId:j.jobId})).applicable,false);
});
test('artifact rejected if actual blob bytes fail verification',async t=>{
 const f=await fixture(t,{corrupt:true}),j=await f.runtime.submit({ownerUid:'owner',input:base()});
 await assert.rejects(f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId}),/Checksum/);assert.equal((await f.jobs.get(j.jobId)).artifactHash,null);
});
test('worker from a different job cannot publish evidence',async t=>{
 const f=await fixture(t,{identity:true}),j=await f.runtime.submit({ownerUid:'owner',input:base()});
 await assert.rejects(f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId}),/IDENTITY/);
 assert.equal((await f.jobs.get(j.jobId)).status,'failed');
});
test('out-of-range frame selection fails on CPU before dispatch',()=>{
 assert.throws(()=>request({...base(),capability:'detect_object',parameters:{query:'person',frameIndex:72,boxThreshold:.25,textThreshold:.2}}),/FRAME_INVALID/);
});
test('unavailable point tracking cannot be relabelled as object centroid tracking',()=>{
 assert.throws(()=>request({...base(),capability:'track_object',parameters:{subjectId:'s1',mode:'points',maskArtifactHash:null,points:[[.5,.5]]}}),/POINT_TRACKING_UNAVAILABLE/);
});
test('generation cannot choose unsupported resolution or silently truncate scene',()=>{
 assert.throws(()=>request({...base(),capability:'generate_video',parameters:{mode:'text_to_video',prompt:'p',negativePrompt:'',seed:1,width:1280,height:1280,frames:121,fps:24,steps:30,guidance:5}}),/GEOMETRY/);
});
test('revision changes before dispatch prevent paid execution',async t=>{
 const f=await fixture(t,{staleBeforeDispatch:true});const j=await f.runtime.submit({ownerUid:'owner',input:base()});
 assert.equal(j.status,'failed');assert.equal(f.counts().dispatches,0);
});
test('cancellation races cannot publish an orphan evidence artifact',async t=>{
 const f=await fixture(t,{cancelDuringVerify:true});const j=await f.runtime.submit({ownerUid:'owner',input:base()});
 const state=await f.runtime.reconcile({ownerUid:'owner',jobId:j.jobId});assert.equal(state.status,'cancelling');
 assert.equal((await f.jobs.get(j.jobId)).artifactHash,null);await assert.rejects(fs.readdir(path.join(f.root,'artifacts')),/ENOENT/);
});
test('well-shaped output cannot invent temporal evidence or truncate generated video',()=>{
 const r=base();
 assert.throws(()=>validateRequestCoverage(r,{subjects:[{observedFrameIndices:[4]}],observations:[]}),/COVERAGE/);
 assert.throws(()=>validateRequestCoverage(r,{subjects:[],observations:[{frameIndex:1,sourceTick:1}]}),/COVERAGE/);
 const gen={...r,capability:'generate_video',parameters:{width:1280,height:704,frames:121,fps:24}};
 assert.throws(()=>validateRequestCoverage(gen,{width:1280,height:704,frameCount:120,fpsNumerator:24,fpsDenominator:1,durationTicks:450000}),/COVERAGE/);
});
test('tracking cannot publish a sparse path as decoded-frame coverage',()=>{
 const r={...base(),capability:'track_object',parameters:{subjectId:'s',maskArtifactHash:'b'.repeat(64)}};
 assert.throws(()=>validateRequestCoverage(r,{subjectId:'s',sourceRange:r.sourceRange,dependencyArtifactHash:r.parameters.maskArtifactHash,samples:[]}),/COVERAGE/);
});

test('foreground component selections reject ambiguous identities, inverted boxes and cross-cut reuse',()=>{
 const input={...base(),capability:'segment_subject',parameters:{subjectId:'speaker',initialBox:[.1,.1,.9,1],points:[],shotPrompts:[],
  components:[{id:'microphone',box:[.2,.2,.6,.8],points:[{position:[.3,.3],label:1}],propagate:false}]}};
 assert.equal(request(input).parameters.components[0].propagate,false);
 const duplicate=structuredClone(input);duplicate.parameters.components.push({...duplicate.parameters.components[0]});
 assert.throws(()=>request(duplicate),{code:'MODEL_CAPABILITY_COMPONENT_SELECTION_INVALID'});
 const inverted=structuredClone(input);inverted.parameters.components[0].box=[.6,.2,.2,.8];
 assert.throws(()=>request(inverted),{code:'MODEL_CAPABILITY_COMPONENT_SELECTION_INVALID'});
 const cut=structuredClone(input);cut.parameters.shotPrompts=[{frameIndex:24,box:[.1,.1,.8,.9]}];
 assert.throws(()=>request(cut),{code:'MODEL_CAPABILITY_COMPONENT_SELECTION_INVALID'});
 const corrected=structuredClone(input);
 corrected.parameters.shotPrompts=[{frameIndex:24,box:[.1,.1,.8,.9],points:[{position:[.5,.5],label:1},{position:[.2,.2],label:0}]}];
 assert.deepEqual(request(corrected).parameters.shotPrompts,corrected.parameters.shotPrompts);
 corrected.parameters.shotPrompts[0].points[0].label=0;
 assert.throws(()=>request(corrected),{code:'MODEL_CAPABILITY_SHOT_PROMPT_INVALID'});
});

test('a component request cannot silently fall through to a worker that ignores equipment selections',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.runtime.submit({ownerUid:'owner',input:{...base(),capability:'segment_subject',parameters:{subjectId:'speaker',
  initialBox:[.1,.1,.9,1],points:[],shotPrompts:[],components:[{id:'mic',box:[.2,.2,.5,.5],points:[],propagate:false}]}}}),{code:'MODEL_COMPONENT_WORKER_UNAVAILABLE'});
 assert.equal(f.counts().dispatches,0);
});

test('matting needs an exact immutable dependency and never falls back to the segmentation default',async t=>{
 const input={...base(),capability:'segment_subject',parameters:{subjectId:'s',initialBox:[.1,.1,.9,.9],points:[],shotPrompts:[],
  refinement:{maskArtifactHash:'b'.repeat(64),radius:10,holdouts:[]}}};
 assert.throws(()=>request(input),{code:'MODEL_MASK_REFINEMENT_DEPENDENCY_REQUIRED'});
 const f=await fixture(t);input.dependencyHashes=['b'.repeat(64)];
 await assert.rejects(f.runtime.submit({ownerUid:'owner',input}),{code:'MODEL_ARTIFACT_MISSING'});assert.equal(f.counts().dispatches,0);
 const unavailable={...registry,refinementDefaults:{segment_subject:'unavailable'}};
 const runtime=new ModelCapabilityRuntime({jobs:f.jobs,artifacts:f.artifacts,workers:{},authorize:async()=>{},models:unavailable});
 await assert.rejects(runtime.submit({ownerUid:'owner',input}),{code:'MODEL_CAPABILITY_UNAVAILABLE'});
});


test('refined holdout paths are bounded to their source clock and geometry',()=>{
 const refinement={maskArtifactHash:'b'.repeat(64),radius:10,holdouts:[],holdoutGroups:[{
  id:'rig',start:0,end:3,feather:.5,corners:[[.1,.1],[.2,.1],[.2,.8],[.1,.8]],
  paths:[[[.2,.1],[.3,.1],[.3,.8],[.2,.8]]]}]};
 const input={...base(),capability:'segment_subject',dependencyHashes:[refinement.maskArtifactHash],
  parameters:{subjectId:'person',initialBox:[0,0,1,1],points:[{position:[.5,.5],label:1}],shotPrompts:[],refinement}};
 assert.deepEqual(request(input).parameters.refinement,refinement);
 const outOfRange=structuredClone(input);outOfRange.parameters.refinement.holdoutGroups[0].end=4;
 assert.throws(()=>request(outOfRange),/HOLDOUT_RANGE_INVALID/);
 const reversed=structuredClone(input);reversed.parameters.refinement.holdoutGroups[0].start=3;
 assert.throws(()=>request(reversed),/HOLDOUT_RANGE_INVALID/);
 const oversized=structuredClone(input);oversized.parameters.refinement.holdoutGroups[0].paths=Array(33).fill(refinement.holdoutGroups[0].paths[0]);
 assert.throws(()=>request(oversized),/REQUEST_INVALID/);
});
