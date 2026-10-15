# Troubleshooting

Development documentation • product 1.2.0 • knowledge 1.0.16 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Model capability requests

ID: `system.model_runtime` • **PARTIAL** • AI_PIPELINE

Routes capability requests through specialized workers and persists owned versioned artifacts. The normal-account request/review/import lifecycle remains partial.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Current execution availability and account entitlement must be checked before requesting a job.
- The frontend contract exposes capabilities, not model implementation selection.
- A completed worker process is insufficient unless its owned result is verified and reviewed.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- MODEL_CAPABILITY_UNAVAILABLE: The requested capability has no enabled configured model. Check capability availability in the existing model workflow; this help panel cannot start a worker.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## GPU processing

ID: `system.gpu_jobs` • **PARTIAL** • DETERMINISTIC

Configured specialized workers execute only requested capabilities. Watching an already rendered example must not start a model job.

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

- Documentation does not authorize paid execution or establish a cost quote.
- Check the job estimate and applicable account/cost approvals before generation.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Processing states

ID: `system.processing_states` • **PARTIAL** • DETERMINISTIC

Tracks queued, dispatching, running, uncertain dispatch, completed, stale, failed and cancellation states. Provider wait and render review are separate from completion.

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

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Safe retries

ID: `system.retries` • **PARTIAL** • DETERMINISTIC

Reconciles an uncertain dispatch under the same request/job identity instead of silently creating a second paid generation. Retry policy depends on the capability.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.processing_states (PARTIAL)

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

## Cancel a model job

ID: `system.cancellation` • **PARTIAL** • DETERMINISTIC

Uses the existing request cancellation lifecycle. A cancelling state does not prove the worker has stopped; await cancellation reconciliation.

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

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Failed generation

ID: `system.generation_failure` • **PARTIAL** • DETERMINISTIC

Keeps failed/stale results distinct from completed owned artifacts. Diagnose source binding, current revision, provider availability and job state before a retry.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.processing_states (PARTIAL)

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

## Account and permissions

ID: `system.account` • **FUNCTIONAL** • DETERMINISTIC

An authenticated account, project ownership and applicable entitlements are checked by server-side workflows. A browser flag cannot grant project or model access.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- An expired sign-in needs the existing authentication flow. Do not share passwords or tokens with support.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Credits and execution estimates

ID: `system.costs` • **PARTIAL** • DETERMINISTIC

Exposed generation/render workflows display estimates and apply account allowances or charging checks. A local development charging bypass is not evidence of production billing.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Use the current displayed estimate; documentation intentionally does not freeze a price.
- Opening a template or example must not silently request paid generation.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn an image into a cinematic scene](../task-guides/task-image_cinematic.md), [Create a 3D title/logo scene](../task-guides/task-three_d_title.md), [Export a final film](../task-guides/task-final_export.md)

**Templates:** No pinned shared-template binding recorded.

## Unsupported or unavailable sources

ID: `system.unsupported_media` • **FUNCTIONAL** • DETERMINISTIC

Source ownership, decode and range validation can reject unusable material. Repair/import an owned compatible source; a temporary local URL is not a durable asset.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

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

**Guides:** [Export a final film](../task-guides/task-final_export.md)

**Templates:** No pinned shared-template binding recorded.
