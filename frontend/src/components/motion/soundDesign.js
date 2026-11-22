// Deterministic PCM, shared mathematically with the worker. Preview/seek/export use the same envelope.
export const DESIGN_SOUNDS = [
  { id: "chime", name: "Glass chime", emoji: "✧", duration: 0.9, tone: "chime" },
  { id: "reverse", name: "Reverse pull", emoji: "↶", duration: 0.8, tone: "reverse" },
  { id: "glitch", name: "Digital glitch", emoji: "▥", duration: 0.4, tone: "glitch" },
  { id: "subdrop", name: "Sub drop", emoji: "◉", duration: 1.1, tone: "subdrop" },
  { id: "cinematic_hit", name: "Cinematic hit", emoji: "◆", duration: 1.4, tone: "cinematic_hit", volume: 0.38 },
  { id: "airy_whoosh", name: "Airy whoosh", emoji: "≋", duration: 0.65, tone: "airy_whoosh", volume: 0.32 },
  { id: "bass_punch", name: "Bass punch", emoji: "●", duration: 0.45, tone: "bass_punch", volume: 0.38 },
  { id: "metal_hit", name: "Metallic hit", emoji: "◇", duration: 1.1, tone: "metal_hit", volume: 0.26 },
  { id: "tape_stop", name: "Tape stop", emoji: "↘", duration: 0.55, tone: "tape_stop", volume: 0.28 },
  { id: "sparkle", name: "Sparkle tail", emoji: "✦", duration: 1.6, tone: "sparkle", volume: 0.22 },
];
export const ORIGINAL_STUDIO_SOUNDS = [
  { id: 'prism_sweep', name: 'Prism sweep', emoji: '◇', duration: .8, tone: 'prism_sweep', volume: .28 },
  { id: 'velvet_hit', name: 'Velvet hit', emoji: '●', duration: .65, tone: 'velvet_hit', volume: .34 },
  { id: 'glass_flick', name: 'Glass flick', emoji: '✧', duration: .5, tone: 'glass_flick', volume: .22 },
  { id: 'paper_snap', name: 'Paper snap', emoji: '▱', duration: .18, tone: 'paper_snap', volume: .25 },
  { id: 'orbit_rise', name: 'Orbit rise', emoji: '◌', duration: 1.2, tone: 'orbit_rise', volume: .22 },
  { id: 'pulse_drop', name: 'Pulse drop', emoji: '◉', duration: .9, tone: 'pulse_drop', volume: .32 },
  { id: 'shutter_tick', name: 'Shutter tick', emoji: '▣', duration: .16, tone: 'shutter_tick', volume: .23 },
  { id: 'reverse_spark', name: 'Reverse spark', emoji: '✦', duration: .7, tone: 'reverse_spark', volume: .2 },
];
export const SOUND_EFFECT_PRESETS = [
  { id: "whoosh", name: "Whoosh", emoji: "💨", duration: 0.8, tone: "sweep" },
  { id: "impact", name: "Impact", emoji: "💥", duration: 0.65, tone: "impact" },
  { id: "pop", name: "Pop", emoji: "🫧", duration: 0.28, tone: "pop" },
  { id: "click", name: "Click", emoji: "🖱️", duration: 0.16, tone: "click" },
  { id: "riser", name: "Riser", emoji: "🚀", duration: 1.5, tone: "riser" },
  ...DESIGN_SOUNDS,
  ...ORIGINAL_STUDIO_SOUNDS,
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
    phase = 0,
    filteredNoise = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate,
      p = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    const previousNoise = filteredNoise;
    filteredNoise += Math.min(1, 2400 / sampleRate) * (noise - filteredNoise);
    let value;
    if (tone === 'prism_sweep') {
      phase += tau * (480 + 2100 * p * p) / sampleRate;
      value = (.42 * (noise - previousNoise) + .16 * Math.sin(phase) + .08 * Math.sin(phase * 1.5)) * Math.pow(Math.sin(Math.PI * p), 2);
    } else if (tone === 'velvet_hit') {
      phase += tau * (46 + 115 * Math.exp(-45 * t)) / sampleRate;
      value = .7 * Math.sin(phase) * Math.exp(-6 * p) + .13 * filteredNoise * Math.exp(-19 * p);
    } else if (tone === 'glass_flick') {
      value = (.3 * Math.sin(tau * 1480 * t) + .18 * Math.sin(tau * 2220 * t) + .1 * Math.sin(tau * 3130 * t)) * (1 - Math.exp(-500 * t)) * Math.exp(-8 * p);
    } else if (tone === 'paper_snap') {
      value = .65 * (noise - previousNoise) * Math.exp(-35 * p) + .13 * Math.sin(tau * 410 * t) * Math.exp(-30 * p);
    } else if (tone === 'orbit_rise') {
      phase += tau * (120 + 1000 * p * p) / sampleRate;
      value = (.34 * Math.sin(phase) + .13 * Math.sin(2 * phase) + .1 * filteredNoise) * Math.pow(Math.sin(Math.PI * p), .7) * (.3 + .7 * p);
    } else if (tone === 'pulse_drop') {
      phase += tau * (36 + 120 * Math.exp(-16 * t)) / sampleRate;
      value = .72 * Math.sin(phase) * Math.exp(-4 * p) + .08 * filteredNoise * Math.exp(-25 * p);
    } else if (tone === 'shutter_tick') {
      const second = Math.max(0, t - .025);
      value = .48 * noise * Math.exp(-90 * p) + .23 * Math.sin(tau * 1700 * t) * Math.exp(-60 * p) + (t >= .025 ? .32 * Math.sin(tau * 1150 * second) * Math.exp(-140 * second) : 0);
    } else if (tone === 'reverse_spark') {
      value = (.27 * Math.sin(tau * 900 * t) + .18 * Math.sin(tau * 1350 * t) + .1 * (noise - previousNoise)) * Math.pow(p, 2.5);
    } else if (tone === "cinematic_hit") {
      phase += (tau * (42 + 105 * Math.exp(-32 * t))) / sampleRate;
      value = 0.62 * Math.sin(phase) * Math.exp(-3.6 * p) +
        0.26 * filteredNoise * Math.exp(-12 * p) +
        0.10 * Math.sin(tau * 196 * t) * Math.exp(-6 * p);
    } else if (tone === "airy_whoosh") {
      phase += (tau * (900 + 2800 * Math.sin(Math.PI * p))) / sampleRate;
      value = (0.62 * (noise - previousNoise) + 0.09 * Math.sin(phase)) *
        Math.pow(Math.sin(Math.PI * p), 2);
    } else if (tone === "bass_punch") {
      phase += (tau * (48 + 160 * Math.exp(-42 * t))) / sampleRate;
      value = 0.82 * Math.sin(phase) * Math.exp(-7 * p) +
        0.15 * noise * Math.exp(-70 * p);
    } else if (tone === "metal_hit") {
      value = (0.34 * Math.sin(tau * 340 * t) + 0.23 * Math.sin(tau * 731 * t) +
        0.16 * Math.sin(tau * 1193 * t) + 0.09 * Math.sin(tau * 1877 * t)) *
        Math.exp(-5 * p) + 0.12 * noise * Math.exp(-65 * p);
    } else if (tone === "tape_stop") {
      phase += (tau * (45 + 950 * Math.pow(1 - p, 3))) / sampleRate;
      value = (0.48 * Math.sin(phase) + 0.18 * Math.sin(2 * phase) +
        0.12 * Math.sin(3 * phase)) * Math.pow(1 - p, 0.65);
    } else if (tone === "sparkle") {
      value = 0;
      for (let k = 0; k < 6; k++) {
        const local = t - k * duration * 0.075;
        if (local >= 0) value += 0.16 * Math.sin(tau * 880 * Math.pow(2, k / 3) * local) *
          (1 - Math.exp(-120 * local)) * Math.exp(-9 * local / duration);
      }
    } else if (tone === "sweep" || tone === "riser" || tone === "reverse") {
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
