# Turn an image into a cinematic scene

Development documentation • product 1.2.0 • knowledge 1.0.18 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.image_cinematic` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Use image-conditioned generation only when the owned image, job availability and cost checks permit it.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Import the owned conditioning image and verify it is usable.
   Feature: `studio.media_ingest`.

2. Request an image-conditioned moving shot through the existing reviewed workflow; retain conditioning evidence.
   Feature: `generation.image_to_video`.

3. Watch the returned motion, accept the usable shot and import it into the canonical project.
   Feature: `generation.scene_workflow`.

4. Edit ordinary layers and sound, then render the current project.
   Feature: `studio.render`.

## Feature readiness

- system.costs — **PARTIAL**: Exposed generation/render workflows display estimates and apply account allowances or charging checks. A local development charging bypass is not evidence of production billing.
- studio.media_ingest — **FUNCTIONAL**: Imports supported owned video, image and audio into canonical assets. Decoding, source validation and ownership checks still apply.
- generation.image_to_video — **PARTIAL**: The shared generation capability supports image-conditioned video. A valid example needs the conditioning image attached to verified execution and the resulting moving shot imported and reviewed.
- generation.scene_workflow — **PARTIAL**: Plans a bounded shot, requests it, reviews the returned video and imports only an accepted owned asset into the same canonical project.
- studio.render — **FUNCTIONAL**: Compiles the canonical project into the existing deterministic final path. Output must match the current project revision and owned source evidence.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
