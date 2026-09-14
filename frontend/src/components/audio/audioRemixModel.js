export const AUDIO_REMIX_PRESETS = [
  {
    id: "slowed_reverb",
    name: "Slowed + Reverb",
    icon: "◒",
    description: "Deep, spacious and cinematic",
    speed: 0.82,
    pitch: -3,
    bass: 4,
    clarity: 2,
    air: 1,
    reverb: 68,
    intensity: 70,
    keepPitch: false,
  },
  {
    id: "sped_up",
    name: "Sped Up",
    icon: "↗",
    description: "Fast, bright social energy",
    speed: 1.2,
    pitch: 3,
    bass: 1,
    clarity: 3,
    air: 4,
    reverb: 12,
    intensity: 65,
    keepPitch: false,
  },
  {
    id: "deep_voice",
    name: "Deep Voice",
    icon: "◉",
    description: "Weight without muddy speech",
    speed: 1,
    pitch: -4,
    bass: 5,
    clarity: 2,
    air: -1,
    reverb: 14,
    intensity: 64,
    keepPitch: false,
  },
  {
    id: "nightcore",
    name: "Nightcore",
    icon: "✦",
    description: "High, fast and electric",
    speed: 1.25,
    pitch: 4,
    bass: -1,
    clarity: 3,
    air: 5,
    reverb: 20,
    intensity: 76,
    keepPitch: false,
  },
  {
    id: "amapiano_space",
    name: "Amapiano Space",
    icon: "♬",
    description: "Warm low end and wide ambience",
    speed: 0.95,
    pitch: -1,
    bass: 6,
    clarity: 1,
    air: 2,
    reverb: 48,
    intensity: 72,
    keepPitch: false,
  },
  {
    id: "warm_vocal",
    name: "Warm Vocal",
    icon: "◎",
    description: "Smooth singing and clear speech",
    speed: 1,
    pitch: 0,
    bass: 3,
    clarity: 3,
    air: 2,
    reverb: 18,
    intensity: 55,
    keepPitch: true,
  },
];

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const bounded = (value, min, max, fallback) =>
  Math.max(min, Math.min(max, finite(value, fallback)));

export const DEFAULT_AUDIO_REMIX = Object.freeze({
  version: 1,
  enabled: false,
  preset: "slowed_reverb",
  speed: 0.82,
  pitch: -3,
  bass: 4,
  clarity: 2,
  air: 1,
  reverb: 68,
  intensity: 70,
  keepPitch: false,
});

export function normalizeAudioRemix(value = {}) {
  const preset = AUDIO_REMIX_PRESETS.find(item => item.id === value.preset);
  const base = preset || DEFAULT_AUDIO_REMIX;
  return {
    version: 1,
    enabled: value.enabled === true,
    preset: preset?.id || DEFAULT_AUDIO_REMIX.preset,
    speed: bounded(value.speed, 0.5, 1.5, base.speed),
    pitch: bounded(value.pitch, -12, 12, base.pitch),
    bass: bounded(value.bass, -12, 12, base.bass),
    clarity: bounded(value.clarity, -12, 12, base.clarity),
    air: bounded(value.air, -12, 12, base.air),
    reverb: bounded(value.reverb, 0, 100, base.reverb),
    intensity: bounded(value.intensity, 0, 100, base.intensity),
    keepPitch: value.keepPitch === true,
  };
}

export function applyAudioRemixPreset(id) {
  const preset = AUDIO_REMIX_PRESETS.find(item => item.id === id) || AUDIO_REMIX_PRESETS[0];
  return normalizeAudioRemix({ ...preset, enabled: true });
}

export function patchAudioRemix(current, patch) {
  return normalizeAudioRemix({ ...current, ...patch, enabled: true });
}

export function audioRemixForRender(value) {
  const remix = normalizeAudioRemix(value);
  return {
    version: 1,
    enabled: remix.enabled,
    preset: remix.preset,
    speed: remix.speed,
    pitch_semitones: remix.keepPitch ? 0 : remix.pitch,
    bass_db: remix.bass,
    clarity_db: remix.clarity,
    air_db: remix.air,
    reverb_mix: remix.reverb / 100,
    intensity: remix.intensity / 100,
    keep_pitch: remix.keepPitch,
  };
}
