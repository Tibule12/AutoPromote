const crypto = require('node:crypto');
const MAX_MODEL_SOURCE_BYTES=512*1024**2;
async function hashCompletedStudioSource({bucket,storagePath,generation,size}) {
  if(!/^studio\/sources\/[^/]+\//.test(storagePath) || !/^[0-9]+$/.test(String(generation)) ||
     !Number.isSafeInteger(size) || size<=0 || size>MAX_MODEL_SOURCE_BYTES)
    throw Object.assign(new Error('STUDIO_SOURCE_IDENTITY_UNAVAILABLE'),{statusCode:409});
  const digest=crypto.createHash('sha256');let actual=0;
  for await(const bytes of bucket.file(storagePath,{generation:String(generation)}).createReadStream()){
    actual+=bytes.length;if(actual>size)throw Object.assign(new Error('STUDIO_SOURCE_SIZE_CHANGED'),{statusCode:409});digest.update(bytes);
  }
  if(actual!==size)throw Object.assign(new Error('STUDIO_SOURCE_SIZE_CHANGED'),{statusCode:409});
  return digest.digest('hex');
}
module.exports={hashCompletedStudioSource,MAX_MODEL_SOURCE_BYTES};
