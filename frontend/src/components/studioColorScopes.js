import { applyPrecisionGrade, buildPrecisionGrade } from "./studioPrecisionGrade";
import { applyColorCube, buildAdvancedColorCube } from "./studioColorCube";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const SKIN_TONE_LINE_ANGLE_DEG = 123;

/**
 * Generates a deterministic broadcast reference chart (Rec.709 color bars,
 * natural skin-tone patches, and a 0..255 luma grayscale ramp) so scopes
 * respond immediately to any primary, wheel, curve, HSL, or 3D LUT change.
 */
export function buildReferenceColorChartRgba(width = 48, height = 27) {
  const w = Math.max(8, Math.floor(Number(width) || 48));
  const h = Math.max(6, Math.floor(Number(height) || 27));
  const pixels = new Uint8ClampedArray(w * h * 4);

  const colorBars = [
    [235, 235, 235], // White
    [235, 235, 16],  // Yellow
    [16, 235, 235],  // Cyan
    [16, 235, 16],   // Green
    [235, 16, 235],  // Magenta
    [235, 16, 16],   // Red
    [16, 16, 235],   // Blue
    [16, 16, 16],    // Black
  ];

  // Representative human skin-tone patches along the Rec.709 skin I-line
  const skinPatches = [
    [228, 178, 148],
    [206, 148, 116],
    [182, 122, 92],
    [152, 98, 72],
    [122, 76, 56],
    [94, 58, 43],
  ];

  for (let y = 0; y < h; y += 1) {
    const rowBand = y / h;
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      let r = 128;
      let g = 128;
      let b = 128;
      if (rowBand < 0.4) {
        const barIdx = Math.min(colorBars.length - 1, Math.floor((x / w) * colorBars.length));
        [r, g, b] = colorBars[barIdx];
      } else if (rowBand < 0.72) {
        const skinIdx = Math.min(skinPatches.length - 1, Math.floor((x / w) * skinPatches.length));
        [r, g, b] = skinPatches[skinIdx];
      } else {
        const ramp = Math.round((x / Math.max(1, w - 1)) * 255);
        r = ramp;
        g = ramp;
        b = ramp;
      }
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

/**
 * Computes Luma Waveform, RGB Parade, and Chroma Vectorscope (with Skin-Tone I-line
 * alignment telemetry) from an RGBA byte buffer.
 */
export function computeColorScopesFromRgba(
  rgbaBytes,
  width = 48,
  height = 27,
  { columns = 32, bins = 24, vectorBins = 24 } = {}
) {
  const w = Math.max(1, Math.floor(Number(width) || 48));
  const cols = Math.max(8, Math.floor(Number(columns) || 32));
  const numBins = Math.max(8, Math.floor(Number(bins) || 24));
  const vBins = Math.max(8, Math.floor(Number(vectorBins) || 24));

  const waveform = Array.from({ length: cols }, () => new Float32Array(numBins));
  const paradeR = Array.from({ length: cols }, () => new Float32Array(numBins));
  const paradeG = Array.from({ length: cols }, () => new Float32Array(numBins));
  const paradeB = Array.from({ length: cols }, () => new Float32Array(numBins));
  const vectorGrid = Array.from({ length: vBins }, () => new Float32Array(vBins));

  let minLuma = 1;
  let maxLuma = 0;
  let sumLuma = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumCb = 0;
  let sumCr = 0;
  let peakChroma = 0;
  let clippedLowCount = 0;
  let clippedHighCount = 0;
  let skinCandidateCount = 0;
  let skinAlignedCount = 0;

  const totalPixels = Math.max(1, Math.floor((rgbaBytes?.length || 0) / 4));

  for (let p = 0; p < totalPixels; p += 1) {
    const i = p * 4;
    const r = (rgbaBytes[i] || 0) / 255;
    const g = (rgbaBytes[i + 1] || 0) / 255;
    const b = (rgbaBytes[i + 2] || 0) / 255;

    const px = p % w;
    const colIdx = Math.min(cols - 1, Math.floor((px / w) * cols));

    const luma = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
    sumLuma += luma;
    sumR += r;
    sumG += g;
    sumB += b;

    if (luma <= 0.02) clippedLowCount += 1;
    if (luma >= 0.98) clippedHighCount += 1;

    const lumaBin = Math.min(numBins - 1, Math.floor(luma * numBins));
    const rBin = Math.min(numBins - 1, Math.floor(r * numBins));
    const gBin = Math.min(numBins - 1, Math.floor(g * numBins));
    const bBin = Math.min(numBins - 1, Math.floor(b * numBins));

    waveform[colIdx][lumaBin] += 1;
    paradeR[colIdx][rBin] += 1;
    paradeG[colIdx][gBin] += 1;
    paradeB[colIdx][bBin] += 1;

    // Rec.709 Cb / Cr in [-0.5, +0.5]
    const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
    const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
    sumCb += cb;
    sumCr += cr;

    const chromaMag = Math.hypot(cb, cr);
    if (chromaMag > peakChroma) peakChroma = chromaMag;

    const vx = Math.min(vBins - 1, Math.max(0, Math.floor((cb + 0.5) * vBins)));
    const vy = Math.min(vBins - 1, Math.max(0, Math.floor((0.5 - cr) * vBins)));
    vectorGrid[vy][vx] += 1;

    // Check alignment with skin-tone I-line (123 deg in Cb/Cr space where 0 deg = +Cb, 90 deg = +Cr)
    if (chromaMag > 0.035 && cr > 0.015 && cb < 0.02) {
      const angleDeg = ((Math.atan2(cr, cb) * 180) / Math.PI + 360) % 360;
      if (angleDeg >= 95 && angleDeg <= 155) {
        skinCandidateCount += 1;
        if (Math.abs(angleDeg - SKIN_TONE_LINE_ANGLE_DEG) <= 15) {
          skinAlignedCount += 1;
        }
      }
    }
  }

  // Summarize each column with { min, max, avg, bins } in 0..100 IRE percentages
  const summarizeCols = colsArr =>
    colsArr.map(col => {
      let maxVal = 0;
      let totalWeight = 0;
      let weightedSum = 0;
      let minBin = numBins - 1;
      let maxBin = 0;
      for (let j = 0; j < col.length; j += 1) {
        const count = col[j];
        if (count > 0) {
          if (j < minBin) minBin = j;
          if (j > maxBin) maxBin = j;
          totalWeight += count;
          weightedSum += ((j + 0.5) / numBins) * 100 * count;
        }
        if (count > maxVal) maxVal = count;
      }
      if (totalWeight <= 0) {
        return { min: 0, max: 0, avg: 0, bins: Array.from(col) };
      }
      return {
        min: Math.round((minBin / Math.max(1, numBins - 1)) * 100),
        max: Math.round((maxBin / Math.max(1, numBins - 1)) * 100),
        avg: Math.round(weightedSum / totalWeight),
        bins: Array.from(col, v => Number((v / maxVal).toFixed(3))),
      };
    });

  let maxVec = 0;
  for (let y = 0; y < vBins; y += 1) {
    for (let x = 0; x < vBins; x += 1) {
      if (vectorGrid[y][x] > maxVec) maxVec = vectorGrid[y][x];
    }
  }
  const normalizedVector = vectorGrid.map(row =>
    Array.from(row, v => (maxVec > 0 ? Number((v / maxVec).toFixed(3)) : 0))
  );

  return {
    columns: cols,
    bins: numBins,
    vectorBins: vBins,
    waveform: summarizeCols(waveform),
    parade: {
      r: summarizeCols(paradeR),
      g: summarizeCols(paradeG),
      b: summarizeCols(paradeB),
      meanR: Math.round((sumR / totalPixels) * 100),
      meanG: Math.round((sumG / totalPixels) * 100),
      meanB: Math.round((sumB / totalPixels) * 100),
    },
    vectorscope: {
      grid: normalizedVector,
      avgCb: Number((sumCb / totalPixels).toFixed(4)),
      avgCr: Number((sumCr / totalPixels).toFixed(4)),
      peakChroma: Number(peakChroma.toFixed(4)),
      skinToneLineAngleDeg: SKIN_TONE_LINE_ANGLE_DEG,
      skinToneCompliancePct:
        skinCandidateCount > 0
          ? Math.round((skinAlignedCount / skinCandidateCount) * 100)
          : 100,
    },
    lumaStats: {
      minLuma: Math.round((minLuma <= maxLuma ? minLuma : 0) * 100),
      maxLuma: Math.round(maxLuma * 100),
      avgLuma: Math.round((sumLuma / totalPixels) * 100),
      clippedLowPct: Number(((clippedLowCount / totalPixels) * 100).toFixed(2)),
      clippedHighPct: Number(((clippedHighCount / totalPixels) * 100).toFixed(2)),
    },
  };
}

/**
 * Evaluates live broadcast scopes by applying the current primary/precision grade
 * and 3D .cube LUT to a reference color chart (or caller-supplied RGBA buffer).
 */
export function computeLiveGradeScopes({
  finishFx = {},
  advancedColor = null,
  rgbaBytes = null,
  alreadyGraded = false,
  width = 48,
  height = 27,
} = {}) {
  const pixels = rgbaBytes
    ? new Uint8ClampedArray(rgbaBytes)
    : buildReferenceColorChartRgba(width, height);

  if (!alreadyGraded) {
    const gradeInput = {
      exposureStops: Number(finishFx?.exposureStops ?? 0),
      brightness:
        Number(finishFx?.brightness ?? 1) > 10
          ? Number(finishFx.brightness) / 100
          : Number(finishFx?.brightness ?? 1),
      contrast:
        Number(finishFx?.contrast ?? 1) > 10
          ? Number(finishFx.contrast) / 100
          : Number(finishFx?.contrast ?? 1),
      saturation:
        Number(finishFx?.saturation ?? 1) > 10
          ? Number(finishFx.saturation) / 100
          : Number(finishFx?.saturation ?? 1),
      lift: Number(finishFx?.lift ?? 0),
      gamma: Number(finishFx?.gamma ?? 1),
      gain: Number(finishFx?.gain ?? 1),
      temperature: Number(finishFx?.temperature ?? 0),
      tint: Number(finishFx?.tint ?? 0),
    };
    applyPrecisionGrade(pixels, buildPrecisionGrade(gradeInput));
    const resolvedAdv = advancedColor || finishFx?.advancedColor || null;
    if (resolvedAdv) {
      const cube = buildAdvancedColorCube({
        ...resolvedAdv,
        lutData: resolvedAdv.lutData || resolvedAdv.lut || null,
      });
      if (cube) {
        applyColorCube(pixels, cube);
      }
    }
  }

  return computeColorScopesFromRgba(pixels, width, height);
}
