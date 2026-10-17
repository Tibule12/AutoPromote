# Put text behind a person

Development documentation • product 1.2.0 • knowledge 1.0.29 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.text_behind` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Use the real reviewed mask-backed scene rather than the Creator placement study.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Choose a source-bound 0.25–10 second range and place subject seed points.
   Feature: `studio.subject_cutout`. Controls: [studio.subject.range](../control-reference/index.md#studio-subject-range), [studio.subject.seed_points](../control-reference/index.md#studio-subject-seed_points), [studio.subject.seed_labels](../control-reference/index.md#studio-subject-seed_labels).

2. Add text, adjust its position/size and request the owned composite.
   Feature: `studio.compositing.text_behind_subject`. Controls: [studio.subject.x](../control-reference/index.md#studio-subject-x), [studio.subject.y](../control-reference/index.md#studio-subject-y), [studio.subject.font_size](../control-reference/index.md#studio-subject-font_size).

3. Inspect occlusion in moving playback and review the current scene result.
   Feature: `studio.masks`.

4. Split the timeline at effect range boundaries, then save and export the reviewed version.
   Feature: `studio.cut`.

## Feature readiness

- studio.subject_cutout — **FUNCTIONAL**: Uses a real source-bound segmentation result to separate the selected subject across the supported scene range. Seed points and artifact review identify the subject.
- studio.compositing.text_behind_subject — **PARTIAL**: Renders editable text behind a real segmented subject in a bounded source-bound effect scene. The real mask path is distinct from the Creator browser proxy.
- studio.masks — **FUNCTIONAL**: Uses reviewed owned subject-mask results in a bounded scene and deterministic final composite. This is separate from a browser matte demonstration.
- studio.cut — **PARTIAL**: Splits a canonical clip occurrence at the mapped output playhead; source ranges and linked material follow the shared edit transaction.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- New segmentation requires configured execution availability and cost/permission checks.
- Mask-scene text parameters are static scene fields; do not invent generic property keyframes.

Troubleshooting references: system.unsupported_media, studio.revision.
