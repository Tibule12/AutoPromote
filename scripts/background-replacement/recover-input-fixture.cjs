// Restore retained, hash-verified model INPUTS into a fresh isolated demo.
// This does not restore lost job/wallet history or synthesize model receipts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyArtifact}=require('../../src/modelRuntime/artifacts');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function restore({fixture,storage,db}) {
 require('../../src/services/unifiedCredits/runtime').assertSandbox();
 if(process.env.STUDIO_BACKGROUND_DEMO!=='true'||!path.isAbsolute(fixture))throw Error('Isolated input fixture required');
 const data=JSON.parse(fs.readFileSync(fixture));
 const artifacts=data.artifacts.map(a=>verifyArtifact(a,{ownerUid:'demo-pilot-alice'}));
 const {StoredFileMetadata}=require('firebase-tools/lib/emulator/storage/metadata');
 const temporary=fs.mkdtempSync(path.join(path.dirname(fixture),'storage-input-'));fs.chmodSync(temporary,0o700);
 fs.mkdirSync(path.join(temporary,'metadata'));fs.mkdirSync(path.join(temporary,'blobs'));
 fs.writeFileSync(path.join(temporary,'buckets.json'),JSON.stringify({buckets:[{id:'demo-autopromote-credits'}]}));
 try {
  for(const [i,item] of data.objects.entries()) {
   if(!path.isAbsolute(item.file)||!item.name.includes('/demo-pilot-alice/')||!/^\d+$/.test(item.generation)||!['studio_source','model_capability_artifact','image'].includes(item.purpose))throw Error('Invalid fixture scope');
   const bytes=fs.readFileSync(item.file);if(digest(bytes)!==item.sha256||bytes.length!==item.bytes)throw Error('Retained input changed');
   const meta=new StoredFileMetadata({name:item.name,bucket:'demo-autopromote-credits',generation:item.generation,contentType:item.contentType,
    customMetadata:{ownerUid:'demo-pilot-alice',sha256:item.sha256,purpose:item.purpose}},null,bytes);
   fs.writeFileSync(path.join(temporary,'metadata',`${i}.json`),StoredFileMetadata.toJSON(meta));
   fs.writeFileSync(path.join(temporary,'blobs',String(i)),bytes);
  }
  storage.storageLayer.import(temporary,{initiatedBy:'retained_owned_background_inputs'});
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
 const {FirestoreArtifactStore}=require('../../src/modelRuntime/stores');const store=new FirestoreArtifactStore(db);
 for(const artifact of artifacts) {
  for(const f of artifact.files)if(!data.objects.some(o=>o.name===f.storagePath&&o.generation===f.generation&&o.sha256===f.sha256&&o.bytes===f.bytes))throw Error('Incomplete artifact input fixture');
  await store.put(artifact);
  await require('../../src/services/studioDirectorProjectBinding').assertOwnedStudioSourceBinding({uid:artifact.ownerUid,projectId:artifact.projectId,sourceAssetId:artifact.sourceAssetId,sourceSha256:artifact.sourceSha256,firestore:db});
 }
 console.log('Retained owned inputs verified and imported; fresh demo wallet/history remain independent.');
}
module.exports={restore};
