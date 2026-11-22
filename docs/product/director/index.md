# Director

Development documentation • product 1.2.0 • knowledge 1.0.66 • 2026-11-22

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Studio Director proposals

ID: `director.proposals` • **FUNCTIONAL** • HYBRID

Proposes reviewed edits through shared Studio operations. Accepting a proposal modifies ordinary editable project state; manual editing continues afterward.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.revision (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Save an owned project video, open Director, enter a brief and select a design approach.
2. Create a model proposal, review it and edit its supported design controls before Apply.
3. Apply to ordinary editable layers, then use manual controls, Undo/Redo and Save.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated snapshot does not establish professional or production readiness.
- Model planning uses the configured OpenAI provider on demand, or explicitly selected local CPU inference. No key or an explicit disabled provider leaves model planning offline. Existing paid-plan/tester access is required. No model request runs on status checks or when idle.
- Source-bound choreography and built-in 3D design are deterministic operators, separate from model inference. Colour and frame-change descriptors do not recognize subjects or understand speech.
- Composition and kinetic posters use the saved output aspect, including portrait. Poster copy is exactly three uppercase English words of two to six letters each.
- Actual OpenAI poster and footage-composition planning, review, refinement, Apply, manual editing, Undo/Redo, saving and reopening pass on the live App. Independent native backup import and reopening retain all tested image bytes. Broader preview/final picture and sound agreement remains unqualified.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Director evidence

ID: `director.evidence` • **FUNCTIONAL** • DETERMINISTIC

Binds suggestions to owned source, analysis/artifact evidence and the current project revision. Unsupported visual claims are not acceptable evidence.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.revision (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** No pinned shared-template binding recorded.

## Review Director changes

ID: `director.review` • **FUNCTIONAL** • DETERMINISTIC

Reviews and applies a proposal against its current revision and operation preconditions. A stale proposal needs fresh review.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** director.proposals (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** No pinned shared-template binding recorded.

## Director template selection

ID: `director.template_selection` • **PARTIAL** • DETERMINISTIC

Selects a pinned shared draft template and applies the same native instantiation adapter used by manual Studio application. It does not qualify the template as public-ready.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.templates (PARTIAL), director.review (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Find Viral Clips

ID: `director.find_viral_clips` • **PARTIAL** • HYBRID

Finds source-bound short-form candidates with requested length, opening/context/payoff, audio and visual evidence, transcript review flags and duplicate filtering. Preview a range and send it into the editable Studio.

**Purpose:** Find useful, complete moments in an owned video and review the evidence before creating a clip.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Choose an owned source video.
2. Choose target length and destinations; optionally describe the moments you want.
3. Analyse the source, then read the transcript excerpt, evidence label and review notes.
4. Preview a candidate; playback stops at its end.
5. Choose Create clip to edit and export it in Studio.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Editorial scores rank source evidence; they are not confidence percentages or predictions of views.
- Speech recognition and sentence punctuation can need correction, especially with code-switching, music and background sound. Visual-only results do not establish spoken meaning.
- Short sources and natural sentence edges can produce shorter clips; review notes identify this.
- No thumbnail/poster generation or selection is part of this flow. Broad media, scale, cancellation/restart and professional readiness remain unqualified.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md)

**Templates:** No pinned shared-template binding recorded.

## Visual/video understanding

ID: `director.scene_understanding` • **PARTIAL** • AI_PIPELINE

The capability contract and isolated understanding worker exist; owned analysis must be attached before Director reasons from it. Retained private executions do not establish universal normal-account availability.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video, image

**Requires:** system.model_runtime (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Text/object detection

ID: `director.object_detection` • **PARTIAL** • AI_PIPELINE

Locates a requested visible object through the common capability contract and persists detections. A label alone is not evidence that the object was detected.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video, image

**Requires:** system.model_runtime (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
