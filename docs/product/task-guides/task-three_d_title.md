# Create a 3D object, title or logo scene

Development documentation • product 1.2.0 • knowledge 1.0.45 • 2026-10-21

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.three_d_title` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Author a bounded editable object composition or title/logo template, review its rendered result and composite matching private alpha through Studio.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Open Studio → Motion → 3D Motion. Choose Object Composition for separate editable geometry, or use an existing title/logo preset.
   Feature: `studio.three_d`.

2. Select each mesh object, set its colour and XYZ pose, and add the first object key. Seek to another scene time, adjust that object and add its next key. Save the project.
   Feature: `studio.three_d`.

3. Adjust supported scene material, camera focal length and light intensity. Disabled fields do not gain final support.
   Feature: `studio.three_d`. Controls: [studio.three_d.material](../control-reference/index.md#studio-three_d-material), [studio.three_d.focallength](../control-reference/index.md#studio-three_d-focallength), [studio.three_d.lightintensity](../control-reference/index.md#studio-three_d-lightintensity).

4. Request the configured 3D render and review its actual quality profile. After reopening, use Check saved 3D render to recover the accepted job. Review the animation before ordinary final export composites matching private alpha.
   Feature: `studio.blender`.

## Feature readiness

- system.costs — **PARTIAL**: Exposed generation/render workflows display estimates and apply account allowances or charging checks. A local development charging bypass is not evidence of production billing.
- studio.three_d — **PARTIAL**: Builds bounded mesh compositions and continuously flowing ribbon surfaces. Individual objects retain colours, surfaces, roughness, transforms and pose keys; browser and final lighting/materials remain approximate.
- studio.blender — **PARTIAL**: Renders supported authored object/title/logo scenes to owned preview and private alpha for the canonical Studio compositor. Configured nonproduction local CPU execution supports saved-job API-restart recovery.

## Result and limitations

A saved editable scene and reviewed owned 3D render that the ordinary final compositor can reuse. Actual quality follows the reported render profile.

- At most 24 objects, 32 keys per object and 256 object keys total.
- The local CPU path is explicitly enabled for nonproduction; its bounded landscape profile is 640 × 360 at 24 fps. A larger final canvas upscales that layer.
- Contour morphing, procedural repeaters, general Blender scene import and arbitrary node scripts are unavailable.
- Object keys through timeline cuts, retiming and trimmed boundaries remain unqualified; the verified scene uses a fixed uncut interval.
- Browser lighting, materials, colour and edges do not establish full final-picture parity.
- Uncertain accepted work must not be automatically rerun; API-restart recovery does not establish host/worker-loss or pre-dispatch recovery.

Troubleshooting references: system.unsupported_media, studio.revision.
