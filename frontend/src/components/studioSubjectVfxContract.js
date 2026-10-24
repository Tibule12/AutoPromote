// Shared by Studio and its server resolver; no browser or cloud dependencies.
const EFFECT_FIELDS = {
  text_behind: ["text", "x", "y", "font_size", "color"],
  kinetic_type: ["text", "x", "y", "font_size", "color", "tracking", "travel", "align"],
  background_grade: ["exposure", "saturation", "contrast"],
  foreground_grade: ["exposure", "saturation", "contrast"],
  foreground_holdout: ["corners", "feather"],
  background_replace: ["asset_id", "asset_sha256", "blur", "exposure", "saturation"],
  foreground_refine: ["choke", "feather", "recover_box", "recover_hue", "hue_tolerance", "saturation_min",
    "detail_box", "dark_max", "clear_box", "reject_hue", "reject_tolerance", "reject_saturation", "reject_value"],
  tracked_callout: ["text", "offset_x", "offset_y", "font_size", "color", "avoid_subject"],
  depth: ["amount"],
  glow: ["color", "strength", "radius"],
  particles: ["seed", "count", "color", "opacity", "speed"],
};
const fail = message => {
  throw new Error(message);
};
const keys = (value, required) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === required.length &&
  required.every(key => Object.prototype.hasOwnProperty.call(value, key));
const bounded = (value, low, high) =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const stable = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );

function validatePoints(points, labels) {
  if (
    !Array.isArray(points) ||
    !Array.isArray(labels) ||
    points.length < 1 ||
    points.length > 16 ||
    points.length !== labels.length ||
    !labels.includes(1) ||
    !labels.every(label => label === 0 || label === 1) ||
    !points.every(
      point =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(value => bounded(value, 0, 0.999999))
    )
  ) {
    fail("Choose at least one subject point inside the source frame.");
  }
}

function validateSubjectVfxScene(scene) {
  if (
    !keys(scene, [
      "version",
      "id",
      "sourceId",
      "sourceStoragePath",
      "sourceRange",
      "prompt",
      "effects",
    ]) ||
    scene.version !== 1 ||
    !id(scene.id) ||
    typeof scene.sourceId !== "string" ||
    !scene.sourceId ||
    scene.sourceId.length > 160 ||
    typeof scene.sourceStoragePath !== "string" ||
    scene.sourceStoragePath.length > 500 ||
    !keys(scene.sourceRange, ["start", "end"]) ||
    !bounded(scene.sourceRange.start, 0, 86400) ||
    !bounded(scene.sourceRange.end, 0.25, 86412) ||
    scene.sourceRange.end - scene.sourceRange.start < 0.25 ||
    scene.sourceRange.end - scene.sourceRange.start > 10
  )
    fail("Subject effects require a source-bound range of 0.25–10 seconds.");
  if (
    !keys(scene.prompt, ["points", "labels", "shotPrompts"]) ||
    !Array.isArray(scene.prompt.shotPrompts) ||
    scene.prompt.shotPrompts.length > 24
  )
    fail("Invalid subject prompts.");
  validatePoints(scene.prompt.points, scene.prompt.labels);
  const duration = scene.sourceRange.end - scene.sourceRange.start;
  const frameCount = Math.floor(duration * 24 + 0.5);
  let previous = 0;
  let previousFrame = 0;
  for (const shot of scene.prompt.shotPrompts) {
    if (
      !keys(shot, ["time", "points", "labels"]) ||
      !bounded(shot.time, 0.001, duration - 0.001) ||
      shot.time <= previous ||
      Math.floor(shot.time * 24 + 0.5) <= previousFrame ||
      Math.floor(shot.time * 24 + 0.5) >= frameCount
    )
      fail("Shot prompts must be ordered inside the selected range.");
    validatePoints(shot.points, shot.labels);
    previous = shot.time;
    previousFrame = Math.floor(shot.time * 24 + 0.5);
  }
  if (!Array.isArray(scene.effects) || scene.effects.length < 1 || scene.effects.length > 12)
    fail("Add 1–12 subject effect layers.");
  if (scene.effects.filter(effect => effect.type === "foreground_refine" && (effect.edge_radius > 0 || effect.decontaminate > 0)).length > 1)
    fail("Use one fine alpha layer after the authored matte corrections.");
  const ids = new Set();
  for (const effect of scene.effects) {
    const fields = EFFECT_FIELDS[effect?.type] && [...EFFECT_FIELDS[effect.type],
      ...(effect.type === "background_replace" && Object.prototype.hasOwnProperty.call(effect, "reveal_seconds") ? ["reveal_seconds"] : []),
      ...(effect.type === "foreground_refine" ? ["edge_radius", "decontaminate", "detail_polygon", "blue_spill", "clear_paths", "after_refine", "after_holdout", "reject_connected"].filter(key => Object.prototype.hasOwnProperty.call(effect, key)) : [])];
    if (effect?.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect, "after_refine")) fields.push("after_refine");
    if (effect?.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect, "paths")) fields.push("paths");
    if (effect?.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect, "saturation")) fields.push("saturation");
    if (effect?.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect, "source_patches")) fields.push("source_patches");
    if (effect?.type === "background_replace") fields.push(...["surface_corners", "asset_crop"].filter(key => Object.prototype.hasOwnProperty.call(effect, key)));
    if (
      !fields ||
      !keys(effect, ["id", "type", "start", "end", ...fields]) ||
      !id(effect.id) ||
      effect.id.length > 64 ||
      ids.has(effect.id) ||
      !bounded(effect.start, 0, duration) ||
      !bounded(effect.end, 0, duration) ||
      effect.end <= effect.start ||
      Math.ceil(effect.start * 24) >= Math.min(frameCount, Math.ceil(effect.end * 24))
    )
      fail("Invalid subject effect type, fields, identity or timing.");
    ids.add(effect.id);
    if (fields.includes("color") && !/^#[a-fA-F0-9]{6}$/.test(effect.color))
      fail("Use a hex effect color.");
    if (
      fields.includes("text") &&
      (typeof effect.text !== "string" ||
        effect.text.length < 1 ||
        effect.text.length > 120 ||
        [...effect.text].some(character => character.charCodeAt(0) <= 31))
    )
      fail("Use a single line of effect text, up to 120 characters.");
    const bounds = {
      x: [0, 100],
      y: [0, 100],
      font_size: [12, 320],
      tracking: [0, 40],
      travel: [0, 150],
      exposure: [-3, 1],
      saturation: [0, 2],
      contrast: [0.5, 2],
      reveal_seconds: [0, 2],
      offset_x: [-500, 500],
      offset_y: [-500, 500],
      amount: [0, 0.06],
      strength: [0, 0.6],
      radius: [0, 40],
      blur: [0, 40],
      choke: [0, 3], feather: [0, 3], recover_hue: [0, 360], hue_tolerance: [0, 60], saturation_min: [0, 1],
      edge_radius: [0, 8], decontaminate: [0, 1],
      blue_spill: [0, 1],
      dark_max: [0, 1], reject_hue: [0, 360], reject_tolerance: [0, 60], reject_saturation: [0, 1], reject_value: [0, 1],
      opacity: [0, 0.6],
      speed: [0, 100],
      seed: [0, 2147483647],
      count: [1, 80],
    };
    for (const field of fields)
      if (bounds[field] && !bounded(effect[field], ...bounds[field]))
        fail(`Invalid effect ${field}.`);
    if (effect.type === "kinetic_type" && !["left", "center", "right"].includes(effect.align))
      fail("Invalid text alignment.");
    if (effect.type === "tracked_callout" && typeof effect.avoid_subject !== "boolean")
      fail("Choose whether the callout should avoid the subject.");
    if (effect.type === "foreground_refine") {
      if (Object.prototype.hasOwnProperty.call(effect,"reject_connected") && typeof effect.reject_connected!=="boolean")
        fail("Use a boolean background-connected colour cleanup choice.");
      if (Object.prototype.hasOwnProperty.call(effect,"after_holdout") &&
          (typeof effect.after_holdout!=="boolean" || (effect.after_holdout &&
            (effect.edge_radius>0 || effect.decontaminate>0 || effect.choke>0))))
        fail("Use protected-object cleanup without a global choke or another alpha solver.");
      if (Object.prototype.hasOwnProperty.call(effect,"after_refine") &&
          (typeof effect.after_refine!=="boolean" || (effect.after_refine && (effect.edge_radius>0 || effect.decontaminate>0))))
        fail("Use a boolean post-matting colour cleanup without another alpha solver.");
      if (Object.prototype.hasOwnProperty.call(effect, "detail_polygon")) {
        const points = effect.detail_polygon;
        if (!Array.isArray(points) || points.length < 3 || points.length > 64 ||
            !points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => bounded(value, 0, 1))) ||
            Math.abs(points.reduce((area, point, i) => { const next = points[(i + 1) % points.length]; return area + point[0] * next[1] - next[0] * point[1]; }, 0)) < .000001)
          fail("Choose 3–64 distinct source-frame points for the detail region.");
      }
      if (Object.prototype.hasOwnProperty.call(effect, "edge_radius") && !Number.isInteger(effect.edge_radius))
        fail("Edge radius uses whole source pixels.");
      if (!Number.isInteger(effect.choke)) fail("Matte choke uses whole source pixels.");
      for (const field of ["recover_box", "detail_box", "clear_box"])
        if (!Array.isArray(effect[field]) || effect[field].length !== 4 ||
            !effect[field].every(value => bounded(value, 0, 1)) ||
            effect[field][0] > effect[field][2] || effect[field][1] > effect[field][3])
          fail("Matte regions must be ordered inside the source frame.");
    }
    if (effect.type === "foreground_holdout" && (!Array.isArray(effect.corners) || effect.corners.length !== 4 ||
      !effect.corners.every(point => Array.isArray(point) && point.length === 2 && point.every(value => bounded(value, 0, 1)))))
      fail("Choose four source-frame corners for the foreground holdout.");
    if (effect.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect, "after_refine") && typeof effect.after_refine !== "boolean")
      fail("Choose whether to keep the thin detail through cleanup.");
    if (effect.type === "foreground_holdout" && Object.prototype.hasOwnProperty.call(effect,"source_patches")) {
      const quad = points => {
        if (!Array.isArray(points) || points.length!==4 || !points.every(point=>Array.isArray(point) &&
            point.length===2 && point.every(value=>bounded(value,0,1)))) return false;
        const crosses=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
        const area=Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%4];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
        return area>=.000001 && (crosses.every(value=>value>0) || crosses.every(value=>value<0));
      };
      const validRepair=patch=>{
        if (!patch || typeof patch!=="object" || Array.isArray(patch) ||
            !keys(patch,["source","target","feather","end_blend",...["clear_box","protect_paths"].filter(key=>Object.prototype.hasOwnProperty.call(patch,key))]) ||
            !quad(patch.source) || !quad(patch.target) || !bounded(patch.feather,0,3) || !bounded(patch.end_blend,0,32)) return false;
        if (Object.prototype.hasOwnProperty.call(patch,"clear_box") && (!Array.isArray(patch.clear_box) || patch.clear_box.length!==4 ||
            !patch.clear_box.every(value=>bounded(value,0,1)) || patch.clear_box[0]>=patch.clear_box[2] || patch.clear_box[1]>=patch.clear_box[3])) return false;
        if (Object.prototype.hasOwnProperty.call(patch,"protect_paths") && (!Array.isArray(patch.protect_paths) || patch.protect_paths.length<1 ||
            patch.protect_paths.length>16 || !patch.protect_paths.every(points=>Array.isArray(points) && points.length>=3 && points.length<=64 &&
              points.every(point=>Array.isArray(point) && point.length===2 && point.every(value=>bounded(value,0,1))) &&
              Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0))>=.000001))) return false;
        return true;
      };
      if (!Array.isArray(effect.source_patches) || effect.source_patches.length<1 || effect.source_patches.length>16 || !effect.source_patches.every(validRepair))
        fail("Use 1–16 source detail repairs with convex source/target corners, feather 0–3 and end blend 0–32 pixels.");
    }
    for (const field of effect.type === "foreground_holdout" ? ["paths"] : effect.type === "foreground_refine" ? ["clear_paths"] : [])
      if (Object.prototype.hasOwnProperty.call(effect, field) &&
        (!Array.isArray(effect[field]) || effect[field].length < 1 || effect[field].length > 32 ||
         !effect[field].every(points => Array.isArray(points) && points.length >= 3 && points.length <= 64 &&
           points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => bounded(value, 0, 1))) &&
           Math.abs(points.reduce((area, point, i) => { const next = points[(i + 1) % points.length]; return area + point[0] * next[1] - next[0] * point[1]; }, 0)) >= .000001)))
        fail("Use bounded nonempty matte paths with 3–64 source-frame points each (32 holdout or removal paths).");
    if (effect.type === "background_replace" &&
        (typeof effect.asset_id !== "string" || !effect.asset_id || effect.asset_id.length > 160 ||
         !/^[a-f0-9]{64}$/.test(effect.asset_sha256)))
      fail("Choose a saved background from this project.");
    if (effect.type === "background_replace" && (effect.surface_corners || effect.asset_crop)) {
      if (!Array.isArray(effect.surface_corners) || effect.surface_corners.length !== 4 ||
          !effect.surface_corners.every(point => Array.isArray(point) && point.length === 2 && point.every(value => bounded(value, 0, 1))) ||
          !Array.isArray(effect.asset_crop) || effect.asset_crop.length !== 4 || !effect.asset_crop.every(value => bounded(value,0,1)) ||
          effect.asset_crop[0]>=effect.asset_crop[2] || effect.asset_crop[1]>=effect.asset_crop[3])
        fail("Choose four surface corners and a nonempty replacement crop.");
    }
    if (
      effect.type === "particles" &&
      (!Number.isInteger(effect.seed) || !Number.isInteger(effect.count))
    )
      fail("Particle seed and count must be integers.");
  }
  return JSON.parse(stable(scene));
}

function subjectVfxRevision(scene) {
  return stable(validateSubjectVfxScene(scene));
}
// Subject renders use source time, before occurrence edits and delivery speed.
// Never substitute frames from a different source, stale edit or adjacent range.
function resolveSubjectVfxProgrammePreview(items, sourceId, sourceTime) {
  if (!sourceId || !Number.isFinite(sourceTime)) return null;
  for (const item of items || []) {
    if (item?.enabled === false || item?.scene?.sourceId !== String(sourceId)) continue;
    const range = item.scene.sourceRange;
    if (!range || sourceTime < range.start || sourceTime >= range.end) continue;
    try {
      if (!item.preview?.url || !item.preview.jobId || !item.preview.receipt?.pixel_sha256 ||
          item.preview.revision !== subjectVfxRevision(item.scene)) continue;
      return item;
    } catch { /* Invalid scene edits cannot display an older render. */ }
  }
  return null;
}
function validateSubjectVfxExport(items, timeline) {
  if (!Array.isArray(items) || items.length > 8) fail("Invalid subject effect export count.");
  const scenes = items.filter(item => item.enabled !== false);
  for (const item of scenes) {
    validateSubjectVfxScene(item.scene);
    if (
      !item.preview?.jobId ||
      !item.preview.reviewed ||
      item.preview.revision !== subjectVfxRevision(item.scene)
    )
      fail("Render and review every active subject effect before exporting.");
    const clips = (timeline || []).filter(
      clip => String(clip.source_clip_id ?? clip.sourceClipId ?? clip.id) === item.scene.sourceId
    );
    if (
      !clips.length ||
      !clips.some(
        clip =>
          Number(clip.start_time ?? clip.startRequest) < item.scene.sourceRange.end &&
          Number(clip.end_time ?? clip.endRequest) > item.scene.sourceRange.start
      )
    )
      fail("A subject effect no longer matches the timeline.");
    for (const clip of clips) {
      const start = Number(clip.start_time ?? clip.startRequest),
        end = Number(clip.end_time ?? clip.endRequest);
      if (
        start < item.scene.sourceRange.end &&
        end > item.scene.sourceRange.start &&
        (start < item.scene.sourceRange.start - 0.001 || end > item.scene.sourceRange.end + 0.001)
      )
        fail("Split the timeline at the subject effect range edges before exporting.");
    }
  }
  for (let a = 0; a < scenes.length; a++)
    for (let b = a + 1; b < scenes.length; b++) {
      const x = scenes[a].scene,
        y = scenes[b].scene;
      if (
        x.sourceId === y.sourceId &&
        x.sourceRange.start < y.sourceRange.end &&
        y.sourceRange.start < x.sourceRange.end
      )
        fail("Overlapping subject scenes must be combined into one effect stack.");
    }
  return scenes.map(item => ({
    jobId: item.preview.jobId,
    scene: validateSubjectVfxScene(item.scene),
  }));
}
module.exports = {
  EFFECT_FIELDS,
  validateSubjectVfxScene,
  subjectVfxRevision,
  resolveSubjectVfxProgrammePreview,
  validateSubjectVfxExport,
  stable,
};
