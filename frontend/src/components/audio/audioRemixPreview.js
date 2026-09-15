import { normalizeAudioRemix } from "./audioRemixModel";

const graphs = new WeakMap();

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
    const analyser = context.createAnalyser();

    try {
      reverb.buffer = createImpulse(context);
    } catch (_impulseErr) {
      console.warn("Remix Audio impulse creation skipped", _impulseErr);
    }

    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.68;

    // Signal chain:
    // source -> bass -> clarity -> air
    // air -> dry -> compressor -> output (clean dry speech)
    // air -> reverb -> wet -> output (parallel reverb, doesn't squash compressor)
    // output -> analyser -> context.destination
    source.connect(bass);
    bass.connect(clarity);
    clarity.connect(air);

    air.connect(dry);
    dry.connect(compressor);
    compressor.connect(output);

    air.connect(reverb);
    reverb.connect(wet);
    wet.connect(output);

    output.connect(analyser);
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
      analyser,
      meterSubscribers: new Set(),
      meterFrame: null,
      lastMeterAt: 0,
    };

    graphs.set(media, graph);
    media.__audioRemixGraph = graph;
    return graph;
  } catch (error) {
    console.log("Remix Audio live graph unavailable", error);
    return null;
  }
}

export async function updateAudioRemixPreview(media, value, bypass = false) {
  if (!media) return false;
  const remix = normalizeAudioRemix(value);
  const active = remix.enabled && !bypass;

  media.playbackRate = active ? remix.speed : 1;
  media.preservesPitch = active ? remix.keepPitch : true;
  media.mozPreservesPitch = media.preservesPitch;
  media.webkitPreservesPitch = media.preservesPitch;

  const graph = remix.enabled ? ensureAudioRemixPreview(media) : graphs.get(media) || media.__audioRemixGraph;
  if (!graph) return false;

  if (graph.context.state === "suspended") {
    try {
      await graph.context.resume();
    } catch (_error) {
      // Background retry
    }
  }

  const amount = active ? remix.intensity / 100 : 0;
  setAudioParam(graph.bass.gain, remix.bass * amount, graph.context);
  setAudioParam(graph.clarity.gain, remix.clarity * amount, graph.context);
  setAudioParam(graph.air.gain, remix.air * amount, graph.context);

  const wet = active ? (remix.reverb / 100) * amount * 0.55 : 0;
  setAudioParam(graph.wet.gain, wet, graph.context);
  setAudioParam(graph.dry.gain, active ? Math.max(0.75, 1 - wet * 0.25) : 1, graph.context);

  const positiveEq =
    Math.max(0, remix.bass) * 0.06 +
    Math.max(0, remix.clarity) * 0.04 +
    Math.max(0, remix.air) * 0.03;
  const levelTrim = active && remix.levelMatch ? -Math.min(3.0, positiveEq + wet * 1.5) : 0;
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

  setAudioParam(graph.compressor.threshold, active ? dynamics.threshold : -3, graph.context);
  setAudioParam(graph.compressor.ratio, active ? dynamics.ratio : 1, graph.context);
  setAudioParam(graph.compressor.attack, dynamics.attack, graph.context);
  setAudioParam(graph.compressor.release, dynamics.release, graph.context);

  return true;
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
