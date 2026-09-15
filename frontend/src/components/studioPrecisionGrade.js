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
