// Validation of saved real artifact records using synthetic DB/access transport.
// This test does not execute a model or qualify an authenticated browser flow.
process.env.FIREBASE_ADMIN_BYPASS='1';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {hash}=require('../../src/modelRuntime/contract');
const {referenceFor}=require('../../src/modelRuntime/studioAdapter');
const {resolveSubjectMaskInputs}=require('../../src/services/studioModelCapabilityService');
const {validateStudioProjectRevisionDocument}=require('../../src/services/studioProjectRevisionService');
const root='reports/model-capability-runtime-v1-20261009/proof/';
const mask=JSON.parse(fs.readFileSync(root+'artifacts/91399a80c757d52f360868c0373123feee364b7b9535e0e63ae7b0ed443d5ba7.json'));
const canonical=JSON.parse(fs.readFileSync(root+'canonical-project.json'));
function fixture() {
  const a=structuredClone(mask),document=structuredClone(canonical.document),records=new Map();
  const ownerUid=a.ownerUid,{documentJson,documentFingerprint}=validateStudioProjectRevisionDocument(document);
  const head={schemaVersion:1,ownerUid,projectId:a.projectId,revision:document.revision,documentJson,documentFingerprint,
    serverRevisionId:hash(`${a.projectId}\0${document.revision}`),registeredAt:new Date().toISOString()};
  records.set(`studio_model_capability_artifacts/${a.artifactHash}`,{artifactJson:JSON.stringify(a)});
  const headPath=`users/${ownerUid}/studioDirectorProjects/${hash(a.projectId)}`;records.set(headPath,head);
  const collection=path=>({doc:id=>({get:async()=>({exists:records.has(path+'/'+id),data:()=>records.get(path+'/'+id)}),collection:name=>collection(path+'/'+id+'/'+name)})});
  const firestore={collection},metas=new Map(a.files.map(f=>[f.storagePath,{generation:f.generation,size:f.bytes,
    metadata:{ownerUid,sha256:f.sha256,purpose:'model_capability_artifact'}}])),signed=[];
  const bucket={file:(p,options)=>({getMetadata:async()=>[metas.get(p)],getSignedUrl:async cfg=>{
    signed.push({path:p,generation:options.generation,cfg});return ['https://storage.googleapis.com/synthetic-access-only/'+p];}})};
  const scene=structuredClone(canonical.snapshot.subjectVfxScenes[0].scene);
  return {args:{ownerUid,scene,modelArtifactRef:referenceFor(a),sourceSha256:a.sourceSha256,
    sourceGeneration:a.provenance.sourceGeneration,firestore,bucket},records,headPath,metas,signed};
}
test.before(()=>{process.env.STUDIO_MODEL_RUNTIME_ENABLED='true';});
test.after(()=>{delete process.env.STUDIO_MODEL_RUNTIME_ENABLED;});
test('mask inputs retain generation, bytes and hashes, while effects remain editable',async()=>{
  const f=fixture();f.args.scene.effects[0].text='EDITED TITLE';
  const value=await resolveSubjectMaskInputs(f.args);
  assert.equal(value.artifactHash,mask.artifactHash);assert.equal(value.frameCount,72);
  assert.equal(value.files.maskBundle.sha256,mask.output.maskBundle.sha256);
  assert.equal(f.signed.length,2);
  for(const file of f.signed)assert.equal(file.generation,file.cfg.queryParams.generation);
});
test('another owner, replaced source and changed seed fail before access URLs',async()=>{
  for(const edit of [f=>f.args.ownerUid='other-owner',f=>f.args.sourceSha256='a'.repeat(64),
    f=>f.args.sourceGeneration='2',f=>f.args.scene.prompt.points[0][0]=.01]) {
    const f=fixture();edit(f);await assert.rejects(resolveSubjectMaskInputs(f.args));assert.equal(f.signed.length,0);
  }
});
test('removed project membership or a forged source range cannot reuse a mask',async()=>{
  const absent=fixture();absent.records.delete(absent.headPath);await assert.rejects(resolveSubjectMaskInputs(absent.args));
  const forged=fixture();forged.args.modelArtifactRef.sourceRange.endTick-=3750;
  await assert.rejects(resolveSubjectMaskInputs(forged.args));assert.equal(forged.signed.length,0);
});
test('changed immutable file metadata is rejected before worker dispatch',async()=>{
  const f=fixture();f.metas.get(mask.files.find(x=>x.name==='normalized_source.mp4').storagePath).generation='2';
  await assert.rejects(resolveSubjectMaskInputs(f.args),/FILE_CHANGED/);assert.equal(f.signed.length,0);
});
test('export validation needs no artifact downloads or refreshed input URLs',async()=>{
  const f=fixture();const value=await resolveSubjectMaskInputs({...f.args,signFiles:false});
  assert.equal(value.manifestSha256,mask.output.maskManifest.sha256);assert.equal(f.signed.length,0);
});
