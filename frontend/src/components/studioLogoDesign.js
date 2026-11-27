// Logo authoring materializes ordinary vector layers; the existing document,
// path editor, motion graph and compositor own every accepted design.
import glyphs from "./motion/logoGlyphs.v1.json";
import { studioVectorSvg, validateStudioVectorShape } from "./studioVectorShape";
import { validateStudioGraphicsPackage } from "./studioGraphicsPackage";

export const LOGO_DESIGN_DEFAULT = {
  name: "AutoPromote",
  family: "flow",
  layout: "horizontal",
  weight: 900,
  tracking: 1,
  symbolSize: 1,
  primary: "#763bff",
  secondary: "#00c8ef",
  lettering: "#eef2ff",
  gradient: true,
};

export const STUDIO_LOGO_FAMILIES = Object.freeze([
  ["flow", "Flow", "Ribbon ascent"],
  ["orbit", "Orbit", "Interlocking motion"],
  ["facet", "Facet", "Geometric structure"],
  ["prism", "Prism", "3D crystal core"],
  ["crown", "Crown", "Sovereign apex crest"],
  ["pulse", "Pulse", "Sonic kinetic wave"],
  ["infinity", "Infinity", "Dual mobius loop"],
]);

export const STUDIO_LOGO_COLOR_RECIPES = Object.freeze([
  {
    id: "cyber_ultraviolet",
    label: "Cyber Ultraviolet",
    primary: "#763bff",
    secondary: "#00c8ef",
    lettering: "#eef2ff",
    gradient: true,
  },
  {
    id: "cinema_gold",
    label: "Cinema Gold",
    primary: "#f59e0b",
    secondary: "#fde68a",
    lettering: "#fffbeb",
    gradient: true,
  },
  {
    id: "emerald_surge",
    label: "Emerald Surge",
    primary: "#10b981",
    secondary: "#06b6d4",
    lettering: "#ecfdf5",
    gradient: true,
  },
  {
    id: "solar_flare",
    label: "Solar Flare",
    primary: "#ef4444",
    secondary: "#f97316",
    lettering: "#fff7ed",
    gradient: true,
  },
  {
    id: "neon_magenta",
    label: "Neon Magenta",
    primary: "#ec4899",
    secondary: "#8b5cf6",
    lettering: "#fdf2f8",
    gradient: true,
  },
  {
    id: "arctic_titanium",
    label: "Arctic Titanium",
    primary: "#38bdf8",
    secondary: "#94a3b8",
    lettering: "#f8fafc",
    gradient: true,
  },
]);

export const STUDIO_LOGO_ANIMATION_STYLES = Object.freeze([
  {
    id: "cascade",
    label: "Cascade Assembly",
    description: "Classic staggered scale, rotation & vertical rise",
  },
  {
    id: "laser_trace",
    label: "Laser Trim Trace",
    description: "Vector path laser drawing with luminous fill ignition",
  },
  {
    id: "elastic_bloom",
    label: "Elastic Spring Bloom",
    description: "Multi-stage liquid spring overshoot & counter-spin",
  },
  {
    id: "vortex_convergence",
    label: "360° Orbital Vortex",
    description: "Radial spiral convergence from outer orbit into lockup",
  },
  {
    id: "kinetic_slam",
    label: "Broadcast Impact Slam",
    description: "High-altitude Z-drop with whip-tilt shockwave settle",
  },
  {
    id: "neon_flicker",
    label: "Cyber Neon Ignition",
    description: "Staccato neon tube ignition with harmonic pulse",
  },
]);

const ALLOWED_FAMILIES = STUDIO_LOGO_FAMILIES.map(([id]) => id);

const clone = value => JSON.parse(JSON.stringify(value));
const node = (x, y, inside = [0, 0], outside = [0, 0]) => ({ x, y, in: inside, out: outside });
const polygon = points => points.map(([x, y]) => node(x, y));
const paint = (spec, reverse = false) => ({
  kind: spec.gradient ? "linear" : "solid",
  color: reverse ? spec.secondary : spec.primary,
  endColor: reverse ? spec.primary : spec.secondary,
  start: [0, 100],
  end: [100, 0],
});
const shape = (nodes, fill, strokeWidth = 0, strokeColor = "#ffffff") => ({
  version: 1,
  closed: true,
  nodes,
  fill,
  stroke: { color: strokeColor, width: strokeWidth },
});
const solid = color => ({ kind: "solid", color, endColor: color, start: [0, 100], end: [100, 0] });
const circle = (radius = 40, cx = 50, cy = 50) => {
  const k = radius * 0.55228475;
  return [
    node(cx, cy - radius, [-k, 0], [k, 0]),
    node(cx + radius, cy, [0, -k], [0, k]),
    node(cx, cy + radius, [k, 0], [-k, 0]),
    node(cx - radius, cy, [0, k], [0, -k]),
  ];
};

export function validateStudioLogoDesign(spec) {
  if (!spec || Object.keys(spec).some(k => !Object.keys(LOGO_DESIGN_DEFAULT).includes(k)))
    throw Error("Unknown logo design setting.");
  const font = glyphs.weights[String(spec.weight)];
  if (
    typeof spec.name !== "string" ||
    !spec.name.trim() ||
    spec.name.length > 32 ||
    !font ||
    [...spec.name].some(c => !font.glyphs[c])
  )
    throw Error(
      "Use 1–32 Latin letters, numbers, spaces, &, periods or hyphens with bundled Inter 600 or 900."
    );
  if (
    !ALLOWED_FAMILIES.includes(spec.family) ||
    !["horizontal", "stacked", "symbol"].includes(spec.layout) ||
    typeof spec.gradient !== "boolean"
  )
    throw Error("Choose a supported logo family and layout.");
  for (const [key, lo, hi] of [
    ["tracking", -2, 12],
    ["symbolSize", 0.6, 1.4],
  ])
    if (
      typeof spec[key] !== "number" ||
      !Number.isFinite(spec[key]) ||
      spec[key] < lo ||
      spec[key] > hi
    )
      throw Error(`Logo ${key} must be ${lo}–${hi}.`);
  for (const key of ["primary", "secondary", "lettering"])
    if (!/^#[a-f\d]{6}$/i.test(spec[key] || "")) throw Error("Choose six-digit logo colours.");
  return spec;
}

export function studioLogoSymbol(spec) {
  validateStudioLogoDesign(spec);
  if (spec.family === "facet")
    return [
      shape(
        polygon([
          [50, 7],
          [87, 29],
          [50, 50],
          [13, 29],
        ]),
        paint(spec)
      ),
      shape(
        polygon([
          [13, 35],
          [46, 55],
          [46, 94],
          [13, 74],
        ]),
        paint(spec, true)
      ),
      shape(
        polygon([
          [54, 55],
          [87, 35],
          [87, 74],
          [54, 94],
        ]),
        solid(spec.primary)
      ),
    ];
  if (spec.family === "orbit")
    return [
      {
        version: 2,
        contours: [
          { closed: true, nodes: circle(39) },
          { closed: true, nodes: circle(23) },
        ],
        fill: paint(spec),
        stroke: { color: "#ffffff", width: 0 },
      },
      shape(
        [
          node(14, 77, [-3, -15], [16, -4]),
          node(82, 15, [-17, 5], [16, -6]),
          node(93, 22, [-3, -11], [-15, 27]),
          node(22, 88, [29, -5], [-9, 1]),
        ],
        paint(spec, true)
      ),
    ];
  if (spec.family === "prism")
    return [
      shape(
        polygon([
          [50, 6],
          [90, 30],
          [72, 48],
          [50, 32],
          [28, 48],
          [10, 30],
        ]),
        paint(spec)
      ),
      shape(
        polygon([
          [10, 36],
          [46, 62],
          [46, 95],
          [16, 72],
        ]),
        paint(spec, true)
      ),
      shape(
        polygon([
          [54, 62],
          [90, 36],
          [84, 72],
          [54, 95],
        ]),
        solid(spec.primary)
      ),
      shape(
        polygon([
          [50, 38],
          [66, 50],
          [50, 62],
          [34, 50],
        ]),
        solid(spec.secondary)
      ),
    ];
  if (spec.family === "crown")
    return [
      shape(
        polygon([
          [50, 8],
          [65, 42],
          [50, 64],
          [35, 42],
        ]),
        paint(spec)
      ),
      shape(
        polygon([
          [10, 24],
          [34, 46],
          [44, 70],
          [18, 70],
        ]),
        paint(spec, true)
      ),
      shape(
        polygon([
          [90, 24],
          [82, 70],
          [56, 70],
          [66, 46],
        ]),
        paint(spec, true)
      ),
      shape(
        polygon([
          [18, 76],
          [82, 76],
          [76, 92],
          [24, 92],
        ]),
        solid(spec.secondary)
      ),
    ];
  if (spec.family === "pulse")
    return [
      shape(
        [
          node(8, 56, [0, 0], [10, -18]),
          node(34, 18, [-8, 12], [8, 14]),
          node(52, 74, [-8, -14], [9, -16]),
          node(70, 12, [-8, 14], [10, 18]),
          node(92, 48, [-8, -10], [0, 0]),
          node(74, 54, [0, 0], [-6, -12]),
          node(66, 36, [4, 8], [-6, 12]),
          node(50, 92, [8, -14], [-8, -14]),
          node(32, 42, [6, 10], [-6, 10]),
          node(18, 66, [6, -8], [0, 0]),
        ],
        paint(spec)
      ),
      shape(
        polygon([
          [44, 8],
          [58, 8],
          [52, 26],
          [38, 26],
        ]),
        paint(spec, true)
      ),
      shape(
        polygon([
          [42, 76],
          [60, 76],
          [54, 92],
          [36, 92],
        ]),
        solid(spec.secondary)
      ),
    ];
  if (spec.family === "infinity")
    return [
      {
        version: 2,
        contours: [
          { closed: true, nodes: circle(27, 32, 50) },
          { closed: true, nodes: circle(14, 32, 50) },
        ],
        fill: paint(spec),
        stroke: { color: "#ffffff", width: 0 },
      },
      {
        version: 2,
        contours: [
          { closed: true, nodes: circle(27, 68, 50) },
          { closed: true, nodes: circle(14, 68, 50) },
        ],
        fill: paint(spec, true),
        stroke: { color: "#ffffff", width: 0 },
      },
      shape(
        polygon([
          [36, 32],
          [68, 62],
          [60, 70],
          [28, 40],
        ]),
        solid(spec.secondary)
      ),
    ];
  return [
    shape(
      [
        node(9, 83, [0, 0], [4, -23]),
        node(38, 17, [-13, 15], [6, -8]),
        node(52, 12, [-6, -3], [9, 3]),
        node(65, 26, [-4, -7], [-11, 6]),
        node(43, 49, [9, -10], [-12, 13]),
        node(30, 83, [5, -17], [0, 0]),
      ],
      paint(spec)
    ),
    shape(
      [
        node(48, 31, [0, 0], [12, -8]),
        node(66, 25, [-4, -2], [14, 17]),
        node(91, 83, [-8, -22], [0, 0]),
        node(69, 83, [0, 0], [-4, -20]),
        node(56, 52, [7, 9], [0, 0]),
      ],
      paint(spec, true)
    ),
    shape(
      [
        node(29, 75, [0, 0], [18, -20]),
        node(68, 58, [-10, -3], [3, 8]),
        node(74, 72, [-2, -6], [-17, -7]),
        node(38, 87, [12, -10], [0, 0]),
      ],
      solid(spec.secondary)
    ),
  ];
}

function applyLogoLayerAnimation(layers, duration, animationStyle = "cascade", spec = LOGO_DESIGN_DEFAULT) {
  const key = (property, time, value, easing = "linear", curve = [0.16, 0.85, 0.24, 1]) => ({
    property,
    time: Math.round(time * 90000) / 90000,
    value,
    easing,
    ...(easing === "bezier" ? { curve } : {}),
  });

  layers.forEach((layer, i) => {
    const start = Math.min(duration * 0.12, i * 0.045);
    const end = Math.min(duration * 0.65, start + Math.min(1.2, duration * 0.35));
    const mid = start + (end - start) * 0.62;
    const isSymbolPart = layer.name.includes("· symbol ");
    const hasHoldWindow = duration > end + 0.45;
    const breatheAt = Math.round((end + (duration - end) * 0.45) * 90000) / 90000;
    const settleAt = Math.round((duration * 0.94) * 90000) / 90000;
    const breatheScale = isSymbolPart ? 1.055 : 1.015;

    if (animationStyle === "laser_trace") {
      // Enable luminous contour stroke and drive real trim-path drawing before fill ignition
      if (layer.vectorShape?.stroke) {
        layer.vectorShape.stroke = {
          color: isSymbolPart ? spec.secondary : spec.primary,
          width: isSymbolPart ? 3.2 : 2.3,
        };
      }
      layer.strokeStart = 0;
      layer.strokeEnd = 0;
      const traceCurve = [0.22, 1, 0.36, 1];
      const traceEnd = Math.min(duration * 0.72, start + Math.min(1.45, duration * 0.42));
      const ignitionAt = start + (traceEnd - start) * 0.72;
      const traceHasHold = duration > traceEnd + 0.45;
      const traceBreatheAt = Math.round((traceEnd + (duration - traceEnd) * 0.42) * 90000) / 90000;
      const traceSettleAt = Math.round((duration * 0.94) * 90000) / 90000;
      const yLift = isSymbolPart ? -1.4 : (i % 2 ? -0.9 : 0.9);
      layer.keys = [
        key("strokeEnd", start, 0),
        key("strokeEnd", ignitionAt, 100, "bezier", traceCurve),
        key("opacity", start, 0),
        key("opacity", start + (ignitionAt - start) * 0.14, 0.94),
        key("opacity", ignitionAt, 0.96),
        key("opacity", traceEnd, 1, "bezier", traceCurve),
        key("scale", start, 0.78),
        key("scale", traceEnd, isSymbolPart ? 1.06 : 1.03, "bezier", traceCurve),
        ...(traceHasHold
          ? [
              key("scale", traceBreatheAt, isSymbolPart ? 1.1 : 1.045, "ease_in_out"),
              key("scale", traceSettleAt, 1, "ease_in_out"),
              key("y", traceEnd, layer.y),
              key("y", traceBreatheAt, Math.max(4, Math.min(96, layer.y + yLift)), "ease_in_out"),
              key("y", traceSettleAt, layer.y, "ease_in_out"),
            ]
          : []),
        key("x", start, Math.max(2, layer.x - (isSymbolPart ? 5 : 2.5))),
        key("x", traceEnd, layer.x, "bezier", traceCurve),
        key("rotation", start, isSymbolPart ? -24 : 8),
        key("rotation", traceEnd, isSymbolPart ? 4 : 0, "bezier", traceCurve),
        ...(traceHasHold && isSymbolPart
          ? [
              key("rotation", traceBreatheAt, -3, "ease_in_out"),
              key("rotation", traceSettleAt, 0, "ease_in_out"),
            ]
          : []),
      ];
      return;
    }

    if (animationStyle === "elastic_bloom") {
      const springCurve = [0.2, 1.38, 0.32, 1];
      layer.keys = [
        key("opacity", start, 0),
        key("opacity", mid, 1),
        key("scale", start, 0.12),
        key("scale", mid, 1.24, "bezier", springCurve),
        key("scale", end, 1, "bezier"),
        ...(hasHoldWindow ? [key("scale", breatheAt, breatheScale, "ease_in_out"), key("scale", settleAt, 1, "ease_in_out")] : []),
        key("rotation", start, isSymbolPart ? -65 : (i % 2 ? 32 : -32)),
        key("rotation", mid, isSymbolPart ? 8 : (i % 2 ? -5 : 5), "bezier", springCurve),
        key("rotation", end, 0, "bezier"),
        key("y", start, Math.min(98, layer.y + 16)),
        key("y", end, layer.y, "bezier", springCurve),
      ];
      return;
    }

    if (animationStyle === "vortex_convergence") {
      const angle = (i / Math.max(1, layers.length)) * Math.PI * 2;
      const orbitX = Math.max(4, Math.min(96, 50 + Math.cos(angle) * 32));
      const orbitY = Math.max(4, Math.min(96, 50 + Math.sin(angle) * 28));
      layer.keys = [
        key("opacity", start, 0),
        key("opacity", mid, 1),
        key("x", start, orbitX),
        key("x", end, layer.x, "bezier"),
        key("y", start, orbitY),
        key("y", end, layer.y, "bezier"),
        key("scale", start, 0.18),
        key("scale", end, 1, "bezier"),
        ...(hasHoldWindow ? [key("scale", breatheAt, breatheScale, "ease_in_out"), key("scale", settleAt, 1, "ease_in_out")] : []),
        key("rotation", start, i % 2 ? 160 : -160),
        key("rotation", end, 0, "bezier"),
      ];
      return;
    }

    if (animationStyle === "kinetic_slam") {
      const slamCurve = [0.12, 0.96, 0.2, 1];
      layer.keys = [
        key("opacity", start, 0),
        key("opacity", Math.min(end, start + 0.1), 1),
        key("scale", start, 2.65),
        key("scale", mid, 0.92, "bezier", slamCurve),
        key("scale", end, 1, "bezier"),
        ...(hasHoldWindow ? [key("scale", breatheAt, breatheScale, "ease_in_out"), key("scale", settleAt, 1, "ease_in_out")] : []),
        key("rotation", start, i % 2 ? -18 : 18),
        key("rotation", end, 0, "bezier", slamCurve),
        key("y", start, Math.max(2, layer.y - 14)),
        key("y", end, layer.y, "bezier", slamCurve),
      ];
      return;
    }

    if (animationStyle === "neon_flicker") {
      const f1 = start + (end - start) * 0.22;
      const f2 = start + (end - start) * 0.42;
      const f3 = start + (end - start) * 0.68;
      layer.keys = [
        key("opacity", start, 0),
        key("opacity", f1, 0.92),
        key("opacity", f2, 0.18),
        key("opacity", f3, 1),
        key("opacity", end, 1),
        ...(hasHoldWindow ? [key("opacity", breatheAt, 0.86, "ease_in_out"), key("opacity", settleAt, 1, "ease_in_out")] : []),
        key("scale", start, 0.86),
        key("scale", f2, 1.06, "bezier"),
        key("scale", end, 1, "bezier"),
      ];
      return;
    }

    // Default "cascade" style: exact 8 keys per layer
    layer.keys = [
      key("opacity", start, 0),
      key("opacity", end, 1),
      key("scale", start, 0.2),
      key("scale", end, 1, "bezier"),
      key("rotation", start, i % 2 ? 24 : -24),
      key("rotation", end, 0, "bezier"),
      key("y", start, Math.min(98, layer.y + 12)),
      key("y", end, layer.y, "bezier"),
    ];
  });
}

export function buildStudioLogoDesign(
  spec,
  {
    width = 1280,
    height = 720,
    duration = 8,
    animate = false,
    animationStyle = "cascade",
    strokeTrace = false,
  } = {}
) {
  validateStudioLogoDesign(spec);
  if (
    ![width, height, duration].every(Number.isFinite) ||
    width < 16 ||
    height < 16 ||
    duration < 0.2
  )
    throw Error("Open a valid Studio programme first.");
  const W = width,
    H = height,
    font = glyphs.weights[String(spec.weight)],
    text = spec.name.trim(),
    layers = [];
  const add = (name, vectorShape, cx, cy, side) => {
    const shaped = clone(vectorShape);
    if (strokeTrace && shaped.stroke) {
      shaped.stroke = {
        color: name.includes("· symbol ") ? spec.secondary : spec.primary,
        width: name.includes("· symbol ") ? 2.2 : 1.5,
      };
    }
    layers.push({
      id: `logo-${layers.length}`,
      name,
      type: "artwork",
      vectorShape: shaped,
      startTime: 0,
      duration,
      x: (cx / W) * 100,
      y: (cy / H) * 100,
      width: (side / W) * 100,
      height: (side / H) * 100,
      scale: 1,
      rotation: 0,
      opacity: 1,
      keys: [],
    });
  };
  const mark = studioLogoSymbol(spec),
    isStack = spec.layout === "stacked",
    isSymbol = spec.layout === "symbol";
  let markSide = Math.min(W * 0.21, H * 0.37) * spec.symbolSize,
    fontSize = Math.min(H * 0.115, W * 0.083);
  let advance =
    [...text].reduce((sum, c) => sum + (font.glyphs[c].advance / font.unitsPerEm) * fontSize, 0) +
    (text.length - 1) * spec.tracking;
  const available = isStack ? W * 0.8 : W * 0.82 - markSide - 40;
  if (advance > available) {
    fontSize *= available / advance;
    advance =
      [...text].reduce((sum, c) => sum + (font.glyphs[c].advance / font.unitsPerEm) * fontSize, 0) +
      (text.length - 1) * spec.tracking;
  }
  if (!isSymbol && fontSize < 20)
    throw Error("Shorten the name or reduce the letter spacing to keep the wordmark readable.");
  if (isSymbol) markSide = Math.min(W, H) * 0.56 * spec.symbolSize;
  const total = markSide + 36 + advance,
    markX = isSymbol || isStack ? W / 2 : (W - total) / 2 + markSide / 2;
  const markY = isStack ? H * 0.37 : H / 2;
  mark.forEach((s, i) => add(`${text} · symbol ${i + 1}`, s, markX, markY, markSide));
  if (!isSymbol) {
    let cursor = isStack ? (W - advance) / 2 : (W - total) / 2 + markSide + 36;
    // Unhinted glyph geometry is authored once, with a common baseline. Every
    // letter/counter becomes normal editable cubic contours, not a font raster.
    const baseline = isStack ? H * 0.73 : H / 2 + fontSize * 0.35;
    for (const char of text) {
      const g = font.glyphs[char],
        unit = fontSize / font.unitsPerEm;
      if (g.contours.length)
        add(
          `${text} · letter ${char}`,
          {
            version: 2,
            contours: g.contours,
            fill: solid(spec.lettering),
            stroke: { color: "#ffffff", width: 0 },
          },
          cursor + (g.left + g.side / 2) * unit,
          baseline + (-g.top + g.side / 2) * unit,
          g.side * unit
        );
      cursor += g.advance * unit + spec.tracking;
    }
  }
  if (animate) {
    applyLogoLayerAnimation(layers, duration, animationStyle, spec);
  }
  const input = {
    format: "autopromote-graphics",
    version: 1,
    name: `Logo · ${text} · ${spec.family}`,
    width: W,
    height: H,
    duration,
    layers,
    groups: [
      {
        id: "logo-master",
        name: `Logo · ${text} · ${spec.family}`,
        startTime: 0,
        duration,
        layerIds: layers.map(l => l.id),
        keys: [],
      },
    ],
  };
  return validateStudioGraphicsPackage(input, { duration, aspect: W / H });
}

export function studioLogoMasterSvg(
  layers,
  { width = 1280, height = 720, variant = "colour", group } = {}
) {
  if (!["colour", "light", "dark"].includes(variant) || !layers.length || layers.length > 128)
    throw Error("Choose a logo and a colour variant.");
  const parts = layers.map((layer, index) => {
    validateStudioVectorShape(layer.vectorShape);
    // A master is the base layout before timeline animation. Reject unrelated
    // composition effects rather than silently flattening unsupported fields.
    if (
      layer.mask?.enabled ||
      layer.layerMask?.enabled ||
      layer.glow?.enabled ||
      layer.layerShadow?.enabled ||
      Number(layer.blur || 0) !== 0 ||
      Number(layer.cropX || 0) !== 0 ||
      Number(layer.cropY || 0) !== 0 ||
      Number(layer.borderRadius || 0) !== 0 ||
      (layer.frameShape && layer.frameShape !== "edge") ||
      (layer.blendMode && layer.blendMode !== "normal") ||
      ["cropTop", "cropBottom", "cropLeft", "cropRight"].some(k => Number(layer[k] || 0) !== 0)
    )
      throw Error(
        "Logo masters support vector geometry and base transforms. Remove masks, crops, filters, rounded frames or blends before exporting."
      );
    const s = clone(layer.vectorShape);
    if (variant !== "colour") {
      const c = variant === "light" ? "#ffffff" : "#111827";
      s.fill = {
        ...s.fill,
        kind: s.fill.kind === "none" ? "none" : "solid",
        color: c,
        endColor: c,
      };
      s.stroke.color = c;
    }
    const w = (layer.width / 100) * width,
      h = (layer.height / 100) * height,
      x = (layer.x / 100) * width,
      y = (layer.y / 100) * height,
      ax = ((layer.anchorX ?? 50) / 100) * w,
      ay = ((layer.anchorY ?? 50) / 100) * h,
      scale = layer.scale ?? 1,
      rotation = layer.rotation ?? 0;
    if (![w, h, x, y, ax, ay, scale, rotation].every(Number.isFinite) || w <= 0 || h <= 0)
      throw Error("Invalid logo base transform.");
    let svg = studioVectorSvg(s, {
      strokeStart: layer.strokeStart ?? 0,
      strokeEnd: layer.strokeEnd ?? 100,
      strokeOffset: layer.strokeOffset ?? 0,
    });
    const fit = layer.mediaFit || "contain";
    if (!["contain", "cover", "stretch"].includes(fit))
      throw Error("Choose a supported logo image fit.");
    svg = svg
      .replace(/id="paint"/g, `id="logo-paint-${index}"`)
      .replace(/url\(#paint\)/g, `url(#logo-paint-${index})`)
      .replace('preserveAspectRatio="none"',
        `preserveAspectRatio="${fit === "stretch" ? "none" : fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"`)
      .replace(
        'width="1024" height="1024"',
        `x="${-ax}" y="${-ay}" width="${w}" height="${h}"`
      );
    return `<g opacity="${layer.opacity ?? 1}" transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">${svg}</g>`;
  });
  if (group?.mask?.enabled || (group?.blendMode && group.blendMode !== "normal"))
    throw Error("Remove the group mask or blend before exporting a logo master.");
  const t = group?.transform || {},
    x = ((t.x || 0) / 100) * width,
    y = ((t.y || 0) / 100) * height;
  if (
    ![width, height, x, y, t.rotation ?? 0, t.scale ?? 1, t.opacity ?? 1].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("Invalid logo artboard or group transform.");
  const content = `<g opacity="${t.opacity ?? 1}" transform="translate(${x + width / 2} ${y + height / 2}) rotate(${t.rotation || 0}) scale(${t.scale ?? 1}) translate(${-width / 2} ${-height / 2})">${parts.join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Editable logo master</title>${content}</svg>`;
}

export const studioLogoPreviewUri = svg => `data:image/svg+xml;base64,${btoa(svg)}`;
