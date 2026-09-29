// V1 parity inventory for normalizeStudio3DScene fields. "Exact" here means
// the field has the same decision/timing meaning, not pixel-identical output.
// Browser Three.js and Blender are different rasterizers; their visual fields
// remain approximate until a paired image/audio conformance proof exists.
const matrix = {};
const add = (names, status, reason) =>
  names.split(" ").forEach(name => {
    matrix[name] = Object.freeze({ status, reason });
  });

add("version id name assetName", "exact", "Version/identity/display metadata; no visual claim.");
add(
  "startTime duration endTime enabled",
  "exact",
  "Programme placement and enable gate; export still requires a current owned alpha job."
);
add(
  "assetStoragePath hqPreviewJobId",
  "exact",
  "Owner-bound asset/job references checked by the server-side render gate."
);
add(
  "hqPreviewUrl hqPreviewRevision",
  "exact",
  "Browser preview display/revision metadata; excluded from Blender pixels."
);
add(
  "template text secondary textAlign lineSpacing",
  "approximate",
  "Both engines draw the scene, but fonts, text geometry and template staging differ."
);
add(
  "material primaryColor secondaryColor glowColor extrusionDepth bevel",
  "approximate",
  "Both engines apply these choices with different shaders and geometry."
);
add(
  "x y z scale rotationX rotationY rotationZ keyframes",
  "approximate",
  "Pose math is shared in intent; camera, geometry and rasterization differ."
);
add(
  "entrance hold exit intensity",
  "approximate",
  "Preset motion exists in both; some accepted modes have no distinct motion. Fade alpha is unsupported in Blender."
);
add(
  "cameraMotion focalLength lightColor lightIntensity bloom",
  "approximate",
  "Both engines use these fields with different cameras, light types, tone mapping and bloom."
);
add(
  "layerOrder",
  "approximate",
  "Orders 3D scenes among themselves; regular overlays and motion graphics are earlier fixed stages."
);
add(
  "assetUrl",
  "unsupported",
  "Browser-only URL is not an export asset; final rendering requires an owned storage path."
);
add(
  "fontFamily fontWeight",
  "unsupported",
  "Validated and shown in the UI, but both renderers use fixed fonts."
);
add(
  "easing",
  "unsupported",
  "Scene-level easing is accepted but preset pose uses a fixed curve; only per-keyframe easing is used."
);
add(
  "audioReactiveIntensity",
  "unsupported",
  "Three.js uses live audioLevel; Blender receives no audio envelope."
);
add("lightDirection", "unsupported", "Three.js moves its key light; Blender key light is fixed.");
add(
  "shadows reflections",
  "unsupported",
  "Controls are accepted but neither render path reads them to select an effect."
);
add(
  "background",
  "unsupported",
  "Both use transparent scene output; standalone H.264 preview has a fixed dark matte."
);
add(
  "quality",
  "unsupported",
  "The service uses a fixed bounded 720p/30fps render profile regardless of this field."
);

// The pose result is not a normalized scene field, but the fade omission is a
// material parity defect and must remain visible to capability consumers.
add(
  "renderedOpacity",
  "unsupported",
  "Three.js applies pose.opacity to mesh materials; Blender computes it but never applies it to rendered alpha."
);

export const STUDIO_3D_FIELD_PARITY_VERSION = 1;
export const STUDIO_3D_FIELD_PARITY = Object.freeze(matrix);

export function getStudio3DFieldParity(field) {
  return STUDIO_3D_FIELD_PARITY[field] || null;
}
