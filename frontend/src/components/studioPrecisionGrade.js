const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const buildPrecisionGrade = fx => {
  const exposure = 2 ** clamp(Number(fx.exposureStops || 0), -2, 2);
  const lift = clamp(Number(fx.lift || 0), -.15, .15);
  const gamma = clamp(Number(fx.gamma ?? 1), .6, 1.6);
  const gain = clamp(Number(fx.gain ?? 1), .6, 1.4);
  const warmth = clamp(Number(fx.temperature || 0), -1, 1);
  const tint = clamp(Number(fx.tint || 0), -1, 1);
  const contrast = clamp(Number(fx.contrast ?? 1), .65, 1.75);
  const brightness = clamp(Number(fx.brightness ?? 1), .65, 1.4);
  const saturation = clamp(Number(fx.saturation ?? 1), 0, 1.8);
  const balance = [1 + warmth*.1 + tint*.04, 1 - tint*.08, 1 - warmth*.1 + tint*.04];
  const tables = balance.map(wb => Float32Array.from({ length: 256 }, (_, i) => {
    const linear = Math.max(0, (i/255 * exposure * brightness * gain * wb + lift));
    return clamp((linear ** (1/gamma) - .5)*contrast + .5, 0, 1)*255;
  }));
  return { tables, saturation };
};

export const applyPrecisionGrade = (pixels, grade) => {
  const [red, green, blue] = grade.tables;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = red[pixels[i]], g = green[pixels[i+1]], b = blue[pixels[i+2]];
    const luma = .2126*r + .7152*g + .0722*b;
    pixels[i] = clamp(luma + (r-luma)*grade.saturation, 0, 255);
    pixels[i+1] = clamp(luma + (g-luma)*grade.saturation, 0, 255);
    pixels[i+2] = clamp(luma + (b-luma)*grade.saturation, 0, 255);
  }
  return pixels;
};

const vignetteMaps = new Map();
export const applyPrecisionVignette = (pixels, width, height, amount) => {
  const strength = clamp(Number(amount) || 0, 0, .85);
  if (strength <= .005) return pixels;
  const angle = Math.PI / Number(Math.max(5.5, 17 - strength * 10).toFixed(3));
  const key = `${width}:${height}:${angle}`;
  let factors = vignetteMaps.get(key);
  if (!factors) {
    const distance = Math.hypot(width / 2, height / 2);
    factors = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const radius = Math.hypot(Math.trunc(x - width / 2), Math.trunc(y - height / 2)) / distance;
      factors[y * width + x] = radius > 1 ? 0 : Math.cos(angle * radius) ** 4;
    }
    if (vignetteMaps.size >= 2) vignetteMaps.delete(vignetteMaps.keys().next().value);
    vignetteMaps.set(key, factors);
  }
  // The canonical filter acts on limited-range BT.709 YUV: Y*f and
  // (chroma-127)*f+127. Express that same operation in decoded RGB, including
  // the limited-range black/chroma offsets, rather than a CSS dark gradient.
  const offsets = [16 * 255 / 219 + 1.5748 * 255 / 224,
    16 * 255 / 219 - (.187324 + .468124) * 255 / 224,
    16 * 255 / 219 + 1.8556 * 255 / 224];
  for (let p = 0, i = 0; p < factors.length; p++, i += 4) {
    const factor = factors[p];
    for (let channel = 0; channel < 3; channel++)
      pixels[i + channel] = clamp(pixels[i + channel] * factor + (factor - 1) * offsets[channel], 0, 255);
  }
  return pixels;
};
