// Canonical references contain capability/result identity, never model routing.
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/;
const CAPABILITIES = ['understand_video','detect_object','segment_subject','track_object','generate_video'];
export function createModelArtifactReference(ref) {
  const fields=['kind','schemaVersion','artifactHash','sourceAssetId','sourceContentHash','capability','sourceRange'];
  if(!ref || ref.kind!=='model_capability' || ref.schemaVersion!==1 ||
     Object.keys(ref).length!==fields.length || fields.some(k=>!Object.prototype.hasOwnProperty.call(ref,k)) ||
     !HASH.test(ref.artifactHash || '') || !HASH.test(ref.sourceContentHash || '') || !ID.test(ref.sourceAssetId || '') ||
     !CAPABILITIES.includes(ref.capability) || !ref.sourceRange || Object.keys(ref.sourceRange).length!==3 ||
     ref.sourceRange.space!=='source' || !Number.isSafeInteger(ref.sourceRange.startTick) || ref.sourceRange.startTick<0 ||
     !Number.isSafeInteger(ref.sourceRange.endTick) || ref.sourceRange.endTick<=ref.sourceRange.startTick)
    throw new Error('Invalid immutable model artifact reference');
  return JSON.parse(JSON.stringify(ref));
}
