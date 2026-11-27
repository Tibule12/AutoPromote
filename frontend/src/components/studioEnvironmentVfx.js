// Cinematic Sky Replacement & Environment Harmonization + Clean-Plate Removal helpers.

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / Math.max(1e-5, b - a));
  return t * t * (3 - 2 * t);
};

export const SKY_REPLACEMENT_PRESETS = Object.freeze({
  none: { id: "none", label: "Original Sky", top: [120, 175, 235], horizon: [215, 232, 248], tint: [0, 0, 0] },
  sunset_gold: { id: "sunset_gold", label: "Golden Hour Sunset", top: [58, 72, 148], horizon: [255, 142, 72], tint: [1.0, 0.72, 0.42] },
  storm_indigo: { id: "storm_indigo", label: "Stormy Dramatic Clouds", top: [34, 48, 74], horizon: [108, 126, 152], tint: [0.55, 0.68, 0.85] },
  clear_azure: { id: "clear_azure", label: "Crisp Azure Blue", top: [28, 108, 224], horizon: [152, 212, 250], tint: [0.7, 0.86, 1.0] },
  twilight_violet: { id: "twilight_violet", label: "Neon Twilight", top: [26, 20, 68], horizon: [196, 88, 175], tint: [0.85, 0.56, 0.92] },
});

export function computeSkyMatte(rgba, width, height, { threshold = 0.48, horizonPct = 64, softness = 0.22 } = {}) {
  const out = new Float32Array(width * height);
  const horizonY = Math.max(0.15, Math.min(0.95, Number(horizonPct || 64) / 100));
  const soft = Math.max(0.04, Number(softness || 0.22));
  const thr = clamp01(threshold);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const heightPrior = 1 - smooth(horizonY - soft * 0.6, Math.min(1, horizonY + soft * 0.4), ny);
    if (heightPrior <= 0.002) continue;
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const blueSky = Math.max(0, b - Math.max(r, g) * 0.82);
      const chromaSpan = Math.max(Math.abs(r - g), Math.abs(g - b));
      const lowTextureWhite = Math.max(0, luma - chromaSpan * 0.55) * smooth(0.45, 0.78, luma);
      const score = Math.max(luma * 0.62 + blueSky * 0.92, lowTextureWhite * 0.9);
      out[p] = clamp01(heightPrior * smooth(thr - soft * 0.45, thr + soft * 0.45, score));
    }
  }
  return out;
}

export function applySkyReplacementRgba(rgba, width, height, options = {}) {
  const preset = SKY_REPLACEMENT_PRESETS[options.preset] || SKY_REPLACEMENT_PRESETS.sunset_gold;
  if (!options.preset || options.preset === "none") return rgba;
  const matte = computeSkyMatte(rgba, width, height, options);
  const mixAmt = clamp01(options.blend ?? 0.92);
  const tempMatch = clamp01(options.temperatureMatch ?? 0.32);
  const customSky = options.customSkyRgba || null;
  const horizonFrac = Math.max(0.15, (options.horizonPct ?? 64) / 100);
  const t = Number(options.time || 0);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const vMix = Math.pow(clamp01(ny / horizonFrac), 0.82);
    const baseR = preset.top[0] * (1 - vMix) + preset.horizon[0] * vMix;
    const baseG = preset.top[1] * (1 - vMix) + preset.horizon[1] * vMix;
    const baseB = preset.top[2] * (1 - vMix) + preset.horizon[2] * vMix;
    const wispR = preset.top[0] * 0.35 + preset.horizon[0] * 0.65;
    const wispG = preset.top[1] * 0.35 + preset.horizon[1] * 0.65;
    const wispB = preset.top[2] * 0.35 + preset.horizon[2] * 0.65;
    const cloudMaskY = smooth(0.12, horizonFrac * 0.92, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const wispA = Math.sin(nx * 4.7 + ny * 6.3 + t * 0.18) * Math.cos(nx * 3.1 - ny * 4.1 - t * 0.11);
      const wispB = Math.sin(nx * 9.3 - ny * 8.4 + t * 0.25) * 0.5;
      const cloud = clamp01(0.5 + 0.32 * wispA + 0.18 * wispB) * cloudMaskY;
      const dx = (nx - 0.34) / 0.42;
      const dy = (ny - horizonFrac * 0.78) / 0.34;
      const glow = Math.exp(-(dx * dx + dy * dy));
      const sr = Math.min(255, baseR * (0.94 + 0.08 * cloud) + wispR * (cloud * 0.08) + preset.horizon[0] * (glow * 0.2));
      const sg = Math.min(255, baseG * (0.94 + 0.08 * cloud) + wispG * (cloud * 0.08) + preset.horizon[1] * (glow * 0.2));
      const sb = Math.min(255, baseB * (0.94 + 0.08 * cloud) + wispB * (cloud * 0.08) + preset.horizon[2] * (glow * 0.2));
      const p = y * width + x;
      const i = p * 4;
      const m = matte[p] * mixAmt;
      const tr = customSky ? customSky[i] : sr;
      const tg = customSky ? customSky[i + 1] : sg;
      const tb = customSky ? customSky[i + 2] : sb;
      let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (tempMatch > 0.005 && m < 0.95) {
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const tWeight = tempMatch * (0.35 + 0.65 * lum) * (1 - m);
        r = r * (1 - tWeight * 0.25) + r * preset.tint[0] * tWeight * 0.25;
        g = g * (1 - tWeight * 0.25) + g * preset.tint[1] * tWeight * 0.25;
        b = b * (1 - tWeight * 0.25) + b * preset.tint[2] * tWeight * 0.25;
      }
      rgba[i] = Math.max(0, Math.min(255, Math.round(r * (1 - m) + tr * m)));
      rgba[i + 1] = Math.max(0, Math.min(255, Math.round(g * (1 - m) + tg * m)));
      rgba[i + 2] = Math.max(0, Math.min(255, Math.round(b * (1 - m) + tb * m)));
    }
  }
  return rgba;
}
