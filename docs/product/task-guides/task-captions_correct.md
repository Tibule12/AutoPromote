# Create captions and correct transcription

Development documentation • product 1.2.0 • knowledge 1.0.45 • 2026-10-21

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.captions_correct` • **BROKEN** • SUPPORTED_WITH_LIMITATIONS

Choose the speech language, generate editable timed lines and review uncertain words before export.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Select the timeline clip whose speech you want. In Captions, check that Speech source names that file.
   Feature: `studio.captions`.

2. Choose Speech language. Automatic detection uses the general speech recognizer. Choose English or Afrikaans for that language; choose a listed South African language or mixed English for the specialised recognizer. Then generate or regenerate speech captions; the other clips’ lines remain unchanged.
   Feature: `studio.captions`. Controls: [studio.captions.source_language](../control-reference/index.md#studio-captions-source_language).

3. Review the editable transcript lines. Correct words, in/out times, speaker and language; adjust placement and the caption style controls. Flagged automatic wording remains a draft until you review it.
   Feature: `studio.captions`.

4. Inspect the current phrase at mapped source times in preview and final export.
   Feature: `studio.captions`.

## Feature readiness

- studio.captions — **BROKEN**: Creates editable timed captions with a speech-language choice. Regeneration replaces only the selected source and preserves edits made while listening. Mixed-language wording still needs review.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- The empty-hint repetition trigger is repaired on retained speech, but code-switched wording still needs correction. Broad automatic transcription, all caption styles and full preview/export parity are not qualified.

Troubleshooting references: system.unsupported_media, studio.revision.
