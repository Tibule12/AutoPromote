export const AUDIO_REMIX_PRESETS = [
  {
    id: "slowed_reverb",
    name: "Slowed + Reverb",
    icon: "◒",
    description: "Deep, spacious and cinematic",
    speed: 0.82,
    pitch: -3,
    bass: 8,
    clarity: 2,
    air: 1,
    reverb: 68,
    intensity: 75,
    keepPitch: false,
  },
  {
    id: "sped_up",
    name: "Sped Up",
    icon: "↗",
    description: "Fast, bright social energy",
    speed: 1.2,
    pitch: 3,
    bass: 3,
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
    description: "Heavy chest & sub resonance",
    speed: 1,
    pitch: -4,
    bass: 9,
    clarity: 2,
    air: -1,
    reverb: 14,
    intensity: 70,
    keepPitch: false,
  },
  {
    id: "nightcore",
    name: "Nightcore",
    icon: "✦",
    description: "High, fast and electric",
    speed: 1.25,
    pitch: 4,
    bass: 2,
    clarity: 4,
    air: 5,
    reverb: 20,
    intensity: 76,
    keepPitch: false,
  },
  {
    id: "amapiano_space",
    name: "Amapiano Space",
    icon: "♬",
    description: "Sub-bass log-drum & wide room",
    speed: 0.95,
    pitch: -1,
    bass: 10,
    clarity: 1,
    air: 2,
    reverb: 48,
    intensity: 78,
    keepPitch: false,
  },
  {
    id: "warm_vocal",
    name: "Warm Vocal",
    icon: "◎",
    description: "Smooth singing and clear speech",
    speed: 1,
    pitch: 0,
    bass: 5,
    clarity: 3,
    air: 2,
    reverb: 18,
    intensity: 60,
    keepPitch: true,
  },
  {
    id: "bass_boost",
    name: "Bass Boost",
    icon: "⚡",
    description: "Maximum sub slam and 808 punch",
    speed: 1,
    pitch: 0,
    bass: 12,
    clarity: 3,
    air: 2,
    reverb: 10,
    intensity: 85,
    keepPitch: true,
  },
  {
    id: "lo_fi",
    name: "Lo-Fi Chill",
    icon: "☕",
    description: "Warm tape low-end & soft highs",
    speed: 0.9,
    pitch: -1,
    bass: 7,
    clarity: -1,
    air: -4,
    reverb: 36,
    intensity: 72,
    keepPitch: false,
  },
  {
    id: "telephone",
    name: "Telephone",
    icon: "☏",
    description: "Vintage radio & narrow bandpass",
    speed: 1,
    pitch: 0,
    bass: -6,
    clarity: 8,
    air: -5,
    reverb: 16,
    intensity: 75,
    keepPitch: true,
  },
  {
    id: "spatial_8d",
    name: "8D Spatial",
    icon: "∞",
    description: "Immersive 3D surround soundstage",
    speed: 0.98,
    pitch: 0,
    bass: 7,
    clarity: 3,
    air: 4,
    reverb: 65,
    intensity: 80,
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
  bass: 8,
  clarity: 2,
  air: 1,
  reverb: 68,
  intensity: 75,
  keepPitch: false,
  contentType: "auto",
  target: "master",
  outputGain: 0,
  levelMatch: true,
  quality: "studio",
});

export const AUDIO_CONTENT_TYPES = Object.freeze([
  { id: "auto", name: "Auto", description: "Balanced protection" },
  { id: "choir", name: "Choir", description: "Wide, clear harmonies" },
  { id: "speech", name: "Speech", description: "Clean spoken voice" },
  { id: "music", name: "Music", description: "Punch and movement" },
]);

export const AUDIO_REMIX_TARGETS = Object.freeze([
  { id: "master", name: "Full Mix" },
  { id: "voice", name: "Voice" },
  { id: "music", name: "Music" },
]);

export function normalizeAudioRemix(value = {}) {
  const preset = AUDIO_REMIX_PRESETS.find(item => item.id === value.preset);
  const base = preset || DEFAULT_AUDIO_REMIX;
  return {
    version: 1,
    enabled: value.enabled === true,
    preset: preset?.id || DEFAULT_AUDIO_REMIX.preset,
    speed: bounded(value.speed, 0.5, 1.5, base.speed),
    pitch: bounded(value.pitch, -12, 12, base.pitch),
    bass: bounded(value.bass, -12, 18, base.bass),
    clarity: bounded(value.clarity, -12, 12, base.clarity),
    air: bounded(value.air, -12, 12, base.air),
    reverb: bounded(value.reverb, 0, 100, base.reverb),
    intensity: bounded(value.intensity, 0, 100, base.intensity),
    keepPitch: value.keepPitch === true,
    contentType: AUDIO_CONTENT_TYPES.some(item => item.id === value.contentType)
      ? value.contentType
      : "auto",
    target: AUDIO_REMIX_TARGETS.some(item => item.id === value.target) ? value.target : "master",
    outputGain: bounded(value.outputGain, -12, 6, 0),
    levelMatch: value.levelMatch !== false,
    quality: value.quality === "preview" ? "preview" : "studio",
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
    content_type: remix.contentType,
    target: remix.target,
    output_gain_db: remix.outputGain,
    level_match: remix.levelMatch,
    quality: remix.quality,
  };
}
