import {
  STUDIO_3D_TEMPLATES, createStudio3DScene, normalizeStudio3DScene,
  studio3DPose, studio3DSceneRevision, cutStudio3DScenes,
} from "./studio3DModel";

test.each(STUDIO_3D_TEMPLATES)("%s creates a bounded, animated timeline scene", template => {
  const scene = createStudio3DScene(template.id, 2, `studio-3d-${template.id}`);
  expect(scene.template).toBe(template.id);
  expect(scene.endTime).toBe(7);
  expect(studio3DPose(scene, 1.9)).toBeNull();
  expect(studio3DPose(scene, 2.5)?.opacity).toBeGreaterThan(0);
  expect(studio3DPose(scene, 7)).toBeNull();
});

test("bounds extreme controls and keeps preview artifacts out of revision", () => {
  const scene = normalizeStudio3DScene({ ...createStudio3DScene("neon_logo", 0, "test"), x: 999, y: -10, scale: Infinity, duration: 99, text: "A".repeat(200) });
  expect(scene.x).toBe(95);
  expect(scene.y).toBe(5);
  expect(scene.scale).toBe(1);
  expect(scene.duration).toBe(10);
  expect(scene.text).toHaveLength(80);
  expect(studio3DSceneRevision(scene)).toBe(studio3DSceneRevision({ ...scene, hqPreviewJobId: "another", hqPreviewUrl: "temporary" }));
  expect(studio3DSceneRevision(scene)).not.toBe(studio3DSceneRevision({ ...scene, text: "Changed" }));
});

test("cut ripple retimes and trims real 3D objects", () => {
  const first = normalizeStudio3DScene({ ...createStudio3DScene("cinematic_title", 1, "a"), keyframes: [{
    id: "pose-a", time: 2, easing: "linear",
    values: { x: 62, y: 50, z: 0, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 },
  }] });
  const scenes = [first, createStudio3DScene("neon_logo", 8, "b")];
  const result = cutStudio3DScenes(scenes, 3, 5);
  expect(result[0]).toMatchObject({ id: "a", startTime: 1, duration: 3, endTime: 4 });
  expect(result[0].keyframes[0]).toMatchObject({ id: "pose-a", time: 2 });
  expect(result[1]).toMatchObject({ id: "b", startTime: 6, duration: 5, endTime: 11 });
});

test("interpolates editable pose keyframes on the same preview clock", () => {
  const base = createStudio3DScene("cinematic_title", 2, "keyframed");
  const scene = normalizeStudio3DScene({ ...base, keyframes: [
    { id: "start", time: 2, easing: "linear", values: { x: 50, y: 50, z: 0, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 } },
    { id: "end", time: 4, easing: "linear", values: { x: 74, y: 50, z: 0, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 } },
  ] });
  expect(studio3DPose(scene, 3).x).toBeCloseTo(1);
  expect(scene.keyframes).toHaveLength(2);
});
