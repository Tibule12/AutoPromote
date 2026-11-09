import { studioTitleMatteMarkup } from './studioTitleMatte';
import {
  buildMotionAutomationStyle,
  interpolateAutomationValue,
  sortAutomationKeyframes,
} from "./studioAutomation";
import { secondsToTicks, ticksToSeconds } from "./studioTime";

export const TRACK_MATTE_MODES = [
  "none",
  "alpha",
  "alpha_inverted",
  "luma",
  "luma_inverted",
];

export const TRACK_MATTE_OPTIONS = [
  { id: "none", label: "No Matte", shortLabel: "None" },
  { id: "alpha", label: "Alpha Matte", shortLabel: "Alpha" },
  { id: "alpha_inverted", label: "Alpha Inverted", shortLabel: "Alpha Inv" },
  { id: "luma", label: "Luma Matte", shortLabel: "Luma" },
  { id: "luma_inverted", label: "Luma Inverted", shortLabel: "Luma Inv" },
];

export const MOTION_DRIVER_PROPERTIES = ["x", "y", "scale", "rotation", "opacity"];

export const MOTION_DRIVER_TYPES = [
  "wiggle",
  "spring",
  "pulse",
  "spin",
  "loop",
  "beat_pump",
];

export const MOTION_DRIVER_CATALOG = [
  {
    id: "wiggle",
    label: "Handheld Wiggle",
    badge: "WIG",
    summary: "Organic multi-octave camera or graphic drift",
    defaults: { type: "wiggle", enabled: true, frequencyHz: 2.2, amplitude: 3.5, octaves: 3, seed: 17 },
  },
  {
    id: "spring",
    label: "Inertial Spring",
    badge: "SPR",
    summary: "Velocity-driven overshoot and settle after keyframes",
    defaults: { type: "spring", enabled: true, frequencyHz: 3.2, damping: 5.5, amount: 1.0 },
  },
  {
    id: "pulse",
    label: "Rhythm Pulse",
    badge: "PLS",
    summary: "Continuous sine, triangle, or square LFO modulation",
    defaults: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 1.5, amplitude: 0.08, phaseDeg: 0 },
  },
  {
    id: "spin",
    label: "Continuous Spin",
    badge: "SPN",
    summary: "Constant angular or linear velocity over layer time",
    defaults: { type: "spin", enabled: true, ratePerSecond: 45 },
  },
  {
    id: "loop",
    label: "Keyframe Loop",
    badge: "LOP",
    summary: "Cycle or ping-pong authored keyframes automatically",
    defaults: { type: "loop", enabled: true, loopMode: "cycle" },
  },
  {
    id: "beat_pump",
    label: "Beat Pump",
    badge: "BPM",
    summary: "Tempo-locked exponential punch synced to BPM",
    defaults: { type: "beat_pump", enabled: true, bpm: 120, amount: 0.12, decay: 8.5 },
  },
];

export const COMP_CURVE_PRESETS = [
  { id: "whip_snap", label: "Whip Snap", easing: "bezier", curve: [0.12, 0.92, 0.22, 1] },
  { id: "cinema_settle", label: "Cinema Settle", easing: "bezier", curve: [0.22, 1, 0.36, 1] },
  { id: "elastic_pop", label: "Elastic Pop", easing: "bezier", curve: [0.34, 1.56, 0.64, 1] },
  { id: "smooth_s", label: "Smooth S-Curve", easing: "bezier", curve: [0.45, 0, 0.55, 1] },
  { id: "dramatic_ramp", label: "Dramatic Ramp", easing: "bezier", curve: [0.76, 0, 0.24, 1] },
  { id: "hold_cut", label: "Hold Cut", easing: "hold", curve: [0, 0, 1, 1] },
];

const PROPERTY_BOUNDS = {
  x: [-100, 200],
  y: [-100, 200],
  scale: [0.02, 6],
  rotation: [-3600, 3600],
  opacity: [0, 1],
};

const PROPERTY_HASH_OFFSET = {
  x: 11,
  y: 29,
  scale: 47,
  rotation: 71,
  opacity: 97,
};

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const isFiniteNum = value => typeof value === "number" && Number.isFinite(value);

export const defaultMotionDriverForProperty = (type = "wiggle", property = "x") => {
  const entry = MOTION_DRIVER_CATALOG.find(item => item.id === type) || MOTION_DRIVER_CATALOG[0];
  const base = { ...entry.defaults };
  if (type === "wiggle") {
    if (property === "scale") base.amplitude = 0.06;
    else if (property === "opacity") base.amplitude = 0.15;
    else if (property === "rotation") base.amplitude = 6;
  } else if (type === "pulse") {
    if (property === "x" || property === "y") base.amplitude = 4;
    else if (property === "rotation") base.amplitude = 12;
    else if (property === "opacity") base.amplitude = 0.2;
  } else if (type === "beat_pump") {
    if (property === "x" || property === "y") base.amount = 4;
    else if (property === "rotation") base.amount = 10;
    else if (property === "opacity") base.amount = 0.25;
  } else if (type === "spin" && property !== "rotation") {
    base.ratePerSecond = property === "scale" ? 0.15 : 8;
  }
  return base;
};

export const createStudioNullRigLayer = ({
  id = `null-rig-${Date.now()}`,
  name = "Null Rig 1",
  startTime = 0,
  duration = 5,
  x = 50,
  y = 50,
} = {}) => ({
  id: String(id),
  name: String(name || "Null Rig"),
  type: "text",
  text: "",
  isNullRig: true,
  x: Number.isFinite(Number(x)) ? Number(x) : 50,
  y: Number.isFinite(Number(y)) ? Number(y) : 50,
  width: 16,
  height: 16,
  scale: 1,
  rotation: 0,
  opacity: 1,
  anchorX: 50,
  anchorY: 50,
  blendMode: "normal",
  startTime: Math.max(0, Number(startTime) || 0),
  duration: Math.max(0.2, Number(duration) || 5),
});

export const validateStudioMotionDrivers = layer => {
  if (!layer || layer.motionDrivers === undefined || layer.motionDrivers === null) return;
  const drivers = layer.motionDrivers;
  if (typeof drivers !== "object" || Array.isArray(drivers)) {
    fail("INVALID_MOTION_DRIVER", "Motion drivers must be an object keyed by property.");
  }
  for (const [property, driver] of Object.entries(drivers)) {
    if (!MOTION_DRIVER_PROPERTIES.includes(property)) {
      fail("INVALID_MOTION_DRIVER", `Motion driver property ${property} is unsupported.`);
    }
    if (driver === null || driver === undefined) continue;
    if (typeof driver !== "object" || Array.isArray(driver)) {
      fail("INVALID_MOTION_DRIVER", `Motion driver on ${property} must be an object.`);
    }
    if (driver.enabled !== undefined && typeof driver.enabled !== "boolean") {
      fail("INVALID_MOTION_DRIVER", `Motion driver enabled flag on ${property} must be boolean.`);
    }
    if (!MOTION_DRIVER_TYPES.includes(driver.type)) {
      fail("INVALID_MOTION_DRIVER", `Unsupported motion driver type ${String(driver.type)}.`);
    }
    if (driver.type === "wiggle") {
      if (
        !isFiniteNum(driver.frequencyHz) || driver.frequencyHz < 0.05 || driver.frequencyHz > 30 ||
        !isFiniteNum(driver.amplitude) || driver.amplitude < 0 || driver.amplitude > 360 ||
        (driver.octaves !== undefined && (!Number.isInteger(driver.octaves) || driver.octaves < 1 || driver.octaves > 6)) ||
        (driver.seed !== undefined && (!isFiniteNum(driver.seed) || Math.abs(driver.seed) > 100000))
      ) {
        fail("INVALID_MOTION_DRIVER", `Invalid wiggle parameters on ${property}.`);
      }
    } else if (driver.type === "spring") {
      if (
        !isFiniteNum(driver.frequencyHz) || driver.frequencyHz < 0.2 || driver.frequencyHz > 20 ||
        !isFiniteNum(driver.damping) || driver.damping < 0.2 || driver.damping > 40 ||
        !isFiniteNum(driver.amount) || driver.amount < 0 || driver.amount > 5
      ) {
        fail("INVALID_MOTION_DRIVER", `Invalid spring parameters on ${property}.`);
      }
    } else if (driver.type === "pulse") {
      if (
        !["sine", "triangle", "square"].includes(driver.waveform || "sine") ||
        !isFiniteNum(driver.frequencyHz) || driver.frequencyHz < 0.05 || driver.frequencyHz > 30 ||
        !isFiniteNum(driver.amplitude) || driver.amplitude < -360 || driver.amplitude > 360 ||
        (driver.phaseDeg !== undefined && (!isFiniteNum(driver.phaseDeg) || Math.abs(driver.phaseDeg) > 3600))
      ) {
        fail("INVALID_MOTION_DRIVER", `Invalid pulse parameters on ${property}.`);
      }
    } else if (driver.type === "spin") {
      if (!isFiniteNum(driver.ratePerSecond) || Math.abs(driver.ratePerSecond) > 1440) {
        fail("INVALID_MOTION_DRIVER", `Invalid spin rate on ${property}.`);
      }
    } else if (driver.type === "loop") {
      if (!["cycle", "pingpong"].includes(driver.loopMode || "cycle")) {
        fail("INVALID_MOTION_DRIVER", `Invalid loop mode on ${property}.`);
      }
    } else if (driver.type === "beat_pump") {
      if (
        !isFiniteNum(driver.bpm) || driver.bpm < 20 || driver.bpm > 300 ||
        !isFiniteNum(driver.amount) || Math.abs(driver.amount) > 360 ||
        !isFiniteNum(driver.decay) || driver.decay < 0.5 || driver.decay > 60
      ) {
        fail("INVALID_MOTION_DRIVER", `Invalid beat_pump parameters on ${property}.`);
      }
    }
  }
};

export const validateStudioParentGraph = (overlays = [], mainTransform = null) => {
  if (mainTransform?.parentId) {
    fail("INVALID_LAYER_PARENT", "The base programme layer cannot be parented to an overlay.");
  }
  const visualOverlays = (overlays || []).filter(item => item && !item.isCaption);
  const byId = new Map(visualOverlays.map(item => [String(item.id), item]));

  for (const layer of visualOverlays) {
    if (layer.isNullRig !== undefined && typeof layer.isNullRig !== "boolean") {
      fail("INVALID_NULL_RIG", `Layer ${layer.id} isNullRig flag must be boolean.`);
    }
    const parentId = layer.parentId;
    if (parentId === undefined || parentId === null || parentId === "") continue;
    if (typeof parentId !== "string") {
      fail("INVALID_LAYER_PARENT", `Layer ${layer.id} parentId must be a string.`);
    }
    if (String(layer.id) === parentId) {
      fail("INVALID_LAYER_PARENT", `Layer ${layer.id} cannot parent to itself.`);
    }
    if (parentId !== "main-video" && !byId.has(parentId)) {
      fail("INVALID_LAYER_PARENT", `Layer ${layer.id} references missing parent ${parentId}.`);
    }
    const seen = new Set([String(layer.id)]);
    let cursor = parentId;
    let depth = 0;
    while (cursor && cursor !== "main-video") {
      if (seen.has(cursor)) {
        fail("INVALID_LAYER_PARENT", `Layer parenting cycle detected at ${cursor}.`);
      }
      depth += 1;
      if (depth > 8) {
        fail("INVALID_LAYER_PARENT", "Layer parenting depth cannot exceed 8 levels.");
      }
      seen.add(cursor);
      const next = byId.get(cursor);
      if (!next) {
        fail("INVALID_LAYER_PARENT", `Layer ${layer.id} ancestor ${cursor} does not exist.`);
      }
      cursor = next.parentId || null;
    }
  }
  return true;
};

export const validateStudioTrackMattes = (overlays = [], disabledIds = []) => {
  const visualOverlays = (overlays || []).filter(item => item && !item.isCaption);
  const byId = new Map(visualOverlays.map(item => [String(item.id), item]));
  const disabled = new Set((disabledIds || []).map(String));

  for (const layer of visualOverlays) {
    if (layer.keepMatteVisible !== undefined && typeof layer.keepMatteVisible !== "boolean") {
      fail("INVALID_TRACK_MATTE", `Layer ${layer.id} keepMatteVisible must be boolean.`);
    }
    const matte = layer.trackMatte;
    if (matte === undefined || matte === null) continue;
    if (typeof matte !== "object" || Array.isArray(matte)) {
      fail("INVALID_TRACK_MATTE", `Layer ${layer.id} trackMatte must be an object.`);
    }
    const extraKeys = Object.keys(matte).filter(key => !["mode", "sourceLayerId"].includes(key));
    if (extraKeys.length > 0) {
      fail("INVALID_TRACK_MATTE", `Unsupported trackMatte field ${extraKeys[0]}.`);
    }
    const mode = matte.mode || "none";
    if (!TRACK_MATTE_MODES.includes(mode)) {
      fail("INVALID_TRACK_MATTE", `Unsupported track matte mode ${String(mode)}.`);
    }
    if (mode === "none") continue;
    if (layer.isNullRig) {
      fail("INVALID_TRACK_MATTE", "A Null Rig layer cannot receive a track matte.");
    }
    const sourceId = matte.sourceLayerId ? String(matte.sourceLayerId) : "";
    if (!sourceId || sourceId === String(layer.id)) {
      fail("INVALID_TRACK_MATTE", `Layer ${layer.id} needs a distinct track matte source layer.`);
    }
    if (disabled.has(sourceId)) {
      fail("INVALID_TRACK_MATTE", `Track matte source ${sourceId} is disabled.`);
    }
    const source = byId.get(sourceId);
    if (!source) {
      fail("INVALID_TRACK_MATTE", `Track matte source ${sourceId} does not exist.`);
    }
    if (source.isNullRig) {
      fail("INVALID_TRACK_MATTE", "A Null Rig layer cannot act as a pixel track matte.");
    }
    if (source.type === 'video' && (source.colorize?.enabled || source.perspective || source.mask?.enabled || source.motionBlur?.enabled || source.layerShadow?.enabled || source.glow?.enabled || source.useOverlayAudio || source.bRollMode === 'fullscreen')) {
      fail('INVALID_TRACK_MATTE', 'Video matte sources support ordinary 2D transforms and silent pixels; disable their perspective, mask, blur, glow and shadow first.');
    }
    if (source.trackMatte?.mode && source.trackMatte.mode !== "none") {
      fail("INVALID_TRACK_MATTE", "Chained track mattes are unsupported; matte source must be direct.");
    }
  }
  return true;
};

export const isHiddenTrackMatteSource = (layer, overlays = []) => {
  if (!layer || layer.keepMatteVisible) return false;
  const targetId = String(layer.id);
  return (overlays || []).some(
    other =>
      other &&
      !other.isCaption &&
      String(other.id) !== targetId &&
      other.trackMatte?.mode &&
      other.trackMatte.mode !== "none" &&
      String(other.trackMatte.sourceLayerId) === targetId
  );
};

const deterministicPhase = (seed, octave, property) => {
  const base = (Number(seed) || 17) * 12.9898 + (octave + 1) * 78.233 + (PROPERTY_HASH_OFFSET[property] || 13);
  const raw = Math.sin(base) * 43758.5453;
  return (raw - Math.floor(raw)) * Math.PI * 2;
};

export const evaluateMotionDriverValue = ({
  driver,
  property,
  baseValue,
  time,
  layer,
  layerKeyframes = [],
}) => {
  if (!driver || driver.enabled === false) return baseValue;
  const t = Number(time) || 0;
  const startTime = Number(layer?.startTime) || 0;
  const localTime = t - startTime;
  const ordered = sortAutomationKeyframes(layerKeyframes).filter(k => k.property === property);

  if (driver.type === "loop") {
    if (ordered.length < 2) return baseValue;
    const firstTime = Number(ordered[0].time);
    const lastTime = Number(ordered[ordered.length - 1].time);
    const span = lastTime - firstTime;
    if (span <= 0.001 || t <= lastTime) return baseValue;
    const elapsed = t - firstTime;
    const cycleIndex = Math.floor(elapsed / span);
    const remainder = elapsed - cycleIndex * span;
    const wrappedTime =
      (driver.loopMode || "cycle") === "pingpong" && cycleIndex % 2 === 1
        ? lastTime - remainder
        : firstTime + remainder;
    return interpolateAutomationValue({
      keyframes: ordered,
      property,
      time: wrappedTime,
      fallback: baseValue,
    });
  }

  let delta = 0;
  if (driver.type === "wiggle") {
    const freq = Math.max(0.05, Number(driver.frequencyHz) || 2.2);
    const amp = Math.max(0, Number(driver.amplitude) || 0);
    const octaves = Math.max(1, Math.min(6, Math.round(Number(driver.octaves) || 3)));
    const seed = Number(driver.seed) || 17;
    let sum = 0;
    let norm = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      const weight = Math.pow(0.5, octave);
      const harmonic = freq * Math.pow(1.73, octave);
      const phase = deterministicPhase(seed, octave, property);
      sum += weight * Math.sin(t * Math.PI * 2 * harmonic + phase);
      norm += weight;
    }
    delta = norm > 0 ? (sum / norm) * amp : 0;
  } else if (driver.type === "spring") {
    const freq = Math.max(0.2, Number(driver.frequencyHz) || 3.2);
    const damping = Math.max(0.2, Number(driver.damping) || 5.5);
    const amount = Math.max(0, Number(driver.amount) ?? 1);
    const omega = freq * Math.PI * 2;
    if (ordered.length >= 2) {
      let anchorIdx = -1;
      for (let i = 1; i < ordered.length; i += 1) {
        if (Number(ordered[i].time) <= t) anchorIdx = i;
      }
      if (anchorIdx >= 1) {
        const anchor = ordered[anchorIdx];
        const anchorTime = Number(anchor.time);
        const dtAfter = t - anchorTime;
        if (dtAfter >= 0 && dtAfter < 8) {
          const sampleDt = Math.min(1 / 120, Math.max(0.001, (anchorTime - Number(ordered[anchorIdx - 1].time)) * 0.1));
          const vBefore = interpolateAutomationValue({
            keyframes: ordered,
            property,
            time: anchorTime - sampleDt,
            fallback: baseValue,
          });
          const velocity = (Number(anchor.value) - vBefore) / sampleDt;
          delta = amount * (velocity / omega) * Math.sin(dtAfter * omega) * Math.exp(-damping * dtAfter);
        }
      }
    } else if (localTime >= 0 && localTime < 6) {
      const defaultKick =
        property === "scale" ? -0.18 : property === "opacity" ? -0.25 : property === "rotation" ? -12 : 6;
      delta = amount * defaultKick * Math.cos(localTime * omega) * Math.exp(-damping * localTime);
    }
  } else if (driver.type === "pulse") {
    const freq = Math.max(0.05, Number(driver.frequencyHz) || 1.5);
    const amp = Number(driver.amplitude) || 0;
    const phase = ((Number(driver.phaseDeg) || 0) * Math.PI) / 180;
    const cycle = localTime * freq + phase / (Math.PI * 2);
    const frac = cycle - Math.floor(cycle);
    let wave = Math.sin(cycle * Math.PI * 2);
    if (driver.waveform === "triangle") {
      wave = 1 - 4 * Math.abs(Math.round(frac - 0.25) - (frac - 0.25));
    } else if (driver.waveform === "square") {
      wave = frac < 0.5 ? 1 : -1;
    }
    delta = amp * wave;
  } else if (driver.type === "spin") {
    const rate = Number(driver.ratePerSecond) || 0;
    delta = Math.max(0, localTime) * rate;
  } else if (driver.type === "beat_pump") {
    const bpm = Math.max(20, Number(driver.bpm) || 120);
    const period = 60 / bpm;
    const decay = Math.max(0.5, Number(driver.decay) || 8.5);
    const amount = Number(driver.amount) || 0;
    const beatPhase = ((localTime % period) + period) % period;
    delta = amount * Math.exp(-decay * beatPhase);
  }

  const [low, high] = PROPERTY_BOUNDS[property] || [-10000, 10000];
  return clamp(baseValue + delta, low, high);
};

export const evaluateLocalLayerPose = (layer, motionKeyframes = [], time = 0) => {
  const targetId = String(layer?.id ?? "main-video");
  const layerKeys = (motionKeyframes || []).filter(
    keyframe => String(keyframe?.targetId) === targetId
  );
  const pose = buildMotionAutomationStyle(layerKeys, time, layer || {});
  const drivers = layer?.motionDrivers;
  if (!drivers || typeof drivers !== "object") return pose;
  const next = { ...pose };
  for (const property of MOTION_DRIVER_PROPERTIES) {
    const driver = drivers[property];
    if (driver && driver.enabled !== false) {
      next[property] = evaluateMotionDriverValue({
        driver,
        property,
        baseValue: next[property],
        time,
        layer,
        layerKeyframes: layerKeys,
      });
    }
  }
  return next;
};

const resolveParentLayer = (parentId, byId, mainTransform) => {
  if (!parentId) return null;
  if (parentId === "main-video") {
    return mainTransform
      ? { id: "main-video", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, ...mainTransform }
      : { id: "main-video", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 };
  }
  return byId.get(String(parentId)) || null;
};

export const evaluateWorldLayerPose = (
  layer,
  overlays = [],
  motionKeyframes = [],
  time = 0,
  mainTransform = null
) => {
  const local = evaluateLocalLayerPose(layer, motionKeyframes, time);
  if (!layer?.parentId) return local;

  const byId = new Map(
    (overlays || [])
      .filter(item => item && !item.isCaption)
      .map(item => [String(item.id), item])
  );
  let wx = Number(local.x ?? 50);
  let wy = Number(local.y ?? 50);
  let wScale = Math.max(0.01, Number(local.scale ?? 1));
  let wRotation = Number(local.rotation ?? 0);

  const visited = new Set([String(layer.id)]);
  let cursorId = String(layer.parentId);
  let depth = 0;

  while (cursorId && depth < 8 && !visited.has(cursorId)) {
    visited.add(cursorId);
    const parent = resolveParentLayer(cursorId, byId, mainTransform);
    if (!parent) break;
    const pPose = evaluateLocalLayerPose(parent, motionKeyframes, time);
    const px = Number(pPose.x ?? 50);
    const py = Number(pPose.y ?? 50);
    const pScale = Math.max(0.01, Number(pPose.scale ?? 1));
    const pRot = Number(pPose.rotation ?? 0);
    const rad = (pRot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ox = wx - 50;
    const oy = wy - 50;
    wx = px + (ox * cos - oy * sin) * pScale;
    wy = py + (ox * sin + oy * cos) * pScale;
    wScale = Math.max(0.01, wScale * pScale);
    wRotation += pRot;
    cursorId = parent.parentId ? String(parent.parentId) : "";
    depth += 1;
  }

  return {
    ...local,
    x: clamp(wx, -200, 300),
    y: clamp(wy, -200, 300),
    scale: clamp(wScale, 0.02, 8),
    rotation: clamp(wRotation, -3600, 3600),
  };
};

export const reparentStudioLayerPreservingWorldPose = (
  layer,
  nextParentId,
  overlays = [],
  motionKeyframes = [],
  time = 0,
  mainTransform = null
) => {
  const cleanNextParent = nextParentId ? String(nextParentId) : null;
  const world = evaluateWorldLayerPose(layer, overlays, motionKeyframes, time, mainTransform);
  if (!cleanNextParent) {
    const updated = {
      ...layer,
      x: Number(world.x.toFixed(4)),
      y: Number(world.y.toFixed(4)),
      scale: Number(world.scale.toFixed(4)),
      rotation: Number(world.rotation.toFixed(4)),
    };
    delete updated.parentId;
    return updated;
  }

  const byId = new Map(
    (overlays || [])
      .filter(item => item && !item.isCaption)
      .map(item => [String(item.id), item])
  );
  const parentLayer = resolveParentLayer(cleanNextParent, byId, mainTransform);
  if (!parentLayer) return layer;

  // Test candidate graph for cycles before committing
  const candidateOverlays = (overlays || []).map(item =>
    String(item?.id) === String(layer.id) ? { ...item, parentId: cleanNextParent } : item
  );
  validateStudioParentGraph(candidateOverlays, mainTransform);

  const parentWorld = evaluateWorldLayerPose(
    parentLayer,
    overlays,
    motionKeyframes,
    time,
    mainTransform
  );
  const pScale = Math.max(0.01, Number(parentWorld.scale ?? 1));
  const pRot = Number(parentWorld.rotation ?? 0);
  const invRad = (-pRot * Math.PI) / 180;
  const dx = (world.x - Number(parentWorld.x ?? 50)) / pScale;
  const dy = (world.y - Number(parentWorld.y ?? 50)) / pScale;
  const lx = 50 + dx * Math.cos(invRad) - dy * Math.sin(invRad);
  const ly = 50 + dx * Math.sin(invRad) + dy * Math.cos(invRad);

  return {
    ...layer,
    parentId: cleanNextParent,
    x: Number(lx.toFixed(4)),
    y: Number(ly.toFixed(4)),
    scale: Number(Math.max(0.02, world.scale / pScale).toFixed(4)),
    rotation: Number((world.rotation - pRot).toFixed(4)),
  };
};

export const layerHasActiveMotionDrivers = layer =>
  !!(
    layer?.motionDrivers &&
    typeof layer.motionDrivers === "object" &&
    MOTION_DRIVER_PROPERTIES.some(
      prop => layer.motionDrivers[prop] && layer.motionDrivers[prop].enabled !== false
    )
  );

export const layerRequiresWorldBake = (layer, overlays = [], mainTransform = null) => {
  if (!layer) return false;
  if (layerHasActiveMotionDrivers(layer)) return true;
  if (!layer.parentId) return false;
  return true;
};

const simplifyLinearSamples = (samples, epsilon) => {
  if (samples.length <= 2) {
    if (samples.length === 2 && Math.abs(samples[0].value - samples[1].value) <= epsilon) {
      return [samples[0]];
    }
    return samples;
  }
  const keep = new Uint8Array(samples.length);
  keep[0] = 1;
  keep[samples.length - 1] = 1;
  const stack = [[0, samples.length - 1]];
  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop();
    if (endIdx - startIdx <= 1) continue;
    const first = samples[startIdx];
    const last = samples[endIdx];
    const dt = Math.max(1e-6, last.time - first.time);
    let maxErr = 0;
    let splitIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const expected = first.value + ((last.value - first.value) * (samples[i].time - first.time)) / dt;
      const err = Math.abs(samples[i].value - expected);
      if (err > maxErr) {
        maxErr = err;
        splitIdx = i;
      }
    }
    if (maxErr > epsilon && splitIdx > startIdx) {
      keep[splitIdx] = 1;
      stack.push([startIdx, splitIdx], [splitIdx, endIdx]);
    }
  }
  const reduced = samples.filter((_, index) => keep[index] === 1);
  if (reduced.length === 2 && Math.abs(reduced[0].value - reduced[1].value) <= epsilon) {
    return [reduced[0]];
  }
  return reduced;
};

export const bakeLayerMotionToKeyframes = ({
  layer,
  overlays = [],
  motionKeyframes = [],
  mainTransform = null,
  programmeDuration = 6,
  fps = 30,
  maxSamples = 240,
  properties = MOTION_DRIVER_PROPERTIES,
}) => {
  const start = Math.max(0, Number(layer?.startTime ?? 0));
  const rawDuration =
    layer?.id === "main-video"
      ? Math.max(0.2, Number(programmeDuration) || 6)
      : Math.max(0.1, Number(layer?.duration ?? programmeDuration) || 5);
  const end = Math.max(start + 0.05, start + rawDuration);
  const span = end - start;
  const rawCount = Math.max(2, Math.ceil(span * Math.max(4, Number(fps) || 30)) + 1);
  const count = Math.min(maxSamples, rawCount);

  const sampleTimes = [];
  const seenTicks = new Set();
  for (let i = 0; i < count; i += 1) {
    const t = i === count - 1 ? end : start + (span * i) / (count - 1);
    const tick = secondsToTicks(t);
    if (!seenTicks.has(tick)) {
      seenTicks.add(tick);
      sampleTimes.push(ticksToSeconds(tick));
    }
  }

  const worldSamples = sampleTimes.map(time => ({
    time,
    pose: evaluateWorldLayerPose(layer, overlays, motionKeyframes, time, mainTransform),
  }));
  const initialPose = worldSamples[0]?.pose || evaluateWorldLayerPose(layer, overlays, motionKeyframes, start, mainTransform);

  const bakedKeys = [];
  for (const property of properties) {
    const epsilon = property === "scale" || property === "opacity" ? 0.0008 : 0.02;
    const rawSeries = worldSamples.map(entry => ({
      time: entry.time,
      value: Number(entry.pose[property]),
    }));
    const simplified = simplifyLinearSamples(rawSeries, epsilon);
    if (simplified.length <= 1) continue;
    simplified.forEach((sample, idx) => {
      bakedKeys.push({
        id: `baked-${layer.id}-${property}-${idx}`,
        targetId: String(layer.id),
        property,
        time: Number(sample.time.toFixed(6)),
        value: Number(sample.value.toFixed(6)),
        easing: "linear",
      });
    });
  }

  return {
    initialPose,
    keyframes: bakedKeys,
  };
};

const escapeXml = value =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildTrackMatteStageSvgDataUri = ({
  matteLayer,
  overlays = [],
  motionKeyframes = [],
  mainTransform = null,
  mode = "alpha",
  time = 0,
  stageAspect = 9 / 16,
}) => {
  if (!matteLayer || !mode || mode === "none") return "";
  const pose = evaluateWorldLayerPose(matteLayer, overlays, motionKeyframes, time, mainTransform);
  if(pose.mask)matteLayer={...matteLayer,mask:pose.mask};
  const start = Number(matteLayer.startTime ?? 0);
  const end = start + Math.max(0.05, Number(matteLayer.duration ?? 9999));
  const inWindow = time >= start && time < end;
  const inverted = mode === "alpha_inverted" || mode === "luma_inverted";
  const isLuma = mode === "luma" || mode === "luma_inverted";

  const safeAspect = Number.isFinite(Number(stageAspect)) && Number(stageAspect) > 0.05 ? Number(stageAspect) : 9 / 16;
  const vw = 1000;
  const vh = Math.max(100, Math.round(vw / safeAspect));
  const cx = (Number(pose.x ?? 50) / 100) * vw;
  const cy = (Number(pose.y ?? 50) / 100) * vh;
  const scale = Math.max(0.01, Number(pose.scale ?? 1));
  const rot = Number(pose.rotation ?? 0);
  const opacity = inWindow ? clamp(pose.opacity ?? 1, 0, 1) : 0;
  const w = Math.max(4, (Number(matteLayer.width || (matteLayer.type === "text" ? 68 : 35)) / 100) * vw * scale);
  const h = Math.max(4, (Number(matteLayer.height || (matteLayer.type === "text" ? 18 : 35)) / 100) * vh * scale);
  const ax = clamp(matteLayer.anchorX ?? 50, 0, 100) / 100;
  const ay = clamp(matteLayer.anchorY ?? 50, 0, 100) / 100;
  const x = -w * ax;
  const y = -h * ay;

  const fillColor = isLuma ? escapeXml(matteLayer.color || "#ffffff") : "#ffffff";
  let shapeMarkup = "";
  if (matteLayer.type === 'video' || (matteLayer.type==='image'&&!matteLayer.mask?.enabled&&!matteLayer.vectorShape&&(matteLayer.src||matteLayer.url))) {
    // The decoded-frame painter replaces this transparent initial mask. An
    // unloaded movie must never masquerade as an opaque rectangular matte.
    return 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`) + '")';
  } else if (matteLayer.type === "text" && String(matteLayer.text || "").trim()) {
    const bgFill =
      matteLayer.bg && matteLayer.bg !== "transparent"
        ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="18" fill="${isLuma ? escapeXml(matteLayer.bg) : "#ffffff"}" />`
        : "";
    const nativeTitle = studioTitleMatteMarkup(matteLayer, pose, safeAspect, time, fillColor);
    shapeMarkup = `${bgFill}<g transform="scale(${vh/720})">${nativeTitle || `<text x="0" y="13" text-anchor="middle" font-family="Inter, sans-serif" font-weight="${Number(matteLayer.fontWeight || 900)}" font-size="36" fill="${fillColor}">${escapeXml(matteLayer.text)}</text>`}</g>`;
  } else if (matteLayer.mask?.enabled && matteLayer.mask.shape === "ellipse") {
    shapeMarkup = `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w * 0.48).toFixed(1)}" ry="${(h * 0.48).toFixed(1)}" fill="${fillColor}" />`;
  } else if (matteLayer.mask?.enabled && matteLayer.mask.shape === "polygon") {
    const rawPath = String(matteLayer.mask.path || "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)");
    const match = rawPath.trim().match(/^polygon\((.+)\)$/i);
    const pts = (match ? match[1].split(",") : [])
      .map(pair => {
        const m = pair.trim().match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
        if (!m) return null;
        return `${(x + (Number(m[1]) / 100) * w).toFixed(2)},${(y + (Number(m[2]) / 100) * h).toFixed(2)}`;
      })
      .filter(Boolean);
    shapeMarkup = pts.length >= 3
      ? `<polygon points="${pts.join(" ")}" fill="${fillColor}" />`
      : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fillColor}" />`;
  } else {
    const rawRadius = matteLayer.frameShape === "edge"
      ? 0
      : clamp(Number(matteLayer.borderRadius ?? 28), 12, 48) / 4;
    const rx = rawRadius > 0 ? Math.min(w * 0.5, h * 0.5, (rawRadius / 100) * Math.min(w, h)) : 0;
    shapeMarkup = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(2)}" fill="${fillColor}" />`;
  }

  const filterDef = isLuma
    ? `<filter id="tm-op"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  ${inverted ? "-0.2126 -0.7152 -0.0722 1" : "0.2126 0.7152 0.0722 0"} 0"/></filter>`
    : inverted
      ? `<filter id="tm-op"><feComponentTransfer><feFuncA type="table" tableValues="1 0"/></feComponentTransfer></filter>`
      : "";

  const baseBackdrop = isLuma
    ? `<rect width="${vw}" height="${vh}" fill="#000000" fill-opacity="1"/>`
    : `<rect width="${vw}" height="${vh}" fill="#ffffff" fill-opacity="0"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none"><defs>${filterDef}</defs><g${filterDef ? ' filter="url(#tm-op)"' : ""}>${baseBackdrop}<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${rot.toFixed(2)})" opacity="${opacity.toFixed(4)}">${shapeMarkup}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
