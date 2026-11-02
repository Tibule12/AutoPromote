// Product boundary: authenticated source/project resolution stays in AutoPromote.
// Model/router/worker choices never originate in a browser request.
const { ModelCapabilityRuntime } = require('../modelRuntime/router');
const { FirestoreJobStore, FirestoreArtifactStore } = require('../modelRuntime/stores');
const { CloudRunCapabilityWorker } = require('../modelRuntime/cloudRunWorker');
const { hash, fail } = require('../modelRuntime/contract');
const { verifyArtifact } = require('../modelRuntime/artifacts');
let instance;
async function ownedModelArtifact({ uid, artifactHash, firestore }) {
  if (!/^[a-f0-9]{64}$/.test(artifactHash)) throw fail('MODEL_ARTIFACT_INVALID');
  const db = firestore || require('../firebaseAdmin').db;
  return verifyArtifact(await new FirestoreArtifactStore(db).get(artifactHash), { ownerUid:uid });
}
// Resolve a saved mask into bounded, generation-pinned worker inputs. Effects
// may change without inference; changed segmentation prompts require a new mask.
async function resolveSubjectMaskInputs({ownerUid,scene,modelArtifactRef,sourceSha256,sourceGeneration,signFiles=true,firestore,bucket}) {
  if(process.env.STUDIO_MODEL_RUNTIME_ENABLED!=='true')throw fail('MODEL_CAPABILITY_RUNTIME_OFFLINE',503);
  const studio=require('../generated/studioDirectorReplayKernel.cjs');
  const {referenceFor,editableSubjectScene}=require('../modelRuntime/studioAdapter');
  const ref=studio.createModelArtifactReference(modelArtifactRef);
  const a=await ownedModelArtifact({uid:ownerUid,artifactHash:ref.artifactHash,firestore});
  if(a.capability!=='segment_subject' || hash(ref)!==hash(referenceFor(a)) ||
     scene.sourceId!==a.sourceAssetId || sourceSha256!==a.sourceSha256 ||
     String(sourceGeneration)!==a.provenance.sourceGeneration ||
     Math.round(scene.sourceRange.start*90000)!==a.sourceRange.startTick ||
     Math.round(scene.sourceRange.end*90000)!==a.sourceRange.endTick)
    throw fail('MODEL_SUBJECT_SOURCE_MISMATCH',409);
  const expected=editableSubjectScene({segmentation:a,sourceStoragePath:scene.sourceStoragePath,effects:scene.effects,id:scene.id});
  if(hash(scene.prompt)!==hash(expected.scene.prompt))throw fail('MODEL_SUBJECT_PROMPT_CHANGED',409);
  const db=firestore || require('../firebaseAdmin').db;
  const head=await db.collection('users').doc(ownerUid).collection('studioDirectorProjects').doc(hash(a.projectId)).get();
  if(!head.exists)throw fail('MODEL_PROJECT_UNREGISTERED',409);
  const parsed=require('./studioProjectRevisionService').parseStudioProjectHeadRecord(head.data(),ownerUid,a.projectId);
  if(parsed.revision<a.projectRevision || !parsed.document.assets.some(asset =>
    (asset.sourceId===a.sourceAssetId || asset.assetId===a.sourceAssetId) &&
    asset.contentHash===a.sourceSha256 && asset.storagePath===scene.sourceStoragePath))
    throw fail('MODEL_PROJECT_SOURCE_MISMATCH',409);
  if(!signFiles)return {artifactHash:a.artifactHash,sourceSha256:a.sourceSha256,manifestSha256:a.output.maskManifest.sha256,
    projectId:a.projectId,projectRevision:a.projectRevision,model:a.model,revision:a.revision,checkpoint:a.checkpoint,modelVersion:a.modelVersion};
  const storage=bucket || require('firebase-admin').storage().bucket(process.env.STUDIO_MODEL_ARTIFACT_BUCKET);
  const files={};
  for(const [key,name] of [['normalizedSource','normalized_source.mp4'],['maskBundle',a.output.maskBundle.name]]) {
    const f=a.files.find(file=>file.name===name);
    const prefix=`studio/model-runtime/executions/${ownerUid}/${a.provenance.jobId}/${a.provenance.attemptToken}/outputs/`;
    if(!f || f.storagePath!==prefix+name || !/^[0-9]+$/.test(f.generation) || f.bytes>75*1024**2)
      throw fail('MODEL_SUBJECT_FILE_INVALID',409);
    const file=storage.file(f.storagePath,{generation:f.generation}),[meta]=await file.getMetadata();
    if(meta.metadata?.ownerUid!==ownerUid || meta.metadata?.sha256!==f.sha256 ||
       meta.metadata?.purpose!=='model_capability_artifact' || String(meta.generation)!==f.generation || Number(meta.size)!==f.bytes)
      throw fail('MODEL_SUBJECT_FILE_CHANGED',409);
    const [url]=await file.getSignedUrl({action:'read',expires:Date.now()+20*60000,queryParams:{generation:f.generation}});
    files[key]={url,sha256:f.sha256,bytes:f.bytes};
  }
  return {schemaVersion:1,artifactHash:a.artifactHash,sourceSha256:a.sourceSha256,sourceRange:a.sourceRange,files,
    manifestSha256:a.output.maskManifest.sha256,frameCount:a.output.frameCount,width:a.output.width,height:a.output.height};
}
async function createStudioModelRuntime() {
  if (process.env.STUDIO_MODEL_RUNTIME_ENABLED !== 'true') throw fail('MODEL_CAPABILITY_RUNTIME_OFFLINE',503);
  const admin = require('firebase-admin');
  const { GoogleAuth } = require('google-auth-library');
  const { getOwnedStudioSourceBinding,assertOwnedStudioSourceBinding } = require('./studioDirectorProjectBinding');
  const { parseStudioProjectHeadRecord } = require('./studioProjectRevisionService');
  const db = require('../firebaseAdmin').db;
  const artifactBucket = process.env.STUDIO_MODEL_ARTIFACT_BUCKET;
  if (!artifactBucket) throw fail('MODEL_CAPABILITY_STORAGE_UNCONFIGURED',503);
  const bucket=admin.storage().bucket(artifactBucket), artifacts=new FirestoreArtifactStore(db);
  const config=JSON.parse(process.env.STUDIO_MODEL_WORKERS_JSON || '{}');
  // Cloud deployments keep ADC. Local private integration can explicitly use
  // the same configured service identity as the authenticated backend; no user
  // token, gcloud impersonation or additional credential file is introduced.
  const credentials=process.env.STUDIO_MODEL_USE_BACKEND_IDENTITY==='true'?require('../../firebaseConfig.server'):undefined;
  const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform'],...(credentials?{credentials}:{})}).getClient();
  const workers=Object.fromEntries(Object.entries(config).map(([key,c])=>[key,new CloudRunCapabilityWorker({client,bucket,
    jobName:c.jobName,image:c.image,artifactStore:artifacts})]));
  let models;
  if (process.env.STUDIO_MODEL_LOCAL_CPU_ENABLED==='true') {
    const {LocalCpuCapabilityWorker}=require('../modelRuntime/localCpuWorker');
    workers['segmentation-tracking:cpu']=new LocalCpuCapabilityWorker({bucket,
      artifacts,refinementModelDirectory:process.env.STUDIO_MODEL_LOCAL_CPU_REFINEMENT_MODEL_DIR,
      image:process.env.STUDIO_MODEL_LOCAL_CPU_IMAGE,directory:process.env.STUDIO_MODEL_LOCAL_CPU_ROOT,
      modelDirectory:process.env.STUDIO_MODEL_LOCAL_CPU_MODEL_DIR,
      dependenciesDirectory:process.env.STUDIO_MODEL_LOCAL_CPU_DEPS_DIR,
      baseDependencies:process.env.STUDIO_MODEL_LOCAL_CPU_BASE_DEPS});
    models=structuredClone(require('../modelRuntime/contract').registry);
    models.defaults.segment_subject='sam21-small-cpu-v1';
  }
  const authorize=async ({ownerUid,request:r,requireCurrentRevision})=>{
    const binding=await getOwnedStudioSourceBinding({uid:ownerUid,projectId:r.projectId,sourceAssetId:r.sourceAssetId,firestore:db});
    if (binding && binding.sourceSha256!==r.sourceSha256) throw fail('MODEL_SOURCE_UNVERIFIED',409);
    const head=await db.collection('users').doc(ownerUid).collection('studioDirectorProjects').doc(hash(r.projectId)).get();
    if (!head.exists) throw fail('MODEL_PROJECT_UNREGISTERED',409);
    const parsed=parseStudioProjectHeadRecord(head.data(),ownerUid,r.projectId);
    if (requireCurrentRevision && parsed.revision!==r.projectRevision) throw fail('MODEL_PROJECT_REVISION_STALE',409);
    const asset=parsed.document.assets.find(a=>a.sourceId===r.sourceAssetId || a.assetId===r.sourceAssetId);
    if (!asset || asset.contentHash!==r.sourceSha256 || asset.storagePath!==r.sourceStoragePath) throw fail('MODEL_PROJECT_SOURCE_MISMATCH',409);
    if (!r.sourceStoragePath.startsWith(`studio/sources/${ownerUid}/`)) throw fail('MODEL_SOURCE_FORBIDDEN',403);
    const file=bucket.file(r.sourceStoragePath);const [metadata]=await file.getMetadata();
    if(metadata.metadata?.ownerUid!==ownerUid || (metadata.metadata?.sha256 || metadata.metadata?.contentHash)!==r.sourceSha256 || !['studio_source','studio_project'].includes(metadata.metadata?.purpose) ||
       !metadata.generation || !Number.isFinite(Number(metadata.size)) || Number(metadata.size)<=0 || Number(metadata.size)>512*1024**2)
      throw fail('MODEL_SOURCE_FORBIDDEN',403);
    if (!String(metadata.contentType || '').startsWith('video/')) throw fail('MODEL_IMAGE_INGEST_PENDING',422);
    if(!binding)await assertOwnedStudioSourceBinding({uid:ownerUid,projectId:r.projectId,
      sourceAssetId:r.sourceAssetId,sourceSha256:r.sourceSha256,firestore:db});
    return {sha256:r.sourceSha256,storagePath:r.sourceStoragePath,bucket:artifactBucket,generation:String(metadata.generation),size:Number(metadata.size)};
  };
  return new ModelCapabilityRuntime({jobs:new FirestoreJobStore(db),artifacts,authorize,workers,...(models?{models}:{})});
}
async function getRuntime() { if(!instance)instance=createStudioModelRuntime().catch(e=>{instance=null;throw e;});return instance; }
async function importGeneratedResult({ownerUid,jobId}) {
  const runtime=await getRuntime(),job=await runtime.owned(ownerUid,jobId);
  const result=await runtime.getArtifact({ownerUid,jobId});
  if(!result.applicable)throw fail('MODEL_PROJECT_REVISION_STALE',409);
  await runtime.authorize({ownerUid,request:job.request,requireCurrentRevision:true});
  const {assertOwnedStudioSourceBinding}=require('./studioDirectorProjectBinding');
  const {importGeneratedSource}=require('../modelRuntime/importGenerated');
  const admin=require('firebase-admin');
  return importGeneratedSource({ownerUid,projectId:job.request.projectId,artifact:result.artifact,
    bucket:admin.storage().bucket(process.env.STUDIO_MODEL_ARTIFACT_BUCKET),bindSource:assertOwnedStudioSourceBinding});
}
module.exports={getRuntime,createStudioModelRuntime,ownedModelArtifact,importGeneratedResult,resolveSubjectMaskInputs};
