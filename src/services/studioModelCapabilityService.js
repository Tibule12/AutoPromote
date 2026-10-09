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
  const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
  const workers=Object.fromEntries(Object.entries(config).map(([key,c])=>[key,new CloudRunCapabilityWorker({client,bucket,
    jobName:c.jobName,image:c.image,artifactStore:artifacts})]));
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
  return new ModelCapabilityRuntime({jobs:new FirestoreJobStore(db),artifacts,authorize,workers});
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
module.exports={getRuntime,createStudioModelRuntime,ownedModelArtifact,importGeneratedResult};
