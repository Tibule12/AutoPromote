/* Shared browser/local-worker contract. No network, filesystem or provider calls. */
const VERSION = 1;
const PRESET = "evidence_stage_v1";
const ID = /^[a-f0-9]{64}$/;
const finite = (v, min, max, name) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error(`Invalid cinematic ${name} (${min}–${max})`);
  return v;
};
const exact = (value, fields, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !(key in value)))
    throw new Error(`Invalid cinematic ${name} fields`);
};
const text = (v, max, name) => {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\u0000-\u001f<>]/.test(v))
    throw new Error(`Invalid cinematic ${name}`);
  return v;
};
function createCinematicParameters(presenter = "", evidence = presenter) {
  return {
    version: VERSION, preset: PRESET,
    sources: { presenter, evidence, presenterOffset: 0, evidenceOffset: 0 },
    camera: { focalLength: 42, pushIn: 1, screenYaw: -12 },
    material: { color: "#122230", roughness: 0.26, metallic: 0.7 },
    lighting: { key: 850, fill: 500 },
    content: { headline: "THE CLOCK DISCREPANCY", callout: "COMPARE THE TWO READINGS",
      clockA: "02:17:36", clockB: "02:19:04", disclosure: "LOCAL TEST CUE · ILLUSTRATIVE READINGS" },
    timing: { pushAt: 0.24, holdUntil: 0.67, returnAt: 0.86 },
    cueMode: "local_test",
  };
}
function validateCinematicParameters(value, { allowUnbound = false } = {}) {
  exact(value, ["version", "preset", "sources", "camera", "material", "lighting", "content", "timing", "cueMode"], "scene");
  if (value.version !== VERSION || value.preset !== PRESET) throw new Error("Unsupported cinematic scene version or preset");
  exact(value.sources, ["presenter", "evidence", "presenterOffset", "evidenceOffset"], "sources");
  for (const field of ["presenter", "evidence"])
    if (!(allowUnbound && value.sources[field] === "") && !ID.test(value.sources[field])) throw new Error(`Select a local ${field} asset`);
  for (const field of ["presenterOffset", "evidenceOffset"]) finite(value.sources[field], 0, 86400, field);
  exact(value.camera, ["focalLength", "pushIn", "screenYaw"], "camera");
  finite(value.camera.focalLength, 32, 65, "focal length");
  finite(value.camera.pushIn, 0, 1, "push in");
  finite(value.camera.screenYaw, -22, 0, "screen yaw");
  exact(value.material, ["color", "roughness", "metallic"], "material");
  if (!/^#[a-f0-9]{6}$/i.test(value.material.color)) throw new Error("Invalid cinematic material colour");
  finite(value.material.roughness, 0.1, 0.9, "roughness"); finite(value.material.metallic, 0, 1, "metallic");
  exact(value.lighting, ["key", "fill"], "lighting");
  finite(value.lighting.key, 100, 2000, "key light"); finite(value.lighting.fill, 50, 1500, "fill light");
  exact(value.content, ["headline", "callout", "clockA", "clockB", "disclosure"], "content");
  text(value.content.headline, 36, "headline"); text(value.content.callout, 40, "callout");
  text(value.content.disclosure, 64, "disclosure");
  for (const name of ["clockA", "clockB"]) if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value.content[name])) throw new Error("Clock readings must be HH:MM:SS");
  // Narration-driven timing is deliberately not accepted without transcript grounding.
  if (value.cueMode !== "local_test" || !value.content.disclosure.startsWith("LOCAL TEST CUE"))
    throw new Error("This milestone requires an explicit LOCAL TEST CUE disclosure");
  exact(value.timing, ["pushAt", "holdUntil", "returnAt"], "timing");
  finite(value.timing.pushAt, .18, .35, "push time"); finite(value.timing.holdUntil, .55, .72, "hold time");
  finite(value.timing.returnAt, .82, .94, "return time");
  return JSON.parse(JSON.stringify(value));
}
function validateCinematicScene(scene, options) {
  if (!scene || scene.sceneType !== "cinematic_evidence" || !/^[A-Za-z0-9_-]{1,100}$/.test(scene.id)) throw new Error("Invalid cinematic scene identity");
  finite(scene.startTime, 0, 86400, "programme start"); finite(scene.duration, 4, 10, "duration");
  if (Math.abs(scene.duration * 24 - Math.round(scene.duration * 24)) > .00001) throw new Error("Cinematic duration must align to the 24 fps frame clock");
  if (Math.abs(scene.endTime - scene.startTime - scene.duration) > .0001 || !Number.isFinite(scene.endTime)) throw new Error("Invalid cinematic programme range");
  return validateCinematicParameters(scene.cinematic, options);
}
function buildCinematicGraph(scene) {
  const p = validateCinematicScene(scene);
  const duration = scene.duration;
  const pose = (at, position, target) => ({ time: at * duration, position, target, easing: "smootherstep" });
  // Metres, right handed: +Z up, camera looking along +Y. Explicit physical depth.
  const wide = [0, -11.8, 3.7], wideTarget = [0, .2, 2.05];
  const close = [1.65, -5.15, 2.9], closeTarget = [1.55, .45, 2.3];
  const push = p.camera.pushIn;
  const blend = (a, b) => a.map((v, i) => v + (b[i] - v) * push);
  return { version: VERSION, units: "metres", timeSpace: "scene_seconds", duration,
    programmeStart: scene.startTime, preset: PRESET,
    nodes: [
      { id: "stage", type: "group", children: ["presenter", "evidence", "clock", "forensic-type"] },
      { id: "presenter", type: "video_surface", assetId: p.sources.presenter, offset: p.sources.presenterOffset,
        position: [-2.25, .5, 2.2], width: 3.5, height: 1.96875, yaw: 9, material: "display" },
      { id: "evidence", type: "video_surface", assetId: p.sources.evidence, offset: p.sources.evidenceOffset,
        position: [1.65, .6, 2.35], width: 3.35, height: 1.884375, yaw: p.camera.screenYaw, material: "display" },
      { id: "clock", type: "clock_reconstruction", parentId: "evidence", readings: [p.content.clockA, p.content.clockB] },
      { id: "forensic-type", type: "forensic_callouts", parentId: "evidence", ...p.content },
      { id: "camera", type: "perspective_camera", focalLength: p.camera.focalLength,
        keyframes: [pose(0, [-2.15, -5.6, 2.5], [-2.25, .5, 2.2]),
          pose(.16, wide, wideTarget), pose(p.timing.pushAt, wide, wideTarget),
          pose(.48, blend(wide, close), blend(wideTarget, closeTarget)),
          pose(p.timing.holdUntil, blend(wide, close), blend(wideTarget, closeTarget)),
          pose(p.timing.returnAt, [-2.15, -5.6, 2.5], [-2.25, .5, 2.2]),
          pose(1, [-2.15, -5.6, 2.5], [-2.25, .5, 2.2])] },
      { id: "key", type: "area_light", energy: p.lighting.key, position: [-3, -3, 7] },
      { id: "fill", type: "area_light", energy: p.lighting.fill, position: [4, 1, 5] },
    ], materials: { chassis: p.material, display: { emission: 0.85, roughness: .3 } },
    transparency: "opaque_stage", audio: { sourceId: p.sources.presenter, offset: p.sources.presenterOffset, gain: 1 },
  };
}
function planCinematicIntent(intent, assets, id = "director-evidence") {
  exact(intent, ["version", "action", "presenterId", "evidenceId", "startTime", "duration", "content"], "Director intent");
  if (intent.version !== 1 || intent.action !== "reconstruct_clock_and_return") throw new Error("Unsupported Director action");
  const cinematic = createCinematicParameters(intent.presenterId, intent.evidenceId);
  cinematic.content = { ...cinematic.content, ...intent.content };
  const scene = { id, sceneType: "cinematic_evidence", startTime: intent.startTime, duration: intent.duration,
    endTime: intent.startTime + intent.duration, cinematic };
  validateCinematicScene(scene);
  for (const role of ["presenter", "evidence"]) {
    const asset = assets.find(item => item.id === cinematic.sources[role]);
    if (!asset || asset.duration + .001 < intent.duration) throw new Error(`Missing or insufficient ${role} media`);
  }
  return { version: 1, storyBeat: "Illustrative clock mismatch; return to presenter", scene,
    graph: buildCinematicGraph(scene), requiredAssets: [...new Set([intent.presenterId, intent.evidenceId])],
    renderRequirements: { renderer: "blender_cycles_cpu", fps: 24, localOnly: true, externalCost: 0 },
    limitations: ["Local test cues; narration grounding unavailable", "Opaque 16:9 scene; no arbitrary graph authoring"] };
}
module.exports = { VERSION, PRESET, createCinematicParameters, validateCinematicParameters,
  validateCinematicScene, buildCinematicGraph, planCinematicIntent };
