const test=require('node:test'),assert=require('node:assert/strict');
const {hash}=require('../../src/modelRuntime/contract');
const {componentGuidance}=require('../../src/modelRuntime/componentGuidance');
const make=(extra={})=>{const core={schemaVersion:1,status:'completed',ownerUid:'owner',projectId:'project',sourceAssetId:'source',sourceSha256:'a'.repeat(64),
 sourceRange:{space:'source',startTick:0,endTick:270000},capability:'segment_subject',parameters:{},dependencyHashes:[],
 output:{subjectId:'person',width:64,height:64,fpsNumerator:24,fpsDenominator:1,frameCount:72,sourceRange:{space:'source',startTick:0,endTick:270000},
  maskManifest:{name:'manifest.json',sha256:'b'.repeat(64),bytes:100,mediaType:'application/json'},maskBundle:{name:'masks.tar.gz',sha256:'c'.repeat(64),bytes:100,mediaType:'application/gzip'},coverageBasis:'decoded_frames',confidence:null,warnings:[]},
 files:[],provenance:{sourceGeneration:'123',jobId:'job',attemptToken:'attempt'},...extra};return {...core,artifactHash:hash(core)};};
test('source edge guidance follows verified immutable parents to per-object masks',async()=>{
 const root=make({files:[{name:'component_masks.tar.gz',storagePath:'studio/model-runtime/executions/owner/job/attempt/outputs/component_masks.tar.gz',generation:'123',bytes:100,sha256:'d'.repeat(64)}]});
 const child=make({parameters:{refinement:{maskArtifactHash:root.artifactHash}},dependencyHashes:[root.artifactHash]});
 const result=await componentGuidance(child,{get:async id=>id===root.artifactHash?root:null});assert.equal(result.artifact.artifactHash,root.artifactHash);
});
test('component guidance cannot borrow a different selection on the same source',async()=>{
 const root=make({parameters:{points:[{position:[.1,.2],label:1}]}});
 const child=make({parameters:{points:[{position:[.2,.3],label:1}],refinement:{maskArtifactHash:root.artifactHash}},dependencyHashes:[root.artifactHash]});
 await assert.rejects(componentGuidance(child,{get:async()=>root}),/GUIDANCE_INVALID/);
});
test('a different source generation or account cannot supply component guidance',async()=>{
 for(const extra of [{ownerUid:'other'},{provenance:{sourceGeneration:'456'}},{sourceAssetId:'other'}]){
  const root=make({...extra,files:[{name:'component_masks.tar.gz'}]});const child=make({parameters:{refinement:{maskArtifactHash:root.artifactHash}},dependencyHashes:[root.artifactHash]});
  await assert.rejects(componentGuidance(child,{get:async()=>root}),/MODEL_/);
 }
});
test('missing or undeclared parents fail instead of substituting an unrelated artifact',async()=>{
 const child=make({parameters:{refinement:{maskArtifactHash:'e'.repeat(64)}}});
 await assert.rejects(componentGuidance(child,{get:async()=>null}),/GUIDANCE_INVALID/);
 const declared=make({parameters:child.parameters,dependencyHashes:['e'.repeat(64)]});
 await assert.rejects(componentGuidance(declared,{get:async()=>null}),/MISSING/);
});
