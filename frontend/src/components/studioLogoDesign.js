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
const shape = (nodes, fill) => ({
  version: 1,
  closed: true,
  nodes,
  fill,
  stroke: { color: "#ffffff", width: 0 },
});
const solid = color => ({ kind: "solid", color, endColor: color, start: [0, 100], end: [100, 0] });
const circle = (radius = 40) => {
  const k = radius * 0.55228475;
  return [
    node(50, 50 - radius, [-k, 0], [k, 0]),
    node(50 + radius, 50, [0, -k], [0, k]),
    node(50, 50 + radius, [k, 0], [-k, 0]),
    node(50 - radius, 50, [0, k], [0, -k]),
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
    !["flow", "orbit", "facet"].includes(spec.family) ||
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
export function buildStudioLogoDesign(
  spec,
  { width = 1280, height = 720, duration = 8, animate = false } = {}
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
  const add = (name, vectorShape, cx, cy, side) =>
    layers.push({
      id: `logo-${layers.length}`,
      name,
      type: "artwork",
      vectorShape: clone(vectorShape),
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
  if (animate)
    layers.forEach((layer, i) => {
      const start = Math.min(duration * 0.12, i * 0.045),
        end = Math.min(duration * 0.65, start + Math.min(1.2, duration * 0.35));
      const key = (property, time, value, easing = "linear") => ({
        property,
        time,
        value,
        easing,
        ...(easing === "bezier" ? { curve: [0.16, 0.85, 0.24, 1] } : {}),
      });
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
      .replace(
        'width="1024" height="1024"',
        `x="${-ax}" y="${-ay}" width="${w}" height="${h}" preserveAspectRatio="${fit === "stretch" ? "none" : fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"`
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
