// Shared authoring contract only. All picture/motion execution remains in the
// existing Studio scene actions, Node Flow, compiler and canonical renderer.
const object = (v, keys) =>
  v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const number = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const text = (v, max) =>
  typeof v === "string" && v.trim() && v.length <= max && ![...v].some(char => char === "<" || char === ">" || char.charCodeAt(0) < 32);
function materializeDirectorNodePlan(plan, context) {
  const fail = message => {
    throw Error(message);
  };
  if (
    !object(plan, ["name", "concept", "nodes", "links", "drivers"]) ||
    !text(plan.name, 80) ||
    !text(plan.concept, 300) ||
    !Array.isArray(plan.nodes) ||
    plan.nodes.length < 3 ||
    plan.nodes.length > 16 ||
    !Array.isArray(plan.links) ||
    plan.links.length < 1 ||
    plan.links.length > 20 ||
    !Array.isArray(plan.drivers) ||
    plan.drivers.length > 8
  )
    fail("Director needs a named node composition, real connections and motion drivers.");
  const ids = new Map(),
    layers = [];
  for (const n of plan.nodes) {
    if (
      !object(n, ["id", "kind", "source", "color", "poses", "region", "range", "sourceStart"]) ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(n.id || "") ||
      ids.has(n.id) ||
      !["video", "solid", "ellipse", "ring", "rig"].includes(n.kind) ||
      !Array.isArray(n.poses) ||
      !n.poses.length ||
      n.poses.length > 8
    )
      fail("Invalid Director node.");
    ids.set(n.id, n);
    const range = n.range || [0, 1],
      sourceStart = n.sourceStart ?? 0;
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !number(range[0], 0, 1) ||
      !number(range[1], range[0] + 0.01, 1) ||
      !number(sourceStart, 0, 3600)
    )
      fail("Invalid node source/programme range.");
    const source = Number.isInteger(n.source) ? context.media[n.source - 1] : null;
    if (
      n.kind === "video" &&
      (!source || source.duration + 0.001 < sourceStart + (range[1] - range[0]) * context.duration)
    )
      fail("Choose a saved clip long enough for this composition.");
    if (
      n.region &&
      (n.kind !== "video" ||
        !Array.isArray(n.region) ||
        n.region.length !== 4 ||
        n.region.some(v => !number(v, 0, 100)) ||
        n.region[2] - n.region[0] < 2 ||
        n.region[3] - n.region[1] < 2)
    )
      fail("A video fragment needs a finite rectangular source region.");
    if (["solid", "ellipse", "ring"].includes(n.kind) && !/^#[a-f\d]{6}$/i.test(n.color || ""))
      fail("Choose a six-digit colour for shape nodes.");
    let previous = -1;
    const poses = n.poses.map(p => {
      if (
        !Array.isArray(p) ||
        p.length !== 6 ||
        !number(p[0], range[0], range[1]) ||
        p[0] <= previous ||
        !number(p[1], -100, 200) ||
        !number(p[2], -100, 200) ||
        !number(p[3], n.kind === "rig" || n.kind === "video" ? 0.02 : 0.1, 3) ||
        !number(p[4], -360, 360) ||
        !number(p[5], 0, 1)
      )
        fail("Node poses need ordered progress, position, scale, rotation and opacity.");
      previous = p[0];
      return {
        at: Math.round(p[0] * context.duration * 90000) / 90000,
        x: p[1],
        y: p[2],
        scale: p[3],
        rotation: p[4],
        opacity: p[5],
      };
    });
    layers.push({
      id: n.id,
      name: n.id.replace(/_/g, " "),
      kind: n.kind === "video" ? "video" : n.kind === "rig" ? "rig" : "shape",
      sourceMediaId: source?.id || "",
      sourceStart,
      start: Math.round(range[0] * context.duration * 90000) / 90000,
      end: Math.round(range[1] * context.duration * 90000) / 90000,
      ...(n.region
        ? {
            perspective: {
              version: 1,
              sourceRect: [...n.region],
              corners: [
                [n.region[0], n.region[1]],
                [n.region[2], n.region[1]],
                [n.region[2], n.region[3]],
                [n.region[0], n.region[3]],
              ],
            },
          }
        : {}),
      shape: n.kind === "ellipse" || n.kind === "ring" ? "ellipse" : "none",
      polygon: "",
      color: n.color || "",
      parentId: "",
      matteId: "",
      matteMode: "",
      poses,
    });
  }
  let parentCount = 0,
    matteCount = 0;
  const destinations = new Set();
  for (const e of plan.links) {
    if (
      !object(e, ["from", "to", "port", "mode"]) ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      e.from === e.to ||
      !["Parent", "Mask"].includes(e.port)
    )
      fail("Invalid Director connection.");
    const stamp = e.to + ":" + e.port;
    if (destinations.has(stamp)) fail("A node input can have only one connection.");
    destinations.add(stamp);
    const src = ids.get(e.from),
      dst = ids.get(e.to),
      layer = layers.find(l => l.id === e.to);
    if (e.port === "Parent") {
      if (src.kind !== "rig") fail("Parent links must come from a rig.");
      layer.parentId = e.from;
      parentCount++;
    } else {
      if (
        src.kind === "rig" ||
        dst.kind === "rig" ||
        !["alpha", "alpha_inverted", "luma", "luma_inverted"].includes(e.mode)
      )
        fail("Mask links need a pixel source and supported matte mode.");
      layer.matteId = e.from;
      layer.matteMode = e.mode;
      matteCount++;
    }
  }
  for (const edge of ["parentId", "matteId"])
    for (const n of layers) {
      const seen = new Set([n.id]);
      let next = n[edge];
      while (next) {
        if (seen.has(next)) fail("Director node connections contain a cycle.");
        seen.add(next);
        const currentId = next;
        next = layers.find(l => l.id === currentId)?.[edge];
      }
    }
  const driverChannels = new Set();
  for (const d of plan.drivers) {
    if (
      !object(d, ["target", "property", "type", "rate", "frequency", "amount", "phase"]) ||
      !ids.has(d.target) ||
      !["x", "y", "scale", "rotation", "opacity"].includes(d.property) ||
      !["spin", "pulse"].includes(d.type)
    )
      fail("Invalid Director motion driver.");
    const stamp = d.target + ":" + d.property;
    if (driverChannels.has(stamp)) fail("Use one driver per node channel.");
    driverChannels.add(stamp);
    if (d.type === "spin" && !number(d.rate, -180, 180))
      fail("Spin rate is outside the supported limit.");
    if (
      d.type === "pulse" &&
      (!number(d.frequency, 0.05, 3) ||
        !number(
          d.amount,
          -{ scale: 0.3, opacity: 0.5, x: 25, y: 25, rotation: 45 }[d.property],
          { scale: 0.3, opacity: 0.5, x: 25, y: 25, rotation: 45 }[d.property]
        ) ||
        !number(d.phase || 0, -360, 360))
    )
      fail("Pulse settings are outside the supported limit.");
  }
  if (
    !layers.some(l => l.kind === "video") ||
    (!matteCount && !plan.nodes.some(n => n.region)) ||
    !parentCount
  )
    fail(
      "The composition must use footage, a real matte or source-region branch, and a controller connection."
    );
  if (!plan.drivers.length && !plan.nodes.some(n => n.poses.length > 1))
    fail("The composition needs authored animation or a motion driver.");
  const opaque = layers.some(
    l =>
      l.kind !== "rig" &&
      !l.parentId &&
      !l.matteId &&
      !l.perspective?.sourceRect &&
      l.start === 0 &&
      l.end === context.duration &&
      l.shape === "none" &&
      l.poses.every(
        p => p.x === 50 && p.y === 50 && p.scale >= 1 && p.rotation === 0 && p.opacity === 1
      )
  );
  if (!opaque) fail("Keep an opaque full-frame background beneath the node composition.");
  return { name: plan.name, concept: plan.concept, layers };
}
module.exports = { materializeDirectorNodePlan };

// A typed media-window operator lowers to normal MediaIn/Transform/Mask/Merge
// branches and a controller. It supplies no fixed arrangement or timestamps.
function expandDirectorWindowLayout(layout) {
  const fail = m => {
    throw Error(m);
  };
  if (
    !["normalized", "percent"].includes(layout?.coordinates) ||
    !["fill", "hold"].includes(layout?.finish)
  )
    fail("Declare window coordinate units and end behaviour.");
  if (
    !object(layout, [
      "name",
      "concept",
      "coordinates",
      "finish",
      "background",
      "controller",
      "windows",
    ]) ||
    !text(layout.name, 80) ||
    !text(layout.concept, 300) ||
    !Number.isInteger(layout.background) ||
    !object(layout.controller, ["spin", "pulse", "frequency"]) ||
    !number(layout.controller.spin, -60, 60) ||
    !number(layout.controller.pulse, 0, 0.2) ||
    !number(layout.controller.frequency, 0.05, 1) ||
    !Array.isArray(layout.windows) ||
    layout.windows.length < 1 ||
    layout.windows.length > 3
  )
    fail("Invalid Director window layout.");
  const nodes = [
      { id: "backdrop", kind: "video", source: layout.background, poses: [[0, 50, 50, 1, 0, 1]] },
      { id: "controller", kind: "rig", poses: [[0, 50, 50, 1, 0, 1]] },
    ],
    links = [];
  for (const [i, w] of layout.windows.entries()) {
    if (
      !object(w, ["source", "color", "poses"]) ||
      !Number.isInteger(w.source) ||
      !/^#[a-f\d]{6}$/i.test(w.color || "") ||
      !Array.isArray(w.poses)
    )
      fail("A media window needs a saved source, border colour and motion poses.");
    const poses = w.poses.map(p => {
      const a = Array.isArray(p)
        ? p
        : object(p, ["progress", "x", "y", "scale", "rotation", "opacity"])
          ? [p.progress, p.x, p.y, p.scale, p.rotation, p.opacity]
          : null;
      if (!a || a.length !== 6 || !a.every(Number.isFinite)) fail("Invalid window motion pose.");
      return layout.coordinates === "normalized"
        ? [a[0], a[1] * 100, a[2] * 100, ...a.slice(3)]
        : [...a];
    });
    // `fill` is an authoring operator, not an instruction to the language model
    // to solve coverage numerically. Preserve its travel poses, then lower the
    // declared finish into explicit editable keys. At the maximum supported
    // negative scale pulse, radius 348 * 2.7 * .8 still covers a 1280x720 frame.
    // Validate supplied poses before replacing a terminal intent pose.
    if (!poses.length || poses.length > 3) fail("Use one to three window motion poses.");
    let previous = -1;
    for (const p of poses) {
      if (
        !number(p[0], 0, 1) ||
        p[0] <= previous ||
        !number(p[1], -100, 200) ||
        !number(p[2], -100, 200) ||
        !number(p[3], 0.1, 3) ||
        !number(p[4], -360, 360) ||
        !number(p[5], 0, 1)
      )
        fail("Invalid window motion pose.");
      previous = p[0];
    }
    if (layout.finish === "fill") {
      const last = poses.at(-1);
      const end = i === 0 ? [1, 50, 50, 2.7, 0, 1] : [1, ...last.slice(1, 5), 0];
      if (last[0] === 1) poses[poses.length - 1] = end;
      else poses.push(end);
    }
    const id = "window_" + (i + 1),
      mask = id + "_mask",
      fill = id + "_picture",
      ring = id + "_ring";
    nodes.push(
      { id: mask, kind: "ellipse", color: "#ffffff", poses: poses },
      { id: fill, kind: "video", source: w.source, poses: [[0, 50, 50, 1, 0, 1]] },
      { id: ring, kind: "ring", color: w.color, poses: poses }
    );
    links.push(
      { from: "controller", to: mask, port: "Parent" },
      { from: "controller", to: ring, port: "Parent" },
      { from: mask, to: fill, port: "Mask", mode: "alpha" }
    );
  }
  if (
    Math.abs(layout.controller.spin) > 1 &&
    !nodes
      .filter(n => n.kind === "ellipse")
      .some(n => n.poses.some(p => Math.hypot(p[1] - 50, p[2] - 50) > 3))
  )
    fail("Rotation needs at least one off-centre circular window to create visible travel.");
  return {
    name: layout.name,
    concept: layout.concept,
    nodes,
    links,
    drivers: [
      { target: "controller", property: "rotation", type: "spin", rate: layout.controller.spin },
      {
        target: "controller",
        property: "scale",
        type: "pulse",
        frequency: layout.controller.frequency,
        amount: layout.controller.pulse,
        phase: 0,
      },
    ],
  };
}
module.exports.expandDirectorWindowLayout = expandDirectorWindowLayout;
