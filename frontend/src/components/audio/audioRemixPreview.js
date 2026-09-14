import { normalizeAudioRemix } from "./audioRemixModel";

const graphs = new WeakMap();

const setAudioParam = (param, value, context) => {
  if (!param) return;
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(value, context.currentTime, 0.025);
  } else {
    param.value = value;
  }
};

const createImpulse = context => {
  const seconds = 2.4;
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  let seed = 88421;
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      data[i] = noise * Math.pow(1 - i / length, 3.2);
    }
  }
  return impulse;
};

export function ensureAudioRemixPreview(media) {
  if (!media) return null;
  if (graphs.has(media)) return graphs.get(media);
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(media);
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
    reverb.buffer = createImpulse(context);
    compressor.threshold.value = -12;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;

    source.connect(bass);
    bass.connect(clarity);
    clarity.connect(air);
    air.connect(dry);
    air.connect(reverb);
    reverb.connect(wet);
    dry.connect(compressor);
    wet.connect(compressor);
    compressor.connect(context.destination);
    const graph = { context, source, bass, clarity, air, dry, wet, reverb, compressor };
    graphs.set(media, graph);
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
  const graph = remix.enabled ? ensureAudioRemixPreview(media) : graphs.get(media);
  if (!graph) return false;
  if (graph.context.state === "suspended") {
    try {
      await graph.context.resume();
    } catch (error) {
      return false;
    }
  }
  const amount = active ? remix.intensity / 100 : 0;
  setAudioParam(graph.bass.gain, remix.bass * amount, graph.context);
  setAudioParam(graph.clarity.gain, remix.clarity * amount, graph.context);
  setAudioParam(graph.air.gain, remix.air * amount, graph.context);
  const wet = active ? (remix.reverb / 100) * amount * 0.72 : 0;
  setAudioParam(graph.wet.gain, wet, graph.context);
  setAudioParam(graph.dry.gain, active ? Math.max(0.62, 1 - wet * 0.34) : 1, graph.context);
  return true;
}
