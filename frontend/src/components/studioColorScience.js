const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

export const CAMERA_COLOR_PROFILES = Object.freeze([
  { id: "rec709", label: "Rec.709 (Standard)" },
  { id: "apple_log", label: "Apple Log (iPhone Pro)" },
  { id: "sony_slog3", label: "Sony S-Log3 / S-Gamut3.Cine" },
  { id: "dji_dlog", label: "DJI D-Log M" },
  { id: "canon_clog", label: "Canon C-Log2" },
  { id: "hlg_hdr", label: "HDR HLG -> Rec.709" },
]);

export const LOUDNESS_STANDARDS = Object.freeze({
  social: { targetLufs: -14, truePeakDbtp: -1 },
  podcast: { targetLufs: -16, truePeakDbtp: -1 },
  broadcast: { targetLufs: -23, truePeakDbtp: -1 },
});

export const HSL_QUALIFIER_PRESETS = Object.freeze({
  skin_isolate: {
    enabled: true,
    label: "Skin Tone Qualifier",
    targetCategory: "body",
    hueCenter: 0.075,
    hueWidth: 0.08,
    satMin: 0.16,
    satMax: 0.78,
    lumMin: 0.14,
    lumMax: 0.88,
    softness: 0.24,
    invert: false,
    showMatte: false,
    hueShift: 0,
    saturation: 1.05,
    gain: 1.04,
    exposureStops: 0.08,
    temperature: 0.06,
    desaturateOutside: 0,
    colorizeColor: "",
    colorizeStrength: 0,
  },
  skin_radiance: {
    enabled: true,
    label: "Body & Skin Golden Radiance",
    targetCategory: "body",
    hueCenter: 0.07,
    hueWidth: 0.09,
    satMin: 0.14,
    satMax: 0.82,
    lumMin: 0.12,
    lumMax: 0.92,
    softness: 0.26,
    invert: false,
    showMatte: false,
    hueShift: 0.005,
    saturation: 1.12,
    gain: 1.08,
    exposureStops: 0.15,
    temperature: 0.14,
    desaturateOutside: 0,
    colorizeColor: "",
    colorizeStrength: 0,
  },
  garment_crimson: {
    enabled: true,
    label: "Red / Garment & Lips Recolor",
    targetCategory: "object",
    hueCenter: 0.99,
    hueWidth: 0.085,
    satMin: 0.24,
    satMax: 1.0,
    lumMin: 0.08,
    lumMax: 0.94,
    softness: 0.22,
    invert: false,
    showMatte: false,
    hueShift: 0,
    saturation: 1.32,
    gain: 1.06,
    exposureStops: 0.1,
    temperature: 0.05,
    desaturateOutside: 0,
    colorizeColor: "#e11d48",
    colorizeStrength: 0.25,
  },
  garment_cobalt: {
    enabled: true,
    label: "Cobalt / Denim & Vehicle Pop",
    targetCategory: "object",
    hueCenter: 0.61,
    hueWidth: 0.11,
    satMin: 0.2,
    satMax: 1.0,
    lumMin: 0.08,
    lumMax: 0.94,
    softness: 0.24,
    invert: false,
    showMatte: false,
    hueShift: -0.01,
    saturation: 1.35,
    gain: 1.05,
    exposureStops: 0.08,
    temperature: -0.08,
    desaturateOutside: 0,
    colorizeColor: "#2563eb",
    colorizeStrength: 0.22,
  },
  gold_amber_object: {
    enabled: true,
    label: "Amber / Gold Product & Jewelry",
    targetCategory: "object",
    hueCenter: 0.13,
    hueWidth: 0.09,
    satMin: 0.2,
    satMax: 1.0,
    lumMin: 0.15,
    lumMax: 0.96,
    softness: 0.24,
    invert: false,
    showMatte: false,
    hueShift: -0.01,
    saturation: 1.3,
    gain: 1.1,
    exposureStops: 0.12,
    temperature: 0.16,
    desaturateOutside: 0,
    colorizeColor: "#f59e0b",
    colorizeStrength: 0.2,
  },
  violet_neon_accent: {
    enabled: true,
    label: "Violet / Cyber Neon Object",
    targetCategory: "object",
    hueCenter: 0.78,
    hueWidth: 0.11,
    satMin: 0.2,
    satMax: 1.0,
    lumMin: 0.1,
    lumMax: 0.96,
    softness: 0.25,
    invert: false,
    showMatte: false,
    hueShift: 0.015,
    saturation: 1.38,
    gain: 1.08,
    exposureStops: 0.1,
    temperature: -0.05,
    desaturateOutside: 0,
    colorizeColor: "#8b5cf6",
    colorizeStrength: 0.28,
  },
  sky_enhance: {
    enabled: true,
    label: "Cyan / Sky Pop",
    targetCategory: "environment",
    hueCenter: 0.57,
    hueWidth: 0.11,
    satMin: 0.22,
    satMax: 1.0,
    lumMin: 0.2,
    lumMax: 0.95,
    softness: 0.28,
    invert: false,
    showMatte: false,
    hueShift: -0.015,
    saturation: 1.28,
    gain: 0.96,
    exposureStops: -0.08,
    temperature: -0.06,
    desaturateOutside: 0,
    colorizeColor: "",
    colorizeStrength: 0,
  },
  foliage_pop: {
    enabled: true,
    label: "Emerald Foliage",
    targetCategory: "environment",
    hueCenter: 0.33,
    hueWidth: 0.12,
    satMin: 0.18,
    satMax: 1.0,
    lumMin: 0.1,
    lumMax: 0.9,
    softness: 0.25,
    invert: false,
    showMatte: false,
    hueShift: 0.02,
    saturation: 1.22,
    gain: 1.0,
    exposureStops: 0.04,
    temperature: -0.04,
    desaturateOutside: 0,
    colorizeColor: "",
    colorizeStrength: 0,
  },
  sin_city_red_splash: {
    enabled: true,
    label: "Color Splash · Red Object Only (B&W Outside)",
    targetCategory: "splash",
    hueCenter: 0.99,
    hueWidth: 0.09,
    satMin: 0.25,
    satMax: 1.0,
    lumMin: 0.08,
    lumMax: 0.95,
    softness: 0.2,
    invert: false,
    showMatte: false,
    hueShift: 0,
    saturation: 1.42,
    gain: 1.08,
    exposureStops: 0.12,
    temperature: 0.08,
    desaturateOutside: 1.0,
    colorizeColor: "",
    colorizeStrength: 0,
  },
  spotlight_skin_splash: {
    enabled: true,
    label: "Color Splash · Subject Skin & Warmth Only",
    targetCategory: "splash",
    hueCenter: 0.075,
    hueWidth: 0.095,
    satMin: 0.15,
    satMax: 0.85,
    lumMin: 0.12,
    lumMax: 0.92,
    softness: 0.26,
    invert: false,
    showMatte: false,
    hueShift: 0,
    saturation: 1.15,
    gain: 1.06,
    exposureStops: 0.14,
    temperature: 0.1,
    desaturateOutside: 0.85,
    colorizeColor: "",
    colorizeStrength: 0,
  },
});

export const POWER_WINDOW_PRESETS = Object.freeze({
  subject_spotlight: {
    enabled: true,
    label: "Subject Spotlight",
    shape: "ellipse",
    x: 0.5,
    y: 0.44,
    rx: 0.26,
    ry: 0.34,
    rotation: 0,
    feather: 0.32,
    invert: false,
    exposureStops: 0.25,
    saturation: 1.08,
    gain: 1.08,
    temperature: 0.04,
  },
  surround_dim: {
    enabled: true,
    label: "Surround Dimming",
    shape: "ellipse",
    x: 0.5,
    y: 0.46,
    rx: 0.32,
    ry: 0.38,
    rotation: 0,
    feather: 0.35,
    invert: true,
    exposureStops: -0.45,
    saturation: 0.86,
    gain: 0.92,
    temperature: -0.04,
  },
  face_upper_body: {
    enabled: true,
    label: "Face & Upper Body Key Light",
    shape: "ellipse",
    x: 0.5,
    y: 0.32,
    rx: 0.18,
    ry: 0.24,
    rotation: 0,
    feather: 0.28,
    invert: false,
    exposureStops: 0.32,
    saturation: 1.12,
    gain: 1.08,
    temperature: 0.09,
  },
  full_body_column: {
    enabled: true,
    label: "Full Body Vertical Isolation",
    shape: "rectangle",
    x: 0.5,
    y: 0.52,
    rx: 0.22,
    ry: 0.44,
    rotation: 0,
    feather: 0.26,
    invert: false,
    exposureStops: 0.24,
    saturation: 1.14,
    gain: 1.06,
    temperature: 0.05,
  },
  center_object_hero: {
    enabled: true,
    label: "Center Object / Product Hero Pop",
    shape: "ellipse",
    x: 0.5,
    y: 0.5,
    rx: 0.22,
    ry: 0.22,
    rotation: 0,
    feather: 0.22,
    invert: false,
    exposureStops: 0.3,
    saturation: 1.24,
    gain: 1.12,
    temperature: 0.04,
  },
  hands_foreground_zone: {
    enabled: true,
    label: "Lower Foreground / Hands & Desk Object",
    shape: "ellipse",
    x: 0.5,
    y: 0.72,
    rx: 0.34,
    ry: 0.22,
    rotation: 0,
    feather: 0.3,
    invert: false,
    exposureStops: 0.22,
    saturation: 1.16,
    gain: 1.06,
    temperature: 0.04,
  },
  sky_top_grad: {
    enabled: true,
    label: "Upper Sky / Ceiling Gradient",
    shape: "linear",
    x: 0.5,
    y: 0.18,
    rx: 0.5,
    ry: 0.25,
    rotation: 0,
    feather: 0.35,
    invert: false,
    exposureStops: -0.35,
    saturation: 1.22,
    gain: 0.92,
    temperature: -0.08,
  },
});

export const DEAD_CONTENT_REVITALIZER_PRESETS = Object.freeze({
  flat_log_revival: {
    id: "flat_log_revival",
    label: "Revive Flat / Washed-Out Footage",
    icon: "⚡",
    description: "Clears hazy lifted blacks, expands midtone punch & restores rich colour",
    dehaze: 0.45,
    clarity: 0.38,
    shadowRecovery: 0.32,
    highlightRollOff: 0.3,
    vibrance: 0.48,
    skinToneProtect: 0.85,
    exposureStops: 0.14,
    contrast: 1.18,
    saturation: 1.16,
    sharpness: 0.32,
  },
  low_light_rescue: {
    id: "low_light_rescue",
    label: "Low-Light & Muddy Shadow Rescue",
    icon: "🌙",
    description: "Lifts dark muddy shadows cleanly while protecting highlights & skin",
    dehaze: 0.24,
    clarity: 0.42,
    shadowRecovery: 0.72,
    highlightRollOff: 0.42,
    vibrance: 0.38,
    skinToneProtect: 0.9,
    exposureStops: 0.48,
    lift: 0.035,
    gamma: 1.16,
    contrast: 1.12,
    saturation: 1.12,
    sharpness: 0.28,
  },
  dead_phone_enhancer: {
    id: "dead_phone_enhancer",
    label: "Dead Phone Clip -> Crisp Cinema",
    icon: "📱",
    description: "Transforms compressed, dull phone clips into punchy studio-grade video",
    dehaze: 0.36,
    clarity: 0.5,
    shadowRecovery: 0.42,
    highlightRollOff: 0.45,
    vibrance: 0.52,
    skinToneProtect: 0.88,
    exposureStops: 0.18,
    contrast: 1.2,
    saturation: 1.18,
    temperature: 0.08,
    sharpness: 0.42,
  },
  lifeless_color_resurrection: {
    id: "lifeless_color_resurrection",
    label: "Lifeless Color Resurrection (HDR Pop)",
    icon: "🔥",
    description: "Maximum chroma revival, deep obsidian blacks & luminous highlights",
    dehaze: 0.52,
    clarity: 0.46,
    shadowRecovery: 0.38,
    highlightRollOff: 0.48,
    vibrance: 0.68,
    skinToneProtect: 0.82,
    exposureStops: 0.16,
    contrast: 1.22,
    saturation: 1.24,
    gain: 1.08,
    sharpness: 0.38,
  },
  portrait_skin_revival: {
    id: "portrait_skin_revival",
    label: "Subject & Skin Tone Miracle",
    icon: "✨",
    description: "Warms & illuminates dull faces while keeping skin tones natural",
    dehaze: 0.22,
    clarity: 0.28,
    shadowRecovery: 0.46,
    highlightRollOff: 0.52,
    vibrance: 0.42,
    skinToneProtect: 0.96,
    exposureStops: 0.22,
    gamma: 1.08,
    contrast: 1.1,
    saturation: 1.1,
    temperature: 0.12,
    tint: 0.04,
    sharpness: 0.25,
  },
});

export const FILM_EMULATION_PRESETS = Object.freeze({
  none: { halation: 0, chromaticAberration: 0, filmGrain: 0 },
  "35mm_halation": { halation: 0.28, chromaticAberration: 0.08, filmGrain: 0.18 },
  "16mm_doc": { halation: 0.14, chromaticAberration: 0.14, filmGrain: 0.34 },
  anamorphic_prism: { halation: 0.36, chromaticAberration: 0.24, filmGrain: 0.12 },
});

export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToChannel(p, q, t) {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

export function hslToRgb(h, s, l) {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToChannel(p, q, h + 1 / 3),
    hueToChannel(p, q, h),
    hueToChannel(p, q, h - 1 / 3),
  ];
}

export function hexToHsl(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgbToHsl(r, g, b);
}

function smoothWindow(value, min, max, feather) {
  const f = Math.max(0.001, Number(feather) || 0.05);
  let wMin = 1;
  if (min > 0) {
    wMin = clamp((value - (min - f)) / f, 0, 1);
  }
  let wMax = 1;
  if (max < 1) {
    wMax = clamp((max + f - value) / f, 0, 1);
  }
  return wMin * wMax;
}

/**
 * Evaluates how strongly a pixel (r,g,b in 0..1) matches an HSL Secondary Qualifier
 * for isolating a specific object, garment, skin tone, or background element.
 */
export function evaluateHslQualifierMatte(r, g, b, qualifier) {
  if (!qualifier || qualifier.enabled === false) return 1;
  const [h, s, l] = rgbToHsl(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1));
  const center = ((Number(qualifier.hueCenter ?? 0.075) % 1) + 1) % 1;
  const width = clamp(qualifier.hueWidth ?? 0.08, 0.005, 0.5);
  const softness = clamp(qualifier.softness ?? 0.2, 0.005, 0.5);

  let hueDiff = Math.abs(h - center);
  if (hueDiff > 0.5) hueDiff = 1 - hueDiff;

  let hueWeight = 0;
  if (hueDiff <= width) {
    hueWeight = 1;
  } else if (hueDiff <= width + softness) {
    const t = (hueDiff - width) / softness;
    hueWeight = 1 - t * t * (3 - 2 * t);
  }

  const satMin = clamp(qualifier.satMin ?? 0.12, 0, 1);
  const satMax = clamp(qualifier.satMax ?? 1.0, satMin, 1);
  const lumMin = clamp(qualifier.lumMin ?? 0.08, 0, 1);
  const lumMax = clamp(qualifier.lumMax ?? 0.95, lumMin, 1);

  const satWeight = smoothWindow(s, satMin, satMax, softness * 0.5);
  const lumWeight = smoothWindow(l, lumMin, lumMax, softness * 0.5);

  const matte = clamp(hueWeight * satWeight * lumWeight, 0, 1);
  return qualifier.invert ? 1 - matte : matte;
}

/**
 * Evaluates a spatial Power Window mask at normalized coordinates (nx, ny in 0..1)
 * for isolating a face, upper body, full body column, held object, or sky zone.
 */
export function evaluatePowerWindowMask(nx, ny, windowSpec) {
  if (!windowSpec || windowSpec.enabled === false) return 1;
  const cx = Number(windowSpec.x ?? windowSpec.centerX ?? 0.5);
  const cy = Number(windowSpec.y ?? windowSpec.centerY ?? 0.5);
  const rx = Math.max(0.02, Number(windowSpec.rx ?? windowSpec.radiusX ?? 0.3));
  const ry = Math.max(0.02, Number(windowSpec.ry ?? windowSpec.radiusY ?? 0.3));
  const feather = clamp(windowSpec.feather ?? 0.25, 0.01, 0.8);
  const angleRad = ((Number(windowSpec.rotation) || 0) * Math.PI) / 180;

  const dx = nx - cx;
  const dy = ny - cy;
  const cosA = Math.cos(-angleRad);
  const sinA = Math.sin(-angleRad);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;

  const shape = windowSpec.shape || "ellipse";
  let dist = 0;
  if (shape === "rectangle") {
    dist = Math.max(Math.abs(lx) / rx, Math.abs(ly) / ry);
  } else if (shape === "linear") {
    dist = Math.abs(ly) / ry;
  } else {
    dist = Math.hypot(lx / rx, ly / ry);
  }

  let weight = 0;
  if (dist <= 1) {
    weight = 1;
  } else if (dist <= 1 + feather * 2) {
    const t = (dist - 1) / (feather * 2);
    weight = 1 - t * t * (3 - 2 * t);
  }
  return windowSpec.invert ? 1 - weight : weight;
}

/**
 * Applies the Dead-Content Revitalizer signal restoration to a single normalized RGB pixel (0..1).
 * Restores crushed shadows, hazy black points, flat midtone contrast, and muted colors
 * while protecting natural skin tones.
 */
export function evaluatePixelRevitalizer(rIn, gIn, bIn, revitalizer = {}) {
  let r = clamp(rIn, 0, 1);
  let g = clamp(gIn, 0, 1);
  let b = clamp(bIn, 0, 1);

  const dehaze = clamp(revitalizer.dehaze ?? 0, 0, 1);
  const shadowRecovery = clamp(revitalizer.shadowRecovery ?? 0, 0, 1);
  const highlightRollOff = clamp(revitalizer.highlightRollOff ?? 0, 0, 1);
  const clarity = clamp(revitalizer.clarity ?? 0, 0, 1);
  const vibrance = clamp(revitalizer.vibrance ?? 0, -1, 1);
  const skinToneProtect = clamp(revitalizer.skinToneProtect ?? 0.85, 0, 1);

  if (
    dehaze === 0 &&
    shadowRecovery === 0 &&
    highlightRollOff === 0 &&
    clarity === 0 &&
    vibrance === 0
  ) {
    return [r, g, b];
  }

  // 1. Atmospheric Dehaze & Black-Point Recovery
  if (dehaze > 0) {
    const minChan = Math.min(r, g, b);
    const hazeFloor = minChan * dehaze * 0.34;
    const transmission = Math.max(0.28, 1 - hazeFloor);
    r = clamp((r - hazeFloor) / transmission, 0, 1);
    g = clamp((g - hazeFloor) / transmission, 0, 1);
    b = clamp((b - hazeFloor) / transmission, 0, 1);
  }

  // 2. Shadow Rescue & Highlight Roll-Off (Luminance-preserving tone recovery)
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma > 0.0001 && (shadowRecovery > 0 || highlightRollOff > 0 || clarity > 0)) {
    let targetLuma = luma;

    if (shadowRecovery > 0) {
      // Smooth toe boost concentrated below luma 0.55
      const shadowMask = Math.pow(1 - targetLuma, 2.1);
      targetLuma += shadowMask * shadowRecovery * 0.28;
    }

    if (highlightRollOff > 0 && targetLuma > 0.55) {
      // Soft filmic shoulder compression above luma 0.55
      const excess = targetLuma - 0.55;
      const compressed = excess / (1 + excess * highlightRollOff * 1.45);
      targetLuma = 0.55 + compressed;
    }

    if (clarity > 0) {
      // Midtone S-curve micro-contrast punch centered at 0.5
      const midCentered = targetLuma - 0.5;
      const bell = 1 - Math.min(1, Math.abs(midCentered) * 2) ** 2;
      targetLuma = clamp(targetLuma + midCentered * bell * clarity * 0.45, 0, 1);
    }

    const ratio = targetLuma / Math.max(0.001, luma);
    r = clamp(r * ratio, 0, 1);
    g = clamp(g * ratio, 0, 1);
    b = clamp(b * ratio, 0, 1);
  }

  // 3. Smart Vibrance with Skin-Tone Corridor Protection
  if (vibrance !== 0) {
    const [h, s, l] = rgbToHsl(r, g, b);
    // Human skin tone corridor sits around hue 0.04..0.11 (approx 14°..40°)
    let skinProximity = 0;
    const skinDist = Math.abs(h - 0.072);
    if (skinDist < 0.055) {
      skinProximity = 1 - skinDist / 0.055;
    }
    const protection = 1 - skinProximity * skinToneProtect * 0.72;
    // Smart vibrance boosts muted colours more strongly than already-saturated colours
    const adaptiveBoost =
      vibrance >= 0
        ? vibrance * (1 - s * 0.65) * protection * 0.55
        : vibrance * s * 0.55;
    const nextSat = clamp(s + adaptiveBoost, 0, 1);
    [r, g, b] = hslToRgb(h, nextSat, l);
  }

  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

/**
 * Evaluates Selective Object / Body Part Color Grading on a normalized RGB pixel (0..1)
 * using an HSL Secondary Qualifier and/or Spatial Power Window mask.
 */
export function evaluateSelectiveColorTransform(
  rIn,
  gIn,
  bIn,
  nx = 0.5,
  ny = 0.5,
  { qualifier = null, powerWindow = null } = {}
) {
  let r = clamp(rIn, 0, 1);
  let g = clamp(gIn, 0, 1);
  let b = clamp(bIn, 0, 1);

  const hasQualifier = Boolean(qualifier && qualifier.enabled);
  const hasWindow = Boolean(powerWindow && powerWindow.enabled);
  if (!hasQualifier && !hasWindow) return [r, g, b];

  const qWeight = hasQualifier ? evaluateHslQualifierMatte(r, g, b, qualifier) : 1;
  const wWeight = hasWindow ? evaluatePowerWindowMask(nx, ny, powerWindow) : 1;
  const matte = clamp(qWeight * wWeight, 0, 1);

  if (hasQualifier && qualifier.showMatte) {
    // High-contrast diagnostic matte view: selected object/body glows vibrant cyan-white, outside is dimmed monochrome
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const dim = luma * 0.22;
    return [
      clamp(dim * (1 - matte) + (0.15 + luma * 0.85) * matte, 0, 1),
      clamp(dim * (1 - matte) + (0.88 + luma * 0.12) * matte, 0, 1),
      clamp(dim * (1 - matte) + 1.0 * matte, 0, 1),
    ];
  }

  // Transform inside the targeted object/body region
  let tr = r;
  let tg = g;
  let tb = b;

  const expStops =
    (hasQualifier ? Number(qualifier.exposureStops || 0) : 0) +
    (hasWindow ? Number(powerWindow.exposureStops || 0) : 0);
  const gain =
    (hasQualifier ? Number(qualifier.gain ?? 1) : 1) *
    (hasWindow ? Number(powerWindow.gain ?? 1) : 1);
  const temp =
    (hasQualifier ? Number(qualifier.temperature || 0) : 0) +
    (hasWindow ? Number(powerWindow.temperature || 0) : 0);
  const satMult =
    (hasQualifier ? Number(qualifier.saturation ?? 1) : 1) *
    (hasWindow ? Number(powerWindow.saturation ?? 1) : 1);
  const hueShift = hasQualifier ? Number(qualifier.hueShift || 0) : 0;

  if (expStops !== 0 || gain !== 1 || temp !== 0) {
    const expScale = Math.pow(2, expStops) * gain;
    tr = clamp(tr * expScale * (1 + temp * 0.14), 0, 1);
    tg = clamp(tg * expScale, 0, 1);
    tb = clamp(tb * expScale * (1 - temp * 0.14), 0, 1);
  }

  if (hueShift !== 0 || satMult !== 1 || (hasQualifier && qualifier.colorizeColor && Number(qualifier.colorizeStrength) > 0)) {
    let [h, s, l] = rgbToHsl(tr, tg, tb);
    h = ((h + hueShift) % 1 + 1) % 1;
    s = clamp(s * satMult, 0, 1);

    if (hasQualifier && qualifier.colorizeColor && Number(qualifier.colorizeStrength) > 0) {
      const targetHsl = hexToHsl(qualifier.colorizeColor);
      if (targetHsl) {
        const strength = clamp(qualifier.colorizeStrength, 0, 1);
        // Shortest circular hue interpolation toward the chosen object/garment colour
        let dh = targetHsl[0] - h;
        if (dh > 0.5) dh -= 1;
        if (dh < -0.5) dh += 1;
        h = ((h + dh * strength) % 1 + 1) % 1;
        s = clamp(s * (1 - strength) + Math.max(s, targetHsl[1]) * strength, 0, 1);
      }
    }
    [tr, tg, tb] = hslToRgb(h, s, l);
  }

  // Outside the targeted object/body (e.g. Color Splash B&W outside)
  let or = r;
  let og = g;
  let ob = b;
  const desatOutside = hasQualifier ? clamp(qualifier.desaturateOutside ?? 0, 0, 1) : 0;
  if (desatOutside > 0) {
    const outLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    or = r * (1 - desatOutside) + outLuma * desatOutside;
    og = g * (1 - desatOutside) + outLuma * desatOutside;
    ob = b * (1 - desatOutside) + outLuma * desatOutside;
  }

  return [
    clamp(or * (1 - matte) + tr * matte, 0, 1),
    clamp(og * (1 - matte) + tg * matte, 0, 1),
    clamp(ob * (1 - matte) + tb * matte, 0, 1),
  ];
}

/**
 * Applies both Dead-Content Revitalizer and Selective Object/Body Color Grading
 * directly to an RGBA byte array in-place.
 */
export function applySelectiveAndRevitalizerGrade(
  rgbaBytes,
  width = 1,
  height = 1,
  { revitalizer = null, qualifier = null, powerWindow = null } = {}
) {
  if (!rgbaBytes || !rgbaBytes.length) return rgbaBytes;
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || Math.floor(rgbaBytes.length / 4 / w) || 1);
  const hasRevitalizer =
    revitalizer &&
    (Number(revitalizer.dehaze || 0) !== 0 ||
      Number(revitalizer.shadowRecovery || 0) !== 0 ||
      Number(revitalizer.highlightRollOff || 0) !== 0 ||
      Number(revitalizer.clarity || 0) !== 0 ||
      Number(revitalizer.vibrance || 0) !== 0);
  const hasQualifier = Boolean(qualifier && qualifier.enabled);
  const hasWindow = Boolean(powerWindow && powerWindow.enabled);

  if (!hasRevitalizer && !hasQualifier && !hasWindow) return rgbaBytes;

  for (let i = 0; i < rgbaBytes.length; i += 4) {
    const pixelIndex = i >> 2;
    const px = pixelIndex % w;
    const py = Math.floor(pixelIndex / w);
    const nx = w > 1 ? px / (w - 1) : 0.5;
    const ny = h > 1 ? py / (h - 1) : 0.5;

    let r = rgbaBytes[i] / 255;
    let g = rgbaBytes[i + 1] / 255;
    let b = rgbaBytes[i + 2] / 255;

    if (hasRevitalizer) {
      [r, g, b] = evaluatePixelRevitalizer(r, g, b, revitalizer);
    }
    if (hasQualifier || hasWindow) {
      [r, g, b] = evaluateSelectiveColorTransform(r, g, b, nx, ny, {
        qualifier,
        powerWindow,
      });
    }

    rgbaBytes[i] = Math.round(clamp(r, 0, 1) * 255);
    rgbaBytes[i + 1] = Math.round(clamp(g, 0, 1) * 255);
    rgbaBytes[i + 2] = Math.round(clamp(b, 0, 1) * 255);
  }
  return rgbaBytes;
}

function linearizeLogSignal(x, profile) {
  const v = clamp(x, 0, 1);
  if (profile === "apple_log") {
    const cut = 0.092864;
    if (v < cut) return Math.max(0, (v - 0.092864) / 8.5 + 0.01);
    return clamp(Math.pow(2, (v - 0.57) / 0.085) * 0.18, 0, 4);
  }
  if (profile === "sony_slog3") {
    const cut = 171.2102946929 / 1023;
    if (v < cut) return Math.max(0, ((v * 1023 - 95) * 0.01125) / (171.2102946929 - 95));
    return clamp(Math.pow(10, ((v * 1023 - 420) / 261.5)) * 0.19 - 0.01, 0, 4);
  }
  if (profile === "dji_dlog") {
    if (v <= 0.14) return Math.max(0, (v - 0.0929) / 6.025);
    return clamp((Math.pow(10, (v - 0.3847) / 0.2568) - 0.0108) / 0.9892, 0, 4);
  }
  if (profile === "canon_clog") {
    return clamp((Math.pow(10, (v - 0.0928) / 0.2413) - 1) / 87.0993, 0, 4);
  }
  if (profile === "hlg_hdr") {
    const a = 0.17883277;
    const b = 1 - 4 * a;
    const c = 0.5 - a * Math.log(4 * a);
    if (v <= 0.5) return (v * v) / 3;
    return clamp((Math.exp((v - c) / a) + b) / 12, 0, 4);
  }
  return Math.pow(v, 2.2);
}

function encodeRec709RollOff(linear) {
  // Filmic ACES-style soft shoulder roll-off into Rec.709 display range
  const x = Math.max(0, linear);
  const mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return clamp(Math.pow(clamp(mapped, 0, 1), 1 / 2.2), 0, 1);
}

/**
 * Generates a 3D .cube LUT converting from camera log / HDR input profiles into
 * display Rec.709, compatible with both studioWebGLCompositor and FFmpeg lut3d.
 */
export function buildColorSpaceTransformCube(inputProfile = "rec709", outputProfile = "rec709", size = 17) {
  const n = Math.max(2, Math.min(33, Math.floor(Number(size) || 17)));
  const data = [];
  const isIdentity = inputProfile === outputProfile;

  for (let bIdx = 0; bIdx < n; bIdx += 1) {
    for (let gIdx = 0; gIdx < n; gIdx += 1) {
      for (let rIdx = 0; rIdx < n; rIdx += 1) {
        const rIn = rIdx / (n - 1);
        const gIn = gIdx / (n - 1);
        const bIn = bIdx / (n - 1);
        if (isIdentity) {
          data.push(
            Number(rIn.toFixed(6)),
            Number(gIn.toFixed(6)),
            Number(bIn.toFixed(6))
          );
          continue;
        }
        const lr = linearizeLogSignal(rIn, inputProfile);
        const lg = linearizeLogSignal(gIn, inputProfile);
        const lb = linearizeLogSignal(bIn, inputProfile);

        // Gentle gamut saturation restore when coming from flat Log encodings
        const luma = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        const gamutSat = inputProfile === "rec709" ? 1.0 : 1.18;
        const mr = Math.max(0, luma + (lr - luma) * gamutSat);
        const mg = Math.max(0, luma + (lg - luma) * gamutSat);
        const mb = Math.max(0, luma + (lb - luma) * gamutSat);

        data.push(
          Number(encodeRec709RollOff(mr).toFixed(6)),
          Number(encodeRec709RollOff(mg).toFixed(6)),
          Number(encodeRec709RollOff(mb).toFixed(6))
        );
      }
    }
  }

  return {
    size: n,
    data,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    presetId: `cst:${inputProfile}->${outputProfile}`,
    title: `${inputProfile} to ${outputProfile}`,
  };
}

function measureChannelStats(rgbaBytes) {
  const count = Math.max(1, Math.floor((rgbaBytes?.length || 0) / 4));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let sumSat = 0;
  let minLuma = 1;
  let maxLuma = 0;
  for (let i = 0; i < count * 4; i += 4) {
    const r = rgbaBytes[i] / 255;
    const g = rgbaBytes[i + 1] / 255;
    const b = rgbaBytes[i + 2] / 255;
    sumR += r;
    sumG += g;
    sumB += b;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumLuma += luma;
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
    const [, s] = rgbToHsl(r, g, b);
    sumSat += s;
  }
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanLuma = sumLuma / count;
  const meanSat = sumSat / count;

  let varLuma = 0;
  for (let i = 0; i < count * 4; i += 4) {
    const luma = 0.2126 * (rgbaBytes[i] / 255) + 0.7152 * (rgbaBytes[i + 1] / 255) + 0.0722 * (rgbaBytes[i + 2] / 255);
    varLuma += (luma - meanLuma) ** 2;
  }
  const stdLuma = Math.sqrt(varLuma / count);
  return { meanR, meanG, meanB, meanLuma, meanSat, stdLuma, minLuma, maxLuma };
}

/**
 * Diagnoses dead/low-quality footage (washed-out haze, dark crushed shadows,
 * lifeless muted colours, or colour casts) and solves an automatic revival grade.
 */
export function diagnoseDeadFootageAndSolveRevival(rgbaBytes) {
  const stats = measureChannelStats(rgbaBytes);
  const issues = [];
  if (stats.meanLuma < 0.3) issues.push("underexposed_shadows");
  if (stats.stdLuma < 0.14 || stats.minLuma > 0.12) issues.push("washed_out_flat_contrast");
  if (stats.meanSat < 0.22) issues.push("lifeless_muted_chroma");
  if (Math.abs(stats.meanR - stats.meanB) > 0.14) issues.push("color_cast_imbalance");

  let presetId = "dead_phone_enhancer";
  if (issues.includes("underexposed_shadows")) presetId = "low_light_rescue";
  else if (issues.includes("washed_out_flat_contrast") && issues.includes("lifeless_muted_chroma"))
    presetId = "lifeless_color_resurrection";
  else if (issues.includes("washed_out_flat_contrast")) presetId = "flat_log_revival";

  const basePreset = DEAD_CONTENT_REVITALIZER_PRESETS[presetId];
  const exposureStops = clamp(
    stats.meanLuma < 0.42 ? Math.log2(0.46 / Math.max(0.05, stats.meanLuma)) * 0.75 : basePreset.exposureStops,
    -0.5,
    1.2
  );
  const dehaze = clamp(
    stats.minLuma > 0.08 ? Math.max(basePreset.dehaze, stats.minLuma * 2.2) : basePreset.dehaze,
    0.15,
    0.75
  );
  const vibrance = clamp(
    stats.meanSat < 0.25 ? Math.max(basePreset.vibrance, (0.35 - stats.meanSat) * 2.1) : basePreset.vibrance,
    0.2,
    0.85
  );
  const shadowRecovery = clamp(
    stats.meanLuma < 0.34 ? Math.max(basePreset.shadowRecovery, (0.42 - stats.meanLuma) * 1.9) : basePreset.shadowRecovery,
    0.2,
    0.85
  );

  return {
    issues,
    presetId,
    label: basePreset.label,
    revitalizer: {
      dehaze: Number(dehaze.toFixed(2)),
      clarity: Number(basePreset.clarity.toFixed(2)),
      shadowRecovery: Number(shadowRecovery.toFixed(2)),
      highlightRollOff: Number(basePreset.highlightRollOff.toFixed(2)),
      vibrance: Number(vibrance.toFixed(2)),
      skinToneProtect: Number(basePreset.skinToneProtect.toFixed(2)),
    },
    grade: {
      precisionGrade: true,
      exposureStops: Number(exposureStops.toFixed(2)),
      contrast: Number(basePreset.contrast.toFixed(2)),
      saturation: Number(basePreset.saturation.toFixed(2)),
      sharpness: Number(basePreset.sharpness.toFixed(2)),
      dehaze: Number(dehaze.toFixed(2)),
      clarity: Number(basePreset.clarity.toFixed(2)),
      shadowRecovery: Number(shadowRecovery.toFixed(2)),
      highlightRollOff: Number(basePreset.highlightRollOff.toFixed(2)),
      vibrance: Number(vibrance.toFixed(2)),
      skinToneProtect: Number(basePreset.skinToneProtect.toFixed(2)),
    },
  };
}

/**
 * Computes primary grade parameters (exposureStops, contrast, temperature, tint, gain)
 * that match a target shot's exposure, contrast spread, and white balance to a reference frame.
 */
export function solveShotMatchGrade(referenceRgba, targetRgba) {
  const ref = measureChannelStats(referenceRgba);
  const tgt = measureChannelStats(targetRgba);

  const safeTargetLuma = Math.max(0.02, tgt.meanLuma);
  const safeRefLuma = Math.max(0.02, ref.meanLuma);
  const exposureStops = clamp(Math.log2(safeRefLuma / safeTargetLuma), -1.5, 1.5);
  const contrast = clamp(ref.stdLuma / Math.max(0.02, tgt.stdLuma), 0.75, 1.45);

  const refWarmth = ref.meanR - ref.meanB;
  const tgtWarmth = tgt.meanR - tgt.meanB;
  const temperature = clamp((refWarmth - tgtWarmth) * 2.4, -0.8, 0.8);

  const refTint = (ref.meanR + ref.meanB) * 0.5 - ref.meanG;
  const tgtTint = (tgt.meanR + tgt.meanB) * 0.5 - tgt.meanG;
  const tint = clamp((refTint - tgtTint) * 2.4, -0.8, 0.8);

  return {
    precisionGrade: true,
    exposureStops: Number(exposureStops.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    temperature: Number(temperature.toFixed(3)),
    tint: Number(tint.toFixed(3)),
    gain: 1,
    lift: 0,
    gamma: 1,
  };
}
