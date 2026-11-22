# Create captions and correct transcription

Development documentation • product 1.2.0 • knowledge 1.0.66 • 2026-11-22

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.captions_correct` • **BROKEN** • SUPPORTED_WITH_LIMITATIONS

Choose the speech language, generate editable timed lines and review uncertain words before export.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Open Studio → Captions and choose Speech language. Automatic detection uses the general speech recognizer. Choose English or Afrikaans for that language; choose a listed South African language or mixed English for the specialised recognizer.
   Feature: `studio.captions`. Controls: [studio.captions.source_language](../control-reference/index.md#studio-captions-source_language).

2. Review source transcription and correct the selected phrase rather than trusting repeated automatic words.
   Feature: `studio.captions`.

3. Inspect the current phrase at mapped source times in preview and final export.
   Feature: `studio.captions`.

## Feature readiness

- studio.captions — **BROKEN**: Creates editable speech drafts. The expanded local correction workflow has passing tests and a real signed-in save/reopen/export example. The overall BROKEN rating refers to remaining recognition errors; it does not mean the tested correction controls fail. Expanded uncertain-word review, missing-speech markers and names/terms are not yet part of the released build.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Expanded caption review and additional delivery profiles have retained local proof but are not all released. A broad feature label must not be read as a failure of every tested control.
- The empty-hint repetition trigger is repaired on retained speech, but code-switched wording still needs correction. Broad automatic transcription, all caption styles and full preview/export parity are not qualified.

Troubleshooting references: system.unsupported_media, studio.revision.
