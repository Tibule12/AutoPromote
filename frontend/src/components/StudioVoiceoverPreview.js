import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SafeAudio } from "./SafeMedia";
import { voiceoverDuration, voiceoverGain, voiceoverPcmEligible, voiceoverPcmKey,
  createVoiceoverPcmBuffer } from "./studioVoiceover";
import { interpolateAutomationValue } from "./studioAutomation";
import { watchStudioAudioClock } from "./studioSourcePreview";
import { studioCueStartPlan, advanceStudioCueStartPlan, scheduleStudioCueGain } from "./studioCueGain";
import { studioVoiceBusRequest } from './studioPreparedVoiceBus';

// Kept outside the inspector: changing tools must never unmount an audible take.
export default forwardRef(function StudioVoiceoverPreview({ takes, videoRef, getTimelineTime, activeClip,
  muted, volume, automationKeyframes = [], renderedOutputUrl, onError, onAnalyser, getAudioContext,
  projectId, outputTimeMap, loadPreparedBus, getOutputPlan, onPreparedDucking, onPreparation, preparedDucking }, ref) {
  const elements = useRef(new Map());
  const latest = useRef();
  const bus = useRef(null);
  const routes = useRef(new WeakMap());
  const buffers = useRef(new Map()), playing = useRef(new Map()), pinned = useRef(new Map());
  const syncLatest = useRef(null);
  const preparedInput = loadPreparedBus && studioVoiceBusRequest({ projectId, takes, outputTimeMap,
    automation: automationKeyframes, ducking: preparedDucking });
  const requestKey = preparedInput ? JSON.stringify(preparedInput) : '';
  const [prepared, setPrepared] = useState(null);
  const pending = useRef(null), preparedPlaying = useRef(null), preparedSync = useRef(null);
  const currentRequest = useRef(requestKey); currentRequest.current = requestKey;
  latest.current = { getTimelineTime, onError, onAnalyser, getAudioContext, loadPreparedBus, getOutputPlan, onPreparedDucking, onPreparation };
  const stopPrepared = () => {
    const current = preparedPlaying.current;
    if (!current) return;
    preparedPlaying.current = null;
    try { current.source.stop(); } catch (_) { /* Already stopped. */ }
    current.source.disconnect(); current.gain.disconnect();
  };
  useImperativeHandle(ref, () => ({ prepare: () => pending.current,
    sync: () => preparedSync.current?.() }), []);
  const ensureBus = () => {
    if (bus.current) return bus.current;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const shared = latest.current.getAudioContext?.();
    const context = shared || new AudioContextCtor({ sampleRate: 48000 });
    const analyser = context.createAnalyser(); analyser.fftSize = 256;
    analyser.connect(context.destination); bus.current = { context, analyser, ownsContext: !shared };
    latest.current.onAnalyser?.(analyser);
    return bus.current;
  };
  const stopPcm = id => {
    const current = playing.current.get(id);
    if (!current) return;
    playing.current.delete(id);
    try { current.source.stop(); } catch (_) { /* Already ended. */ }
    current.source.disconnect(); current.gain.disconnect();
  };
  const route = audio => {
    if (routes.current.has(audio)) return routes.current.get(audio);
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      ensureBus();
      const { context, analyser } = bus.current;
      const source = context.createMediaElementSource(audio), gain = context.createGain();
      source.connect(gain); gain.connect(analyser);
      const value = { source, gain }; routes.current.set(audio, value); return value;
    } catch (_) { return null; }
  };
  useEffect(() => () => {
    stopPrepared();
    [...playing.current.keys()].forEach(stopPcm);
    elements.current.forEach(audio => audio.pause());
    latest.current.onAnalyser?.(null);
    bus.current?.analyser.disconnect();
    if (bus.current?.ownsContext) bus.current.context.close()?.catch(() => {});
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    stopPrepared(); setPrepared(null); latest.current.onPreparedDucking?.(null);
    if (!requestKey) { pending.current = null; return undefined; }
    latest.current.onPreparation?.('loading');
    const input = JSON.parse(requestKey);
    pending.current = latest.current.loadPreparedBus(input, ensureBus().context, controller.signal).then(value => {
      if (controller.signal.aborted || currentRequest.current !== requestKey) return;
      const bound = { ...value, requestKey };
      setPrepared(bound); latest.current.onPreparedDucking?.(input.ducking.enabled ? bound : null);
      latest.current.onPreparation?.('ready');
    });
    // Keep a failed request rejectable by Play, without an unhandled rejection.
    pending.current.catch(error => { if (!controller.signal.aborted) {
      latest.current.onPreparation?.('unavailable');
      latest.current.onError?.(`Recorded-speech preview unavailable: ${error.message}`);
    } });
    return () => { controller.abort(); stopPrepared(); latest.current.onPreparedDucking?.(null); };
  }, [requestKey]);
  useEffect(() => {
    const video = videoRef.current;
    if (!requestKey || !video || renderedOutputUrl || !prepared || prepared.requestKey !== requestKey) {
      stopPrepared(); return undefined;
    }
    let buffering = video.readyState < 3;
    const sync = () => {
      if (video !== videoRef.current) return;
      if (buffering || video.paused || video.seeking || video.readyState < 2) { stopPrepared(); return; }
      const context = ensureBus().context;
      const plan = latest.current.getOutputPlan?.(context, latest.current.getTimelineTime(video.currentTime || 0));
      if (!plan || plan.offset >= prepared.buffer.duration) return;
      let current = preparedPlaying.current;
      if (current && (current.key !== prepared.key ||
          Math.abs(current.offset+Math.max(0, plan.when-current.when)-plan.offset) > .08)) {
        stopPrepared(); current = null;
      }
      if (!current) {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = prepared.buffer; source.studioVoiceoverId = 'prepared-voice-bus';
        source.connect(gain); gain.connect(bus.current.analyser);
        current = { source, gain, key: prepared.key, when: plan.when, offset: plan.offset };
        preparedPlaying.current = current;
        source.start(plan.when, plan.offset);
        context.resume()?.catch(() => {});
      }
      current.gain.gain.value = muted ? 0 : voiceoverGain(volume);
    };
    const waiting = () => { buffering = true; stopPrepared(); };
    const ready = () => { buffering = false; sync(); };
    video.addEventListener('waiting', waiting); video.addEventListener('playing', ready); video.addEventListener('canplay', ready);
    const events = ['play', 'pause', 'seeking', 'seeked', 'timeupdate', 'studio-audio-clock-resync'];
    events.forEach(event => video.addEventListener(event, sync));
    const stopClock = watchStudioAudioClock(video, sync);
    preparedSync.current = sync; sync();
    return () => { stopClock(); events.forEach(event => video.removeEventListener(event, sync));
      video.removeEventListener('waiting', waiting); video.removeEventListener('playing', ready); video.removeEventListener('canplay', ready);
      preparedSync.current = null;
      if (!videoRef.current || videoRef.current.paused || videoRef.current.seeking) stopPrepared(); };
  }, [prepared, requestKey, activeClip, muted, volume, renderedOutputUrl]);
  useEffect(() => {
    const abort = new AbortController();
    if (requestKey) return undefined;
    const candidates = takes.filter(take => take.url && voiceoverPcmEligible(take, outputTimeMap));
    const keys = new Set(candidates.map(take => voiceoverPcmKey(projectId, take)));
    for (const key of buffers.current.keys()) if (!keys.has(key)) buffers.current.delete(key);
    for (const [id, current] of playing.current) if (!keys.has(current.key)) {
      stopPcm(id); pinned.current.delete(id);
    }
    for (const take of candidates) {
      const key = voiceoverPcmKey(projectId, take);
      if (buffers.current.has(key)) continue;
      void (async () => {
        const context = ensureBus()?.context;
        if (!context?.decodeAudioData) return;
        const response = await fetch(take.url, { signal: abort.signal });
        if (!response.ok || Number(response.headers?.get('content-length') || 0) > 8 * 1024 * 1024) return;
        const bytes = await response.arrayBuffer();
        if (abort.signal.aborted || bytes.byteLength > 8 * 1024 * 1024) return;
        const decoded = await context.decodeAudioData(bytes);
        if (abort.signal.aborted) return;
        const buffer = createVoiceoverPcmBuffer(context, decoded, take);
        if (!buffer || [...buffers.current.values()].reduce((n, b) => n + b.length * 4, 0) + buffer.length * 4 > 32 * 1024 * 1024) return;
        buffers.current.set(key, buffer);
        syncLatest.current?.();
      })().catch(() => { /* Retain the native pitch-preserving route. */ });
    }
    return () => abort.abort();
  }, [takes, projectId, outputTimeMap, requestKey]);
  useEffect(() => {
    const video = videoRef.current;
    const pause = () => {
      elements.current.forEach(audio => audio.pause());
      [...playing.current.keys()].forEach(stopPcm); pinned.current.clear();
    };
    if (!video || renderedOutputUrl) { pause(); return undefined; }
    const sync = () => {
      // A prepared cut can promote its decoder before the old pause/frame
      // callback arrives. Only the active picture may seek or stop speech.
      if (video !== videoRef.current) return;
      if (requestKey) { elements.current.forEach(audio => audio.pause());
        [...playing.current.keys()].forEach(stopPcm); return; }
      const time = latest.current.getTimelineTime(video.currentTime || 0);
      takes.forEach(take => {
        const audio = elements.current.get(take.id);
        if (!audio) return;
        const elapsed = time - Number(take.startTime || 0);
        const duration = voiceoverDuration(take);
        const key = voiceoverPcmKey(projectId, take);
        const buffer = voiceoverPcmEligible(take, outputTimeMap) && buffers.current.get(key);
        const pcmPlan = buffer && studioCueStartPlan({ contextTime: bus.current.context.currentTime,
          programmeTime: time, cueStart: Number(take.startTime || 0), duration, outputTimeMap });
        if (video.paused || video.seeking || video.readyState < 2 || take.enabled === false ||
            (elapsed < 0 && !pcmPlan) || elapsed >= duration) {
          audio.pause(); stopPcm(take.id); pinned.current.delete(take.id); return;
        }
        if (pinned.current.get(take.id)?.key !== key ||
            (pinned.current.get(take.id)?.mode === 'pcm' && !buffer)) {
          stopPcm(take.id); pinned.current.delete(take.id);
        }
        if (!pinned.current.has(take.id)) pinned.current.set(take.id, { mode: buffer ? 'pcm' : 'native', key });
        if (pinned.current.get(take.id).mode === 'pcm' && buffer) {
          audio.pause();
          const { context, analyser } = bus.current;
          let current = playing.current.get(take.id);
          if (current && (current.key !== key || current.startTime !== Number(take.startTime || 0))) {
            stopPcm(take.id); current = null;
          }
          const baseGain = muted ? 0 : voiceoverGain(volume) * voiceoverGain(take.volume);
          const envelope = JSON.stringify([baseGain, automationKeyframes]);
          if (!current) {
            let plan = advanceStudioCueStartPlan(pcmPlan, context.currentTime, outputTimeMap, duration);
            if (!plan) return;
            const source = context.createBufferSource(), gain = context.createGain();
            source.buffer = buffer; source.studioVoiceoverId = take.id;
            source.connect(gain); gain.connect(analyser);
            gain.gain.setValueAtTime(baseGain, context.currentTime);
            plan = advanceStudioCueStartPlan(plan, context.currentTime, outputTimeMap, duration);
            if (!plan) { source.disconnect(); gain.disconnect(); return; }
            current = { source, gain, key, startTime: Number(take.startTime || 0),
              envelope: null, when: plan.when, programmeStart: plan.programmeStart };
            playing.current.set(take.id, current);
            source.start(plan.when, plan.offset, Math.max(.001, duration - plan.offset));
            context.resume()?.catch(() => {});
          }
          if (current.envelope !== envelope) {
            const scheduled = scheduleStudioCueGain({ param: current.gain.gain,
              contextTime: Math.max(context.currentTime, current.when),
              programmeStart: Math.max(time, current.programmeStart),
              programmeEnd: Number(take.startTime || 0) + duration,
              outputTimeMap, keyframes: automationKeyframes, baseGain });
            if (!scheduled) current.gain.gain.setValueAtTime(baseGain, context.currentTime);
            current.envelope = envelope;
          }
          return;
        }
        const fade = Math.max(0, Math.min(1,
          take.fadeIn > 0 ? elapsed / take.fadeIn : 1,
          take.fadeOut > 0 ? (duration - elapsed) / take.fadeOut : 1));
        audio.muted = muted;
        const automation = interpolateAutomationValue({ keyframes: automationKeyframes,
          property: "volume", time, fallback: 100 }) / 100;
        const outputGain = voiceoverGain(volume) * voiceoverGain(take.volume) * fade * Math.max(0, Math.min(2, automation));
        const graph = route(audio);
        if (graph) {
          audio.volume = 1;
          graph.gain.gain.setValueAtTime(outputGain, bus.current.context.currentTime);
          bus.current.context.resume()?.catch(() => {});
        } else audio.volume = Math.max(0, Math.min(1, outputGain));
        audio.playbackRate = video.playbackRate || 1;
        audio.preservesPitch = true;
        const target = Number(take.trimStart || 0) + elapsed;
        if (Math.abs(audio.currentTime - target) > (audio.paused ? .001 : .15)) {
          try { audio.currentTime = target; } catch (_) { /* Retry on metadata. */ }
        }
        if (audio.paused && audio.readyState >= 3 && !audio.seeking) audio.play()?.catch(error => {
          if (error.name !== "AbortError") latest.current.onError?.(`Voice-over playback failed: ${error.message}`);
        });
      });
    };
    const events = ["play", "pause", "ended", "waiting", "playing", "timeupdate", "seeking", "seeked", "ratechange", "loadedmetadata"];
    events.forEach(event => video.addEventListener(event, sync));
    const readyEvents = ["loadedmetadata", "loadeddata", "canplay", "seeked"];
    elements.current.forEach(audio => readyEvents.forEach(event => audio.addEventListener(event, sync)));
    const stopFrameClock = watchStudioAudioClock(video, sync);
    syncLatest.current = sync; sync();
    const mounted = [...elements.current.values()];
    return () => {
      stopFrameClock();
      events.forEach(event => video.removeEventListener(event, sync));
      mounted.forEach(audio => {
        readyEvents.forEach(event => audio.removeEventListener(event, sync));
        const current = videoRef.current;
        if (!current || current.paused || current.seeking || ![...elements.current.values()].includes(audio)) audio.pause();
      });
      if (!videoRef.current || videoRef.current.paused || videoRef.current.seeking) pause();
      syncLatest.current = null;
    };
  }, [takes, videoRef, activeClip, muted, volume, automationKeyframes, renderedOutputUrl, projectId, outputTimeMap, requestKey]);
  return takes.filter(take => take.url).map(take => <SafeAudio key={take.id}
    ref={element => element ? elements.current.set(take.id, element) : elements.current.delete(take.id)}
    data-testid={`voiceover-audio-${take.id}`} src={take.url} preload="auto" hidden
    onError={() => latest.current.onError?.(`Reconnect the recording “${take.name}”; its audio could not be loaded.`)} />);
});
