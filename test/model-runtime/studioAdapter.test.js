const test=require('node:test');const assert=require('node:assert/strict');
const studio=require('../../src/generated/studioDirectorReplayKernel.cjs');
const {buildArtifact}=require('../../src/modelRuntime/artifacts');
const {selectModel,hash}=require('../../src/modelRuntime/contract');
const {attachArtifacts,editableSubjectScene}=require('../../src/modelRuntime/studioAdapter');
const h='a'.repeat(64),range={space:'source',startTick:0,endTick:270000};
function initial() {
 const snapshot={timeline:[{id:'clip',sourceClipId:'source',startRequest:0,endRequest:3,duration:3,contentHash:h,storagePath:'studio/sources/owner/source.mp4'}],
  projectMedia:[{id:'source',name:'CPU test source',type:'video',duration:3,contentHash:h,storagePath:'studio/sources/owner/source.mp4'}],
  orderedClips:[],reframeAspect:'16:9',exportSettings:{resolution:'1080p',fps:24,codec:'h264',audioCodec:'aac'},analysisRefs:[]};
 return {snapshot,document:studio.adaptStudioSnapshotToDocument({snapshot,projectId:'project'})};
}
function artifact(capability,output,parameters,dependencyHashes=[]) {
 const model=selectModel(capability);const request={capability,parameters,dependencyHashes,projectId:'project',projectRevision:0,sourceAssetId:'source',sourceSha256:h,sourceRange:range};
 const job={id:'job',ownerUid:'owner',model,request,requestHash:hash(request),attemptToken:'token',workerImage:'test-only@sha256:'+'b'.repeat(64),source:{generation:'1'},registryVersion:'test'};
 const files=Object.values(output).filter(v=>v && typeof v==='object' && v.name && v.sha256);
 if(!files.length)files.push({name:'data.json',sha256:'c'.repeat(64),bytes:1,mediaType:'application/json'});
 return buildArtifact({job,result:{jobId:job.id,attemptToken:job.attemptToken,requestHash:job.requestHash,modelId:model.id,revision:model.revision,status:'completed',output,files,
  metrics:{gpuCount:model.requiredDevice==='cuda'?1:0,device:'synthetic_contract_fixture',peakVramBytes:0,runtimeSeconds:1},
  provenance:{implementationSha256:'d'.repeat(64),executionKind:'test_double'}}});
}
const file=name=>({name,sha256:'e'.repeat(64),bytes:100,mediaType:'application/json'});
function mask() {return artifact('segment_subject',{subjectId:'subject',width:960,height:540,fpsNumerator:24,fpsDenominator:1,frameCount:72,
 sourceRange:range,maskManifest:file('manifest.json'),maskBundle:file('masks.tar.gz'),coverageBasis:'decoded_frames',confidence:null,warnings:[]},
 {subjectId:'subject',initialBox:[.1,.2,.6,.9],points:[],shotPrompts:[]});}
test('immutable generic artifact reference survives canonical projection without model routing fields',()=>{
 const a=mask(),p=initial();const next=attachArtifacts({ownerUid:'owner',...p,artifacts:[a]});
 const recovered=studio.projectStudioEditableStateToSnapshot(next.document,{timeline:p.snapshot.timeline});
 assert.equal(recovered.analysisRefs[0].artifactHash,a.artifactHash);assert.equal(recovered.analysisRefs[0].capability,'segment_subject');
 assert.equal(recovered.analysisRefs[0].checkpoint,undefined);assert.equal(recovered.analysisRefs[0].workerImage,undefined);
});
test('mask/tracking references remain attached to editable existing subject layers',()=>{
 const m=mask();const t=artifact('track_object',{subjectId:'subject',trackingKind:'object_mask_centroid',coordinateSpace:'normalized_source',sourceRange:range,
  samples:Array.from({length:72},(_,i)=>({frameIndex:i,sourceTick:i*3750,point:[.3,.4],box:[.1,.2,.6,.9],visible:true,confidence:null})),dependencyArtifactHash:m.artifactHash,coverageBasis:'decoded_frames'},
  {subjectId:'subject',mode:'mask_centroid',maskArtifactHash:m.artifactHash,points:[]},[m.artifactHash]);
 const p=initial();p.snapshot.subjectVfxScenes=[editableSubjectScene({segmentation:m,tracking:t,sourceStoragePath:'studio/sources/owner/source.mp4',
  effects:[{id:'title',type:'text_behind',start:0,end:3,text:'REAL MASK',x:50,y:35,font_size:80,color:'#ffffff'}]})];
 const next=attachArtifacts({ownerUid:'owner',...p,artifacts:[m,t]});
 const recovered=studio.projectStudioEditableStateToSnapshot(next.document,{timeline:p.snapshot.timeline});
 assert.equal(recovered.subjectVfxScenes[0].modelArtifactRef.artifactHash,m.artifactHash);
 assert.equal(recovered.subjectVfxScenes[0].trackingArtifactRef.artifactHash,t.artifactHash);
 recovered.subjectVfxScenes[0].scene.effects[0].text='EDITED';
 const edited=studio.adaptStudioSnapshotToDocument({snapshot:recovered,projectId:'project',previousDocument:next.document});
 assert.equal(edited.layers[0].parameters.scene.effects[0].text,'EDITED');
 assert.equal(edited.layers[0].parameters.modelArtifactRef.artifactHash,m.artifactHash);
});
test('generated video is ordinary editable canonical project media with provenance',()=>{
 const a=artifact('generate_video',{video:{...file('generated_shot.mp4'),mediaType:'video/mp4'},width:1280,height:704,fpsNumerator:24,fpsDenominator:1,
  frameCount:121,durationTicks:453750,origin:'generated_illustration',reviewRequired:true,confidence:null},{seed:1,width:1280,height:704,frames:121,fps:24});
 const p=initial();const next=attachArtifacts({ownerUid:'owner',...p,artifacts:[a],mediaFor:()=>({url:'http://localhost/contract-test.mp4',storagePath:'studio/sources/owner/generated.mp4',contentHash:a.output.video.sha256})});
 const recovered=studio.projectStudioEditableStateToSnapshot(next.document,next.snapshot);
 const generated=recovered.projectMedia.find(m=>m.id.startsWith('generated-'));
 assert.equal(generated.generationProvenance.artifactHash,a.artifactHash);assert.equal(generated.generationProvenance.reviewRequired,true);
 assert.equal(next.document.editGraph.media.find(m=>m.id===generated.id).contentHash,a.output.video.sha256);
});
test('unverified owner or changed source cannot attach model evidence',()=>{
 const a=mask(),p=initial();assert.throws(()=>attachArtifacts({ownerUid:'other',...p,artifacts:[a]}),/SCOPE/);
 p.document.assets[0].contentHash='f'.repeat(64);
 assert.throws(()=>attachArtifacts({ownerUid:'owner',...p,artifacts:[a]}),/SOURCE_STALE/);
});
test('editable layer cannot borrow a model mask from another source range',()=>{
 const m=mask(),p=initial();p.snapshot.subjectVfxScenes=[editableSubjectScene({segmentation:m,
   sourceStoragePath:'studio/sources/owner/source.mp4',effects:[{id:'title',type:'text_behind',start:0,end:3,text:'REAL MASK',x:50,y:35,font_size:80,color:'#ffffff'}]})];
 const next=attachArtifacts({ownerUid:'owner',...p,artifacts:[m]});
 next.document.layers[0].parameters.modelArtifactRef.sourceRange.endTick=180000;
 assert.throws(()=>studio.validateStudioProjectDocument(next.document),/source and range/);
});
