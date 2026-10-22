// Authored geometric masks. Feather is measured in the Studio 720px programme
// coordinate system before layer scale; this is not subject segmentation.
const bounded = (value, min, max, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
export const hasSoftStudioMask = mask => !!mask?.enabled && (!!mask.inverted || Number(mask.feather) > 0);
export const DEFAULT_STUDIO_MASK_POLYGON = 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
export function parseStudioMaskPolygon(path = DEFAULT_STUDIO_MASK_POLYGON) {
  const match = /^polygon\((.{1,2048})\)$/.exec(String(path).trim());
  const pairs = match?.[1].split(',') || [];
  if (pairs.length < 3 || pairs.length > 64) throw new Error('Use a percentage polygon with 3 to 64 points.');
  return pairs.map(pair => {
    const point = /^\s*(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%\s*$/.exec(pair);
    if (!point || !Number.isFinite(Number(point[1])) || !Number.isFinite(Number(point[2])))
      throw new Error('Each polygon point needs two finite percentages, for example 10% 20%.');
    return [Number(point[1]), Number(point[2])];
  });
}
export function studioLayerMaskSvg(mask, cropX, cropY, width, height, programmeScale = 1) {
  if (!mask?.enabled) return null;
  const w = bounded(width, 1, 16384, 1), h = bounded(height, 1, 16384, 1);
  const x = w * bounded(cropX, 0, 45) / 100, y = h * bounded(cropY, 0, 45) / 100;
  const sigma = bounded(mask.feather, 0, 100) * bounded(programmeScale, .0001, 16, 1);
  let shape;
  const fill = 'white';
  const filter = sigma > 0 || mask.inverted ? ' filter="url(#soft)"' : '';
  if (mask.shape === 'ellipse') {
    shape = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * .48}" ry="${h * .48}" fill="${fill}"${filter}/>`;
  } else if (mask.shape === 'polygon') {
    const points = parseStudioMaskPolygon(mask.path || DEFAULT_STUDIO_MASK_POLYGON)
      .map(([px, py]) => `${px * w / 100},${py * h / 100}`).join(' ');
    shape = `<polygon points="${points}" fill="${fill}"${filter}/>`;
  } else {
    const radius = bounded(mask.radius ?? 6, 0, 50, 6) / 100;
    shape = `<rect x="${x}" y="${y}" width="${w - x * 2}" height="${h - y * 2}" rx="${Math.min(w * radius, (w - x * 2) / 2)}" ry="${Math.min(h * radius, (h - y * 2) / 2)}" fill="${fill}"${filter}/>`;
  }
  // Invert alpha directly. A black/white luminance mask applies color-space
  // conversion to partial coverage and changes the authored Gaussian edge.
  const soft = sigma > 0 || mask.inverted ? `<filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">${sigma > 0 ? `<feGaussianBlur stdDeviation="${sigma}"/>` : ''}${mask.inverted ? '<feComponentTransfer><feFuncA type="linear" slope="-1" intercept="1"/></feComponentTransfer>' : ''}</filter>` : '';
  const content = `<defs>${soft}</defs>${shape}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
}
