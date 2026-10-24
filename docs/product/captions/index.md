# Captions and reviewed transcription

Development documentation • product 1.2.0 • knowledge 1.0.48 • 2026-10-24

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Captions and transcription

ID: `studio.captions` • **BROKEN** • DETERMINISTIC

Creates editable timed captions with a speech-language choice. Regeneration replaces only the selected source and preserves edits made while listening. Mixed-language wording still needs review.

**Purpose:** Generate timed speech drafts, correct wording and speaker/language labels, and retain editable caption styles in the shared Studio project.

**Available to:** signed-in users with owned project and applicable entitlement

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

- This dated development snapshot does not establish professional or production readiness.
- Speech language is a source preference, not detected-language evidence. Code-switched wording still needs review; the prior broad automatic-caption qualification remains open.
- Automatic English translation is unavailable for the explicit South African language choices. Import reviewed English subtitles when needed.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- Generate and review captions before rendering.: There are no editable caption phrases for the requested burn-in. Automatic wording still needs review. Use the caption guide to prepare and manually review editable phrases before relying on a captioned export.
- Review every flagged caption line before rendering.: Approve or correct each flagged phrase and timestamp in Captions. Correct all flagged wording and timing; the repaired repetition trigger does not establish accuracy across all speech.

**Controls:** [Speech language](../control-reference/index.md#studio-captions-source_language)

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Create captions and correct transcription](../task-guides/task-captions_correct.md)

**Templates:** No pinned shared-template binding recorded.
