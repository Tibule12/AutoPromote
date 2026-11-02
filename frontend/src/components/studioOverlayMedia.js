// Materialization changes access bindings, never the user's pose, keys or copy.
// Commit each successful upload so a later rate limit does not discard work.
export function bindStudioOverlayMedia(current,before,uploaded){
  if(!current||String(current.id)!==String(before.id)||current.src!==before.src||current.file!==before.file)return current;
  return {...current,src:uploaded.src,sourceStoragePath:uploaded.sourceStoragePath,
    ...(uploaded.contentHash?{contentHash:uploaded.contentHash}:{}),isLocal:false,file:null};
}

export async function prepareStudioOverlayMedia(layers,prepare){
  // Keep export preparation active until every admitted upload settles. A
  // first failure must not enable Retry while its siblings are still writing.
  const settled=await Promise.allSettled(layers.map(prepare));
  const failed=settled.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  return settled.map(result=>result.value);
}
