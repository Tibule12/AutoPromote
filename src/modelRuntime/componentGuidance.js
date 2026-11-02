const {verifyArtifact}=require('./artifacts');
const {hash,fail}=require('./contract');
// Follow only immutable owned refinement parents, never a browser file/path.
async function componentGuidance(artifact,artifacts) {
 const origin=artifact;const seen=new Set();
 const selection=value=>Object.fromEntries(['subjectId','initialBox','points','shotPrompts','components'].map(k=>[k,value.parameters[k]]));
 for(let depth=0;depth<16;depth++) {
  artifact=verifyArtifact(artifact,{ownerUid:origin.ownerUid,projectId:origin.projectId,sourceSha256:origin.sourceSha256});
  if(seen.has(artifact.artifactHash)||artifact.capability!=='segment_subject'||artifact.sourceAssetId!==origin.sourceAssetId||hash(artifact.sourceRange)!==hash(origin.sourceRange)||artifact.provenance.sourceGeneration!==origin.provenance.sourceGeneration||hash(selection(artifact))!==hash(selection(origin)))throw fail('MODEL_COMPONENT_GUIDANCE_INVALID',409);
  seen.add(artifact.artifactHash);
  const file=artifact.files.find(f=>f.name==='component_masks.tar.gz');
  if(file){
   const expected=`studio/model-runtime/executions/${artifact.ownerUid}/${artifact.provenance.jobId}/${artifact.provenance.attemptToken}/outputs/component_masks.tar.gz`;
   if(file.storagePath!==expected||!/^\d+$/.test(file.generation)||file.bytes>75*1024**2)throw fail('MODEL_COMPONENT_GUIDANCE_INVALID',409);
   return {artifact,file};
  }
  const parent=artifact.parameters.refinement?.maskArtifactHash;
  if(!parent)return null;
  if(!artifact.dependencyHashes.includes(parent))throw fail('MODEL_COMPONENT_GUIDANCE_INVALID',409);
  artifact=await artifacts.get(parent);
 }
 throw fail('MODEL_COMPONENT_GUIDANCE_DEPTH',409);
}
module.exports={componentGuidance};
