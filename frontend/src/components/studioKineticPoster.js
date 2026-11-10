// A reusable motion-design composition. All artwork, masks, vector strokes,
// camera connections and keys are authored into the existing native engine.
const glyphs = require("./motion/logoGlyphs.v1.json");
const PALETTES = {
  orange_ink: ["#f4efe6", "#141419", "#ff5838", "#daff40"],
  cobalt_lime: ["#f4f1e8", "#111624", "#244aff", "#dfff45"],
  pink_ink: ["#f4efe6", "#19121d", "#ff5c8b", "#c9ff4a"],
};
function validateKineticPoster(spec) {
  if (
    !spec ||
    Object.keys(spec).some(k => !["name", "words", "palette", "energy"].includes(k)) ||
    typeof spec.name !== "string" ||
    !spec.name.trim() ||
    spec.name.length > 80 ||
    !Array.isArray(spec.words) ||
    spec.words.length !== 3 ||
    spec.words.some(w => typeof w !== "string" || !/^[A-Z]{2,6}$/.test(w)) ||
    !PALETTES[spec.palette] ||
    typeof spec.energy !== "number" ||
    !Number.isFinite(spec.energy) ||
    spec.energy < 0.5 ||
    spec.energy > 1
  )
    throw Error("Choose three short uppercase words, a motion palette and energy0.5–1.");
  return spec;
}
function buildKineticPoster(spec, duration = 10) {
  validateKineticPoster(spec);
  if (!Number.isFinite(duration) || duration < 8 || duration > 20)
    throw Error("Kinetic motion design needs8–20seconds.");
  const [paper, ink, accent, signal] = PALETTES[spec.palette],
    layers = [],
    actions = [],
    groups = [];
  const t = x => Math.round(((x * duration) / 10) * 90000) / 90000;
  const ease = [0.16, 1, 0.3, 1],
    snap = [0.76, 0, 0.18, 1],
    spring = [0.2, 1.25, 0.38, 1];
  const add = (id, name, a, b, fields) => {
    const l = {
      id,
      name,
      type: "artwork",
      startTime: t(a),
      duration: t(b) - t(a),
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      scale: 1,
      rotation: 0,
      opacity: 1,
      keys: [],
      ...fields,
    };
    layers.push(l);
    return l;
  };
  const key = (l, property, points, curve = ease) => {
    for (const [time, value] of points)
      l.keys.push({ property, time: t(time), value, easing: "bezier", curve });
  };
  const svg = body =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`;
  const field = (id, color, a, b) =>
    add(id, id, a, b, { svg: svg(`<rect width="1280" height="720" fill="${color}"/>`) });
  const solid = color => ({
    kind: "solid",
    color,
    endColor: color,
    start: [0, 100],
    end: [100, 0],
  });
  const circle = (color, stroke = 0) => ({
    version: 1,
    closed: true,
    nodes: [
      { x: 50, y: 6, in: [-24.3, 0], out: [24.3, 0] },
      { x: 94, y: 50, in: [0, -24.3], out: [0, 24.3] },
      { x: 50, y: 94, in: [24.3, 0], out: [-24.3, 0] },
      { x: 6, y: 50, in: [0, 24.3], out: [0, -24.3] },
    ],
    fill: stroke ? { ...solid(color), kind: "none" } : solid(color),
    stroke: { color, width: stroke },
  });
  const disk = (id, color, a, b, width = 24) =>
    add(id, id, a, b, { vectorShape: circle(color), width, height: (width * 1280) / 720 });
  const word = (text, a, b, cx, cy, em, color, prefix, outline = false) => {
    const font = glyphs.weights["900"];
    em = Math.min(
      em,
      (1050 * font.unitsPerEm) / [...text].reduce((n, c) => n + font.glyphs[c].advance, 0)
    );
    const unit = em / font.unitsPerEm;
    const advance = [...text].reduce((n, c) => n + font.glyphs[c].advance * unit, 0);
    let cursor = cx * 12.8 - advance / 2;
    const baseline = cy * 7.2 + em * 0.35,
      out = [];
    for (const [i, c] of [...text].entries()) {
      const g = font.glyphs[c],
        side = g.side * unit,
        x = (cursor + (g.left + g.side / 2) * unit) / 12.8,
        y = (baseline + (-g.top + g.side / 2) * unit) / 7.2;
      const vectorShape = {
        version: 2,
        contours: JSON.parse(JSON.stringify(g.contours)),
        fill: outline ? { ...solid(color), kind: "none" } : solid(color),
        stroke: { color, width: outline ? 1.1 : 0 },
      };
      const l = add(`${prefix}_${i}`, `${prefix} / ${c}`, a, b, {
        vectorShape,
        x,
        y,
        width: side / 12.8,
        height: side / 7.2,
      });
      out.push(l);
      cursor += g.advance * unit;
    }
    return out;
  };
  field("Paper stage", paper, 0, 10);
  add("registration", "Registration / fine geometry", 0, 2.7, {
    svg: svg(
      `<path d="M70 85h36M88 67v36M1174 85h36M1192 67v36M70 635h36M88 617v36M1174 635h36M1192 617v36" fill="none" stroke="${ink}" stroke-width="2"/>`
    ),
  });
  // A travelling impulse uses the same ordinary position/easing keys as the type.
  const impulse = disk("Impulse", accent, 0, 1.15, 5);
  key(
    impulse,
    "x",
    [
      [0, 8],
      [0.55, 50],
      [1.15, 90],
    ],
    snap
  );
  key(
    impulse,
    "y",
    [
      [0, 72],
      [0.55, 25],
      [1.15, 50],
    ],
    snap
  );
  key(impulse, "scale", [
    [0, 0.2],
    [0.2, 1.3],
    [0.55, 0.8],
    [1.15, 0.1],
  ]);
  // Piece construction retains actual editable vector contours and masks.
  const make = word(spec.words[0], 0.45, 2.85, 50, 49, 260, ink, "Construct");
  for (const [i, original] of [...make].entries()) {
    layers.splice(layers.indexOf(original), 1);
    for (let band = 0; band < 3; band++) {
      const begin = 0.45 + i * 0.09 + band * 0.055,
        arrive = 1.5 + i * 0.075 + band * 0.04;
      const l = add(
        original.id + "_band_" + band,
        `Construct / ${spec.words[0][i]} / band${band + 1}`,
        begin,
        2.05,
        {
          ...original,
          id: original.id + "_band_" + band,
          name: `Construct / ${spec.words[0][i]} / band${band + 1}`,
          startTime: t(begin),
          duration: t(2.05) - t(begin),
          keys: [],
          mask: {
            enabled: true,
            shape: "polygon",
            path: `polygon(0% ${(band * 100) / 3}%,100% ${(band * 100) / 3}%,100% ${((band + 1) * 100) / 3}%,0% ${((band + 1) * 100) / 3}%)`,
            feather: 0,
            inverted: false,
          },
        }
      );
      const sign = band === 1 ? -1 : 1;
      key(
        l,
        "x",
        [
          [begin, Math.max(6, Math.min(94, original.x + sign * (16 + i * 2) * spec.energy))],
          [arrive, original.x],
          [2.05, original.x],
        ],
        spring
      );
      key(
        l,
        "y",
        [
          [begin, Math.max(8, Math.min(92, original.y + (band - 1) * 35 * spec.energy))],
          [arrive, original.y],
          [2.05, original.y],
        ],
        spring
      );
      key(
        l,
        "rotation",
        [
          [begin, (band - 1) * 42 * spec.energy],
          [arrive, 0],
          [2.05, 0],
        ],
        spring
      );
    }
  }
  // Clean resolved contours replace the construction pieces after they settle.
  word(spec.words[0], 2.05, 2.85, 50, 49, 260, ink, "Resolved");
  const cut = disk("Accent wipe", accent, 2.35, 5.15, 56);
  key(
    cut,
    "scale",
    [
      [2.35, 0.1],
      [2.95, 2.6],
      [5.15, 2.6],
    ],
    snap
  );
  key(
    cut,
    "x",
    [
      [2.35, 84],
      [2.95, 50],
      [5.15, 50],
    ],
    snap
  );
  const orbit = add("orbit", "Orbit / editable trim stroke", 2.75, 4.9, {
    vectorShape: circle(ink, 1.2),
    width: 48,
    height: (48 * 1280) / 720,
  });
  key(
    orbit,
    "rotation",
    [
      [2.75, -80],
      [4.9, 45],
    ],
    ease
  );
  actions.push({
    type: "keys",
    targetId: "orbit",
    keys: [
      { property: "strokeEnd", time: t(2.75), value: 0, easing: "linear" },
      { property: "strokeEnd", time: t(3.7), value: 100, easing: "bezier", curve: ease },
      { property: "strokeOffset", time: t(2.75), value: -25, easing: "linear" },
      { property: "strokeOffset", time: t(4.9), value: 40, easing: "linear" },
    ],
  });
  for (const [i, l] of word(spec.words[1], 2.85, 4.95, 50, 49, 390, ink, "Impact").entries()) {
    key(
      l,
      "y",
      [
        [2.85, l.y + (i ? 35 : -35)],
        [3.4 + i * 0.08, l.y],
        [4.45, l.y],
        [4.95, Math.max(5, l.y - 40)],
      ],
      spring
    );
    key(
      l,
      "rotation",
      [
        [2.85, i ? 18 : -18],
        [3.4 + i * 0.08, 0],
        [4.6, 0],
        [4.95, -12],
      ],
      spring
    );
  }
  const signalField = field("Signal field", signal, 4.55, 10);
  key(
    signalField,
    "y",
    [
      [4.55, 155],
      [5.1, 50],
      [10, 50],
    ],
    snap
  );
  // Outlined echoes arrive before the main letters, then peel away as the
  // filled word lands. This is actual contour geometry, not an outline filter.
  for (let echo = 0; echo < 2; echo++)
    for (const [i, l] of word(
      spec.words[2],
      4.95 + echo * 0.07,
      7.7,
      50,
      49,
      245,
      accent,
      "Echo" + echo,
      true
    ).entries()) {
      const a = 4.95 + echo * 0.07;
      key(
        l,
        "x",
        [
          [a, l.x + (echo ? 9 : -9)],
          [5.8 + i * 0.05, l.x + (echo ? 1.8 : -1.8)],
          [6.5, l.x + (echo ? 1.8 : -1.8)],
          [7.7, l.x + (echo ? 12 : -12)],
        ],
        ease
      );
      key(
        l,
        "y",
        [
          [a, l.y + (echo ? -32 : 32)],
          [5.8 + i * 0.05, l.y + (echo ? -3 : 3)],
          [6.5, l.y + (echo ? -3 : 3)],
          [7.7, l.y + (echo ? -26 : 26)],
        ],
        ease
      );
      key(l, "opacity", [
        [a, 1],
        [7.1, 1],
        [7.7, 0],
      ]);
    }
  for (const [i, l] of word(spec.words[2], 5.1, 7.85, 50, 49, 245, ink, "Move").entries()) {
    const a = 5.1 + i * 0.07;
    l.startTime = t(a);
    l.duration = t(7.85) - t(a);
    key(
      l,
      "y",
      [
        [a, Math.min(94, l.y + 38)],
        [6 + i * 0.055, l.y],
        [7.2, l.y],
        [7.85, Math.max(5, l.y - 42)],
      ],
      spring
    );
    key(
      l,
      "rotation",
      [
        [a, (i % 2 ? 1 : -1) * 30],
        [6 + i * 0.055, 0],
        [7.2, 0],
        [7.85, -10],
      ],
      spring
    );
    key(
      l,
      "scale",
      [
        [a, 0.35],
        [5.8 + i * 0.055, 1.12],
        [6.15 + i * 0.055, 1],
        [7.85, 1],
      ],
      ease
    );
  }
  const finalField = field("Final ink field", ink, 7.35, 10);
  key(
    finalField,
    "x",
    [
      [7.35, 155],
      [7.9, 50],
      [10, 50],
    ],
    snap
  );
  const finalIds = [];
  for (const [row, text] of spec.words.entries())
    for (const [i, l] of word(
      text,
      7.7 + row * 0.12,
      10,
      55,
      [28, 49, 70][row],
      row === 1 ? 115 : 145,
      row === 1 ? accent : paper,
      "Final" + row
    ).entries()) {
      finalIds.push(l.id);
      const a = 7.7 + row * 0.12;
      key(
        l,
        "x",
        [
          [a, l.x + 14],
          [8.55 + row * 0.09 + i * 0.035, l.x],
          [10, l.x],
        ],
        spring
      );
      key(
        l,
        "rotation",
        [
          [a, -12],
          [8.55 + row * 0.09, 0],
          [10, 0],
        ],
        spring
      );
    }
  // Eight independently keyed petals form the final motion mark.
  for (let i = 0; i < 8; i++) {
    const angle = i > 4 ? i * 45 - 360 : i * 45;
    const a = 7.85 + i * 0.035,
      l = add("petal_" + i, "Motion mark / petal" + (i + 1), a, 10, {
        svg: svg(`<rect x="610" y="120" width="60" height="235" rx="28" fill="${accent}"/>`),
        width: 28,
        height: (28 * 1280) / 720,
        x: 24,
        y: 49,
        rotation: angle,
      });
    key(
      l,
      "rotation",
      [
        [a, angle - 130],
        [8.8, angle],
        [10, angle + 12],
      ],
      spring
    );
    key(
      l,
      "scale",
      [
        [a, 0.1],
        [8.65, 1.12],
        [9, 1],
        [10, 1],
      ],
      spring
    );
    finalIds.push(l.id);
  }
  const rig = "poster_camera";
  actions.unshift({
    type: "null",
    id: rig,
    name: "Poster / shared camera",
    startTime: 0,
    duration,
    transform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
  });
  for (const id of finalIds)
    actions.push({ type: "node_connect", sourceId: rig, targetId: id, port: "Parent" });
  actions.push({
    type: "keys",
    targetId: rig,
    keys: [
      { property: "scale", time: t(7.7), value: 1, easing: "linear" },
      { property: "scale", time: t(9.3), value: 1.04, easing: "bezier", curve: ease },
      { property: "scale", time: t(10), value: 1.04, easing: "linear" },
    ],
  });
  return {
    graphics: {
      format: "autopromote-graphics",
      version: 1,
      name: spec.name,
      width: 1280,
      height: 720,
      duration,
      layers,
      groups,
    },
    actions,
    summary: {
      editableVectorLetters: true,
      sourceIndependent: true,
      phases: [
        "piece construction",
        "vector stroke and type impact",
        "outlined echo and spring landing",
        "shared camera lockup",
      ],
      layers: layers.length,
      connections: finalIds.length,
    },
    cueTimes: [t(0.45), t(2.35), t(4.55), t(7.35)],
  };
}
module.exports = { buildKineticPoster, validateKineticPoster, PALETTES };
