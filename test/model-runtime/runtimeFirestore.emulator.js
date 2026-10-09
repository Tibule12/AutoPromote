// Real local Firestore transactions, with explicit synthetic workers and no GPU.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8188';
const {Firestore}=require('@google-cloud/firestore');
const {FirestoreJobStore,FirestoreArtifactStore}=require('../../src/modelRuntime/stores');
const {ModelCapabilityRuntime}=require('../../src/modelRuntime/router');
test('two runtime replicas share one GPU lease and atomically fence cancellation',async()=>{
  const db=new Firestore({projectId:'demo-model-runtime-v1'});
  const capacity=db.collection('studio_model_capability_capacity').doc('single_gpu');
  const prefix=crypto.randomUUID();let dispatches=0,cancelDuringVerify=false;const results=new Map();
  let a,b;
  const worker={image:'synthetic-emulator-worker@sha256:'+'b'.repeat(64),async dispatch(job){
    dispatches++;results.set(job.id,{status:'completed',jobId:job.id,attemptToken:job.attemptToken,requestHash:job.requestHash,
      modelId:job.model.id,revision:job.model.revision,
      output:{summary:'Synthetic CPU transaction fixture, not model evidence.',subjects:[{id:'s',label:'fixture',description:'test',observedFrameIndices:[0]}],
        observations:[{frameIndex:0,sourceTick:0,description:'test'}],coverageBasis:'sampled_frames_only',confidence:null},
      files:[{name:'scene_understanding.json',sha256:'c'.repeat(64),bytes:100,mediaType:'application/json'}],
      metrics:{runtimeSeconds:1,peakVramBytes:0,gpuCount:1,device:'synthetic_cpu_test_double'},
      provenance:{implementationSha256:'d'.repeat(64),executionKind:'test_double'}});return {name:'local-emulator-execution'};
    },async poll(job){return {terminal:true,result:results.get(job.id)};},async cancel(){},
    async verifyFiles(job){if(cancelDuringVerify)await b.cancel({ownerUid:'owner',jobId:job.id});}};
  const make=()=>new ModelCapabilityRuntime({jobs:new FirestoreJobStore(db),artifacts:new FirestoreArtifactStore(db),
    workers:{'vision-understanding':worker},authorize:async({request:r})=>({generation:'1',sha256:r.sourceSha256,storagePath:r.sourceStoragePath})});
  const input={schemaVersion:1,requestId:prefix,projectId:'emulator-runtime-project',projectRevision:0,
    sourceAssetId:'source',sourceSha256:'a'.repeat(64),sourceStoragePath:'studio/sources/owner/source.mp4',
    sourceRange:{space:'source',startTick:0,endTick:270000},capability:'understand_video',
    parameters:{sampleCount:2,question:'Synthetic CPU fixture.'},dependencyHashes:[]};
  const ids=[];let artifactHash;
  try {
    await capacity.delete();a=make();b=make();
    const same=await Promise.all([a.submit({ownerUid:'owner',input}),b.submit({ownerUid:'owner',input})]);
    assert.equal(same[0].jobId,same[1].jobId);assert.equal(dispatches,1);ids.push(same[0].jobId);
    const second=await b.submit({ownerUid:'owner',input:{...input,requestId:prefix+'-second'}});ids.push(second.jobId);
    assert.equal(second.status,'queued');assert.equal((await capacity.get()).data().id,ids[0]);
    const completed=await a.reconcile({ownerUid:'owner',jobId:ids[0]});artifactHash=completed.artifactHash;
    assert.equal(completed.status,'completed');assert.ok((await db.collection('studio_model_capability_artifacts').doc(artifactHash).get()).exists);
    assert.equal((await capacity.get()).exists,false);
    assert.equal((await b.reconcile({ownerUid:'owner',jobId:ids[1]})).status,'running');assert.equal(dispatches,2);
    cancelDuringVerify=true;
    assert.equal((await a.reconcile({ownerUid:'owner',jobId:ids[1]})).status,'cancelling');
    const record=JSON.parse((await db.collection('studio_model_capability_jobs').doc(ids[1]).get()).data().recordJson);
    assert.equal(record.artifactHash,null);
    assert.equal((await b.reconcile({ownerUid:'owner',jobId:ids[1]})).status,'cancelled');
  } finally {
    for(const id of ids)await db.collection('studio_model_capability_jobs').doc(id).delete();
    if(artifactHash)await db.collection('studio_model_capability_artifacts').doc(artifactHash).delete();
    await capacity.delete();await db.terminate();
  }
});
