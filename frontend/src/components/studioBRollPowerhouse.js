import { sortAutomationKeyframes } from "./studioAutomation";
import { findNearestBeat } from "./studioBeatEngine";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export const BROLL_LAYOUT_PRESETS = Object.freeze([
  {
    id: "fullscreen_cutaway",
    label: "Fullscreen Cutaway",
    badge: "FULL",
    summary: "Edge-to-edge full frame story cutaway",
    bRollMode: "fullscreen",
  },
  {
    id: "pip_top_right",
    label: "Top-Right Proof Card",
    badge: "TR",
    summary: "Floating upper-right documentary evidence card",
    bRollMode: "pip",
  },
  {
    id: "pip_bottom_right",
    label: "Bottom-Right Callout",
    badge: "BR",
    summary: "Lower-right floating reaction or product insert",
    bRollMode: "pip",
  },
  {
    id: "pip_top_left",
    label: "Top-Left Evidence",
    badge: "TL",
    summary: "Upper-left floating story callout card",
    bRollMode: "pip",
  },
  {
    id: "pip_center_showcase",
    label: "Center Hero Showcase",
    badge: "HERO",
    summary: "Large centered hero proof frame with deep cinema shadow",
    bRollMode: "pip",
  },
  {
    id: "split_right_half",
    label: "Right Split 50/50",
    badge: "R-50",
    summary: "Right-half vertical split screen",
    bRollMode: "sideBySide",
  },
  {
    id: "split_left_half",
    label: "Left Split 50/50",
    badge: "L-50",
    summary: "Left-half vertical split screen",
    bRollMode: "sideBySide",
  },
  {
    id: "split_top_half",
    label: "Top Split 50/50",
    badge: "T-50",
    summary: "Upper-half horizontal split screen",
    bRollMode: "pip",
  },
  {
    id: "split_bottom_half",
    label: "Bottom Split 50/50",
    badge: "B-50",
    summary: "Lower-half horizontal split screen",
    bRollMode: "pip",
  },
  {
    id: "circle_portal",
    label: "Circle Spotlight Portal",
    badge: "ORB",
    summary: "Circular feathered spotlight portal with cyan rim glow",
    bRollMode: "pip",
  },
]);

export function applyBRollLayoutPreset(overlay = {}, presetId = "fullscreen_cutaway") {
  const preset = BROLL_LAYOUT_PRESETS.find(item => item.id === presetId);
  if (!preset) throw new Error(`Unknown B-roll layout preset: ${presetId}`);

  const base = {
    ...overlay,
    bRollMode: preset.bRollMode,
    mediaFit: overlay.mediaFit || "cover",
  };

  if (presetId === "fullscreen_cutaway") {
    return {
      ...base,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      scale: 1,
      rotation: 0,
      frameShape: "edge",
      coverMainVideo: true,
      mask: { ...(overlay.mask || {}), enabled: false },
    };
  }

  if (presetId === "pip_top_right") {
    return {
      ...base,
      x: 74,
      y: 24,
      width: 42,
      height: 34,
      scale: 1,
      rotation: 0,
      frameShape: "round",
      borderRadius: 28,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
      layerShadow: {
        enabled: true,
        color: "#020617",
        blur: 24,
        opacity: 0.62,
        x: 0,
        y: 10,
      },
    };
  }

  if (presetId === "pip_bottom_right") {
    return {
      ...base,
      x: 74,
      y: 74,
      width: 42,
      height: 34,
      scale: 1,
      rotation: 0,
      frameShape: "round",
      borderRadius: 28,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
      layerShadow: {
        enabled: true,
        color: "#020617",
        blur: 24,
        opacity: 0.62,
        x: 0,
        y: 10,
      },
    };
  }

  if (presetId === "pip_top_left") {
    return {
      ...base,
      x: 26,
      y: 24,
      width: 42,
      height: 34,
      scale: 1,
      rotation: 0,
      frameShape: "round",
      borderRadius: 28,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
      layerShadow: {
        enabled: true,
        color: "#020617",
        blur: 24,
        opacity: 0.62,
        x: 0,
        y: 10,
      },
    };
  }

  if (presetId === "pip_center_showcase") {
    return {
      ...base,
      x: 50,
      y: 46,
      width: 76,
      height: 52,
      scale: 1,
      rotation: 0,
      frameShape: "round",
      borderRadius: 32,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
      layerShadow: {
        enabled: true,
        color: "#020617",
        blur: 32,
        opacity: 0.72,
        x: 0,
        y: 14,
      },
    };
  }

  if (presetId === "split_right_half") {
    return {
      ...base,
      x: 75,
      y: 50,
      width: 50,
      height: 100,
      scale: 1,
      rotation: 0,
      frameShape: "edge",
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
    };
  }

  if (presetId === "split_left_half") {
    return {
      ...base,
      x: 25,
      y: 50,
      width: 50,
      height: 100,
      scale: 1,
      rotation: 0,
      frameShape: "edge",
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
    };
  }

  if (presetId === "split_top_half") {
    return {
      ...base,
      x: 50,
      y: 25,
      width: 100,
      height: 50,
      scale: 1,
      rotation: 0,
      frameShape: "edge",
      borderRadius: 12,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
    };
  }

  if (presetId === "split_bottom_half") {
    return {
      ...base,
      x: 50,
      y: 75,
      width: 100,
      height: 50,
      scale: 1,
      rotation: 0,
      frameShape: "edge",
      borderRadius: 12,
      coverMainVideo: false,
      mask: { ...(overlay.mask || {}), enabled: false },
    };
  }

  if (presetId === "circle_portal") {
    return {
      ...base,
      x: 72,
      y: 28,
      width: 38,
      height: 38,
      scale: 1,
      rotation: 0,
      frameShape: "round",
      borderRadius: 48,
      coverMainVideo: false,
      mask: {
        enabled: true,
        shape: "ellipse",
        feather: 4,
        inverted: false,
      },
      glow: {
        enabled: true,
        color: "#38bdf8",
        radius: 14,
        intensity: 0.45,
      },
      layerShadow: {
        enabled: true,
        color: "#020617",
        blur: 22,
        opacity: 0.6,
        x: 0,
        y: 10,
      },
    };
  }

  return base;
}

export const BROLL_CHOREOGRAPHY_PRESETS = Object.freeze([
  {
    id: "whip_pan_cutaway",
    label: "Whip-Pan Cutaway",
    summary: "High-velocity horizontal whip entrance with shutter motion blur",
  },
  {
    id: "cinema_push_in",
    label: "Cinema Slow Push-In",
    summary: "Gradual documentary scale push (1.0x -> 1.14x) with smooth dissolve",
  },
  {
    id: "elastic_pop_card",
    label: "Elastic Pop Card",
    summary: "Overshoot spring pop-in and gentle exit settle",
  },
  {
    id: "floating_parallax_card",
    label: "Zero-G Floating Card",
    summary: "Weightless sine drift across X, Y and Rotation with soft fade",
  },
  {
    id: "impact_slam_zoom",
    label: "Impact Slam Zoom",
    summary: "High-energy 1.35x -> 1.0x impact drop on entrance",
  },
  {
    id: "slide_up_editorial",
    label: "Editorial Rise-In",
    summary: "Clean vertical editorial rise with smooth ease-out curve",
  },
]);

export function applyBRollChoreographyPreset({
  overlay,
  keyframes = [],
  presetId = "cinema_push_in",
  createId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
} = {}) {
  if (!overlay || !overlay.id) throw new Error("Select a B-roll layer first.");
  const preset = BROLL_CHOREOGRAPHY_PRESETS.find(item => item.id === presetId);
  if (!preset) throw new Error(`Unknown B-roll choreography preset: ${presetId}`);

  const targetId = String(overlay.id);
  const start = Math.max(0, Number(overlay.startTime ?? overlay.start_time ?? 0));
  const duration = Math.max(0.4, Number(overlay.duration ?? 3));
  const end = start + duration;
  const enterDur = Math.min(0.42, duration * 0.25);
  const exitDur = Math.min(0.35, duration * 0.22);
  const t0 = Number(start.toFixed(3));
  const tIn = Number((start + enterDur).toFixed(3));
  const tOut = Number(Math.max(tIn + 0.05, end - exitDur).toFixed(3));
  const tEnd = Number(end.toFixed(3));

  const baseX = clamp(overlay.x ?? 50, 0, 100);
  const baseY = clamp(overlay.y ?? 50, 0, 100);
  const baseScale = clamp(overlay.scale ?? 1, 0.1, 4);
  const baseRot = clamp(overlay.rotation ?? 0, -180, 180);
  const baseOpacity = clamp(overlay.opacity ?? 1, 0.05, 1);

  const retained = (keyframes || []).filter(
    k =>
      String(k.targetId) !== targetId ||
      !["x", "y", "scale", "rotation", "opacity"].includes(k.property)
  );
  const generated = [];

  const addSeries = (property, points) => {
    for (const pt of points) {
      generated.push({
        id: createId(`kf-${targetId}-${property}`),
        targetId,
        property,
        time: pt.time,
        value: Number(pt.value.toFixed(4)),
        easing: pt.easing || "bezier",
        ...(pt.curve ? { curve: [...pt.curve] } : {}),
      });
    }
  };

  let nextOverlay = {
    ...overlay,
    animation: {
      enter: "fade",
      exit: "fade",
      enterDuration: Number(enterDur.toFixed(2)),
      exitDuration: Number(exitDur.toFixed(2)),
    },
  };

  if (presetId === "whip_pan_cutaway") {
    const startX = clamp(baseX - 24, 0, 100);
    const endX = clamp(baseX + 18, 0, 100);
    addSeries("x", [
      { time: t0, value: startX, easing: "bezier", curve: [0.12, 0.96, 0.24, 1] },
      { time: tIn, value: baseX, easing: "bezier", curve: [0.16, 1.22, 0.3, 1] },
      { time: tOut, value: baseX, easing: "hold" },
      { time: tEnd, value: endX, easing: "ease_in" },
    ]);
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      animation: { ...nextOverlay.animation, enter: "slideLeft", exit: "fade" },
      motionBlur: { enabled: true, samples: 6, shutter: 0.65 },
    };
  } else if (presetId === "cinema_push_in") {
    addSeries("scale", [
      { time: t0, value: baseScale, easing: "linear" },
      { time: tEnd, value: clamp(baseScale * 1.14, 0.1, 4), easing: "ease_out" },
    ]);
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      kenBurns: nextOverlay.type === "image" ? "zoomIn" : nextOverlay.kenBurns,
      animation: { ...nextOverlay.animation, enter: "zoom", exit: "fade" },
    };
  } else if (presetId === "elastic_pop_card") {
    addSeries("scale", [
      { time: t0, value: Math.max(0.15, baseScale * 0.38), easing: "bezier", curve: [0.34, 1.56, 0.64, 1] },
      { time: tIn, value: baseScale, easing: "bezier", curve: [0.34, 1.56, 0.64, 1] },
      { time: tOut, value: baseScale, easing: "hold" },
      { time: tEnd, value: Math.max(0.15, baseScale * 0.82), easing: "ease_in" },
    ]);
    addSeries("rotation", [
      { time: t0, value: baseRot - 8, easing: "bezier", curve: [0.34, 1.56, 0.64, 1] },
      { time: tIn, value: baseRot, easing: "bezier", curve: [0.34, 1.56, 0.64, 1] },
      { time: tOut, value: baseRot, easing: "hold" },
      { time: tEnd, value: baseRot + 4, easing: "ease_in" },
    ]);
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      animation: { ...nextOverlay.animation, enter: "pop", exit: "fade" },
    };
  } else if (presetId === "floating_parallax_card") {
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      motionDrivers: {
        ...(nextOverlay.motionDrivers || {}),
        x: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 0.45, amplitude: 2.4, phaseDeg: 0 },
        y: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 0.65, amplitude: 3.2, phaseDeg: 90 },
        rotation: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 0.35, amplitude: 2.5, phaseDeg: 45 },
      },
    };
  } else if (presetId === "impact_slam_zoom") {
    addSeries("scale", [
      { time: t0, value: clamp(baseScale * 1.36, 0.2, 4), easing: "bezier", curve: [0.12, 0.92, 0.22, 1] },
      { time: tIn, value: baseScale, easing: "bezier", curve: [0.16, 1.28, 0.3, 1] },
      { time: tOut, value: baseScale, easing: "hold" },
      { time: tEnd, value: clamp(baseScale * 1.08, 0.2, 4), easing: "ease_in" },
    ]);
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      animation: { ...nextOverlay.animation, enter: "zoom", exit: "fade" },
      motionBlur: { enabled: true, samples: 5, shutter: 0.5 },
    };
  } else if (presetId === "slide_up_editorial") {
    const startY = clamp(baseY + 18, 0, 100);
    const endY = clamp(baseY - 10, 0, 100);
    addSeries("y", [
      { time: t0, value: startY, easing: "bezier", curve: [0.22, 1, 0.36, 1] },
      { time: tIn, value: baseY, easing: "bezier", curve: [0.22, 1, 0.36, 1] },
      { time: tOut, value: baseY, easing: "hold" },
      { time: tEnd, value: endY, easing: "ease_in" },
    ]);
    addSeries("opacity", [
      { time: t0, value: 0, easing: "ease_out" },
      { time: tIn, value: baseOpacity, easing: "hold" },
      { time: tOut, value: baseOpacity, easing: "hold" },
      { time: tEnd, value: 0, easing: "ease_in" },
    ]);
    nextOverlay = {
      ...nextOverlay,
      animation: { ...nextOverlay.animation, enter: "slideUp", exit: "fade" },
    };
  }

  return {
    overlay: nextOverlay,
    keyframes: sortAutomationKeyframes([...retained, ...generated]),
  };
}

export const BROLL_AUDIO_CUT_PRESETS = Object.freeze([
  {
    id: "silent_visual_proof",
    label: "Silent Visual Proof",
    summary: "100% original speech; B-roll plays silently as visual evidence",
  },
  {
    id: "voice_first_duck",
    label: "Voice-First Ambience (25%)",
    summary: "Original voice with 25% cutaway audio and 20% voice ducking",
  },
  {
    id: "nat_sound_takeover",
    label: "Nat-Sound Takeover (95%)",
    summary: "Ducks main track by 75% so the B-roll sound effect/action takes center stage",
  },
  {
    id: "j_cut_lead_in",
    label: "Earlier Cutaway (-0.35s)",
    summary: "Starts the cutaway 0.35s earlier with a a visual lead-in and mixed cutaway audio",
  },
  {
    id: "l_cut_trail_out",
    label: "Extend Visual Tail (+0.45s)",
    summary: "Extends the cutaway 0.45s longer so the visual lingers across the spoken transition",
  },
]);

export function applyBRollAudioCutPreset(
  overlay = {},
  presetId = "silent_visual_proof",
  programmeDuration = 30
) {
  const preset = BROLL_AUDIO_CUT_PRESETS.find(item => item.id === presetId);
  if (!preset) throw new Error(`Unknown B-roll audio cut preset: ${presetId}`);

  const maxDur = Math.max(0.5, Number(programmeDuration) || 30);
  const currentStart = Math.max(0, Number(overlay.startTime ?? overlay.start_time ?? 0));
  const currentDuration = Math.max(0.3, Number(overlay.duration ?? 3));

  if (presetId === "silent_visual_proof") {
    return {
      ...overlay,
      muteMainAudio: false,
      useOverlayAudio: false,
      mixAudio: false,
      audioDucking: false,
      overlayAudioVolume: 0,
    };
  }

  if (presetId === "voice_first_duck") {
    return {
      ...overlay,
      muteMainAudio: false,
      useOverlayAudio: true,
      mixAudio: true,
      audioDucking: true,
      audioDuckingStrength: 0.2,
      overlayAudioVolume: 0.25,
    };
  }

  if (presetId === "nat_sound_takeover") {
    return {
      ...overlay,
      muteMainAudio: false,
      useOverlayAudio: true,
      mixAudio: true,
      audioDucking: true,
      audioDuckingStrength: 0.75,
      overlayAudioVolume: 0.95,
    };
  }

  if (presetId === "j_cut_lead_in") {
    const nextStart = Number(Math.max(0, currentStart - 0.35).toFixed(2));
    const shift = currentStart - nextStart;
    const nextDuration = Number(Math.min(maxDur - nextStart, currentDuration + shift).toFixed(2));
    return {
      ...overlay,
      startTime: nextStart,
      duration: Math.max(0.3, nextDuration),
      ...(overlay.type === "video" && Number(overlay.sourceDuration) > 0 && nextDuration > Number(overlay.sourceDuration) - Number(overlay.sourceStartTime || 0) - Number(overlay.sourceOffsetTime || 0) ? {sourceEndBehavior:"hold"} : {}),
      muteMainAudio: false,
      useOverlayAudio: overlay.type === "video",
      mixAudio: overlay.type === "video",
      audioDucking: overlay.type === "video",
      audioDuckingStrength: 0.35,
      overlayAudioVolume: 0.45,
      animation: {
        ...(overlay.animation || {}),
        enter: "fade",
        enterDuration: 0.35,
      },
    };
  }

  if (presetId === "l_cut_trail_out") {
    const nextDuration = Number(
      Math.min(Math.max(0.3, maxDur - currentStart), currentDuration + 0.45).toFixed(2)
    );
    return {
      ...overlay,
      duration: Math.max(0.3, nextDuration),
      ...(overlay.type === "video" && Number(overlay.sourceDuration) > 0 && nextDuration > Number(overlay.sourceDuration) - Number(overlay.sourceStartTime || 0) - Number(overlay.sourceOffsetTime || 0) ? {sourceEndBehavior:"hold"} : {}),
      animation: {
        ...(overlay.animation || {}),
        exit: "fade",
        exitDuration: 0.45,
      },
    };
  }

  return overlay;
}

export const BROLL_LOOK_POLISH_PRESETS = Object.freeze([
  {
    id: "clean_natural",
    label: "Clean Natural",
    summary: "Unaltered source color with subtle elevation shadow",
  },
  {
    id: "cinema_warm_match",
    label: "Warm Cinema Match",
    summary: "Golden tungsten warmth + contrast boost to match graded A-roll",
  },
  {
    id: "cool_tech_glass",
    label: "Cool Cyber Glass",
    summary: "Crisp cyan tint + glowing border + deep floating shadow",
  },
  {
    id: "noir_archival_proof",
    label: "Archival Contrast",
    summary: "Cool silver tint and stronger contrast for archival inserts",
  },
  {
    id: "golden_spotlight",
    label: "Golden Rim Spotlight",
    summary: "Warm gold outer rim glow + deep studio drop shadow",
  },
]);

export function applyBRollLookPolishPreset(overlay = {}, presetId = "clean_natural") {
  const preset = BROLL_LOOK_POLISH_PRESETS.find(item => item.id === presetId);
  if (!preset) throw new Error(`Unknown B-roll look polish preset: ${presetId}`);

  if (presetId === "clean_natural") {
    return {
      ...overlay,
      colorize: {
        enabled: false,
        color: "#38bdf8",
        strength: 0,
        gamma: 1,
        lift: 0,
        contrast: 1,
      },
      glow: { enabled: false, color: "#8b5cf6", radius: 0, intensity: 0 },
      layerShadow:
        overlay.bRollMode === "fullscreen"
          ? { enabled: false, color: "#000000", blur: 0, opacity: 0, x: 0, y: 0 }
          : { enabled: true, color: "#020617", blur: 20, opacity: 0.5, x: 0, y: 8 },
    };
  }

  if (presetId === "cinema_warm_match") {
    return {
      ...overlay,
      colorize: {
        enabled: true,
        color: "#f59e0b",
        strength: 0.16,
        gamma: 1,
        lift: .02,
        contrast: 1.08,
      },
      glow: { enabled: false, color: "#f59e0b", radius: 0, intensity: 0 },
    };
  }

  if (presetId === "cool_tech_glass") {
    return {
      ...overlay,
      colorize: {
        enabled: true,
        color: "#38bdf8",
        strength: 0.18,
        gamma: 1,
        lift: .02,
        contrast: 1.12,
      },
      glow: { enabled: true, color: "#38bdf8", radius: 16, intensity: 0.45 },
      layerShadow: { enabled: true, color: "#020617", blur: 28, opacity: 0.68, x: 0, y: 12 },
    };
  }

  if (presetId === "noir_archival_proof") {
    return {
      ...overlay,
      colorize: {
        enabled: true,
        color: "#cbd5e1",
        strength: 0.25,
        gamma: .98,
        lift: 0,
        contrast: 1.25,
      },
    };
  }

  if (presetId === "golden_spotlight") {
    return {
      ...overlay,
      glow: { enabled: true, color: "#facc15", radius: 18, intensity: 0.55 },
      layerShadow: { enabled: true, color: "#020617", blur: 30, opacity: 0.7, x: 0, y: 14 },
    };
  }

  return overlay;
}

const KEN_BURNS_CYCLE = ["zoomIn", "panRight", "zoomOut", "panLeft", "panUp"];
const PIP_CORNER_CYCLE = ["pip_top_right", "pip_bottom_right", "pip_top_left", "pip_center_showcase"];

export function buildBRollBeatMontage({
  overlays = [],
  keyframes = [],
  beatMarkers = [],
  startTime = 0,
  clipDuration = 2.0,
  mode = "sequential_montage", // "sequential_montage" | "cycle_corners" | "cinema_push_all"
  programmeDuration = 30,
  createId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
} = {}) {
  const isBRoll = item =>
    item &&
    !item.isCaption &&
    !item.isNullRig &&
    (Boolean(item.bRollMode) || ["video", "image"].includes(item.type)) &&
    !item.vectorShape;

  const brollItems = overlays.filter(isBRoll);
  if (!brollItems.length) {
    return { overlays, keyframes, updatedCount: 0 };
  }

  const orderedIds = brollItems
    .slice()
    .sort((a, b) => Number(a.startTime ?? 0) - Number(b.startTime ?? 0))
    .map(item => String(item.id));
  const rankById = new Map(orderedIds.map((id, idx) => [id, idx]));

  let runningTime = Math.max(0, Number(startTime) || 0);
  const stepDur = Math.max(0.5, Number(clipDuration) || 2.0);
  const maxTime = Math.max(1, Number(programmeDuration) || 30);
  let nextKeyframes = [...keyframes];

  const sequentialSlots = orderedIds.map(() => {
    if (runningTime >= maxTime - .1) return null;
    let clipStart = runningTime;
    if (beatMarkers.length) {
      const snapped = findNearestBeat(clipStart, beatMarkers, 0.4);
      if (snapped.isSnapped && snapped.time >= runningTime && snapped.time < maxTime - .1) clipStart = snapped.time;
    }
    let clipEnd = Math.min(maxTime, clipStart + stepDur);
    if (beatMarkers.length) {
      const snappedEnd = findNearestBeat(clipEnd, beatMarkers, 0.4);
      if (snappedEnd.isSnapped && snappedEnd.time <= maxTime && snappedEnd.time > clipStart + 0.1) {
        clipEnd = snappedEnd.time;
      }
    }
    const dur = Number(Math.max(0.1, clipEnd - clipStart).toFixed(2));
    runningTime = Number((clipStart + dur).toFixed(2));
    return {
      startTime: Number(clipStart.toFixed(2)),
      duration: dur,
    };
  });

  const nextOverlays = overlays.map(item => {
    if (!isBRoll(item)) return item;
    const idx = rankById.get(String(item.id)) ?? 0;
    let updated = { ...item, bRollMode: item.bRollMode || "fullscreen" };

    if (mode === "sequential_montage") {
      const slot = sequentialSlots[idx];
      if (!slot) return item;
      updated = {
        ...updated,
        startTime: slot.startTime,
        duration: slot.duration,
        kenBurns: updated.type === "image" ? KEN_BURNS_CYCLE[idx % KEN_BURNS_CYCLE.length] : updated.kenBurns,
      };
      const choreo = applyBRollChoreographyPreset({
        overlay: updated,
        keyframes: nextKeyframes,
        presetId: idx % 2 === 0 ? "cinema_push_in" : "whip_pan_cutaway",
        createId,
      });
      updated = choreo.overlay;
      nextKeyframes = choreo.keyframes;
    } else if (mode === "cycle_corners") {
      const presetId = PIP_CORNER_CYCLE[idx % PIP_CORNER_CYCLE.length];
      updated = applyBRollLayoutPreset(updated, presetId);
    } else if (mode === "cinema_push_all") {
      const choreo = applyBRollChoreographyPreset({
        overlay: updated,
        keyframes: nextKeyframes,
        presetId: "cinema_push_in",
        createId,
      });
      updated = choreo.overlay;
      nextKeyframes = choreo.keyframes;
    }

    return updated;
  });

  return {
    overlays: nextOverlays,
    keyframes: nextKeyframes,
    updatedCount: mode === "sequential_montage" ? sequentialSlots.filter(Boolean).length : brollItems.length,
  };
}
