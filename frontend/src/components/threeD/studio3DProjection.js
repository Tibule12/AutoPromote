// Blender's default 36 mm AUTO sensor fit, measured with Camera.view_frame.
// Three.js expects the vertical field of view, not a linear lens approximation.
export function studio3DCameraProjection(scene, aspect, localTime = 0) {
  const ratio = Math.max(.01, Number(aspect) || 1);
  const focal = Math.max(24, Math.min(85, Number(scene.focalLength) || 50));
  const sensorHeight = 36 / Math.max(1, ratio);
  return {
    verticalFov: 2 * Math.atan(sensorHeight / (2 * focal)) * 180 / Math.PI,
    distance: Math.max(13, (8.5 / 2) / (Math.tan(43 * Math.PI / 360) * ratio) * 1.17),
    x: Math.sin(localTime * .6) * Number(scene.cameraMotion || 0) * .22,
  };
}
