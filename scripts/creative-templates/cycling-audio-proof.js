#!/usr/bin/env node
// Capture the actual native preview graph. No regenerated soundtrack, fixture
// audio, auth/project injection or render submission substitutes for playback.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { hash } = require('../../src/creativeTemplates/contract');
const { saveAuthenticatedState } = require('./studio-session');
const h = require('./studio-proof');
const q = require('../../test/e2e/playwright/studio-stability/run');
const folder = path.resolve(process.env.STUDIO_TEMPLATE_PROOF_DIR);
const privateState = process.env.STUDIO_QA_STORAGE_STATE || '/home/tibule12/.local/share/autopromote-qa/session/studio-cycling-source.private.json';
const projectName = process.env.STUDIO_QA_PROJECT_NAME || 'VELO — preview switching · 20261010';

async function waitForLiveProgrammeEnd(page) {
  await page.waitForFunction(() => window.__studioAudioTrimEnded() ||
    document.querySelector('[data-testid="hook-preview-frame"]')?.classList.contains('has-rendered-output'),
  undefined, { timeout: 60000 });
  assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')),
    'Completed-output recovery replaced Live Edit during actual audio capture');
}

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ storageState: privateState, viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => {
    const capture = new AudioContext({ sampleRate: 48000 });
    const connect = AudioNode.prototype.connect;
    const channels = capture.createChannelMerger(4);
    // ScriptProcessor callbacks lose PCM under main-thread contention. Capture
    // every audio quantum off that thread, without replacing the Studio graph.
    const module = URL.createObjectURL(new Blob([`class StudioPcmCapture extends AudioWorkletProcessor {
      constructor() { super(); this.samples = new Float32Array(4096); this.used = 0;
        this.port.onmessage = event => { if (event.data === 'flush') this.flushRequested = true; }; }
      flush() { if (!this.used) return;
        const packet = this.samples; this.port.postMessage({ samples: packet, count: this.used,
          firstFrame: this.firstFrame }, [packet.buffer]); this.samples = new Float32Array(4096); this.used = 0; }
      process(inputs) { const channels = inputs[0]; const size = channels[0]?.length || 128;
        if (!this.used) this.firstFrame = currentFrame;
        for (let i = 0; i < size; i++) for (let c = 0; c < 4; c++)
          this.samples[(this.used + i)*4 + c] = channels[c]?.[i] || 0;
        this.used += size; if (this.used === 1024) this.flush();
        if (this.flushRequested) { this.flush(); this.flushRequested = false; this.port.postMessage({ flushed: true }); }
        return true;
      }
    } registerProcessor('studio-pcm-capture', StudioPcmCapture);`], { type: 'text/javascript' }));
    let processor, flushComplete, firstRecordedFrame, lastRecordedFrame;
    const captureReady = capture.audioWorklet.addModule(module).then(() => {
      processor = new AudioWorkletNode(capture, 'studio-pcm-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 4, channelCountMode: 'explicit',
      });
      processor.port.onmessage = event => {
        if (event.data.flushed) { flushComplete?.(); return; }
        recordPacket(event.data);
      };
      connect.call(channels, processor);
      connect.call(processor, capture.destination); // silent output; originals remain unchanged
    });
    const taps = new WeakMap(), musicTaps = new WeakMap(), media = new WeakMap(), routedGain = new WeakMap();
    const destinationNodes = new Map(), cueGains = new Set(), nativeMusicPreparations = [], nativeMusicChunks = [], nativeMixChunks = [], nativeMusicClocks = [];
    let nativeMusicRecorder;
    const tapNativeOutput = node => {
      const recorder = nativeMusicRecorder;
      if (!recorder?.channels || node.context !== recorder.context || recorder.sources.has(node)) return;
      // The stereo destination upmixes a mono cue to both speakers. A channel
      // splitter uses discrete channels and would capture that cue on the left
      // only. Reproduce destination channel interpretation in this side tap.
      const stereoOutput = recorder.context.createGain();
      stereoOutput.channelCount = 2;
      stereoOutput.channelCountMode = 'explicit';
      stereoOutput.channelInterpretation = 'speakers';
      const split = recorder.context.createChannelSplitter(2);
      connect.call(node, stereoOutput);
      connect.call(stereoOutput, split);
      connect.call(split, recorder.channels, 0, 0);
      connect.call(split, recorder.channels, 1, 1);
      if (node === recorder.musicGain) {
        connect.call(split, recorder.channels, 0, 2);
        connect.call(split, recorder.channels, 1, 3);
      }
      recorder.sources.add(node);
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function(...args) {
      const result = decode.apply(this, args), context = this;
      result?.then(buffer => {
        if (buffer.duration <= 20 || nativeMusicRecorder) return;
        const gains = [...(destinationNodes.get(context) || [])]
          .filter(node => node instanceof GainNode && !cueGains.has(node));
        if (gains.length !== 1) throw new Error('Music capture requires one identified post-gain node');
        const recorder = { context, firstFrame: undefined, lastFrame: undefined,
          sources: new Set(), musicGain: gains[0] };
        nativeMusicRecorder = recorder;
        nativeMusicPreparations.push(context.audioWorklet.addModule(module).then(() => {
          recorder.node = new AudioWorkletNode(context, 'studio-pcm-capture', {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 4, channelCountMode: 'explicit',
          });
          recorder.channels = context.createChannelMerger(4);
          connect.call(recorder.channels, recorder.node);
          recorder.node.port.onmessage = event => {
            if (event.data.flushed) { recorder.flushed?.(); return; }
            const packet = event.data;
            if (recorder.firstFrame === undefined) return;
            const first = Math.max(0, recorder.firstFrame-packet.firstFrame);
            const end = Math.min(packet.count, (recorder.lastFrame ?? Infinity)-packet.firstFrame);
            if (end <= first) return;
            const samples = new Int16Array((end-first)*2);
            const mixSamples = new Int16Array((end-first)*2);
            for (let i=first; i<end; i++) for (let c=0; c<2; c++)
              {
                samples[(i-first)*2+c] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4+c+2]))*32767);
                mixSamples[(i-first)*2+c] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4+c]))*32767);
              }
            nativeMusicChunks.push(samples);
            nativeMixChunks.push(mixSamples);
            nativeMusicClocks.push({ firstAudioFrame: packet.firstFrame+first, sampleCount: end-first });
          };
          for (const node of destinationNodes.get(context) || []) tapNativeOutput(node);
          connect.call(recorder.node, context.destination); // silent output
        }));
      }, () => {});
      return result;
    };
    const musicGains = new Set(), activeCues = new Map(), cueLevels = [], nativeMeters = new Map(), chunks = [], starts = [], levels = [], musicStops = [];
    let recording = false, armed = false, requestedAt = 0, startedAt = 0, firstChunkAt = 0, trimEnd = null, mediaStartsSeen = 0;
    let activeMusicAnchor;
    const endObservers = [], chunkClocks = [], videoEvents = [], musicChunks = [], mediaSourceRoles = [], cutPauses = [];
    const connectStereoCapture = (source, firstChannel) => {
      const split = capture.createChannelSplitter(2);
      connect.call(source, split);
      connect.call(split, channels, 0, firstChannel);
      connect.call(split, channels, 1, firstChannel + 1);
    };
    const tapMusic = node => {
      if (musicTaps.has(node)) return;
      const destination = node.context.createMediaStreamDestination();
      connect.call(node, destination);
      const source = capture.createMediaStreamSource(destination.stream);
      connectStereoCapture(source, 2);
      musicTaps.set(node, { destination, source });
    };
    const clock = () => ({ wallMs: performance.now(),
      programmeTime: Number(document.querySelector('[aria-label="Edited output position"]')?.value || 0),
      nativeClipId: document.querySelector('.timeline-clip-thumb.active')?.dataset.testid?.replace('timeline-clip-', ''),
      sourceTime: document.querySelector('[data-testid="studio-after-video"]')?.currentTime,
      playbackRate: document.querySelector('[data-testid="studio-after-video"]')?.playbackRate,
      // Observe both clocks in the same callback. This diagnostic never moves
      // the decoder, changes a node or substitutes a soundtrack.
      musicContextTime: activeMusicAnchor?.source.context.currentTime ?? null,
      musicPosition: activeMusicAnchor ? activeMusicAnchor.offset +
        Math.max(0, activeMusicAnchor.source.context.currentTime - activeMusicAnchor.when) : null,
    });
    AudioNode.prototype.connect = function(target, ...args) {
      const result = connect.call(this, target, ...args);
      if (this instanceof AudioBufferSourceNode && target instanceof GainNode) {
        routedGain.set(this, target);
        if (this.buffer?.duration > 20) {
          // Capture the actual terminal music output, including a separate
          // ducking stage. A tap before it would measure different audio.
          const output = nativeMusicRecorder?.context === this.context ? nativeMusicRecorder.musicGain : target;
          musicGains.add(output); tapMusic(output);
        }
        else if (this.buffer) cueGains.add(target);
      }
      if (this.context !== capture && target === this.context.destination) {
        if (!destinationNodes.has(this.context)) destinationNodes.set(this.context, new Set());
        destinationNodes.get(this.context).add(this);
        tapNativeOutput(this);
        let tap = taps.get(this.context);
        if (!tap) {
          const destination = this.context.createMediaStreamDestination();
          const source = capture.createMediaStreamSource(destination.stream);
          connectStereoCapture(source, 0);
          tap = { destination, source };
          taps.set(this.context, tap);
        }
        const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
        connect.call(this, analyser); connect.call(analyser, tap.destination);
        nativeMeters.set(this, { analyser, samples: new Float32Array(256), peak: 0 });
      }
      return result;
    };
    const play = HTMLMediaElement.prototype.play;
    // Observe existing product routes so the recorder never tries to allocate
    // a second MediaElementSource for the new native voiceover bus.
    const createMediaSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function(element) {
      const source = createMediaSource.call(this, element);
      media.set(element, source);
      mediaSourceRoles.push({ role: element.dataset.testid || element.tagName, muted: element.muted });
      return source;
    };
    HTMLMediaElement.prototype.play = function(...args) {
      // Imported music/SFX normally use HTMLAudioElement. Route its unchanged
      // decoder/volume into Web Audio so the real signal can be captured. Video
      // remix keeps its own existing graph; its destination is tapped above.
      if (this.tagName === 'AUDIO' && !media.has(this)) {
        try {
          const source = capture.createMediaElementSource(this);
          connect.call(source, capture.destination);
          connectStereoCapture(source, 0);
          if (this.dataset.testid === 'background-sound-preview') connectStereoCapture(source, 2);
          media.set(this, source);
        } catch (error) { starts.push({ ...clock(), type: 'capture-error', message: error.message }); }
      }
      if (recording && this.tagName === 'AUDIO' && this.paused) starts.push({ ...clock(),
        type: 'media', identity: this.dataset.testid, offset: this.currentTime, volume: this.volume, muted: this.muted,
        preservesPitch: this.preservesPitch,
        stack: mediaStartsSeen++ < 3 ? new Error().stack : undefined });
      return play.apply(this, args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function(...args) {
      if (recording && this.buffer?.duration > 20 && musicStops.length < 100)
        musicStops.push({ ...clock(), stack: new Error().stack });
      if (activeMusicAnchor?.source === this) activeMusicAnchor = undefined;
      return stop.apply(this, args);
    };
    AudioBufferSourceNode.prototype.start = function(when, offset, ...args) {
      if (this.studioControlOnly) return start.call(this, when, offset, ...args);
      if (this.buffer?.duration > 20) activeMusicAnchor = { source: this,
        when: Number(when || this.context.currentTime), offset: Number(offset || 0) };
      if (recording || armed) starts.push({ ...clock(), type: 'buffer', duration: this.buffer?.duration,
        voiceoverId: this.studioVoiceoverId || null,
        offset: offset || 0, scheduledDelay: Number(when || 0) - this.context.currentTime,
        scheduledContextTime: Number.isFinite(when) ? when : this.context.currentTime,
        contextTime: this.context.currentTime, playbackRate: this.playbackRate.value,
        gain: routedGain.get(this)?.gain.value });
      if (this.buffer?.duration <= 20 && routedGain.has(this)) {
        activeCues.set(this, routedGain.get(this));
        this.addEventListener('ended', () => activeCues.delete(this), { once: true });
      }
      return start.call(this, when, offset, ...args);
    };
    const recordPacket = packet => {
      if (!startedAt || firstRecordedFrame === undefined) return;
      const first = Math.max(0, firstRecordedFrame - packet.firstFrame);
      const end = Math.min(packet.count, (lastRecordedFrame ?? Infinity) - packet.firstFrame);
      if (end <= first) return;
      for (const meter of nativeMeters.values()) {
        meter.analyser.getFloatTimeDomainData(meter.samples);
        meter.peak = Math.max(meter.peak, ...meter.samples.map(Math.abs));
      }
      if (!firstChunkAt) firstChunkAt = performance.now();
      const observation = clock();
      // Keep independent sample/context/wall clocks. Concatenated PCM alone
      // cannot distinguish a stalled decoder from missing recorder callbacks.
      chunkClocks.push({ ...observation, sampleOffset: chunks.reduce((n, chunk) => n + chunk.length / 2, 0),
        sampleCount: end - first, firstAudioFrame: packet.firstFrame + first,
        playbackTime: (packet.firstFrame + first) / capture.sampleRate,
        captureContextTime: capture.currentTime });
      if (observation.programmeTime >= 13.45 && observation.programmeTime <= 14.55) {
        cueLevels.push({ ...observation, cues: [...activeCues].map(([source, gain]) => ({
          duration: source.buffer.duration, gain: gain.gain.value, contextTime: source.context.currentTime,
        })) });
      }
      if (observation.wallMs - startedAt < 700 || observation.programmeTime > 19 ||
          (document.querySelector('audio[data-testid^="voiceover-audio-"]') &&
            (!levels.length || observation.wallMs - levels.at(-1).wallMs >= 100))) {
        levels.push({ ...observation, audio: Array.from(document.querySelectorAll('audio')).filter(a => !a.paused)
          .map(a => ({ identity:a.dataset.testid, duration:a.duration, time:a.currentTime, volume:a.volume, muted:a.muted })),
          voices: [...document.querySelectorAll('audio[data-testid^="voiceover-audio-"]')].map(audio => ({
            id: audio.dataset.testid, sourceTime: audio.currentTime, playbackRate: audio.playbackRate,
            paused: audio.paused, seeking: audio.seeking, readyState: audio.readyState,
            preservesPitch: audio.preservesPitch, muted: audio.muted,
          })),
          decodedMusic: [...musicGains].map(gain => ({ gain: gain.gain.value, contextTime: gain.context.currentTime })) });
      }
      const samples = new Int16Array((end - first) * 2);
      for (let i = first; i < end; i++) {
        samples[(i-first)*2] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4])) * 32767);
        samples[(i-first)*2+1] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4+1])) * 32767);
      }
      chunks.push(samples);
      const musicSamples = new Int16Array((end - first) * 2);
      for (let i = first; i < end; i++) {
        musicSamples[(i-first)*2] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4+2])) * 32767);
        musicSamples[(i-first)*2+1] = Math.round(Math.max(-1, Math.min(1, packet.samples[i*4+3])) * 32767);
      }
      musicChunks.push(musicSamples);
    };
    window.__startStudioAudioCapture = async ({ lastClipId, lastSourceEnd }) => {
      await captureReady; await Promise.all(nativeMusicPreparations); await capture.resume(); chunks.length = 0; musicChunks.length = 0; nativeMusicChunks.length = 0; nativeMixChunks.length = 0; nativeMusicClocks.length = 0; starts.length = 0; levels.length = 0; cueLevels.length = 0; chunkClocks.length = 0; videoEvents.length = 0; musicStops.length = 0; cutPauses.length = 0; firstChunkAt = 0;
      if (nativeMusicRecorder) {
        nativeMusicRecorder.firstFrame = undefined;
        nativeMusicRecorder.lastFrame = undefined;
      }
      firstRecordedFrame = undefined; lastRecordedFrame = undefined;
      requestedAt = performance.now(); startedAt = 0; recording = false; armed = true; trimEnd = null;
      const finalDecoders = new WeakSet();
      const check = (video, boundaryObservation = 'native-event-or-frame') => {
        if (video.dataset.testid === 'studio-after-video' &&
            document.querySelector('.timeline-clip-thumb.active')?.dataset.testid === `timeline-clip-${lastClipId}`) {
          finalDecoders.add(video);
        }
        // Promotion can change the active role before the old decoder's pause
        // event. Its observed final-trim identity remains valid for that event.
        if (!recording || !finalDecoders.has(video) || video.currentTime < lastSourceEnd - .00002) return;
        trimEnd = { ...clock(), observedFinalClipId: lastClipId,
          finalDecoderSourceTime: video.currentTime, boundaryObservation };
        lastRecordedFrame = Math.round(capture.currentTime * capture.sampleRate); recording = false; armed = false;
        if (nativeMusicRecorder) nativeMusicRecorder.lastFrame = Math.round(nativeMusicRecorder.context.currentTime * nativeMusicRecorder.context.sampleRate);
      };
      for (const video of document.querySelectorAll('[data-testid="studio-after-video"], [data-testid="studio-next-video"], [data-testid="studio-later-video"]')) {
        // The final and first occurrences can reuse the same native decoder.
        // Read its real end clock before the existing controller replaces the
        // source or seeks to the loop start; otherwise later queued events see
        // the new source. Delegate every operation without changing its value.
        const ownTime = Object.getOwnPropertyDescriptor(video, 'currentTime');
        const nativeTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        Object.defineProperty(video, 'currentTime', { configurable: true,
          get() { return nativeTime.get.call(this); },
          set(value) { check(this, 'before-native-seek'); nativeTime.set.call(this, value); },
        });
        const ownAttribute = Object.getOwnPropertyDescriptor(video, 'setAttribute');
        const nativeAttribute = video.setAttribute;
        video.setAttribute = function(name, ...args) {
          if (String(name).toLowerCase() === 'src') check(this, 'before-native-source-change');
          return nativeAttribute.call(this, name, ...args);
        };
        const ownPause = Object.getOwnPropertyDescriptor(video, 'pause');
        const nativePause = video.pause;
        video.pause = function(...args) {
          if (recording && !this.paused && this.dataset.testid === 'studio-after-video')
            cutPauses.push({ ...clock(), sourceEndTime: this.currentTime });
          return nativePause.apply(this, args);
        };
        endObservers.push(() => {
          if (ownTime) Object.defineProperty(video, 'currentTime', ownTime); else delete video.currentTime;
          if (ownAttribute) Object.defineProperty(video, 'setAttribute', ownAttribute); else delete video.setAttribute;
          if (ownPause) Object.defineProperty(video, 'pause', ownPause); else delete video.pause;
        });
        for (const type of ['playing', 'waiting', 'stalled', 'pause', 'seeking', 'seeked', 'error']) {
          const listener = () => { if (recording || armed) videoEvents.push({ ...clock(), type,
            role: video.dataset.testid, eventSourceTime: video.currentTime, paused: video.paused,
            seeking: video.seeking, readyState: video.readyState, networkState: video.networkState,
            buffered: Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]) }); };
          video.addEventListener(type, listener);
          endObservers.push(() => video.removeEventListener(type, listener));
        }
        let frame;
        const tick = () => { check(video); if (recording || armed) frame = video.requestVideoFrameCallback(tick); };
        frame = video.requestVideoFrameCallback(tick);
        const begin = () => {
          if (armed && !recording && video.dataset.testid === 'studio-after-video') {
            startedAt = performance.now(); firstRecordedFrame = Math.round(capture.currentTime * capture.sampleRate); recording = true;
            if (nativeMusicRecorder) nativeMusicRecorder.firstFrame = Math.round(nativeMusicRecorder.context.currentTime * nativeMusicRecorder.context.sampleRate);
          }
        };
        video.addEventListener('play', begin);
        const observe = () => check(video);
        for (const event of ['timeupdate','ended','pause']) video.addEventListener(event, observe);
        endObservers.push(() => { video.cancelVideoFrameCallback(frame);
          video.removeEventListener('play', begin);
          for (const event of ['timeupdate','ended','pause']) video.removeEventListener(event, observe); });
      }
    };
    window.__studioAudioTrimEnded = () => Boolean(trimEnd);
    window.__stopStudioAudioCapture = async (includePcm = true) => {
      recording = false; armed = false;
      lastRecordedFrame ??= Math.round(capture.currentTime * capture.sampleRate);
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('AudioWorklet flush timed out')), 5000);
        flushComplete = () => { clearTimeout(deadline); resolve(); };
        processor.port.postMessage('flush');
      });
      if (nativeMusicRecorder?.node) {
        nativeMusicRecorder.lastFrame ??= Math.round(nativeMusicRecorder.context.currentTime * nativeMusicRecorder.context.sampleRate);
        await new Promise((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error('Native music worklet flush timed out')), 5000);
          nativeMusicRecorder.flushed = () => { clearTimeout(deadline); resolve(); };
          nativeMusicRecorder.node.port.postMessage('flush');
        });
      }
      endObservers.splice(0).forEach(stop => stop());
      const encode = values => {
        const bytes = new Uint8Array(values.reduce((n, c) => n + c.byteLength, 0));
        let at = 0;
        for (const chunk of values) { bytes.set(new Uint8Array(chunk.buffer), at); at += chunk.byteLength; }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      };
      return { sampleRate: capture.sampleRate, channels: 2,
        ...(includePcm ? { pcmBase64: encode(chunks), musicPcmBase64: encode(musicChunks),
          nativeMusicPcmBase64: encode(nativeMusicChunks), nativeMixPcmBase64: encode(nativeMixChunks) } : {}),
        nativeMusicCapture: nativeMusicRecorder ? { sampleRate: nativeMusicRecorder.context.sampleRate,
          firstFrame: nativeMusicRecorder.firstFrame, lastFrame: nativeMusicRecorder.lastFrame, chunks: nativeMusicClocks,
          scope: 'Actual post-gain music and all programme nodes connected to that same context destination, captured together on its audio thread; no MediaStream bridge. Other-context/HTML routes remain represented only in the full bridge mix.' } : null,
        captureImplementation: 'AudioWorklet', firstRecordedFrame, lastRecordedFrame,
        requestedAt, startedAt, firstChunkAt, stoppedAt: performance.now(), trimEnd, starts, levels, cueLevels, musicStops, cutPauses, chunkClocks, videoEvents,
        mediaSourceRoles,
        nativeMeterPeaks: [...nativeMeters].map(([node, meter]) => ({ peak: meter.peak,
          music: musicGains.has(node), contextState: node.context.state })) };
    };
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  let submissions = 0;
  const voiceBusPreviews = [];
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/api/media/studio-assets/voice-bus-preview') return;
    try {
      const result = await response.json();
      voiceBusPreviews.push({ status: response.status(), projectId: result.projectId,
        parametersHash: result.parametersHash, voiceHash: result.voiceHash, duckHash: result.duckHash,
        runtimeHash: result.runtimeHash,
        sourceGenerations: result.sourceGenerations, sampleRate: result.sampleRate,
        sampleCount: result.sampleCount, runtimeSeconds: result.runtimeSeconds, device: result.device, code: result.code });
    } catch (_) {}
  });
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/media/process') submissions++; });
  try {
    await page.goto('http://localhost:5000/?studioTemplateSession=cycling-audio');
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: projectName, exact: true }).click();
    await h.rail(page);
    if (process.env.STUDIO_QA_LIVE_EDIT === '1') {
      await q.tool(page, 'Export');
      const live = page.getByRole('button', { name: 'Show Live Edit', exact: true });
      // Opening a saved project resolves its receipt asynchronously. A
      // one-shot visibility check could skip the requested control entirely.
      await live.waitFor({ state: 'visible', timeout: 90000 });
      await live.click();
      await page.getByRole('button', { name: 'Show Finished Video', exact: true }).waitFor();
    }
    await page.getByRole('button', { name: 'After', exact: true }).click();
    assert(!await page.evaluate(() => !!window.__E2E_BYPASS));
    assert(!await page.getByTestId('hook-preview-frame').evaluate(e => e.classList.contains('has-rendered-output')));
    const before = await h.save(page, 'audio-before');
    const resize = page.getByRole('separator', { name: 'Resize timeline' });
    await resize.focus();
    for (let i=0; i<17; i++) await resize.press('ArrowUp');
    await page.getByTestId('studio-pro-timeline').getByRole('button', { name: 'Fit entire timeline', exact: true }).click();
    const timelineVisibility = await page.getByTestId('studio-pro-timeline').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('[data-testid^="pro-track-row-"]')].map(row => {
        const box = row.getBoundingClientRect();
        return { track: row.dataset.testid.replace('pro-track-row-', ''),
          fullyVisible: box.top >= bounds.top && box.bottom <= bounds.bottom,
          top: box.top-bounds.top, bottom: box.bottom-bounds.top, timelineHeight: bounds.height };
      });
    });
    assert(timelineVisibility.length && timelineVisibility.every(row => row.fullyVisible), 'A populated timeline lane is cropped');
    fs.writeFileSync(path.join(folder, 'timeline-visibility.json'), JSON.stringify(timelineVisibility, null, 2));
    const pause = page.getByRole('button', { name: 'Pause comparison', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.getByLabel('Edited output position', { exact: true }).evaluate(el => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      return v && !v.seeking && v.readyState >= 3;
    });
    const unmute = page.getByRole('button', { name: 'Unmute preview audio', exact: true });
    if (await unmute.isVisible()) await unmute.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="Play comparison"]');
      return button && !button.disabled;
    });
    const lastClip = before.snapshot.timeline.at(-1);
    let warmPlayback;
    if (process.env.STUDIO_QA_AUDIO_WARM_PLAY === '1') {
      // A separately labelled real replay isolates source-loading stalls from
      // clock drift. Do not replace media, readiness or the normal controls.
      await page.evaluate(last => window.__startStudioAudioCapture(last), {
        lastClipId: lastClip.id, lastSourceEnd: lastClip.endRequest,
      });
      await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
      await waitForLiveProgrammeEnd(page);
      const warm = await page.evaluate(() => window.__stopStudioAudioCapture());
      warmPlayback = { requested: true, starts: warm.starts, videoEvents: warm.videoEvents,
        firstRecordedFrame: warm.firstRecordedFrame, lastRecordedFrame: warm.lastRecordedFrame,
        sampleRate: warm.sampleRate, duration: (warm.lastRecordedFrame-warm.firstRecordedFrame)/warm.sampleRate,
        scope: 'Unretained warmup PCM from actual complete native playback; subsequent measured run is a replay, not cold loading qualification.' };
      if (await pause.isVisible()) await pause.click();
      await page.getByLabel('Edited output position', { exact: true }).evaluate(el => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        return v && !v.seeking && v.readyState >= 3;
      });
    }
    await page.evaluate(last => window.__startStudioAudioCapture(last), {
      lastClipId: lastClip.id, lastSourceEnd: lastClip.endRequest,
    });
    console.log('Capturing the real native Studio music/SFX mix.');
    await page.getByRole('button', { name: 'Play comparison', exact: true }).click();
    if (process.env.STUDIO_QA_AUDIO_TRACE === '1') await page.waitForTimeout(5000);
    else await waitForLiveProgrammeEnd(page);
    const result = await page.evaluate(() => window.__stopStudioAudioCapture());
    if (await pause.isVisible()) await pause.click();
    await page.screenshot({ path: path.join(folder, 'studio-live-mix.png') });
    await page.getByTestId('studio-pro-timeline').screenshot({ path: path.join(folder, 'timeline.png') });
    const pcm = Buffer.from(result.pcmBase64, 'base64'); delete result.pcmBase64;
    const musicPcm = Buffer.from(result.musicPcmBase64, 'base64'); delete result.musicPcmBase64;
    const nativeMusicPcm = Buffer.from(result.nativeMusicPcmBase64, 'base64'); delete result.nativeMusicPcmBase64;
    const nativeMixPcm = Buffer.from(result.nativeMixPcmBase64, 'base64'); delete result.nativeMixPcmBase64;
    assert.equal(musicPcm.length, pcm.length);
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 4, 28);
    header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(folder, 'native-preview-mix.wav'), Buffer.concat([header, pcm]));
    fs.writeFileSync(path.join(folder, 'native-preview-music.wav'), Buffer.concat([header, musicPcm]));
    if (nativeMusicPcm.length) {
      assert.equal(result.nativeMusicCapture.sampleRate, result.sampleRate);
      const musicHeader = Buffer.from(header);
      musicHeader.writeUInt32LE(36+nativeMusicPcm.length, 4); musicHeader.writeUInt32LE(nativeMusicPcm.length, 40);
      fs.writeFileSync(path.join(folder, 'native-context-music.wav'), Buffer.concat([musicHeader, nativeMusicPcm]));
      assert.equal(nativeMixPcm.length, nativeMusicPcm.length);
      fs.writeFileSync(path.join(folder, 'native-context-mix.wav'), Buffer.concat([musicHeader, nativeMixPcm]));
    }
    const after = await h.save(page, 'audio-after');
    assert.equal(hash(before.snapshot.studioDocument), hash(after.snapshot.studioDocument));
    assert.equal(submissions, 0);
    fs.writeFileSync(path.join(folder, 'native-preview-mix.json'), JSON.stringify({
      at: new Date().toISOString(), projectId: after.id, canonicalHash: hash(after.snapshot.studioDocument),
      duration: pcm.length / (result.sampleRate * 4), ...result, noMocks: true, preFinal: true,
      configuredMusicVolume: before.snapshot.musicTrack?.volume,
      newRenderJobs: submissions, newGpuJobs: 0, humanListening: false,
      diagnosticOnly: process.env.STUDIO_QA_AUDIO_TRACE === '1',
      warmPlayback,
      voiceBusPreviews,
      scope: 'Actual live browser mix; post-gain Web Audio taps plus unchanged HTMLAudioElement decoder/volume routed through the capture context. Capture adds a MediaStream bridge; timing and levels need comparison, not inferred approval.',
      musicCaptureScope: 'Independent actual post-gain music tap captured on the same callbacks/sample clock as the whole mix. No SFX are routed to this bus; the known 97.8s song is the only long decoded buffer in this project. Not a regenerated soundtrack.',
    }, null, 2));
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), privateState);
    console.log(`Actual live preview mix saved: ${(pcm.length / (result.sampleRate * 4)).toFixed(3)} seconds.`);
  } catch (error) {
    // Retain the actual native clocks on a failed run. A timeout screenshot
    // alone cannot distinguish a stopped decoder from a slow loading source.
    const failure = await page.evaluate(async () => ({
      capture: await window.__stopStudioAudioCapture?.(false),
      media: Array.from(document.querySelectorAll('video[data-testid]')).map(video => ({
        role: video.dataset.testid, currentTime: video.currentTime, duration: video.duration,
        paused: video.paused, seeking: video.seeking, readyState: video.readyState,
        networkState: video.networkState, playbackRate: video.playbackRate,
        error: video.error && { code: video.error.code, message: video.error.message },
        buffered: Array.from({ length: video.buffered.length }, (_, i) =>
          [video.buffered.start(i), video.buffered.end(i)]),
      })),
    })).catch(captureError => ({ captureFailure: captureError.message }));
    fs.writeFileSync(path.join(folder, 'audio-failure-observations.json'), JSON.stringify({
      at: new Date().toISOString(), error: error.message, ...failure,
      qualification: 'FAILED_PARTIAL_CAPTURE',
    }, null, 2)+'\n');
    await page.screenshot({ path: path.join(folder, 'audio-failure.png') }).catch(() => {});
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), privateState);
    throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
