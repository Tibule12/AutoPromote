const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCinematicParameters, validateCinematicScene, buildCinematicGraph, planCinematicIntent } = require("../frontend/src/components/threeD/cinematicContract");
const { stable, hash } = require("../src/cinematic/localServer.cjs");
const asset = { id: "a".repeat(64), duration: 8 };
const makeScene = () => ({ id: "test-scene", sceneType: "cinematic_evidence", startTime: 3,
  duration: 8, endTime: 11, cinematic: createCinematicParameters(asset.id) });
test("scene compiles real source surfaces, camera poses, lights, material and audio on the programme clock", () => {
  const scene = makeScene(), graph = buildCinematicGraph(scene);
  assert.equal(graph.programmeStart, 3);
  assert.equal(graph.nodes.filter(node => node.type === "video_surface").length, 2);
  assert.equal(graph.nodes.find(node => node.id === "evidence").assetId, asset.id);
  const camera = graph.nodes.find(node => node.type === "perspective_camera");
  assert.notDeepEqual(camera.keyframes[0].position, camera.keyframes[3].position);
  assert.deepEqual(camera.keyframes[0].position, camera.keyframes.at(-1).position);
  assert.equal(graph.audio.sourceId, asset.id);
  assert.equal(graph.nodes.filter(node => node.type === "area_light").length, 2);
});
test("each exposed camera, material, text and timing parameter reaches the graph", () => {
  const original = makeScene(), before = stable(buildCinematicGraph(original));
  for (const [section, field, value] of [["camera", "pushIn", .4], ["camera", "focalLength", 55], ["camera", "screenYaw", -20],
    ["material", "roughness", .6], ["material", "color", "#445566"], ["material", "metallic", .3],
    ["lighting", "key", 1500], ["lighting", "fill", 900], ["timing", "pushAt", .3], ["timing", "holdUntil", .7],
    ["timing", "returnAt", .9], ["content", "clockA", "03:15:00"], ["content", "callout", "A LOCAL COMPARISON"],
    ["sources", "evidenceOffset", 1]]) {
    const scene = structuredClone(original); scene.cinematic[section][field] = value;
    assert.notEqual(stable(buildCinematicGraph(scene)), before, `${section}.${field} must affect the render graph`);
  }
});
test("unsupported versions, unknown controls and unsafe text fail closed", () => {
  for (const mutate of [s => s.cinematic.version = 2, s => s.cinematic.preset = "arbitrary_script",
    s => s.cinematic.python = "print('not allowed')", s => s.cinematic.content.headline = "<script>",
    s => s.cinematic.camera.pushIn = NaN, s => s.cinematic.sources.presenter = "https://production.invalid/media",
    s => s.cinematic.sources.evidence = "../../credentials", s => s.cinematic.content.clockB = "27:90:02",
    s => s.duration = 300, s => s.endTime = Infinity]) {
    const scene = makeScene(); mutate(scene); assert.throws(() => validateCinematicScene(scene));
  }
});
test("missing narration cannot be represented as grounded evidence", () => {
  const scene = makeScene(); scene.cinematic.cueMode = "narration";
  assert.throws(() => validateCinematicScene(scene), /LOCAL TEST CUE/);
  scene.cinematic.cueMode = "local_test"; scene.cinematic.content.disclosure = "ACTUAL TIMESTAMP";
  assert.throws(() => validateCinematicScene(scene), /LOCAL TEST CUE/);
});
test("Director produces the same editable scene semantics as manual controls", () => {
  const input = { version: 1, action: "reconstruct_clock_and_return", presenterId: asset.id,
    evidenceId: asset.id, startTime: 0, duration: 8, content: {} };
  const result = planCinematicIntent(input, [asset]);
  assert.deepEqual(result.graph, buildCinematicGraph(result.scene));
  assert.equal(result.renderRequirements.externalCost, 0);
  assert.equal(result.requiredAssets.length, 1);
  assert.throws(() => planCinematicIntent(input, []), /Missing/);
  assert.throws(() => planCinematicIntent(input, [{ ...asset, duration: 4 }]), /insufficient/);
  assert.throws(() => planCinematicIntent({ ...input, action: "generate_missing_narration" }, [asset]), /Unsupported/);
});
test("manifest hash ignores object key insertion order and changes with render content", () => {
  assert.equal(hash(stable({ b: 2, a: 1 })), hash(stable({ a: 1, b: 2 })));
  assert.notEqual(hash(stable({ a: 1 })), hash(stable({ a: 2 })));
});
