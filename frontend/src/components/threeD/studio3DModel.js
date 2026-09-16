// Version 1 of the editor/worker contract. Keep every field bounded before it
// becomes a render request; the Python worker validates the contract again.
export const STUDIO_3D_TEMPLATES = [
  { id: "cinematic_title", name: "Cinematic 3D Title", accent: "#79d9ff", material: "chrome", entrance: "dolly" },
  { id: "neon_logo", name: "Neon Logo Reveal", accent: "#a855f7", material: "neon", entrance: "orbit" },
  { id: "chrome_lyric", name: "Chrome Lyric Burst", accent: "#f5f7ff", material: "chrome", entrance: "burst" },
  { id: "audio_reactive_text", name: "Audio-Reactive 3D Text", accent: "#38bdf8", material: "holographic", entrance: "pulse" },
  { id: "floating_callout", name: "Floating Social Callout", accent: "#f9a8d4", material: "glass", entrance: "float" },
  { id: "impact_explosion", name: "Impact Word Explosion", accent: "#fbbf24", material: "gold", entrance: "burst" },
  { id: "speaker_intro", name: "Speaker Introduction", accent: "#8b5cf6", material: "matte", entrance: "slide" },
  { id: "comparison_card", name: "3D Comparison Card", accent: "#22d3ee", material: "glass", entrance: "orbit" },
];

export const STUDIO_3D_MATERIALS = ["chrome", "glass", "neon", "gold", "matte", "holographic"];
export const STUDIO_3D_ANIMATIONS = ["dolly", "orbit", "burst", "pulse", "float", "slide", "fade"];
export const STUDIO_3D_EASINGS = ["ease_out", "ease_in_out", "spring", "linear"];
export const STUDIO_3D_KEYFRAME_FIELDS = ["x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ"];

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const between = (value, min, max, fallback) => Math.max(min, Math.min(max, finite(value, fallback)));
const choice = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
// eslint-disable-next-line no-control-regex
const clean = (value, max) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, " ").slice(0, max);
const KEYFRAME_BOUNDS = {
  x: [5, 95, 50], y: [5, 95, 50], z: [-4, 4, 0], scale: [0.2, 3, 1],
  rotationX: [-180, 180, 0], rotationY: [-180, 180, 0], rotationZ: [-180, 180, 0],
};

const normalizeKeyframes = (raw, startTime, endTime) => (Array.isArray(raw) ? raw : [])
  .slice(0, 64)
  .map((frame, index) => ({
    id: clean(frame?.id || `pose-${index + 1}`, 100),
    time: between(frame?.time, startTime, endTime, startTime),
    easing: choice(frame?.easing, STUDIO_3D_EASINGS, "ease_in_out"),
    values: Object.fromEntries(STUDIO_3D_KEYFRAME_FIELDS.map(field => {
      const [min, max, fallback] = KEYFRAME_BOUNDS[field];
      return [field, between(frame?.values?.[field], min, max, fallback)];
    })),
  }))
  .sort((left, right) => left.time - right.time);

export function normalizeStudio3DScene(raw = {}) {
  const template = STUDIO_3D_TEMPLATES.find(item => item.id === raw.template) || STUDIO_3D_TEMPLATES[0];
  const startTime = between(raw.startTime, 0, 86400, 0);
  const duration = between(raw.duration, 0.5, 10, 5);
  return {
    version: 1,
    id: clean(raw.id, 100),
    template: template.id,
    name: clean(raw.name || template.name, 80),
    text: clean(raw.text || "AUTOPROMOTE", 80),
    secondary: clean(raw.secondary || "CREATE WHAT MOVES PEOPLE", 100),
    startTime,
    duration,
    endTime: startTime + duration,
    layerOrder: between(raw.layerOrder, 0, 100, 50),
    assetUrl: clean(raw.assetUrl, 2048),
    assetStoragePath: clean(raw.assetStoragePath, 512),
    assetName: clean(raw.assetName, 128),
    fontFamily: choice(raw.fontFamily, ["studio", "sans", "serif"], "studio"),
    fontWeight: choice(raw.fontWeight, ["regular", "bold", "black"], "bold"),
    textAlign: choice(raw.textAlign, ["left", "center", "right"], "center"),
    lineSpacing: between(raw.lineSpacing, 0.7, 2, 1),
    material: choice(raw.material, STUDIO_3D_MATERIALS, template.material),
    primaryColor: color(raw.primaryColor, template.accent),
    secondaryColor: color(raw.secondaryColor, "#e8ecff"),
    glowColor: color(raw.glowColor, template.accent),
    extrusionDepth: between(raw.extrusionDepth, 0.01, 1.5, 0.28),
    bevel: between(raw.bevel, 0, 0.2, 0.04),
    x: between(raw.x, 5, 95, 50),
    y: between(raw.y, 5, 95, 50),
    z: between(raw.z, -4, 4, 0),
    scale: between(raw.scale, 0.2, 3, 1),
    rotationX: between(raw.rotationX, -180, 180, 0),
    rotationY: between(raw.rotationY, -180, 180, 0),
    rotationZ: between(raw.rotationZ, -180, 180, 0),
    entrance: choice(raw.entrance, STUDIO_3D_ANIMATIONS, template.entrance),
    hold: choice(raw.hold, ["still", "float", "pulse", "orbit"], "float"),
    exit: choice(raw.exit, ["fade", "dolly", "spin", "burst"], "fade"),
    easing: choice(raw.easing, STUDIO_3D_EASINGS, "ease_out"),
    intensity: between(raw.intensity, 0, 1, 0.65),
    audioReactiveIntensity: between(raw.audioReactiveIntensity, 0, 1, template.id === "audio_reactive_text" ? 0.7 : 0),
    cameraMotion: between(raw.cameraMotion, 0, 1, 0.28),
    focalLength: between(raw.focalLength, 24, 85, 50),
    lightDirection: between(raw.lightDirection, -180, 180, 35),
    lightColor: color(raw.lightColor, "#ffffff"),
    lightIntensity: between(raw.lightIntensity, 0, 5, 2.2),
    shadows: raw.shadows !== false,
    reflections: raw.reflections !== false,
    bloom: between(raw.bloom, 0, 1, template.id === "neon_logo" ? 0.7 : 0.32),
    background: choice(raw.background, ["transparent", "dark", "light"], "transparent"),
    enabled: raw.enabled !== false,
    quality: choice(raw.quality, ["draft", "preview", "high"], "preview"),
    hqPreviewUrl: clean(raw.hqPreviewUrl, 2048),
    hqPreviewRevision: clean(raw.hqPreviewRevision, 128),
    hqPreviewJobId: clean(raw.hqPreviewJobId, 100),
    keyframes: normalizeKeyframes(raw.keyframes, startTime, startTime + duration),
  };
}

export function createStudio3DScene(template, startTime, id) {
  return normalizeStudio3DScene({ template, startTime, id, text: "AutoPromote" });
}

export function studio3DSceneRevision(scene) {
  const {
    hqPreviewUrl: _hqPreviewUrl,
    hqPreviewRevision: _hqPreviewRevision,
    hqPreviewJobId: _hqPreviewJobId,
    ...renderValues
  } = normalizeStudio3DScene(scene);
  return JSON.stringify(renderValues);
}

export function studio3DPose(raw, time) {
  const scene = normalizeStudio3DScene(raw);
  const local = time - scene.startTime;
  if (!scene.enabled || local < 0 || local >= scene.duration) return null;
  const baseFrame = { time: scene.startTime, easing: "linear", values: Object.fromEntries(STUDIO_3D_KEYFRAME_FIELDS.map(field => [field, scene[field]])) };
  const keyframes = [
    ...(scene.keyframes.some(frame => Math.abs(frame.time - scene.startTime) < .0001) ? [] : [baseFrame]),
    ...scene.keyframes,
  ].sort((left, right) => left.time - right.time);
  const rightIndex = keyframes.findIndex(frame => frame.time >= time);
  const right = rightIndex < 0 ? keyframes[keyframes.length - 1] : keyframes[rightIndex];
  const left = rightIndex <= 0 ? right : keyframes[rightIndex - 1];
  const rawMix = right.time === left.time ? 1 : Math.max(0, Math.min(1, (time - left.time) / (right.time - left.time)));
  const mix = right.easing === "linear" ? rawMix
    : right.easing === "ease_out" ? 1 - Math.pow(1 - rawMix, 3)
      : right.easing === "spring" ? Math.max(0, Math.min(1, 1 - Math.cos(rawMix * Math.PI * 2.5) * Math.exp(-rawMix * 5)))
        : rawMix * rawMix * (3 - 2 * rawMix);
  const animated = { ...scene };
  STUDIO_3D_KEYFRAME_FIELDS.forEach(field => {
    animated[field] = left.values[field] + (right.values[field] - left.values[field]) * mix;
  });
  const p = local / scene.duration;
  const easeOut = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const enter = easeOut(Math.min(1, local / Math.min(0.75, scene.duration * 0.25)));
  const leave = easeOut(Math.min(1, (scene.duration - local) / Math.min(0.55, scene.duration * 0.2)));
  const sway = Math.sin(local * 1.5) * animated.intensity;
  const originY = animated.entrance === "slide" ? -1.5 : 0;
  const originZ = animated.entrance === "dolly" ? -3 : animated.entrance === "burst" ? 2 : -1;
  const orbitY = animated.entrance === "orbit" ? (1 - enter) * -55 : 0;
  return {
    x: (animated.x - 50) / 12,
    y: (50 - animated.y) / 12 + originY * (1 - enter) + (animated.hold === "float" ? sway * 0.08 : 0),
    z: animated.z + originZ * (1 - enter),
    scale: animated.scale * (animated.entrance === "burst" ? 1.45 - .45 * enter : .72 + .28 * enter),
    rotationX: animated.rotationX + (animated.entrance === "burst" ? (1 - enter) * 32 : 0),
    rotationY: animated.rotationY + orbitY + (animated.hold === "orbit" ? sway * 5 : 0),
    rotationZ: animated.rotationZ + (animated.exit === "spin" ? (1 - leave) * 28 : 0),
    opacity: enter * leave,
    progress: p,
  };
}

export function cutStudio3DScenes(scenes, from, to) {
  if (!(to > from)) return scenes;
  const map = t => t <= from ? t : t >= to ? t - (to - from) : from;
  return scenes.flatMap(raw => {
    const scene = normalizeStudio3DScene(raw);
    const startTime = map(scene.startTime);
    const duration = map(scene.endTime) - startTime;
    const keyframes = scene.keyframes
      .map(frame => ({ ...frame, time: map(frame.time) }))
      .filter(frame => frame.time >= startTime && frame.time <= startTime + duration);
    return duration < 0.5 ? [] : [normalizeStudio3DScene({ ...scene, startTime, duration, keyframes })];
  });
}
