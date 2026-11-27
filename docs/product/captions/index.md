# Captions and reviewed transcription

Development documentation • product 1.2.0 • knowledge 1.0.71 • 2026-11-25

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Captions and transcription

ID: `studio.captions` • **BROKEN** • DETERMINISTIC

Creates editable speech drafts. The expanded local correction workflow has passing tests and a real signed-in save/reopen/export example. The overall BROKEN rating refers to remaining recognition errors; it does not mean the tested correction controls fail. Expanded uncertain-word review, missing-speech markers and names/terms are not yet part of the released build.

**Purpose:** Generate timed speech drafts, correct wording and speaker/language labels, and retain editable caption styles in the shared Studio project.

**Available to:** signed-in users with owned project and applicable entitlement; Expanded review and names/terms: verified local build only; not released

**Media:** video with speech, reviewed transcript phrases

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open Studio → Captions and choose Speech language. Automatic detection uses the general speech recognizer. Choose English or Afrikaans for that language; choose a listed South African language or mixed English for the specialised recognizer.
2. Choose Generate speech captions. Changing the language keeps the existing track until you explicitly regenerate.
3. Correct uncertain wording, speaker/language labels and timing in the editable lines. Preview the current phrases and inspect the final export.
4. Regenerate a selected source without replacing other sources’ caption tracks. If its wording changes while listening, keep the edits and regenerate when ready.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Verified working locally on 14 November: 104 focused checks and an eight-second human-speech generation, spelling-context correction, Undo/Redo, exact save/reopen, export and finished-playback workflow.
- Word-level issue selection/navigation, editable speech-gap markers and approval guards have passing component/worker checks. A separate full native gap-only or multilingual lifecycle remains unqualified.
- Automatic recognition still mishears some words and numbers. BROKEN describes that wider accuracy gap, not the working correction and persistence paths.
- The retained local movies and recordings are evidence, not an announcement that these extra controls are deployed.
- Speech language is a source preference, not detected-language evidence. Code-switched wording still needs review.
- Automatic English translation is unavailable for the explicit South African language choices. Import reviewed English subtitles when needed.
- Broad accent/noise coverage, every style/retime combination and whole predictive picture/sound agreement remain open.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- Generate and review captions before rendering.: There are no editable caption phrases for the requested burn-in. Automatic wording still needs review. Use the caption guide to prepare and manually review editable phrases before relying on a captioned export.
- Review every flagged caption line before rendering.: Approve or correct each flagged phrase and timestamp in Captions. Correct all flagged wording and timing; the repaired repetition trigger does not establish accuracy across all speech.

**Controls:** [Speech language](../control-reference/index.md#studio-captions-source_language)

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Create captions and correct transcription](../task-guides/task-captions_correct.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.
