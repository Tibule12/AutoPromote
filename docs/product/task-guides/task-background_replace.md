# Replace a background

Development documentation • product 1.2.0 • knowledge 1.0.45 • 2026-10-21

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.background_replace` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Optionally replace an owned video’s background image through Studio → Composite, using its own reviewed subject mask.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Open Studio → Composite, choose Add effects to a clip and select your video occurrence. Keep original background remains the default.
   Feature: `studio.compositing`.

2. Use Upload background image for your PNG, JPEG or WebP (up to 32 MB), or select an existing owned image under Background choice.
   Feature: `studio.compositing`.

3. Select the person with Subject point on the paused source. Add Background point exclusions as needed. Leave optional object selections empty for people only, or select furniture and microphones individually. Remove an extra selection if it also keeps the old wall or floor, then add it again with tighter keep/remove points. Use Refine foreground selection and create a new mask when the selected silhouette is wrong; edge cleanup cannot correct a wrongly selected part of the room.
   Feature: `studio.subject_cutout`.

4. Create and review a mask for this exact video/range using the available authorized model workflow, or explicitly reuse its valid owned mask. If model execution is unavailable, background selection alone cannot create a new cutout.
   Feature: `studio.subject_cutout`.

5. Choose Clean background edges to add source-guided refinement without shrinking thin objects. Adjust Edge detail width (0–8 pixels) and Remove old background colour (0–1), then render a new preview and check movement. This cannot recover a missing object selection.
   Feature: `studio.compositing`. Controls: [studio.composite.background_edge_radius](../control-reference/index.md#studio-composite-background_edge_radius), [studio.composite.background_decontaminate](../control-reference/index.md#studio-composite-background_decontaminate).

6. Render preview and inspect the whole moving scene on bright and dark backgrounds. Check hair, shoulders, moving hands, seats, microphone rods, clamps and gaps. Use matte refinement and optional object holdouts for corrections; advanced paths are manual source-frame geometry.
   Feature: `studio.compositing`.

7. Save the project and reopen it. After changing sources, masks or effect settings, regenerate and review the current preview before export.
   Feature: `studio.revision`.

8. Export the current revision, then watch the complete movie with sound. A completed job or a still image does not establish clean edges throughout the video.
   Feature: `studio.export`.

## Feature readiness

- studio.compositing — **PARTIAL**: Combines ordinary layers and animated graphic groups with shared order, static masks, alpha-aware blending and editable group clip timing. Broad preview/export picture and sound agreement remains incomplete.
- studio.subject_cutout — **FUNCTIONAL**: Uses a real source-bound segmentation result to separate the selected subject across the supported scene range. Seed points and artifact review identify the subject.
- studio.revision — **FUNCTIONAL**: Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.
- studio.export — **PARTIAL**: Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.

## Result and limitations

An editable source-bound background replacement in the normal Studio project, subject to available mask execution and visual review. Selecting Keep original background removes replacement layers and preserves the other scene settings.

- This is a partial development workflow. Broad ordinary-account availability and clean automatic replacement across arbitrary footage are not qualified.
- The native Composite workflow uses real masks. Creator FX background placement is still a browser study and cannot substitute for a processed output.
- The podcast example still has founder-rejected edge fringes and uses manual source-specific corrections. Do not reuse its mask or contours on another upload.
- Holdout/removal paths require advanced manual source-frame geometry; they are not automatic object detection or tracking.
- Replacing the room does not relight photographed people, restore missing furniture, or change the camera perspective.

Troubleshooting references: system.unsupported_media, studio.revision.
