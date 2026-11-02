// Bounded swept surfaces shared numerically with the canonical Blender mesh.
export const RIBBON_DEFAULTS = { path: "knot", width: .55, thickness: .065, wave: .65, lobes: 3, twists: 1, speed: .3, phase: 0 };
export const RIBBON_BOUNDS = { width: [.1, 1.2, .01], thickness: [.015, .2, .005], wave: [0, 1.2, .01], lobes: [1, 6, 1], twists: [-3, 3, 1], speed: [-1, 1, .01], phase: [0, 360, 1] };
export function normalizeRibbon(raw = {}) {
  const result = { path: ["loop", "knot", "wave"].includes(raw.path) ? raw.path : RIBBON_DEFAULTS.path };
  for (const [field, [min, max]] of Object.entries(RIBBON_BOUNDS)) {
    let value = Number.isFinite(Number(raw[field])) ? Math.max(min, Math.min(max, Number(raw[field]))) : RIBBON_DEFAULTS[field];
    if (["lobes", "twists"].includes(field)) value = Math.round(value);
    result[field] = value;
  }
  return result;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a); return a.map(v => v / length); };
export function ribbonMesh(raw, local = 0) {
  const p = normalizeRibbon(raw), segments = 192, profileSize = 16, closed = p.path !== "wave";
  const phase = p.phase * Math.PI / 180 + local * p.speed * Math.PI / 4;
  const centre = u => {
    const a = u * Math.PI * 2;
    if (!closed) return [(u - .5) * 5.2, p.wave * .8 * Math.sin(p.lobes * a + phase), p.wave * .7 * Math.cos(a + phase * .65)];
    const angle = p.path === "knot" ? a * 2 : a;
    const radius = 1.4 + p.wave * .4 * Math.cos(p.lobes * a + phase);
    return [radius * Math.cos(angle), radius * Math.sin(angle), p.wave * .9 * Math.sin(p.lobes * a + phase)];
  };
  const profile = [], radius = Math.min(p.thickness * .42, p.width * .08);
  for (let corner = 0; corner < 4; corner += 1) {
    const cx = [1, -1, -1, 1][corner] * (p.width / 2 - radius);
    const cy = [1, 1, -1, -1][corner] * (p.thickness / 2 - radius);
    for (let j = 0; j < 4; j += 1) {
      const a = corner * Math.PI / 2 + j * Math.PI / 6;
      profile.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
  }
  const positions = [], indices = [], rings = closed ? segments : segments + 1;
  for (let i = 0; i < rings; i += 1) {
    const u = i / segments, c = centre(u), before = centre(u - .0001), after = centre(u + .0001);
    const tangent = unit(after.map((v, k) => v - before[k]));
    const normal = unit(cross(tangent, [0, 0, 1])), binormal = cross(tangent, normal);
    const angle = Math.PI * 2 * p.twists * u + .3 * Math.sin(p.lobes * u * Math.PI * 2 + phase) + phase * .2;
    const first = normal.map((v, k) => v * Math.cos(angle) + binormal[k] * Math.sin(angle));
    const second = normal.map((v, k) => -v * Math.sin(angle) + binormal[k] * Math.cos(angle));
    for (const [x, y] of profile) positions.push(...c.map((v, k) => v + first[k] * x + second[k] * y));
  }
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % rings;
    for (let j = 0; j < profileSize; j += 1) {
      const a = i * profileSize + j, b = i * profileSize + (j + 1) % profileSize;
      const c = next * profileSize + (j + 1) % profileSize, d = next * profileSize + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (!closed) for (let j = 1; j < profileSize - 1; j += 1) {
    const last = segments * profileSize;
    indices.push(0, j + 1, j, last, last + j, last + j + 1);
  }
  return { positions, indices };
}
