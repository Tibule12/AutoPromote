// One editable title, ordinary progress keys, and a versioned font layout shared
// with the existing worker compositor. No CSS wall-clock animation or RNG.
import metrics from "./motion/textMetrics.v1.json";

export const TEXT_ANIMATOR_DEFAULT = Object.freeze({
  version: 1,
  unit: "character",
  order: "forward",
  stagger: 65,
  fromX: 0,
  fromY: 1.4,
  fromScale: 0.35,
  fromRotation: -35,
  fromOpacity: 0,
  tracking: 0.3,
  rangeStart: 0,
  rangeEnd: 100,
  easing: "back_out",
});
export const TEXT_ANIMATOR_BOUNDS = {
  stagger: [0, 95],
  fromX: [-4, 4],
  fromY: [-4, 4],
  fromScale: [0, 2.5],
  fromRotation: [-360, 360],
  fromOpacity: [0, 1],
  tracking: [-1, 1],
  rangeStart: [0, 100],
  rangeEnd: [0, 100],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function validateStudioTextAnimator(spec) {
  if (
    !spec ||
    typeof spec !== "object" ||
    Array.isArray(spec) ||
    Object.keys(spec).some(k => !Object.hasOwn(TEXT_ANIMATOR_DEFAULT, k)) ||
    spec.version !== 1 ||
    !["character", "word"].includes(spec.unit) ||
    !["forward", "reverse", "center_out", "edges_in"].includes(spec.order) ||
    !["linear", "ease_out", "ease_in_out", "back_out"].includes(spec.easing)
  )
    throw Error("Invalid text animator settings.");
  for (const [field, [lo, hi]] of Object.entries(TEXT_ANIMATOR_BOUNDS))
    if (
      typeof spec[field] !== "number" ||
      !Number.isFinite(spec[field]) ||
      spec[field] < lo ||
      spec[field] > hi
    )
      throw Error(`Text animator ${field} must be between ${lo} and ${hi}.`);
  return spec;
}
export function validateStudioTextAnimation(layer, keys = []) {
  const spec = layer?.textAnimator;
  const progress = layer?.textProgress;
  const progressKeys = keys.filter(k => k.property === "textProgress");
  if (spec == null) {
    if (progress != null || progressKeys.length)
      throw Error("Text progress needs an enabled text animator.");
    return;
  }
  if (
    layer.type !== "text" ||
    layer.isCaption ||
    layer.bRollMode ||
    layer.b_roll_mode ||
    layer.isRainbow
  )
    throw Error("Text animators need an ordinary plain-color title.");
  validateStudioTextAnimator(spec);
  layoutStudioAnimatedText(layer, 1280); // Also validates the bundled font/copy.
  for (const value of [...(progress == null ? [] : [progress]), ...progressKeys.map(k => k.value)])
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
      throw Error("Text progress must be between zero and 100.");
}
export function layoutStudioAnimatedText(layer, programmeWidth) {
  const font = metrics.weights[layer.fontWeight || 900],
    text = String(layer.text || "");
  if ((layer.fontFamily || "Inter") !== "Inter" || !font)
    throw Error("Text animation uses the bundled Inter weights.");
  if (text.length > 180 || [...text].some(c => c !== "\n" && !Object.hasOwn(font.advances, c)))
    throw Error("Text animation supports up to 180 Latin letters, numbers and punctuation.");
  const length = value => [...value].reduce((sum, c) => sum + font.advances[c], 0);
  const maximum = (programmeWidth * clamp(Number(layer.width || 90), 15, 90)) / 100 - 32;
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line + (line ? " " : "") + word;
      if (line && length(candidate) > maximum) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  if (lines.some(line => length(line) > maximum))
    throw Error("Widen the title box or add a line break inside the long word.");
  if (lines.length > 12)
    throw Error("Text animation supports up to twelve wrapped lines; widen or split this title.");
  const width = Math.min(maximum + 32, Math.max(1, ...lines.map(length)) + 32);
  const units = [],
    glyphs = [];
  lines.forEach((line, row) => {
    const lineWidth = length(line),
      align = layer.textAlign || "center";
    let x =
      align === "left"
        ? 0
        : align === "right"
          ? width - 32 - lineWidth
          : (width - 32 - lineWidth) / 2;
    const baseline = row * 50.4 + (50.4 - font.ascent - font.descent) / 2 + font.ascent;
    // Spaces retain their advance but never consume a stagger slot.
    for (const token of line.match(/\S+|\s+/gu) || []) {
      const tokenStart = x,
        tokenGlyphs = [];
      for (const char of token) {
        const glyph = { char, x, baseline, width: font.advances[char], row };
        if (char.trim()) {
          tokenGlyphs.push(glyph);
          glyphs.push(glyph);
        }
        x += font.advances[char];
      }
      if (layer.textAnimator.unit === "word" && tokenGlyphs.length)
        units.push({
          glyphs: tokenGlyphs,
          x: tokenStart,
          y: row * 50.4,
          width: x - tokenStart,
          lineCenter: (width - 32) / 2,
        });
      else
        for (const glyph of tokenGlyphs)
          units.push({
            glyphs: [glyph],
            x: glyph.x,
            y: row * 50.4,
            width: glyph.width,
            lineCenter: (width - 32) / 2,
          });
    }
  });
  return { width, height: lines.length * 50.4 + 16, units, lines, glyphs };
}
export function studioTextAnimatorPoses(spec, progress, layout) {
  validateStudioTextAnimator(spec);
  const selected = layout.units
    .map((_, i) => i)
    .filter(i => {
      const percent = ((i + 0.5) * 100) / layout.units.length;
      return percent >= spec.rangeStart && percent < spec.rangeEnd;
    });
  const center = (selected.length - 1) / 2;
  const ordered = selected.slice().sort((a, b) => {
    const ai = selected.indexOf(a),
      bi = selected.indexOf(b);
    return spec.order === "reverse"
      ? b - a
      : spec.order === "center_out"
        ? Math.abs(ai - center) - Math.abs(bi - center) || a - b
        : spec.order === "edges_in"
          ? Math.abs(bi - center) - Math.abs(ai - center) || a - b
          : a - b;
  });
  const ranks = new Map(ordered.map((i, rank) => [i, rank]));
  const stagger = selected.length > 1 ? spec.stagger : 0;
  return layout.units.map((unit, index) => {
    const rank = ranks.get(index);
    let t =
      rank === undefined
        ? 1
        : clamp(
            (clamp(progress, 0, 100) -
              (selected.length > 1 ? rank / (selected.length - 1) : 0) * stagger) /
              (100 - stagger),
            0,
            1
          );
    const opacity = spec.fromOpacity + (1 - spec.fromOpacity) * t;
    if (spec.easing === "ease_out") t = 1 - (1 - t) ** 3;
    if (spec.easing === "ease_in_out") t = t * t * (3 - 2 * t);
    if (spec.easing === "back_out" && t > 0 && t < 1)
      t = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
    const remaining = 1 - t;
    return {
      x:
        spec.fromX * 36 * remaining +
        (unit.x + unit.width / 2 - unit.lineCenter) * spec.tracking * remaining,
      y: spec.fromY * 36 * remaining,
      scale: Math.max(0, spec.fromScale + (1 - spec.fromScale) * t),
      rotation: spec.fromRotation * remaining,
      opacity: clamp(opacity, 0, 1),
    };
  });
}
