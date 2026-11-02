# 3D authored scenes

Development documentation • product 1.2.0 • knowledge 1.0.52 • 2026-11-02

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## 3D object, title and logo scenes

ID: `studio.three_d` • **PARTIAL** • DETERMINISTIC

Builds bounded mesh compositions and continuously flowing ribbon surfaces. Individual objects retain colours, surfaces, roughness, transforms and pose keys; browser and final lighting/materials remain approximate.

**Purpose:** Create editable object motion and combine reviewed rendered alpha with the existing Studio timeline.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D mesh-object composition, authored 3D title/logo scene

**Requires:** studio.layers (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open an owned Studio project, then Motion → 3D Motion.
2. Choose Object Composition to start with an editable sphere, or choose an existing title/logo template.
3. Add box, sphere, torus, cylinder, icosphere, plane or ribbon; select each object and set its colour, surface, roughness, position, XYZ scale and rotation. Box and cylinder edges support a bounded bevel.
4. For a ribbon, choose loop, knot or wave. Adjust width, thickness, wave amount, lobes and twists; speed and phase control the continuous flow. In Advanced, choose the sculpture lighting rig for aimed studio strips.
5. Set the first pose and add its object key. Seek to another time, change that object’s values and add the next key. Object-key times are relative to the scene start.
6. Save the project and request a 3D preview through the configured worker. Check its reported dimensions and frame rate.
7. After a reload, use Check saved 3D render to recover the accepted result. Keep an unavailable accepted job for status recovery.
8. Review the rendered animation, then use ordinary Studio export to composite its private alpha.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** The existing Blender worker produces a reviewed preview and private alpha. The ordinary Studio compositor reuses the owned, matching alpha; changing scene decisions requires a matching render.

**Limits**

- At most 24 objects, 32 keys per object and 256 object keys total.
- The explicit nonproduction local adapter defaults to 640 × 360 at 24 fps. Its optional higher-resolution/CUDA App path remains unqualified after real long-job failures; successful direct canonical local renders do not prove App recovery. A larger final canvas can upscale a lower-resolution layer.
- Contour morphing, procedural repeaters, general Blender scene import and arbitrary node scripts are unavailable.
- Object keys through timeline cuts, retiming and trimmed boundaries remain unqualified; the verified scene uses a fixed uncut interval.
- Browser lighting, materials, colour and edges do not establish full final-picture parity.
- Uncertain accepted work must not be automatically rerun; API-restart recovery does not establish host/worker-loss or pre-dispatch recovery.
- Per-object glass, chrome, gold, matte, neon, holographic and architecture surfaces are available. Browser glass can reveal opaque parts behind it; matching Blender colour, reflection and edge pixels remains unqualified.
- Ribbon flow is relative to the scene clock. Its timing across cuts, retiming and trimmed boundaries remains unqualified; use an uncut rendered scene for the verified workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [X](../control-reference/index.md#studio-three_d-x), [Y](../control-reference/index.md#studio-three_d-y), [Z](../control-reference/index.md#studio-three_d-z), [Scale](../control-reference/index.md#studio-three_d-scale), [Rotation X](../control-reference/index.md#studio-three_d-rotationx), [Rotation Y](../control-reference/index.md#studio-three_d-rotationy), [Rotation Z](../control-reference/index.md#studio-three_d-rotationz), [Extrusion Depth](../control-reference/index.md#studio-three_d-extrusiondepth), [Bevel](../control-reference/index.md#studio-three_d-bevel), [Focal Length](../control-reference/index.md#studio-three_d-focallength), [Light Intensity](../control-reference/index.md#studio-three_d-lightintensity), [Camera Motion](../control-reference/index.md#studio-three_d-cameramotion), [Bloom](../control-reference/index.md#studio-three_d-bloom), [3D material](../control-reference/index.md#studio-three_d-material), [3D font family](../control-reference/index.md#studio-three_d-fontfamily), [3D font weight](../control-reference/index.md#studio-three_d-fontweight), [3D scene easing](../control-reference/index.md#studio-three_d-easing), [Audio-reactive intensity](../control-reference/index.md#studio-three_d-audioreactiveintensity), [3D light direction](../control-reference/index.md#studio-three_d-lightdirection), [3D shadows](../control-reference/index.md#studio-three_d-shadows), [3D reflections](../control-reference/index.md#studio-three_d-reflections), [3D background](../control-reference/index.md#studio-three_d-background), [3D quality](../control-reference/index.md#studio-three_d-quality)

**Guides:** [Create a cinematic logo reveal](../task-guides/task-cinematic_logo.md), [Create a 3D object, title or logo scene](../task-guides/task-three_d_title.md)

**Templates:** No pinned shared-template binding recorded.

## Final 3D rendering

ID: `studio.blender` • **PARTIAL** • DETERMINISTIC

Renders supported authored object/title/logo scenes to owned preview and private alpha for the canonical Studio compositor. Configured nonproduction local CPU execution supports saved-job API-restart recovery.

**Purpose:** Review actual rendered object motion and composite matching private alpha without rebuilding a separate editing engine.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D mesh-object composition, authored 3D title/logo scene

**Requires:** studio.three_d (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Author and save a supported scene in Studio → Motion → 3D Motion.
2. Generate the preview through the configured worker and check its actual dimensions/frame rate.
3. Use Check saved 3D render after reopening the project to recover the same accepted result.
4. Review the separate animation before ordinary final Studio export.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- The qualified local CPU path is nonproduction and bounded to short scenes; its quality profile can be lower than the final canvas.
- Host/worker loss, pre-dispatch reconciliation, remote GPU recovery and full preview/final material/lighting parity remain unqualified.
- A completed technical test does not establish creative or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- Generate an HQ 3D preview for every active 3D scene before exporting.: An active scene needs current owned HQ frames matching its settings, source and aspect. Open Motion → 3D Motion and review the matching preview. A browser WebGL scene is insufficient; existing availability and cost checks still apply.
- 3D preview is missing: The referenced HQ job cannot be found. Check the current scene and owned preview in 3D Motion before export.
- 3D preview is stale or not owned by this project: Check the current scene, completed job, ownership and covered duration. Use the normal owned preview path; never reuse another project’s output.
- 3D preview aspect ratio changed; generate a new preview: The output aspect no longer matches the owned preview. Review the requested aspect and obtain a matching current preview through the normal authorized workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a 3D object, title or logo scene](../task-guides/task-three_d_title.md)

**Templates:** No pinned shared-template binding recorded.

## Audio-reactive 3D

ID: `studio.three_d_audio` • **PARTIAL** • DETERMINISTIC

The browser can react to audio, but final scene rendering does not receive the equivalent audio envelope. Do not promise matching reactive motion in the exported movie.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D title/logo scene

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## 3D scene presets

ID: `creative.three_d` • **PARTIAL** • DETERMINISTIC

Bounded 3D title/logo presets create editable authored scenes. Final limitations and disabled fields remain authoritative.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D title/logo scene

**Requires:** studio.three_d (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
