const { validateStudio3DObjects } = require("../src/services/studio3DObjects");
const { validateStudio3DScene, stableSceneHash } = require("../src/services/studio3DService");
const fixture = require("../studio_3d_renderer/tests/objects.json");
const copy = () => JSON.parse(JSON.stringify(fixture.scene));
test("accepts independent object keys and binds their geometry and timing into export identity", () => {
  const scene = copy(); validateStudio3DScene(scene, "qa_user_123");
  const hash = stableSceneHash(scene); scene.objects[1].keyframes[1].values.rotationY = 55;
  expect(stableSceneHash(scene)).not.toBe(hash);
});
test.each([
  scene => scene.objects.push({ ...scene.objects[0] }),
  scene => { scene.objects[0].script = "import os"; },
  scene => { scene.objects[0].shape = "../../file.blend"; },
  scene => { scene.objects[0].scaleX = Infinity; },
  scene => { scene.objects[0].keyframes[0].time = -1; },
  scene => { scene.objects[0].keyframes[1].time = scene.duration + 1; },
  scene => { scene.objects[0].keyframes[0].values.scaleY = 0; },
  scene => { scene.objects[0].keyframes.push({ ...scene.objects[0].keyframes[0], id: "duplicate-time" }); },
])("rejects malformed or executable object decisions", change => {
  const scene = copy(); change(scene); expect(() => validateStudio3DObjects(scene.objects, scene.duration)).toThrow();
});
test("rejects object data hidden inside a legacy title scene", () => {
  expect(() => validateStudio3DScene({ ...copy(), template: "cinematic_title" }, "qa_user_123")).toThrow("Object layers");
});
test("per-object physical surfaces and edge bevel remain part of the accepted render identity", () => {
  const scene = copy(); scene.objects[0].material = "architecture"; scene.objects[0].bevel = .08;
  validateStudio3DScene(scene, "qa_user_123"); const first = stableSceneHash(scene);
  scene.objects[0].material = "glass"; expect(stableSceneHash(scene)).not.toBe(first);
  scene.objects[0].bevel = .16; expect(() => validateStudio3DObjects(scene.objects, scene.duration)).toThrow("bevel");
  scene.objects[0].bevel = .08; scene.objects[0].material = "python";
  expect(() => validateStudio3DObjects(scene.objects, scene.duration)).toThrow("material");
});
const ribbon = { path: "knot", width: .55, thickness: .065, wave: .65, lobes: 3, twists: 1, speed: .3, phase: 0 };
test("ribbon form, roughness and sculptural lighting bind to the accepted scene identity", () => {
  const scene = copy(); scene.lightingRig = "sculpture";
  Object.assign(scene.objects[0], { shape: "ribbon", ribbon: { ...ribbon }, material: "brushed", roughness: .19 });
  validateStudio3DScene(scene, "qa_user_123"); const initial = stableSceneHash(scene);
  scene.objects[0].ribbon.phase = 80; expect(stableSceneHash(scene)).not.toBe(initial);
  scene.lightingRig = "python"; expect(() => validateStudio3DScene(scene, "qa_user_123")).toThrow("lighting");
});
test.each([
  value => { value.ribbon.path = "../mesh.blend"; },
  value => { value.ribbon.script = "run()"; },
  value => { value.ribbon.lobes = 1.5; },
  value => { value.ribbon.twists = true; },
  value => { value.ribbon.wave = Infinity; },
  value => { value.ribbon.thickness = .001; },
  value => { value.roughness = 0; },
  value => { value.shape = "sphere"; },
])("rejects unsafe or unbounded procedural surface decisions", change => {
  const scene = copy(); const item = scene.objects[0]; Object.assign(item, { shape: "ribbon", ribbon: { ...ribbon } }); change(item);
  expect(() => validateStudio3DScene(scene, "qa_user_123")).toThrow();
});
