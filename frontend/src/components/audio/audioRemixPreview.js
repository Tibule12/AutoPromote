import { normalizeAudioRemix } from "./audioRemixModel";

const graphs = new WeakMap();
const pitchModules = new WeakMap();

async function setLivePitch(graph, semitones, request) {
  if (!graph.pitch && Math.abs(semitones) < .001) return true;
  try {
    if (!graph.pitch) {
      if (!graph.context.audioWorklet || !window.AudioWorkletNode) return false;
      let module = pitchModules.get(graph.context);
      if (!module) {
        // Compile on the browser's background compiler before creating an
        // audio-thread instance. No synchronous compilation during playback.
        module = Promise.all([
          graph.context.audioWorklet.addModule(`${process.env.PUBLIC_URL || ""}/studio-audio-pitch-v1.js?v=3`),
          fetch(`${process.env.PUBLIC_URL || ""}/vendor/signalsmith/stretch-1.3.2.wasm`)
            .then(response => {
              if (!response.ok) throw new Error("Live pitch module could not be loaded.");
              return response.arrayBuffer();
            }).then(bytes => WebAssembly.compile(bytes)),
        ]).then(([, wasmModule]) => wasmModule);
        pitchModules.set(graph.context, module);
        module.catch(() => pitchModules.delete(graph.context));
      }
      const wasmModule = await module;
      // A newer preset/Before/disabled request wins while the module loads.
      if (graph.updateRequest !== request) return false;
      if (!graph.pitch) {
        const node = new window.AudioWorkletNode(graph.context, "studio-pitch-v1", {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          processorOptions: { wasmModule },
        });
        node.connect(graph.bass);
        graph.source.disconnect(graph.bass);
        graph.source.connect(node);
        graph.pitch = node;
        graph.resetPitch = () => node.port?.postMessage({ type: "reset" });
        graph.media.addEventListener("seeking", graph.resetPitch);
        graph.media.addEventListener("emptied", graph.resetPitch);
        const pitchFailure = () => {
          if (graph.pitch !== node || graph.disposed) return;
          // A failed audio thread must not silence ordinary preview playback.
          graph.source.disconnect(node);
          node.disconnect();
          graph.source.connect(graph.bass);
          graph.pitch = null;
          graph.media.removeEventListener("seeking", graph.resetPitch);
          graph.media.removeEventListener("emptied", graph.resetPitch);
          graph.media.dispatchEvent(new Event("studio-remix-pitch-error"));
        };
        node.onprocessorerror = pitchFailure;
        if (node.port) node.port.onmessage = event => {
          if (event.data?.type === "error") pitchFailure();
          if (event.data?.type === "ready") graph.pitchLatencySeconds = event.data.latencySeconds;
        };
      }
    }
    if (graph.updateRequest !== request) return false;
    setAudioParam(graph.pitch.parameters.get("semitones"), semitones, graph.context);
    return true;
  } catch (_) {
    return false;
  }
}

const dbToGain = db => 10 ** (Number(db || 0) / 20);

const setAudioParam = (param, value, context) => {
  if (!param) return;
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  try {
    if (context && context.state === "running" && typeof param.setTargetAtTime === "function") {
      param.cancelScheduledValues?.(context.currentTime);
      param.setTargetAtTime(target, context.currentTime, 0.025);
    } else {
      param.value = target;
    }
  } catch (_e) {
    param.value = target;
  }
};

const createImpulse = context => {
  const seconds = 1.8;
  const sampleRate = context?.sampleRate || 44100;
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const impulse = context.createBuffer(2, length, sampleRate);
  let seed = 88421;
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      const decay = Math.exp((-3.5 * i) / length);
      data[i] = noise * decay * 0.28;
    }
  }
  return impulse;
};

export function unlockAudioRemixContext(media) {
  const graph = ensureAudioRemixPreview(media);
  if (graph?.context && graph.context.state === "suspended") {
    graph.context.resume().catch(() => {});
  }
  return graph;
}

export function ensureAudioRemixPreview(media) {
  if (!media) return null;
  if (graphs.has(media)) return graphs.get(media);
  if (media.__audioRemixGraph) {
    graphs.set(media, media.__audioRemixGraph);
    return media.__audioRemixGraph;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    const context = media.__webAudioContext || new AudioContextCtor();
    const source = media.__webAudioSource || context.createMediaElementSource(media);
    media.__webAudioContext = context;
    media.__webAudioSource = source;

    const bass = context.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 120;

    const clarity = context.createBiquadFilter();
    clarity.type = "peaking";
    clarity.frequency.value = 3200;
    clarity.Q.value = 0.8;

    const air = context.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 8200;

    const dry = context.createGain();
    const wet = context.createGain();
    const reverb = context.createConvolver();
    const compressor = context.createDynamicsCompressor();
    const output = context.createGain();
    const trackGain = context.createGain();
    const analyser = context.createAnalyser();

    try {
      reverb.buffer = createImpulse(context);
    } catch (_impulseErr) {
      console.warn("Remix Audio impulse creation skipped", _impulseErr);
    }

    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    // Creating a graph for metering/track gain must leave untreated audio dry.
    // updateAudioRemixPreview enables dynamics and reverb only when requested.
    compressor.ratio.value = 1;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;
    wet.gain.value = 0;

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.68;

    // Signal chain:
    // source -> bass -> clarity -> air
    // air -> dry -> compressor -> output (clean dry speech)
    // air -> reverb -> wet -> output (parallel reverb, doesn't squash compressor)
    // output -> trackGain -> analyser -> context.destination
    source.connect(bass);
    bass.connect(clarity);
    clarity.connect(air);

    air.connect(dry);
    dry.connect(compressor);
    compressor.connect(output);

    air.connect(reverb);
    reverb.connect(wet);
    wet.connect(output);

    output.connect(trackGain);
    trackGain.connect(analyser);
    analyser.connect(context.destination);

    const unlockAudio = () => {
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }
    };

    media.addEventListener("play", unlockAudio);
    media.addEventListener("playing", unlockAudio);
    media.addEventListener("timeupdate", unlockAudio);
    if (typeof window !== "undefined") {
      window.addEventListener("click", unlockAudio, { once: true, passive: true });
      window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
      window.addEventListener("keydown", unlockAudio, { once: true, passive: true });
    }
    unlockAudio();

    const graph = {
      media,
      context,
      source,
      bass,
      clarity,
      air,
      dry,
      wet,
      reverb,
      compressor,
      output,
      trackGain,
      analyser,
      meterSubscribers: new Set(),
      meterFrame: null,
      lastMeterAt: 0,
      unlockAudio,
    };

    graphs.set(media, graph);
    media.__audioRemixGraph = graph;
    return graph;
  } catch (error) {
    console.log("Remix Audio live graph unavailable", error);
    return null;
  }
}

// MediaElement.volume is restricted to [0, 1], while Studio's authored bus
// curves support boosts. Reuse the existing per-element audio graph and apply
// bus gain after effects, without changing the saved fader/remix decisions.
export function applyStudioMediaGain(media, value) {
  if (!media) return false;
  const gain = Number.isFinite(Number(value)) ? Math.max(0, Math.min(4, Number(value))) : 0;
  let graph = graphs.get(media) || media.__audioRemixGraph;
  if (!graph && gain > 1) graph = ensureAudioRemixPreview(media);
  if (graph?.trackGain) {
    if (graph.trackGain.gain.value !== gain) graph.trackGain.gain.value = gain;
    if (media.volume !== 1) media.volume = 1;
    return true;
  }
  const nativeGain = Math.min(1, gain);
  if (media.volume !== nativeGain) media.volume = nativeGain;
  return gain <= 1;
}

export async function updateAudioRemixPreview(media, value, bypass = false, { playbackRate = 1 } = {}) {
  if (!media) return false;
  const remix = normalizeAudioRemix(value);
  const active = remix.enabled && !bypass;

  // Pacing owns the untreated programme clock. Resetting a prepared decoder
  // to 1x and then restoring its authored rate can restart its native clock
  // exactly while a cut is being promoted.
  const fallbackRate = Number.isFinite(Number(playbackRate))
    ? Math.max(.25, Math.min(4, Number(playbackRate))) : 1;
  const rate = active ? remix.speed : fallbackRate;
  if (media.playbackRate !== rate) media.playbackRate = rate;
  // Speed is the programme pacing decision. Independent pitch is applied in
  // the audio graph, never by speeding the picture or compounding native pitch.
  media.preservesPitch = true;
  media.mozPreservesPitch = media.preservesPitch;
  media.webkitPreservesPitch = media.preservesPitch;

  const graph = remix.enabled ? ensureAudioRemixPreview(media) : graphs.get(media) || media.__audioRemixGraph;
  if (!graph) return false;
  const request = (graph.updateRequest || 0) + 1;
  graph.updateRequest = request;

  if (graph.context.state === "suspended") {
    try {
      await graph.context.resume();
    } catch (_error) {
      // Background retry
    }
  }
  if (graph.updateRequest !== request) return false;

  const amount = active ? remix.intensity / 100 : 0;
  setAudioParam(graph.bass.gain, remix.bass * amount, graph.context);
  setAudioParam(graph.clarity.gain, remix.clarity * amount, graph.context);
  setAudioParam(graph.air.gain, remix.air * amount, graph.context);

  const wet = active ? (remix.reverb / 100) * amount * 0.55 : 0;
  setAudioParam(graph.wet.gain, wet, graph.context);
  setAudioParam(graph.dry.gain, active ? Math.max(0.75, 1 - wet * 0.25) : 1, graph.context);

  const positiveEq =
    Math.max(0, remix.bass) * 0.04 +
    Math.max(0, remix.clarity) * 0.04 +
    Math.max(0, remix.air) * 0.03;
  const levelTrim = active && remix.levelMatch ? -Math.min(2.5, positiveEq + wet * 1.2) : 0;
  setAudioParam(
    graph.output.gain,
    active ? dbToGain(remix.outputGain + levelTrim) : 1,
    graph.context
  );

  const dynamics = {
    choir: { threshold: -18, ratio: 2.2, attack: 0.018, release: 0.3 },
    speech: { threshold: -22, ratio: 3.4, attack: 0.008, release: 0.18 },
    music: { threshold: -14, ratio: 2.0, attack: 0.025, release: 0.24 },
    auto: { threshold: -16, ratio: 2.5, attack: 0.012, release: 0.22 },
  }[remix.contentType] || { threshold: -16, ratio: 2.5, attack: 0.012, release: 0.22 };

  const bassHeadroom = Math.max(0, remix.bass * amount) * 0.45;
  const targetThreshold = active ? Math.min(-6, dynamics.threshold + bassHeadroom) : -3;
  const targetRatio = active ? Math.max(1.5, dynamics.ratio - (bassHeadroom > 2 ? 0.4 : 0)) : 1;

  setAudioParam(graph.compressor.threshold, targetThreshold, graph.context);
  setAudioParam(graph.compressor.ratio, targetRatio, graph.context);
  setAudioParam(graph.compressor.attack, dynamics.attack, graph.context);
  setAudioParam(graph.compressor.release, dynamics.release, graph.context);

  return setLivePitch(graph, active && !remix.keepPitch ? remix.pitch * amount : 0, request);
}

const measureGraph = (graph, now) => {
  if (!graph.meterSubscribers.size) {
    graph.meterFrame = null;
    return;
  }
  if (now - graph.lastMeterAt >= 80) {
    const samples = new Float32Array(graph.analyser.fftSize);
    graph.analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    let energy = 0;
    samples.forEach(sample => {
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      energy += sample * sample;
    });
    const rms = Math.sqrt(energy / samples.length);
    const reading = {
      peakDb: Math.max(-60, 20 * Math.log10(Math.max(peak, 0.001))),
      rmsDb: Math.max(-60, 20 * Math.log10(Math.max(rms, 0.001))),
      clipping: peak >= 0.985,
    };
    graph.meterSubscribers.forEach(listener => listener(reading));
    graph.lastMeterAt = now;
  }
  graph.meterFrame = window.requestAnimationFrame(next => measureGraph(graph, next));
};

export function subscribeAudioRemixMeter(media, listener) {
  const graph = ensureAudioRemixPreview(media);
  if (!graph || typeof listener !== "function" || !window.requestAnimationFrame) {
    return () => {};
  }
  graph.meterSubscribers.add(listener);
  if (graph.meterFrame === null) {
    graph.meterFrame = window.requestAnimationFrame(now => measureGraph(graph, now));
  }
  return () => {
    graph.meterSubscribers.delete(listener);
    if (!graph.meterSubscribers.size && graph.meterFrame !== null) {
      window.cancelAnimationFrame?.(graph.meterFrame);
      graph.meterFrame = null;
    }
  };
}

export function disposeAudioRemixPreview(media) {
  const graph = media && (graphs.get(media) || media.__audioRemixGraph);
  if (!graph || graph.disposed) return;
  graph.disposed = true;
  graph.updateRequest = (graph.updateRequest || 0) + 1;
  graph.meterSubscribers.clear();
  if (graph.meterFrame !== null) window.cancelAnimationFrame?.(graph.meterFrame);
  graph.meterFrame = null;
  for (const event of ["play", "playing", "timeupdate"]) media.removeEventListener(event, graph.unlockAudio);
  for (const event of ["click", "pointerdown", "keydown"]) window.removeEventListener(event, graph.unlockAudio);
  graph.source.disconnect();
  graph.pitch?.disconnect();
  if (graph.resetPitch) for (const event of ["seeking", "emptied"]) media.removeEventListener(event, graph.resetPitch);
  if (graph.context.state !== "closed") graph.context.close?.().catch(() => {});
}
