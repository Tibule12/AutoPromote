# Export a final film

Development documentation • product 1.2.0 • knowledge 1.0.20 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.final_export` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Compile the saved current project, review the completed exact output and download it through the normal flow.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Verify owned sources, current project revision and all scene reviews.
   Feature: `studio.revision`.

2. Check unsupported/stale scenes, effects and current render estimate.
   Feature: `studio.export`.

3. Request the existing deterministic final render; do not treat a log or queued job as output.
   Feature: `studio.render`.

4. Play the entire downloaded movie with sound and compare relevant preview/cut/text/audio frames.
   Feature: `studio.export`.

## Feature readiness

- system.costs — **PARTIAL**: Exposed generation/render workflows display estimates and apply account allowances or charging checks. A local development charging bypass is not evidence of production billing.
- system.unsupported_media — **FUNCTIONAL**: Source ownership, decode and range validation can reject unusable material. Repair/import an owned compatible source; a temporary local URL is not a durable asset.
- studio.preview — **PARTIAL**: Shows the existing project programme with mapped source frames and sound. Retained fixes improve selected cases; whole-stage live playback, stalls and picture/sound agreement remain open.
- studio.revision — **FUNCTIONAL**: Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.
- studio.export — **PARTIAL**: Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.
- studio.render — **FUNCTIONAL**: Compiles the canonical project into the existing deterministic final path. Output must match the current project revision and owned source evidence.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
