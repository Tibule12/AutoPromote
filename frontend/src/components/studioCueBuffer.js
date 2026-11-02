import { synthesizeEffect } from './motion/soundDesign';
import { mapStudioContinuousSeconds } from './studioTime';

// Generate cue PCM before the transport clock starts. Synthesizing a whoosh
// on its play event can consume its attack while the picture/music advance.
// Faders and timeline positions are separate from these reusable samples.
export function prepareStudioBuiltInCue(context, effect, cache, projectId) {
  const sampleRate = Number(context?.sampleRate || 48000);
  if (!context || !effect?.builtIn || !projectId || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const duration = Math.max(.05, Math.min(15, Number(effect.duration) || .7));
  const key = JSON.stringify([projectId,sampleRate,effect.tone,duration,
    Math.max(.001, Number(effect.fadeIn) || 0),Math.max(.005, Number(effect.fadeOut) || 0)]);
  if (cache.has(key)) {
    const existing = cache.get(key);
    cache.delete(key); cache.set(key,existing);
    return existing;
  }
  const samples = synthesizeEffect({ ...effect,duration },sampleRate);
  // Bound transient PCM memory independently of project count or film length.
  let retained = [...cache.values()].reduce((sum, buffer) => sum + buffer.length,0);
  while (cache.size && retained + samples.length > 4000000) {
    const oldest = cache.keys().next().value;
    retained -= cache.get(oldest).length;
    cache.delete(oldest);
  }
  const buffer = context.createBuffer(1,samples.length,sampleRate);
  buffer.getChannelData(0).set(samples);
  cache.set(key,buffer);
  return buffer;
}

// Transient decoder cache keys are scoped to the owning project and bytes.
// Access-link rotation can reuse attested audio, never another project's cache.
export function studioCueSourceKey(projectId, effect) {
  if (!projectId || effect?.builtIn || effect?.kind === 'voiceover' || !effect?.url) return '';
  const storagePath = effect.storagePath || effect.sourceStoragePath;
  const owned = effect.ownerUid && storagePath && /^[a-f0-9]{64}$/.test(effect.contentHash || '');
  return JSON.stringify(owned
    ? [projectId, effect.ownerUid, storagePath, effect.contentHash]
    : [projectId, effect.url]);
}

// Prefer already requested, bounded PCM decodes before pinning this transport's
// route. Slow/unsupported imports retain the ordinary native decoder fallback.
export async function prepareStudioCuePlayback(promises, timeoutMs = 2000) {
  if (!promises.length) return;
  let timer;
  try {
    await Promise.race([Promise.allSettled(promises), new Promise(resolve => {
      timer = setTimeout(resolve, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Bake the same trim/fades as write_sound_mix into real decoded cue samples.
// Volume/automation stay live on the existing SFX bus. Voiceover retains its
// pitch-preserving native route; it must not be played with SFX resampling.
export function createStudioCueBuffer(context, decoded, effect) {
  const rate = context.sampleRate;
  if (decoded.sampleRate !== rate || decoded.numberOfChannels > 2) return null;
  const duration = Math.max(.05, Math.min(15, Number(effect.duration) || 2));
  const first = Math.round(Math.max(0, Number(effect.trimStart) || 0) * rate);
  const count = Math.min(Math.ceil(duration * rate), decoded.length - first);
  if (count <= 0) return null;
  const buffer = context.createBuffer(decoded.numberOfChannels, count, rate);
  const fadeIn = Math.max(.001, Number(effect.fadeIn) || 0);
  const fadeOut = Math.max(.005, Number(effect.fadeOut) || 0);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const input = decoded.getChannelData(channel), output = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const time = i / rate;
      output[i] = input[first + i] * Math.min(1, time / fadeIn, (duration - time) / fadeOut);
    }
  }
  return buffer;
}

// write_sound_mix samples imported/SFX PCM with linear interpolation on the
// canonical output clock. Browser playbackRate uses a different resampler and
// k-rate changes, so even a correctly timed 2x cue can have a different phase.
// Project those same source samples once; transport plays this transient PCM
// at 1x. Authored source trim, timing, fades and editable bus gain stay intact.
export function projectStudioCueBuffer(context, source, effect, outputTimeMap) {
  const rate=Number(context?.sampleRate), channels=Number(source?.numberOfChannels);
  if (!outputTimeMap?.length || outputTimeMap.length>4096 || !Number.isFinite(rate) ||
      !(source?.length>0) || !(channels>=1 && channels<=2)) return null;
  const programmeStart=Math.max(0,Number(effect.startTime)||0);
  const programmeEnd=programmeStart+Math.max(.05,Math.min(15,Number(effect.duration)||2));
  const firstFrame=Math.ceil(mapStudioContinuousSeconds(outputTimeMap,programmeStart,'programme')*rate);
  const endFrame=Math.ceil(mapStudioContinuousSeconds(outputTimeMap,programmeEnd,'programme')*rate);
  const count=endFrame-firstFrame;
  if (!(count>0 && count<=4000000)) return null;
  const buffer=context.createBuffer(channels,count,rate);
  let segmentIndex=0, outputStart=0;
  const segments=outputTimeMap.map(segment=>{
    const start=segment.programmeRange.startTick/90000,end=segment.programmeRange.endTick/90000;
    const speed=segment.rateNumerator/segment.rateDenominator;
    const result={start,end,speed,outputStart,outputEnd:outputStart+(end-start)/speed};
    outputStart=result.outputEnd;return result;
  });
  const inputs=Array.from({length:channels},(_,i)=>source.getChannelData(i));
  const outputs=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let i=0;i<count;i++) {
    const time=(firstFrame+i)/rate;
    while(segmentIndex<segments.length-1 && time>=segments[segmentIndex].outputEnd) segmentIndex++;
    const segment=segments[segmentIndex];
    const position=(segment.start+(time-segment.outputStart)*segment.speed-programmeStart)*rate;
    if(position<0 || position>source.length-1) continue;
    const left=Math.floor(position),fraction=position-left,right=Math.min(source.length-1,left+1);
    for(let channel=0;channel<channels;channel++)
      outputs[channel][i]=inputs[channel][left]+(inputs[channel][right]-inputs[channel][left])*fraction;
  }
  buffer.studioOutputCue={firstFrame,endFrame,outputTimeMap};
  return buffer;
}

export function prepareStudioDecodedCue(context, route, effect, outputTimeMap) {
  if (!route?.decoded || !route.cues) return null;
  const key=JSON.stringify([effect.trimStart,effect.duration,effect.fadeIn,effect.fadeOut,
    outputTimeMap && effect.startTime,outputTimeMap || null]);
  if(route.cues.has(key)) return route.cues.get(key);
  let buffer=createStudioCueBuffer(context,route.decoded,effect);
  if(!buffer) return null;
  if(outputTimeMap) buffer=projectStudioCueBuffer(context,buffer,effect,outputTimeMap) || buffer;
  if(route.cues.size>=8) route.cues.clear();
  route.cues.set(key,buffer);return buffer;
}
