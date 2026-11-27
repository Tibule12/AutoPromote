const { verifyArtifact } = require('./artifacts');
const { hash, fail } = require('./contract');
// Promote a verified immutable result into the existing owned Studio-source
// namespace. The browser receives ordinary media, without provider choices.
async function importGeneratedSource({ownerUid,projectId,artifact,bucket,bindSource,urlFor}) {
  const a=verifyArtifact(artifact,{ownerUid,projectId});
  if(a.capability!=='generate_video')throw fail('MODEL_GENERATED_VIDEO_REQUIRED',422);
  const ref=a.output.video,file=a.files.find(f=>f.name===ref.name&&f.sha256===ref.sha256);
  if(!file || !file.storagePath || !/^[0-9]+$/.test(file.generation) || file.bytes>75*1024**2)
    throw fail('MODEL_GENERATED_IMPORT_INVALID',422);
  const sourceAssetId=`generated-${a.artifactHash.slice(0,32)}`;
  const storagePath=`studio/sources/${ownerUid}/model-${a.artifactHash}.mp4`;
  const dest=bucket.file(storagePath);const [exists]=await dest.exists();
  if(!exists) {
    const source=bucket.file(file.storagePath,{generation:file.generation});
    const [metadata]=await source.getMetadata();
    if(metadata.metadata?.ownerUid!==ownerUid || Number(metadata.size)!==file.bytes)
      throw fail('MODEL_GENERATED_IMPORT_FORBIDDEN',403);
    const chunks=[];let size=0;
    for await(const block of source.createReadStream()) {
      size+=block.length;if(size>file.bytes)throw fail('MODEL_GENERATED_IMPORT_CHANGED',409);chunks.push(block);
    }
    const bytes=Buffer.concat(chunks);
    if(size!==file.bytes || hash(bytes)!==ref.sha256)throw fail('MODEL_GENERATED_IMPORT_CHANGED',409);
    try {
      await dest.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',
        metadata:{ownerUid,projectId,purpose:'studio_source',sha256:ref.sha256,contentHash:ref.sha256,
          generatedArtifactHash:a.artifactHash,origin:'generated_illustration'}}});
    } catch(error) { if(Number(error.code)!==412)throw error; } // Concurrent immutable import: verify it below.
  }
  const [metadata]=await dest.getMetadata();
  if(metadata.metadata?.ownerUid!==ownerUid || metadata.metadata?.sha256!==ref.sha256 ||
     metadata.metadata?.generatedArtifactHash!==a.artifactHash || Number(metadata.size)!==file.bytes)
    throw fail('MODEL_GENERATED_IMPORT_COLLISION',409);
  await bindSource({uid:ownerUid,projectId,sourceAssetId,sourceSha256:ref.sha256});
  const url=urlFor ? await urlFor(dest) : (await dest.getSignedUrl({action:'read',expires:Date.now()+3600000}))[0];
  return {id:sourceAssetId,url,storagePath,contentHash:ref.sha256,generation:String(metadata.generation),
    duration:a.output.durationTicks/90000,width:a.output.width,height:a.output.height,
    artifactHash:a.artifactHash,origin:'generated_illustration',reviewRequired:true};
}
module.exports={importGeneratedSource};
