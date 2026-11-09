import { studio3DCameraProjection } from "./studio3DProjection";

test("matches measured Blender 4.5.9 camera frames in wide, portrait and square delivery", () => {
  const scene = { focalLength: 65, cameraMotion: 0 };
  // Actual installed Blender Camera.view_frame evidence is retained in
  // reports/studio-canonical-completion-20261008/blender-camera-projection.log.
  for (const [aspect, expected] of [[1280 / 720, 17.7075349767], [720 / 1280, 30.9572758984], [1, 30.9572758984]]) {
    expect(studio3DCameraProjection(scene, aspect).verticalFov).toBeCloseTo(expected, 5);
  }
});

test("lens and camera movement preserve Blender projection semantics without changing pose scale", () => {
  const scene = { focalLength: 65, cameraMotion: .28 };
  const camera = studio3DCameraProjection(scene, 1280 / 720, .5);
  expect(camera.distance).toBe(13);
  expect(camera.x).toBeCloseTo(.0182040447303, 10);
  expect(studio3DCameraProjection({ ...scene, focalLength: 24 }, 1280 / 720).verticalFov)
    .toBeGreaterThan(camera.verticalFov);
  expect(studio3DCameraProjection(scene, 720 / 1280).distance).toBeGreaterThan(13);
});
