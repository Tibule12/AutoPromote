// The owned CPU preview uses the final mixer's samples and edit time map.
// Neither a signed URL nor a completed movie is the identity of this preview.
export function studioVoiceBusRequest({ projectId, takes, outputTimeMap, automation = [], ducking }) {
  const voices = takes.filter(take => take.enabled !== false);
  const duration = outputTimeMap?.at(-1)?.programmeRange.endTick / 90000;
  if (!projectId || !voices.length || voices.length > 8 || !(duration > 0 && duration <= 90) ||
      outputTimeMap.at(-1).outputRange.endTick > 90*90000 || automation.length > 64 ||
      voices.some(take => !take.ownerUid || !(take.sourceStoragePath || take.storagePath) ||
        !/^[a-f0-9]{64}$/.test(take.contentHash || '') || !(take.sourceDuration > 0 && take.sourceDuration <= 60) ||
        !(take.duration >= .05 && take.duration <= 60) || (take.trimStart || 0)+take.duration > 60)) return null;
  return { version: 1, projectId,
    voices: voices.map(take => ({ id: take.id, storagePath: take.sourceStoragePath || take.storagePath,
      sourceContentHash: take.contentHash, startTime: Number(take.startTime || 0),
      duration: Number(take.duration), trimStart: Number(take.trimStart || 0), volume: Number(take.volume ?? 1),
      fadeIn: Number(take.fadeIn || 0), fadeOut: Number(take.fadeOut || 0),
      ...(take.fadeDuration !== undefined ? { fadeOffset: take.fadeOffset, fadeDuration: take.fadeDuration } : {}) })),
    speedPlan: outputTimeMap.map(row => ({ start_time: row.programmeRange.startTick/90000,
      end_time: row.programmeRange.endTick/90000, rate: row.rateNumerator/row.rateDenominator })),
    automation: automation.map(key => ({ property: 'volume', time: Number(key.time), value: Number(key.value),
      easing: key.easing || 'linear', curve: key.curve || null })),
    ducking: { enabled: Boolean(ducking?.enabled), strength: Math.max(.05, Math.min(.95, Number(ducking?.strength ?? .4))) } };
}

// Bounded original-dialogue projection over the same owned mixer. Unsupported
// detached/speed/remix/overlay routes must not silently claim this profile.
export function studioDialogueBusRequest({ projectId, timeline, outputTimeMap, automation = [], restoration }) {
  if (!projectId || !Array.isArray(timeline) || !timeline.length || timeline.length>8 || !outputTimeMap?.length ||
      outputTimeMap.some(row=>row.rateNumerator!==row.rateDenominator) || !restoration?.enabled || automation.length>64) return null;
  let startTime=0;const voices=[];
  for (const clip of timeline) {
    const start=Number(clip.startRequest??clip.start??0),end=Number(clip.endRequest??clip.end);
    const hash=clip.contentHash||clip.sha256;
    if (!(clip.sourceStoragePath||clip.storagePath) || !/^[a-f0-9]{64}$/.test(hash||'') ||
        ![start,end].every(Number.isFinite) || start<0 || end>60 || end-start<.05 ||
        clip.audioDetached || Number(clip.audioTrimOffsetStart||0)!==0 || Number(clip.audioTrimOffsetEnd||0)!==0) return null;
    voices.push({id:clip.id,storagePath:clip.sourceStoragePath||clip.storagePath,sourceContentHash:hash,
      startTime,duration:end-start,trimStart:start,volume:1,fadeIn:0,fadeOut:0});startTime+=end-start;
  }
  if (startTime>90 || Math.abs(outputTimeMap.at(-1).programmeRange.endTick/90000-startTime)>1/90000) return null;
  return {version:2,projectId,voices,restoration,
    speedPlan:outputTimeMap.map(row=>({start_time:row.programmeRange.startTick/90000,end_time:row.programmeRange.endTick/90000,rate:1})),
    automation:automation.map(key=>({property:'volume',time:Number(key.time),value:Number(key.value),easing:key.easing||'linear',curve:key.curve||null})),
    ducking:{enabled:false,strength:.4}};
}

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

export async function loadStudioVoiceBus({ input, context, apiBase, getToken, signal }) {
  const token = await getToken();
  if (!token) throw new Error('Sign in to prepare recorded speech.');
  let response, result;
  const waits = [250, 500, 1000, 1500, 2000];
  for (let attempt=0; attempt<=waits.length; attempt++) {
    response = await fetch(`${apiBase}/api/media/studio-assets/voice-bus-preview`, {
      method: 'POST', signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    result = await response.json();
    if (response.status !== 429 || result.code !== 'STUDIO_VOICE_PREVIEW_BUSY' || attempt === waits.length) break;
    // Rapid edits abort the preceding decode. Give its owned slot a bounded
    // release window, without retrying entitlement or rate-limit failures.
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort);
        reject(new DOMException('Speech preparation cancelled', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, waits[attempt]);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  if (!response.ok) throw new Error(result.message || 'Recorded-speech preview is unavailable.');
  if (result.version !== input.version || result.projectId !== input.projectId || result.sampleRate !== 48000 ||
      !/^[a-f0-9]{64}$/.test(result.runtimeHash || '') ||
      result.parametersHash !== await sha(new TextEncoder().encode(canonical(input))) ||
      !(Number.isSafeInteger(result.sampleCount) && result.sampleCount > 0 && result.sampleCount <= 90*48000) ||
      !Array.isArray(result.sourceGenerations) || result.sourceGenerations.length !== input.voices.length ||
      result.sourceGenerations.some(value => !/^[0-9]+$/.test(String(value))) ||
      typeof result.voiceBase64 !== 'string' || typeof result.duckBase64 !== 'string' ||
      result.voiceBase64.length > 24*1024*1024 || result.duckBase64.length > 24*1024*1024)
    throw new Error('Speech preview no longer matches this edit.');
  const voice = decode(result.voiceBase64), duck = decode(result.duckBase64);
  if (duck.byteLength !== result.sampleCount*4 || await sha(voice) !== result.voiceHash || await sha(duck) !== result.duckHash)
    throw new Error('Speech preview bytes failed verification.');
  const buffer = await context.decodeAudioData(voice.buffer);
  const gains = new Float32Array(duck.buffer);
  if (Math.abs(buffer.duration-result.sampleCount/48000) > 1/48000 || gains.some(v => !Number.isFinite(v) || v < 0 || v > 1.001))
    throw new Error('Incomplete recorded-speech preview.');
  const duckBuffer = context.createBuffer(1, gains.length, 48000);
  duckBuffer.getChannelData(0).set(gains);
  return { buffer, gains, duckBuffer, key: `${result.parametersHash}:${result.runtimeHash}`, sampleRate: 48000, receipt: {
    parametersHash: result.parametersHash, runtimeHash: result.runtimeHash, sourceGenerations: result.sourceGenerations,
    voiceHash: result.voiceHash, duckHash: result.duckHash, runtimeSeconds: result.runtimeSeconds,
  } };
}

export function scheduleStudioPreparedDuck(context, param, prepared, plan) {
  if (!param?.setValueAtTime || !prepared?.duckBuffer || !plan || plan.offset >= prepared.duckBuffer.duration) return null;
  // An a-rate AudioParam accepts an audio control signal. Buffer playback is
  // bounded and sample-exact; hundreds of thousands of automation events can
  // stall the main thread and delay ordinary source/cue startup.
  const source = context.createBufferSource();
  source.buffer = prepared.duckBuffer; source.studioControlOnly = true;
  source.connect(param);
  param.cancelScheduledValues(context.currentTime);
  param.setValueAtTime(0, context.currentTime);
  const rate=Number(context.sampleRate || prepared.sampleRate || 48000);
  source.start(Math.round(plan.when*rate)/rate, Math.round(plan.offset*rate)/rate);
  return source;
}
