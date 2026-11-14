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
  },
  sky_enhance: {
    enabled: true,
    label: "Cyan / Sky Pop",
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
  },
  foliage_pop: {
    enabled: true,
    label: "Emerald Foliage",
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
  },
});

export const POWER_WINDOW_PRESETS = Object.freeze({
  subject_spotlight: {
    enabled: true,
    label: "Subject Spotlight",
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
  },
  surround_dim: {
    enabled: true,
    label: "Surround Dimming",
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
  },
});

export const FILM_EMULATION_PRESETS = Object.freeze({
  none: { halation: 0, chromaticAberration: 0, filmGrain: 0 },
  "35mm_halation": { halation: 0.28, chromaticAberration: 0.08, filmGrain: 0.18 },
  "16mm_doc": { halation: 0.14, chromaticAberration: 0.14, filmGrain: 0.34 },
  anamorphic_prism: { halation: 0.36, chromaticAberration: 0.24, filmGrain: 0.12 },
});

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
  for (let i = 0; i < count * 4; i += 4) {
    const r = rgbaBytes[i] / 255;
    const g = rgbaBytes[i + 1] / 255;
    const b = rgbaBytes[i + 2] / 255;
    sumR += r;
    sumG += g;
    sumB += b;
    sumLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanLuma = sumLuma / count;

  let varLuma = 0;
  for (let i = 0; i < count * 4; i += 4) {
    const luma = 0.2126 * (rgbaBytes[i] / 255) + 0.7152 * (rgbaBytes[i + 1] / 255) + 0.0722 * (rgbaBytes[i + 2] / 255);
    varLuma += (luma - meanLuma) ** 2;
  }
  const stdLuma = Math.sqrt(varLuma / count);
  return { meanR, meanG, meanB, meanLuma, stdLuma };
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
