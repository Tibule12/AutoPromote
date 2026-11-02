// Share decoded source pixels only when the owned source identity and exact
// declared source clock agree. The layer's editable mask/pose still renders on
// its own node. Different takes, clocks and audible overlays keep their decoder.
export function studioSharedOverlayFrame(layer,frame,programmeTime,soloId){
  if(!frame?.picture||layer?.type!=='video'||layer.useOverlayAudio||String(layer.id)===String(soloId))return null;
  const path=layer.sourceStoragePath||layer.storagePath,hash=layer.contentHash||layer.sha256;
  if(!path||path!==frame.storagePath||!hash||hash!==frame.contentHash||!/^[a-f0-9]{64}$/.test(hash))return null;
  const elapsed=programmeTime-Number(layer.startTime??layer.start_time??0),duration=Number(layer.duration);
  const expected=Number(layer.sourceStartTime||0)+elapsed;
  if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(duration)||elapsed>=duration||
    !Number.isFinite(frame.sourceTime)||Math.abs(expected-frame.sourceTime)>1e-6||
    (Number(layer.sourceDuration)>0&&expected>=Number(layer.sourceDuration)))return null;
  return frame.picture;
}

// Different masks, UV regions and poses may read one identical secondary
// source clock. Audio, loops, other owners/hashes and another source offset
// keep their own decoder. This never changes the saved layer or its timing.
export function studioOverlayDecodeKey(layer){
  const path=layer?.sourceStoragePath||layer?.storagePath,hash=layer?.contentHash||layer?.sha256;
  const start=Number(layer?.startTime??layer?.start_time??0),source=Number(layer?.sourceStartTime||0);
  if(layer?.type!=='video'||layer.useOverlayAudio||layer.sourceEndBehavior==='loop'||!path||!/^[a-f0-9]{64}$/.test(hash||'')||
    !Number.isFinite(start)||!Number.isFinite(source)||!(Number(layer.duration)>0))return null;
  return JSON.stringify([path,hash,source-start]);
}

export function studioSecondaryOverlayFrame(layer,owner,video,programmeTime,soloId,presentedTime){
  if(soloId||layer?.id===owner?.id||!video||video.seeking||video.readyState<2||
    !studioOverlayDecodeKey(layer)||studioOverlayDecodeKey(layer)!==studioOverlayDecodeKey(owner))return null;
  for(const item of [layer,owner]){
    const elapsed=programmeTime-Number(item.startTime??item.start_time??0),expected=Number(item.sourceStartTime||0)+elapsed;
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=Number(item.duration)||expected<0||
      (Number(item.sourceDuration)>0&&expected>=Number(item.sourceDuration)))return null;
  }
  const expected=Number(owner.sourceStartTime||0)+programmeTime-Number(owner.startTime??owner.start_time??0);
  const actual=Number(presentedTime??video.currentTime);
  // Paused seeks must have settled to the requested source position. Playing
  // sharing retains the existing transport's bounded drift; it is not labelled
  // exact paused-frame sampling or whole-picture parity.
  if(!Number.isFinite(actual)||Math.abs(actual-expected)>(video.paused ? .001 : .18))return null;
  return {picture:video,sourceTime:actual,ownerId:owner.id};
}
