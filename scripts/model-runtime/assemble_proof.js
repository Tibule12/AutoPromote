#!/usr/bin/env node
// The actual artifact outputs become one normal canonical Studio project.
const fs=require('fs/promises'),path=require('path');
const {latest,root,ownerUid,projectId,credentials}=require('./proof');
const {attachArtifacts,editableSubjectScene}=require('../../src/modelRuntime/studioAdapter');
const {importGeneratedSource}=require('../../src/modelRuntime/importGenerated');
const {immutableJson}=require('../../src/modelRuntime/stores');
const {hash,stable}=require('../../src/modelRuntime/contract');
const studio=require('../../src/generated/studioDirectorReplayKernel.cjs');
const {subjectVfxRevision}=require('../../frontend/src/components/studioSubjectVfxContract');
async function main() {
  const initial=JSON.parse(await fs.readFile(path.join(root,'initial-project.json')));
  const artifacts=await Promise.all(['understand_video','detect_object','segment_subject','track_object','generate_video'].map(latest));
  if(artifacts.some(a=>a.provenance.executionKind==='test_double'))throw Error('Synthetic fixtures cannot be a visual proof');
  const mask=artifacts[2],track=artifacts[3],generated=artifacts[4];
  const review=JSON.parse(await fs.readFile(path.join(root,'visual-review.json')));
  if(!review.segmentationVerified || !review.generatedMotionVerified ||
     review.maskArtifactHash!==mask.artifactHash || review.generatedArtifactHash!==generated.artifactHash)
    throw Error('Review the actual mask and generated motion before assembling');
  const {bucket}=await credentials();
  const access=await importGeneratedSource({ownerUid,projectId,artifact:generated,bucket,
    bindSource:async b=>immutableJson(path.join(root,'source-bindings',hash(b)+'.json'),b),
    urlFor:()=> 'http://127.0.0.1:6021/factory-media/outputs/generate_video/generated_shot.mp4'});
  await fs.writeFile(path.join(root,'generated-source-import.json'),stable(access));
  const effects=JSON.parse(await fs.readFile(path.join(root,'derived/vfx-plan.json'))).effects;
  const receipt=JSON.parse(await fs.readFile(path.join(root,'derived/vfx-receipt.json')));
  const entry=editableSubjectScene({segmentation:mask,tracking:track,sourceStoragePath:initial.snapshot.projectMedia[0].storagePath,effects});
  entry.preview={jobId:'model-runtime-v1-subject-proof',url:'http://127.0.0.1:6021/factory-media/derived/subject-composite.mp4',
    revision:subjectVfxRevision(entry.scene),reviewed:true,receipt};
  initial.snapshot.subjectVfxScenes=[entry];
  const attached=attachArtifacts({ownerUid,document:initial.document,snapshot:initial.snapshot,artifacts,mediaFor:()=>access});
  const media=attached.snapshot.projectMedia.find(m=>m.id===access.id);
  const approved=review.acceptedGeneratedRange;
  if(!approved || approved.space!=='source' || approved.startTick<0 ||
     approved.endTick>generated.output.durationTicks || approved.endTick<=approved.startTick)
    throw Error('The reviewed generated source range is required');
  const snapshot={...attached.snapshot,timeline:[...attached.snapshot.timeline,
    {id:'generated-occurrence',sourceClipId:media.id,name:'Actual Wan-generated moving shot',startRequest:approved.startTick/90000,
      endRequest:approved.endTick/90000,duration:(approved.endTick-approved.startTick)/90000,
      contentHash:media.contentHash,storagePath:media.storagePath}]};
  snapshot.orderedClips=snapshot.timeline.map(c=>{
    const m=snapshot.projectMedia.find(m=>m.id===c.sourceClipId);
    return {...c,url:m.url,start:c.startRequest,end:c.endRequest,sourceDuration:m.duration};
  });
  const document=studio.adaptStudioSnapshotToDocument({snapshot,projectId,previousDocument:attached.document});
  studio.validateStudioProjectDocument(document);
  const editable=studio.projectStudioEditableStateToSnapshot(document,snapshot);
  editable.studioDocument=document;editable.studioDocumentHash=hash(document);
  const mediaById=new Map(editable.projectMedia.map(m=>[m.id,m]));
  const segments=studio.compileStudioTimelineForRender(document).map(s=>({...s,
    url: s.source_clip_id==='proof-source'?'http://127.0.0.1:8765/media/source.mp4':
      'http://127.0.0.1:8765/outputs/generate_video/generated_shot.mp4'}));
  studio.assertStudioExportTimelineMatchesDocument(document,segments);
  const request=studio.buildViralRenderData({finalVideoUrl:segments[0].url,selectedClip:{start:0,end:segments.reduce((s,v)=>s+v.duration,0)},
    overlays:editable.overlays,extraOptions:{timelineSegments:segments,autoCaptions:false,muteAudio:false,
      outputSettings:editable.exportSettings,brandWatermark:false,smartCrop:true,smartCropMode:'safe_fit',
      finishPlan:{version:1,enabled:true,reframe:{enabled:true,aspect:'16:9',mode:'off'}},
      subjectVfx:editable.subjectVfxScenes.map(item=>({jobId:item.preview.jobId,scene:item.scene}))}});
  const resolved=JSON.parse(await fs.readFile(path.join(root,'derived/resolved-subject.private.json')));
  // Same resolved server->worker contract used by the existing Studio endpoint.
  // The private proof transports a real owned signed object; it does not forge
  // a legacy inference-job record or weaken the production resolver.
  request.subjectVfx=[resolved];
  const privatePath=path.join(root,'render-request.private.json');
  await fs.writeFile(privatePath,JSON.stringify(request,null,2),{mode:0o600});
  await fs.writeFile(path.join(root,'render-request.json'),JSON.stringify({...request,
    subjectVfx:request.subjectVfx.map(({url,...ref})=>({...ref,url:'[private signed GCS URL redacted]'}))},null,2));
  const project={id:projectId,name:'Model Runtime V1 · real segmentation and generated motion',snapshot:editable};
  await fs.writeFile(path.join(root,'canonical-project.json'),stable({document,snapshot:editable,documentHash:hash(document),evidence:attached.evidence}));
  await fs.writeFile(path.join(root,'studio-fixture-project.json'),JSON.stringify({project,clip:editable.orderedClips[0],
    scope:'Real artifact integration in the existing headless local Studio; ordinary-account release gates remain unqualified.'},null,2));
  console.log(JSON.stringify({event:'canonical_proof_assembled',projectId,revision:document.revision,artifactCount:artifacts.length,
    mediaCount:mediaById.size,documentHash:hash(document),renderRequestHash:hash(await fs.readFile(privatePath))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
