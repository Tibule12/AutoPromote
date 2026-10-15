# Mask-backed subject effects and browser proxies

Development documentation • product 1.2.0 • knowledge 1.0.17 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Mask-backed compositing

ID: `studio.masks` • **FUNCTIONAL** • DETERMINISTIC

Uses reviewed owned subject-mask results in a bounded scene and deterministic final composite. This is separate from a browser matte demonstration.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.subject_cutout (FUNCTIONAL)

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
- MODEL_SUBJECT_MASK_REQUIRED: The attached subject result must be a real segmentation mask artifact, not a placement study.

**Controls:** [Mask feather](../control-reference/index.md#studio-subject-mask_feather), [Mask expansion](../control-reference/index.md#studio-subject-mask_expansion)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** No pinned shared-template binding recorded.

## Object tracking

ID: `studio.tracking` • **FUNCTIONAL** • DETERMINISTIC

Consumes real owned tracking artifacts for the supported tracked scene subset. Obtaining a new track depends on the configured capability worker and reviewed source range.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

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
- MODEL_TRACK_MASK_REQUIRED: The selected tracking path requires a mask artifact. Check the owned source and reviewed mask in the existing workflow.

**Controls:** [Subject source range](../control-reference/index.md#studio-subject-range), [Subject seed points](../control-reference/index.md#studio-subject-seed_points), [Subject point labels](../control-reference/index.md#studio-subject-seed_labels)

**Guides:** [Track text to a moving object](../task-guides/task-tracked_text.md)

**Templates:** No pinned shared-template binding recorded.

## Subject segmentation

ID: `studio.subject_cutout` • **FUNCTIONAL** • DETERMINISTIC

Uses a real source-bound segmentation result to separate the selected subject across the supported scene range. Seed points and artifact review identify the subject.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

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

**Controls:** [Subject source range](../control-reference/index.md#studio-subject-range), [Subject seed points](../control-reference/index.md#studio-subject-seed_points), [Subject point labels](../control-reference/index.md#studio-subject-seed_labels)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** No pinned shared-template binding recorded.

## Text Behind Subject

ID: `studio.compositing.text_behind_subject` • **PARTIAL** • AI_PIPELINE

Renders editable text behind a real segmented subject in a bounded source-bound effect scene. The real mask path is distinct from the Creator browser proxy.

**Purpose:** Make a subject occlude designed typography using real reviewed masks instead of a flat browser placement.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.subject_cutout (FUNCTIONAL), studio.masks (FUNCTIONAL)

**Optional:** studio.compositing.depth_estimation (UNIMPLEMENTED), studio.tracking (FUNCTIONAL)

**Workflow**

1. Choose a short source range and identify the visible subject with positive/negative seed points.
2. Render the subject scene and review the actual mask and text occlusion.
3. Split source occurrences at effect range edges, then save and export the current reviewed scene.

**Preview:** Shows the reviewed source-bound composite when its revision is current. CSS cutout studies do not qualify as this output.

**Final render:** A reviewed current owned subject scene is composited through the deterministic Studio path; stale scenes are rejected.

**Limits**

- Supported scene ranges are 0.25–10 seconds, not arbitrary full-length footage.
- Render and review each active scene; split occurrences at scene range edges before export.
- New mask execution depends on configured capability availability and applicable authorization.
- Effect parameters are not arbitrary native per-property keyframes.

**Common errors**

- No mask result or model capability unavailable: Choose a valid owned source range and points; check the current configured worker and approvals. A browser matte is not a fallback mask.
- Scene preview is stale or expired: Regenerate/review the same current scene; if dispatch is uncertain, reconcile the same job identity.
- Export rejects an active subject scene: Render/review the current scene revision and split occurrences at the source-range edges.

**Controls:** [Subject text X](../control-reference/index.md#studio-subject-x), [Subject text Y](../control-reference/index.md#studio-subject-y), [Subject text size](../control-reference/index.md#studio-subject-font_size), [Subject letter spacing](../control-reference/index.md#studio-subject-tracking), [Subject source range](../control-reference/index.md#studio-subject-range)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** No pinned shared-template binding recorded.

## Tracked graphics

ID: `studio.compositing.tracked_callout` • **PARTIAL** • AI_PIPELINE

Attaches a supported callout to a real owned subject/track result and edits its offsets. This is not arbitrary tracking of every object over long footage.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.tracking (FUNCTIONAL), studio.masks (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Bounded source scene and reviewed result are required.
- Occlusion, missed subjects and fast motion need actual mask/track inspection.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Tracked callout X offset](../control-reference/index.md#studio-subject-offset_x), [Tracked callout Y offset](../control-reference/index.md#studio-subject-offset_y)

**Guides:** [Track text to a moving object](../task-guides/task-tracked_text.md)

**Templates:** No pinned shared-template binding recorded.

## Subject-separated background grade

ID: `studio.compositing.background_grade` • **FUNCTIONAL** • DETERMINISTIC

Grades the background around an owned subject mask. This changes the existing background appearance; it does not replace it with a new scene.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.masks (FUNCTIONAL)

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

**Controls:** [Background exposure](../control-reference/index.md#studio-subject-exposure), [Background saturation](../control-reference/index.md#studio-subject-saturation), [Background contrast](../control-reference/index.md#studio-subject-contrast)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Mask-based depth effect

ID: `studio.compositing.mask_depth` • **FUNCTIONAL** • DETERMINISTIC

Creates a restrained 2.5D parallax treatment from subject/background separation. No metric scene depth is inferred.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.masks (FUNCTIONAL)

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

**Controls:** [Mask parallax amount](../control-reference/index.md#studio-subject-depth_amount)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Metric depth estimation

ID: `studio.compositing.depth_estimation` • **UNIMPLEMENTED** • UNIMPLEMENTED

A qualified general depth-estimation capability is absent from the current runtime contract. Mask-based parallax is a different implemented effect.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Text behind subject placement proxy

ID: `studio.creator.text_behind_subject` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel places text and a browser subject matte to study layout; it does not itself create a real segmentation artifact.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Background replacement

ID: `studio.creator.background_replacement` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel offers a cutout/background placement proxy. No qualified full replacement workflow is established by those controls.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Replace a background](../task-guides/task-background_replace.md)

**Templates:** No pinned shared-template binding recorded.

## Screen replacement

ID: `studio.creator.screen_replacement` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel offers a four-corner preview placement study. A tracked real screen replacement and finished export are not qualified.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Replace a laptop/phone screen](../task-guides/task-screen_replace.md)

**Templates:** No pinned shared-template binding recorded.

## Object cleanup / replacement

ID: `studio.creator.object_cleanup` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel shows a patch placement study and explicitly removes no object. It is not generative cleanup.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Remove an object](../task-guides/task-remove_object.md)

**Templates:** No pinned shared-template binding recorded.

## Creator tracking placement proxy

ID: `studio.creator.tracking` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel can illustrate an intended attachment; that browser study does not establish an owned model track.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
