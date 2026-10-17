# Create captions and correct transcription

Development documentation • product 1.2.0 • knowledge 1.0.25 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.captions_correct` • **BROKEN** • SUPPORTED_WITH_LIMITATIONS

Automatic words are currently broken; use reviewed phrase correction and inspect the actual final subset.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Review source transcription and correct the selected phrase rather than trusting repeated automatic words.
   Feature: `studio.captions`.

2. Inspect the current phrase at mapped source times in preview and final export.
   Feature: `studio.captions`.

## Feature readiness

- studio.captions — **BROKEN**: Caption controls and reviewed phrase rendering exist, but the retained automatic-word workflow has a repetition defect. Treat automatic word output as broken until that path is repaired and requalified.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- The automatic-word repetition defect remains open. A successful reviewed phrase render does not qualify automatic captions.

Troubleshooting references: system.unsupported_media, studio.revision.
