// Private rollout of the normal Studio mask workflow. This does not grant an
// admin role or access to the administrative multi-capability API.
const denied = () => Object.assign(new Error('Subject masks are unavailable for this account.'), {
  statusCode: 403, code: 'STUDIO_SUBJECT_MASK_UNAVAILABLE',
});
function requireSubjectMaskPreview(req, res, next) {
  const cohort = (process.env.STUDIO_SUBJECT_MASK_PREVIEW_UIDS || '').split(',').map(uid => uid.trim()).filter(Boolean);
  if (process.env.STUDIO_SUBJECT_MASK_PREVIEW_ENABLED !== 'true' || !req.user?.uid || !cohort.includes(req.user.uid))
    return res.status(403).json({success:false,code:'STUDIO_SUBJECT_MASK_UNAVAILABLE'});
  return next();
}
function assertSubjectMaskRequest(input) {
  if (input?.capability !== 'segment_subject' || !input.sourceRange ||
      input.sourceRange.endTick - input.sourceRange.startTick > 10 * 90000) throw denied();
  return input;
}
async function ownedSubjectMaskJob(runtime, ownerUid, jobId) {
  const job = await runtime.owned(ownerUid, jobId);
  if (job.request.capability !== 'segment_subject') throw denied();
  return job;
}
// Explicit native reuse of a completed mask after a later project save. Keep
// the original artifact/job revision immutable; revalidate the current source,
// generation, camera, range and exact retained selection before returning it.
async function reuseSavedSubjectMask({runtime,ownerUid,jobId,input,readProjectHead}) {
  const {hash,stable,fail}=require('../modelRuntime/contract');
  if(!input || Object.keys(input).sort().join()!=='id,projectRevision' || !Number.isSafeInteger(input.projectRevision))
    throw fail('MODEL_MASK_REUSE_INVALID',400);
  const job=await ownedSubjectMaskJob(runtime,ownerUid,jobId);
  const result=await runtime.getArtifact({ownerUid,jobId});
  if(job.status!=='stale')throw fail('MODEL_MASK_REUSE_NOT_STALE',409);
  const source=await runtime.authorize({ownerUid,request:{...job.request,projectRevision:input.projectRevision},requireCurrentRevision:true});
  if(source.sha256!==job.request.sourceSha256 || source.generation!==job.source.generation)
    throw fail('MODEL_MASK_REUSE_SOURCE_CHANGED',409);
  let head;
  if(readProjectHead)head=await readProjectHead(ownerUid,job.request.projectId);
  else {
    const {db}=require('../firebaseAdmin');
    const row=await db.collection('users').doc(ownerUid).collection('studioDirectorProjects').doc(hash(job.request.projectId)).get();
    if(row.exists)head=require('./studioProjectRevisionService').parseStudioProjectHeadRecord(row.data(),ownerUid,job.request.projectId);
  }
  const item=head?.document.layers.find(layer=>layer.type==='subject_vfx'&&layer.layerId===input.id)?.parameters;
  const scene=item?.scene, saved=item?.maskJob, r=job.request, p=r.parameters;
  if(head?.revision!==input.projectRevision || !scene || scene.id!==p.subjectId || scene.sourceId!==r.sourceAssetId ||
    scene.sourceStoragePath!==r.sourceStoragePath || Math.round(scene.sourceRange.start*90000)!==r.sourceRange.startTick ||
    Math.round(scene.sourceRange.end*90000)!==r.sourceRange.endTick || saved?.jobId!==job.id || saved.requestId!==r.requestId ||
    saved.projectId!==r.projectId || saved.projectRevision!==r.projectRevision)
    throw fail('MODEL_MASK_REUSE_SELECTION_CHANGED',409);
  const selection={sourceId:scene.sourceId,sourceStoragePath:scene.sourceStoragePath,sourceRange:scene.sourceRange,
    prompt:scene.prompt,box:p.initialBox,...(p.components?.length?{components:p.components}:{}),...(p.refinement?{refinement:p.refinement}:{})};
  if(stable(selection)!==saved.selectionJson || (p.refinement && item.modelArtifactRef?.artifactHash!==p.refinement.maskArtifactHash))
    throw fail('MODEL_MASK_REUSE_SELECTION_CHANGED',409);
  return require('../modelRuntime/studioAdapter').editableSubjectScene({segmentation:result.artifact,
    sourceStoragePath:scene.sourceStoragePath,effects:scene.effects,id:scene.id});
}
module.exports = { requireSubjectMaskPreview, assertSubjectMaskRequest, ownedSubjectMaskJob, reuseSavedSubjectMask };
