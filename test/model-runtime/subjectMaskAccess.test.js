const {test}=require('node:test');const assert=require('node:assert/strict');
const {requireSubjectMaskPreview,assertSubjectMaskRequest,ownedSubjectMaskJob}=require('../../src/services/studioSubjectMaskAccess');
const {reuseSavedSubjectMask}=require('../../src/services/studioSubjectMaskAccess');
const {buildArtifact}=require('../../src/modelRuntime/artifacts');
const {selectModel,hash,stable,fail}=require('../../src/modelRuntime/contract');
test('normal Studio mask rollout requires the exact server cohort; no admin role is invented',()=>{
 const old={enabled:process.env.STUDIO_SUBJECT_MASK_PREVIEW_ENABLED,uids:process.env.STUDIO_SUBJECT_MASK_PREVIEW_UIDS};
 try{process.env.STUDIO_SUBJECT_MASK_PREVIEW_ENABLED='true';process.env.STUDIO_SUBJECT_MASK_PREVIEW_UIDS='owner';
  let accepted=false,status;const res={status:n=>{status=n;return res;},json:()=>res};
  requireSubjectMaskPreview({user:{uid:'other'}},res,()=>accepted=true);assert.equal(status,403);assert.equal(accepted,false);
  requireSubjectMaskPreview({user:{uid:'owner',isAdmin:false}},res,()=>accepted=true);assert.equal(accepted,true);
  process.env.STUDIO_SUBJECT_MASK_PREVIEW_ENABLED='false';accepted=false;
  requireSubjectMaskPreview({user:{uid:'owner',isAdmin:true}},res,()=>accepted=true);assert.equal(accepted,false);
 }finally{for(const[k,v]of Object.entries({STUDIO_SUBJECT_MASK_PREVIEW_ENABLED:old.enabled,STUDIO_SUBJECT_MASK_PREVIEW_UIDS:old.uids}))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

function reuseFixture(){
 const parent='c'.repeat(64),range={space:'source',startTick:0,endTick:90000};
 const sourceStoragePath='studio/sources/owner/source.mp4';
 const parameters={subjectId:'subject',initialBox:[.1,.2,.6,.9],points:[],shotPrompts:[],refinement:{maskArtifactHash:parent,radius:10,holdouts:[]}};
 const request={schemaVersion:1,requestId:'request-a',capability:'segment_subject',projectId:'project',projectRevision:3,
  sourceAssetId:'source',sourceSha256:'a'.repeat(64),sourceStoragePath,sourceRange:range,parameters,dependencyHashes:[parent]};
 const model=selectModel('segment_subject',{modelId:'vitmatte-small-cpu-v1'});
 const job={id:'b'.repeat(64),ownerUid:'owner',model,request,requestHash:hash(request),attemptToken:'token',status:'stale',
  workerImage:'test-only@sha256:'+'d'.repeat(64),source:{generation:'1'},registryVersion:'test'};
 const file=name=>({name,sha256:'e'.repeat(64),bytes:100,mediaType:'application/json'});
 const output={subjectId:'subject',width:128,height:72,fpsNumerator:24,fpsDenominator:1,frameCount:24,
  sourceRange:range,maskManifest:file('manifest.json'),maskBundle:file('masks.tar.gz'),coverageBasis:'decoded_frames',confidence:null,warnings:[]};
 const artifact=buildArtifact({job,result:{jobId:job.id,attemptToken:job.attemptToken,requestHash:job.requestHash,modelId:model.id,revision:model.revision,
  status:'completed',output,files:[output.maskManifest,output.maskBundle],metrics:{gpuCount:0,device:'test_double',peakVramBytes:0,runtimeSeconds:1},
  provenance:{implementationSha256:'f'.repeat(64),executionKind:'test_double'}}});
 const scene={version:1,id:'subject',sourceId:'source',sourceStoragePath,sourceRange:{start:0,end:1},
  prompt:{points:[[.35,.55]],labels:[1],shotPrompts:[]},effects:[{id:'bg',type:'background_grade',start:0,end:1,contrast:1,exposure:0,saturation:1}]};
 const item={scene,modelArtifactRef:{artifactHash:parent},maskJob:{requestId:request.requestId,jobId:job.id,projectId:'project',projectRevision:3,
  selectionJson:stable({sourceId:'source',sourceStoragePath,sourceRange:scene.sourceRange,prompt:scene.prompt,box:parameters.initialBox,refinement:parameters.refinement})}};
 const head={revision:4,document:{layers:[{type:'subject_vfx',layerId:'subject',parameters:item}]}};
 const source={sha256:request.sourceSha256,generation:'1'};
 const runtime={owned:async uid=>{if(uid!=='owner')throw fail('MODEL_JOB_MISSING',404);return job;},
  getArtifact:async()=>({artifact,applicable:false}),authorize:async({request:r,requireCurrentRevision})=>{
   assert.equal(requireCurrentRevision,true);if(r.projectRevision!==head.revision)throw fail('MODEL_PROJECT_REVISION_STALE',409);return source;}};
 return {job,artifact,item,head,source,runtime,input:{id:'subject',projectRevision:4},readProjectHead:async()=>head};
}
test('explicit native reuse preserves the stale artifact revision and rechecks the current source without inference',async()=>{
 const f=reuseFixture(),result=await reuseSavedSubjectMask({...f,ownerUid:'owner',jobId:f.job.id});
 assert.equal(result.modelArtifactRef.artifactHash,f.artifact.artifactHash);assert.equal(f.job.status,'stale');
 assert.equal(f.artifact.projectRevision,3);assert.deepEqual(result.scene.effects,f.item.scene.effects);
});
test('saved-mask reuse rejects another owner, changed source generation, camera, selection, range or dependency',async()=>{
 for(const mutate of [f=>f.ownerUid='other',f=>f.source.generation='2',f=>f.input.id='another-camera',
   f=>f.item.scene.prompt.points[0][0]=.8,f=>f.item.scene.sourceRange.end=2,
   f=>f.item.modelArtifactRef.artifactHash='d'.repeat(64),f=>f.input.projectRevision=5,
   f=>f.input.extra='untrusted']){
  const f=reuseFixture();f.ownerUid='owner';mutate(f);
  await assert.rejects(reuseSavedSubjectMask({...f,jobId:f.job.id}));
 }
});
test('the Studio mask endpoint cannot submit generation or inspect another capability',async()=>{
 assert.throws(()=>assertSubjectMaskRequest({capability:'generate_video'}),e=>e.statusCode===403);
 assert.throws(()=>assertSubjectMaskRequest({capability:'segment_subject',sourceRange:{startTick:0,endTick:990000}}),e=>e.statusCode===403);
 await assert.rejects(ownedSubjectMaskJob({owned:async()=>({request:{capability:'generate_video'}})},'owner','job'),e=>e.statusCode===403);
 let checkedOwner;await ownedSubjectMaskJob({owned:async(uid)=>{checkedOwner=uid;return{request:{capability:'segment_subject'}};}},'owner','job');assert.equal(checkedOwner,'owner');
});
