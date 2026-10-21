# Track text to a moving object

Development documentation • product 1.2.0 • knowledge 1.0.43 • 2026-10-21

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.tracked_text` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Use a reviewed real track for the supported short tracked-callout scene.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Choose the visible target and bounded source range.
   Feature: `studio.tracking`. Controls: [studio.subject.range](../control-reference/index.md#studio-subject-range), [studio.subject.seed_points](../control-reference/index.md#studio-subject-seed_points).

2. Review the owned track/masks; unavailable workers require resolving availability, not drawing a fake track.
   Feature: `studio.tracking`.

3. Adjust callout offsets, inspect the attachment across motion and export the reviewed scene.
   Feature: `studio.compositing.tracked_callout`. Controls: [studio.subject.offset_x](../control-reference/index.md#studio-subject-offset_x), [studio.subject.offset_y](../control-reference/index.md#studio-subject-offset_y).

## Feature readiness

- studio.tracking — **FUNCTIONAL**: Consumes real owned tracking artifacts for the supported tracked scene subset. Obtaining a new track depends on the configured capability worker and reviewed source range.
- studio.compositing.tracked_callout — **PARTIAL**: Attaches a supported callout to a real owned subject/track result and edits its offsets. This is not arbitrary tracking of every object over long footage.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
