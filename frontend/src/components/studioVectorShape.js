// Editable artwork geometry on an ordinary image layer. Transforms and time
// remain in the canonical Studio motion graph, not in another animation store.
const only = (item, fields) => {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    Object.keys(item).some(k => !fields.includes(k))
  )
    throw Error("Unknown vector artwork field.");
};
const number = (v, lo, hi) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
    throw Error(`Vector coordinate must be ${lo} to ${hi}.`);
};
const pair = (p, lo, hi) => {
  if (!Array.isArray(p) || p.length !== 2) throw Error("Vector handles need two coordinates.");
  p.forEach(v => number(v, lo, hi));
};
const color = c => {
  if (!/^#[a-f\d]{6}$/i.test(c || "")) throw Error("Use a six-digit vector color.");
};
export function validateStudioVectorShape(shape) {
  only(
    shape,
    shape?.version === 2
      ? ["version", "contours", "fill", "stroke"]
      : ["version", "closed", "nodes", "fill", "stroke"]
  );
  if (![1, 2].includes(shape.version)) throw Error("Choose vector artwork version 1 or 2.");
  const contours = studioVectorContours(shape);
  if (!Array.isArray(contours) || !contours.length || contours.length > 8)
    throw Error("Compound artwork needs one to eight contours.");
  let total = 0;
  contours.forEach(contour => {
    if (shape.version === 2) only(contour, ["closed", "nodes"]);
    if (
      typeof contour.closed !== "boolean" ||
      !Array.isArray(contour.nodes) ||
      contour.nodes.length < (contour.closed ? 3 : 2) ||
      contour.nodes.length > 64
    )
      throw Error("Provide a valid vector contour and its points.");
    total += contour.nodes.length;
    contour.nodes.forEach(n => {
      only(n, ["x", "y", "in", "out"]);
      number(n.x, 0, 100);
      number(n.y, 0, 100);
      pair(n.in, -200, 200);
      pair(n.out, -200, 200);
    });
  });
  if (total > 256) throw Error("Compound artwork supports at most 256 points.");
  only(shape.fill, ["kind", "color", "endColor", "start", "end"]);
  if (!["none", "solid", "linear"].includes(shape.fill.kind))
    throw Error("Choose no fill, solid fill or linear gradient.");
  color(shape.fill.color);
  color(shape.fill.endColor);
  pair(shape.fill.start, 0, 100);
  pair(shape.fill.end, 0, 100);
  if (shape.fill.kind === "linear" && shape.fill.start.every((v, i) => v === shape.fill.end[i]))
    throw Error("Gradient endpoints must differ.");
  only(shape.stroke, ["color", "width"]);
  color(shape.stroke.color);
  number(shape.stroke.width, 0, 20);
  if (shape.fill.kind === "none" && !shape.stroke.width)
    throw Error("An unfilled path needs a visible stroke.");
  return shape;
}
export const studioVectorContours = shape =>
  shape.version === 2 ? shape.contours : [{ closed: shape.closed, nodes: shape.nodes }];
export const studioVectorContour = (shape, index = 0) => ({
  version: 1,
  ...studioVectorContours(shape)[index],
  fill: shape.fill,
  stroke: shape.stroke,
});
export function replaceStudioVectorContour(shape, index, contour) {
  if (shape.version === 1)
    return validateStudioVectorShape({ ...shape, closed: contour.closed, nodes: contour.nodes });
  return validateStudioVectorShape({
    ...shape,
    contours: shape.contours.map((c, i) =>
      i === index ? { closed: contour.closed, nodes: contour.nodes } : c
    ),
  });
}
export const createStudioVectorShape = () => ({
  version: 1,
  closed: true,
  nodes: [
    { x: 15, y: 78, in: [0, 0], out: [0, -48] },
    { x: 49, y: 15, in: [-16, 0], out: [20, 0] },
    { x: 85, y: 78, in: [0, -46], out: [0, 0] },
    { x: 65, y: 78, in: [0, 0], out: [-5, -36] },
    { x: 49, y: 40, in: [10, 0], out: [-12, 0] },
    { x: 35, y: 78, in: [0, -24], out: [0, 0] },
  ],
  fill: { kind: "linear", color: "#8b2bff", endColor: "#00d4ff", start: [0, 100], end: [100, 0] },
  stroke: { color: "#ffffff", width: 0 },
});

export const VECTOR_SHAPE_PRIMITIVE_CATALOG = Object.freeze([
  { id: "arch_crest", label: "Arch Crest", summary: "Curved sculptural arch monogram" },
  { id: "starburst_seal", label: "Starburst Seal", summary: "12-vertex radial promo burst badge" },
  { id: "hexagon_shield", label: "Hexagon Shield", summary: "Precision 6-sided geometric emblem" },
  { id: "broadcast_ribbon", label: "Broadcast Ribbon", summary: "Angled lower-third headline banner" },
  { id: "target_reticle", label: "Target Reticle (v2 Cutout)", summary: "Compound ring with transparent inner counter" },
  { id: "callout_pointer", label: "Callout Pointer", summary: "Editorial speech/callout badge with pointer tail" },
  { id: "neon_capsule", label: "Neon Pill Capsule", summary: "Smooth Bezier pill frame with neon outline" },
  { id: "lightning_chevron", label: "Lightning Chevron", summary: "High-velocity directional speed chevron" },
]);

const roundCoord = v => Number(Math.max(0, Math.min(100, v)).toFixed(2));
const roundHandle = v => Number(Math.max(-200, Math.min(200, v)).toFixed(2));

const buildCircleContour = (cx = 50, cy = 50, r = 34) => {
  const k = Number((r * 0.5522847).toFixed(2));
  return {
    closed: true,
    nodes: [
      { x: roundCoord(cx), y: roundCoord(cy - r), in: [-k, 0], out: [k, 0] },
      { x: roundCoord(cx + r), y: roundCoord(cy), in: [0, -k], out: [0, k] },
      { x: roundCoord(cx), y: roundCoord(cy + r), in: [k, 0], out: [-k, 0] },
      { x: roundCoord(cx - r), y: roundCoord(cy), in: [0, k], out: [0, -k] },
    ],
  };
};

export function createStudioVectorPrimitive(primitiveId = "arch_crest") {
  if (primitiveId === "arch_crest") return createStudioVectorShape();
  if (primitiveId === "starburst_seal") {
    const spikes = 12;
    const nodes = [];
    for (let i = 0; i < spikes; i += 1) {
      const angle = (i * Math.PI * 2) / spikes - Math.PI / 2;
      const radius = i % 2 === 0 ? 42 : 24;
      nodes.push({
        x: roundCoord(50 + Math.cos(angle) * radius),
        y: roundCoord(50 + Math.sin(angle) * radius),
        in: [0, 0],
        out: [0, 0],
      });
    }
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes,
      fill: { kind: "linear", color: "#f97316", endColor: "#facc15", start: [0, 100], end: [100, 0] },
      stroke: { color: "#ffffff", width: 1.5 },
    });
  }
  if (primitiveId === "hexagon_shield") {
    const nodes = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      nodes.push({
        x: roundCoord(50 + Math.cos(angle) * 38),
        y: roundCoord(50 + Math.sin(angle) * 40),
        in: [0, 0],
        out: [0, 0],
      });
    }
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes,
      fill: { kind: "linear", color: "#2563eb", endColor: "#22d3ee", start: [0, 0], end: [100, 100] },
      stroke: { color: "#e0f2fe", width: 2 },
    });
  }
  if (primitiveId === "broadcast_ribbon") {
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 14, y: 34, in: [0, 0], out: [0, 0] },
        { x: 92, y: 34, in: [0, 0], out: [0, 0] },
        { x: 84, y: 66, in: [0, 0], out: [0, 0] },
        { x: 8, y: 66, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#ec4899", endColor: "#8b5cf6", start: [0, 50], end: [100, 50] },
      stroke: { color: "#ffffff", width: 1.5 },
    });
  }
  if (primitiveId === "target_reticle") {
    return validateStudioVectorShape({
      version: 2,
      contours: [buildCircleContour(50, 50, 38), buildCircleContour(50, 50, 20)],
      fill: { kind: "linear", color: "#06b6d4", endColor: "#3b82f6", start: [0, 0], end: [100, 100] },
      stroke: { color: "#a5f3fc", width: 1.5 },
    });
  }
  if (primitiveId === "callout_pointer") {
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 14, y: 22, in: [0, 0], out: [0, 0] },
        { x: 86, y: 22, in: [0, 0], out: [0, 0] },
        { x: 86, y: 66, in: [0, 0], out: [0, 0] },
        { x: 46, y: 66, in: [0, 0], out: [0, 0] },
        { x: 26, y: 86, in: [0, 0], out: [0, 0] },
        { x: 30, y: 66, in: [0, 0], out: [0, 0] },
        { x: 14, y: 66, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#6366f1", endColor: "#a855f7", start: [0, 0], end: [100, 100] },
      stroke: { color: "#ffffff", width: 1.5 },
    });
  }
  if (primitiveId === "neon_capsule") {
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 28, y: 30, in: [-14, 0], out: [14, 0] },
        { x: 72, y: 30, in: [-14, 0], out: [14, 0] },
        { x: 88, y: 50, in: [0, -11], out: [0, 11] },
        { x: 72, y: 70, in: [14, 0], out: [-14, 0] },
        { x: 28, y: 70, in: [14, 0], out: [-14, 0] },
        { x: 12, y: 50, in: [0, 11], out: [0, -11] },
      ],
      fill: { kind: "linear", color: "#14b8a6", endColor: "#0ea5e9", start: [0, 50], end: [100, 50] },
      stroke: { color: "#5eead4", width: 2.5 },
    });
  }
  if (primitiveId === "lightning_chevron") {
    return validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 20, y: 20, in: [0, 0], out: [0, 0] },
        { x: 56, y: 20, in: [0, 0], out: [0, 0] },
        { x: 82, y: 50, in: [0, 0], out: [0, 0] },
        { x: 56, y: 80, in: [0, 0], out: [0, 0] },
        { x: 20, y: 80, in: [0, 0], out: [0, 0] },
        { x: 46, y: 50, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#f43f5e", endColor: "#fb923c", start: [0, 0], end: [100, 100] },
      stroke: { color: "#ffe4e6", width: 1.5 },
    });
  }
  throw Error(`Unknown vector primitive: ${primitiveId}`);
}

export function addStudioVectorCounterHole(shape, { radius = 16, centerX = 50, centerY = 54 } = {}) {
  validateStudioVectorShape(shape);
  const existing = studioVectorContours(shape);
  if (existing.length >= 8) throw Error("Compound artwork supports at most 8 contours.");
  const r = Math.max(4, Math.min(36, Number(radius) || 16));
  const hole = buildCircleContour(centerX, centerY, r);
  return validateStudioVectorShape({
    version: 2,
    contours: [...existing.map(c => ({ closed: c.closed, nodes: c.nodes })), hole],
    fill: { ...shape.fill },
    stroke: { ...shape.stroke },
  });
}

export function smoothStudioVectorContourNodes(contour, factor = 0.22) {
  const ns = contour?.nodes || [];
  if (ns.length < 2) return contour;
  const k = Math.max(0.05, Math.min(0.45, Number(factor) || 0.22));
  const smoothed = ns.map((node, i) => {
    const prev = ns[(i + ns.length - 1) % ns.length];
    const next = ns[(i + 1) % ns.length];
    const vx = roundHandle((next.x - prev.x) * k);
    const vy = roundHandle((next.y - prev.y) * k);
    return {
      ...node,
      in: [roundHandle(-vx), roundHandle(-vy)],
      out: [vx, vy],
    };
  });
  return { ...contour, nodes: smoothed };
}

export function scaleStudioVectorContour(contour, scaleFactor = 0.9) {
  const ns = contour?.nodes || [];
  if (!ns.length) return contour;
  const s = Math.max(0.25, Math.min(2.5, Number(scaleFactor) || 0.9));
  const cx = ns.reduce((acc, n) => acc + n.x, 0) / ns.length;
  const cy = ns.reduce((acc, n) => acc + n.y, 0) / ns.length;
  const scaled = ns.map(node => ({
    x: roundCoord(cx + (node.x - cx) * s),
    y: roundCoord(cy + (node.y - cy) * s),
    in: [roundHandle(node.in[0] * s), roundHandle(node.in[1] * s)],
    out: [roundHandle(node.out[0] * s), roundHandle(node.out[1] * s)],
  }));
  return { ...contour, nodes: scaled };
}
export function studioVectorPath(shape) {
  validateStudioVectorShape(shape);
  return studioVectorContours(shape)
    .map(contour => {
      const ns = contour.nodes,
        parts = [`M ${ns[0].x} ${ns[0].y}`];
      for (let i = 0; i < ns.length - (contour.closed ? 0 : 1); i++) {
        const a = ns[i],
          b = ns[(i + 1) % ns.length];
        parts.push(
          `C ${a.x + a.out[0]} ${a.y + a.out[1]} ${b.x + b.in[0]} ${b.y + b.in[1]} ${b.x} ${b.y}`
        );
      }
      return parts.join(" ") + (contour.closed ? " Z" : "");
    })
    .join(" ");
}
// Both consumers measure the same bounded polyline: 128 samples per cubic.
// Percentages follow travelled distance, including uneven/curved segments.
export function studioVectorPoints(shape) {
  validateStudioVectorShape(shape);
  if (shape.version !== 1) throw Error("Measure each compound contour independently.");
  const points = [],
    ns = shape.nodes;
  for (let i = 0; i < ns.length - (shape.closed ? 0 : 1); i++) {
    const a = ns[i],
      b = ns[(i + 1) % ns.length];
    for (let j = 0; j < 128; j++) {
      const t = j / 128,
        v = 1 - t;
      points.push(
        ["x", "y"].map(
          (axis, k) =>
            v ** 3 * a[axis] +
            3 * v * v * t * (a[axis] + a.out[k]) +
            3 * v * t * t * (b[axis] + b.in[k]) +
            t ** 3 * b[axis]
        )
      );
    }
  }
  points.push(shape.closed ? [...points[0]] : [ns.at(-1).x, ns.at(-1).y]);
  return points;
}
export function trimStudioVectorPoints(points, start = 0, end = 100) {
  number(start, 0, 100);
  number(end, 0, 100);
  if (start >= end) return [];
  const lengths = points.map((p, i) =>
    i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return [];
  const lo = (total * start) / 100,
    hi = (total * end) / 100,
    result = [];
  let at = 0;
  for (let i = 1; i < points.length; i++) {
    const length = lengths[i],
      segmentStart = at,
      next = at + length;
    if (length && next > lo && at < hi) {
      const between = distance =>
        points[i - 1].map((v, k) => v + ((points[i][k] - v) * (distance - segmentStart)) / length);
      if (!result.length) result.push(between(Math.max(lo, at)));
      result.push(between(Math.min(hi, next)));
    }
    at = next;
  }
  return result;
}
// Offset moves the selected distance interval. A closed contour crosses its
// original seam continuously; an open contour clips at its real endpoints.
export function offsetStudioVectorPoints(points, start = 0, end = 100, offset = 0, closed = false) {
  number(start, 0, 100);
  number(end, 0, 100);
  number(offset, -1000, 1000);
  if (start >= end) return [];
  if (!closed)
    return trimStudioVectorPoints(
      points,
      Math.max(0, Math.min(100, start + offset)),
      Math.max(0, Math.min(100, end + offset))
    );
  if (end - start === 100) return points;
  const first = (((start + offset) % 100) + 100) % 100,
    last = first + end - start;
  if (last <= 100) return trimStudioVectorPoints(points, first, last);
  const tail = trimStudioVectorPoints(points, first, 100),
    head = trimStudioVectorPoints(points, 0, last - 100);
  return [...tail, ...head.slice(tail.length ? 1 : 0)];
}
export function validateStudioVectorTrim(layer = {}, keys = []) {
  const trimKeys = keys.filter(key =>
    ["strokeStart", "strokeEnd", "strokeOffset"].includes(key.property)
  );
  if (!layer.vectorShape) {
    if (
      layer.strokeStart !== undefined ||
      layer.strokeEnd !== undefined ||
      layer.strokeOffset !== undefined ||
      trimKeys.length
    )
      throw Error("Stroke trim needs editable vector artwork.");
    return;
  }
  const bounds = property => (property === "strokeOffset" ? [-1000, 1000] : [0, 100]);
  for (const property of ["strokeStart", "strokeEnd", "strokeOffset"]) {
    if (layer[property] !== undefined) number(layer[property], ...bounds(property));
  }
  trimKeys.forEach(key => {
    number(key.value, ...bounds(key.property));
    number(key.time, 0, Number.MAX_SAFE_INTEGER);
  });
}
export function studioVectorSvg(
  shape,
  { strokeStart = 0, strokeEnd = 100, strokeOffset = 0 } = {}
) {
  const d = studioVectorPath(shape),
    f = shape.fill,
    s = shape.stroke;
  number(strokeStart, 0, 100);
  number(strokeEnd, 0, 100);
  number(strokeOffset, -1000, 1000);
  const contours = studioVectorContours(shape);
  const full =
    strokeStart === 0 && strokeEnd === 100 && (contours.every(c => c.closed) || strokeOffset === 0);
  const traceActive = !full && s.width > 0;
  const traceFrac = Math.max(0, Math.min(1, (strokeEnd - strokeStart) / 100));
  const fillAlpha = traceActive ? (0.05 + traceFrac * traceFrac * 0.22).toFixed(3) : "1";
  const glowFilter = traceActive
    ? `<filter id="trim-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";
  const gradientStop =
    f.kind === "linear"
      ? `<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="${f.start[0]}" y1="${f.start[1]}" x2="${f.end[0]}" y2="${f.end[1]}"><stop stop-color="${f.color}"/><stop offset="1" stop-color="${f.endColor}"/></linearGradient>`
      : "";
  const fullStroke = full && s.width > 0 ? Number((s.width * 0.45).toFixed(2)) : 0;
  const edgeGlow = fullStroke > 0
    ? `<filter id="trim-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : glowFilter;
  const defsNext = gradientStop || edgeGlow ? `<defs>${gradientStop}${edgeGlow}</defs>` : "";
  const stroke =
    traceActive
      ? contours
          .map((contour, index) => {
            const points = offsetStudioVectorPoints(
              studioVectorPoints(studioVectorContour(shape, index)),
              strokeStart,
              strokeEnd,
              strokeOffset,
              contour.closed
            );
            return points.length
              ? `<polyline points="${points.map(p => p.join(",")).join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round" filter="url(#trim-glow)"/>`
              : "";
          })
          .join("")
      : "";
  // The image element owns contain/cover/stretch, matching the CPU raster.
  // SVG's default inner "meet" letterboxes a stretched non-square image a
  // second time, collapsing a wide contour into a small central square.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100" preserveAspectRatio="none">${defsNext}<path d="${d}" fill-rule="evenodd" fill="${f.kind === "none" ? "none" : f.kind === "linear" ? "url(#paint)" : f.color}"${traceActive ? ` fill-opacity="${fillAlpha}"` : ""}${fullStroke > 0 ? ' filter="url(#trim-glow)"' : ""} stroke="${s.color}" stroke-width="${fullStroke}" stroke-linejoin="round" stroke-linecap="round"/>${stroke}</svg>`;
}
export const studioVectorUri = (shape, pose) =>
  `data:image/svg+xml;base64,${btoa(studioVectorSvg(shape, pose))}`;
export function editStudioVectorNode(shape, index, kind, point) {
  validateStudioVectorShape(shape);
  if (!Number.isInteger(index) || !shape.nodes[index] || !["anchor", "in", "out"].includes(kind))
    throw Error("Choose a vector point or tangent.");
  pair(point, kind === "anchor" ? 0 : -200, kind === "anchor" ? 100 : 200);
  const next = JSON.parse(JSON.stringify(shape)),
    n = next.nodes[index];
  if (kind === "anchor") {
    n.x = point[0];
    n.y = point[1];
  } else n[kind] = [...point];
  return validateStudioVectorShape(next);
}
// Exact De Casteljau subdivision preserves the route when inserting a point.
export function splitStudioVectorSegment(shape, index) {
  validateStudioVectorShape(shape);
  if (
    shape.nodes.length >= 64 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= shape.nodes.length - (shape.closed ? 0 : 1)
  )
    throw Error("Choose a segment with room for another point.");
  const next = JSON.parse(JSON.stringify(shape)),
    a = next.nodes[index],
    b = next.nodes[(index + 1) % next.nodes.length];
  const mid = (p, q) => p.map((v, i) => (v + q[i]) / 2),
    sub = (p, q) => p.map((v, i) => v - q[i]);
  const p = [a.x, a.y],
    q = [b.x, b.y],
    c = [a.x + a.out[0], a.y + a.out[1]],
    d = [b.x + b.in[0], b.y + b.in[1]];
  const u = mid(p, c),
    v = mid(c, d),
    w = mid(d, q),
    l = mid(u, v),
    r = mid(v, w),
    m = mid(l, r);
  a.out = sub(u, p);
  b.in = sub(w, q);
  next.nodes.splice(index + 1, 0, { x: m[0], y: m[1], in: sub(l, m), out: sub(r, m) });
  return validateStudioVectorShape(next);
}
