const studio = require('../generated/studioDirectorReplayKernel.cjs');
const { verifyArtifact } = require('./artifacts');
const { fail, hash, evidenceFor } = require('./contract');
const { validateSubjectVfxScene } = require('../../frontend/src/components/studioSubjectVfxContract');
function referenceFor(artifact) {
  return studio.createModelArtifactReference({kind:'model_capability',schemaVersion:1,artifactHash:artifact.artifactHash,
    sourceAssetId:artifact.sourceAssetId,sourceContentHash:artifact.sourceSha256,capability:artifact.capability,sourceRange:artifact.sourceRange});
}
function attachArtifacts({ownerUid,document,snapshot,artifacts,mediaFor}) {
  studio.validateStudioProjectDocument(document);
  const next=structuredClone(snapshot);
  next.analysisRefs=[...(next.analysisRefs || document.analysisRefs || [])];
  next.projectMedia=[...(next.projectMedia || [])];
  const evidence=[];
  for(const raw of artifacts) {
    const a=verifyArtifact(raw,{ownerUid,projectId:document.projectId});
    if(a.projectRevision>document.revision || !document.assets.some(asset =>
      (asset.sourceId===a.sourceAssetId || asset.assetId===a.sourceAssetId) && asset.contentHash===a.sourceSha256))
      throw fail('MODEL_STUDIO_SOURCE_STALE',409);
    const ref=referenceFor(a);
    if(!next.analysisRefs.some(r=>r.artifactHash===ref.artifactHash))next.analysisRefs.push(ref);
    evidence.push(evidenceFor(a));
    if(a.capability==='generate_video') {
      const access=mediaFor(a);
      if(!access || access.contentHash!==a.output.video.sha256 || !access.url || !access.storagePath)
        throw fail('MODEL_STUDIO_OWNED_MEDIA_REQUIRED',409);
      const id=`generated-${a.artifactHash.slice(0,32)}`;
      const media={id,name:'Generated B-roll',type:'video',mediaType:'video',status:'ready',duration:a.output.durationTicks/90000,
        width:a.output.width,height:a.output.height,...access,
        generationProvenance:{origin:'generated_illustration',artifactHash:a.artifactHash,capability:a.capability,
          contentHash:a.output.video.sha256,reviewRequired:true,model:a.model,modelRevision:a.revision,parameters:a.parameters}};
      if(!next.projectMedia.some(m=>m.id===id))next.projectMedia.push(media);
    }
  }
  const updated=studio.adaptStudioSnapshotToDocument({snapshot:next,projectId:document.projectId,previousDocument:document});
  studio.validateStudioProjectDocument(updated);
  return {document:updated,snapshot:studio.projectStudioEditableStateToSnapshot(updated,next),evidence,documentHash:hash(updated)};
}
function editableSubjectScene({segmentation,tracking,sourceStoragePath,effects,id='runtime-subject-scene'}) {
  const mask=verifyArtifact(segmentation);
  if(mask.capability!=='segment_subject')throw fail('MODEL_SUBJECT_MASK_REQUIRED',409);
  let track;
  if(tracking) {
    track=verifyArtifact(tracking,{ownerUid:mask.ownerUid,projectId:mask.projectId,sourceSha256:mask.sourceSha256});
    if(track.capability!=='track_object' || track.output.dependencyArtifactHash!==mask.artifactHash)
      throw fail('MODEL_SUBJECT_TRACK_DEPENDENCY_INVALID',409);
  }
  const box=mask.parameters.initialBox;
  const scene=validateSubjectVfxScene({version:1,id,sourceId:mask.sourceAssetId,sourceStoragePath,
    sourceRange:{start:mask.sourceRange.startTick/90000,end:mask.sourceRange.endTick/90000},
    prompt:{points:[[(box[0]+box[2])/2,(box[1]+box[3])/2]],labels:[1],
      shotPrompts:mask.parameters.shotPrompts.map(x=>({time:x.frameIndex/24,points:[[(x.box[0]+x.box[2])/2,(x.box[1]+x.box[3])/2]],labels:[1]}))},effects});
  return {scene,enabled:true,modelArtifactRef:referenceFor(mask),...(track?{trackingArtifactRef:referenceFor(track)}:{})};
}
module.exports={attachArtifacts,editableSubjectScene,referenceFor};
