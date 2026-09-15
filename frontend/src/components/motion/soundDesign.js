// Deterministic PCM, shared mathematically with the worker. Preview/seek/export use the same envelope.
export const DESIGN_SOUNDS = [
  { id: "chime", name: "Glass chime", emoji: "✧", duration: 0.9, tone: "chime" },
  { id: "reverse", name: "Reverse pull", emoji: "↶", duration: 0.8, tone: "reverse" },
  { id: "glitch", name: "Digital glitch", emoji: "▥", duration: 0.4, tone: "glitch" },
  { id: "subdrop", name: "Sub drop", emoji: "◉", duration: 1.1, tone: "subdrop" },
];
export function synthesizeEffect(effect, sampleRate = 48000) {
  const duration = Math.max(0.05, Math.min(15, Number(effect.duration) || 0.7));
  const count = Math.ceil(duration * sampleRate),
    samples = new Float32Array(count);
  const fadeIn = Math.max(0.001, Number(effect.fadeIn) || 0),
    fadeOut = Math.max(0.005, Number(effect.fadeOut) || 0);
  const tone = effect.tone,
    tau = 2 * Math.PI;
  let seed = 123456789,
    phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate,
      p = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    let value;
    if (tone === "sweep" || tone === "riser" || tone === "reverse") {
      const rise = tone !== "sweep",
        f = tone === "reverse" ? 2600 - 2300 * p : rise ? 180 + 3200 * p : 1800 - 1450 * p;
      phase += (tau * f) / sampleRate;
      value = (0.48 * noise + 0.25 * Math.sin(phase)) * (rise ? p : Math.sin(Math.PI * p));
    } else if (tone === "chime") {
      value =
        (Math.sin(tau * 880 * t) +
          0.45 * Math.sin(tau * 1320 * t) +
          0.25 * Math.sin(tau * 1760 * t)) *
        Math.exp(-5 * p) *
        0.5;
    } else if (tone === "glitch") {
      value =
        (0.3 * noise + 0.4 * Math.sin(tau * (320 + 160 * Math.floor(p * 8)) * t)) *
        (Math.floor(p * 16) % 2 ? 0.15 : 1);
    } else {
      const low = tone === "impact" || tone === "subdrop",
        f0 = low ? 150 : tone === "click" ? 1100 : 620,
        f1 = low ? 42 : tone === "click" ? 420 : 240;
      phase += (tau * (f0 + (f1 - f0) * p)) / sampleRate;
      value = (Math.sin(phase) * 0.8 + (tone === "impact" ? noise * 0.2 : 0)) * Math.exp(-5 * p);
    }
    const envelope = Math.min(1, t / fadeIn, (duration - t) / fadeOut);
    samples[i] = Math.max(-1, Math.min(1, value * envelope));
  }
  return samples;
}
