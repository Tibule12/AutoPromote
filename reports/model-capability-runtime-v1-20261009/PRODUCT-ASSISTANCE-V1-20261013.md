# Product Assistance V1 — bounded working help

Branch: `agent/product-knowledge-system-v1`. Local qualification on 13 October 2026, Africa/Johannesburg. Product Knowledge V1 remains the foundation. Documentation patch **1.0.1**, product snapshot **1.2.0**. Feature/control/task counts remain **102 / 105 / 18** internally, with 100 public features. No feature readiness changed.

## Working product experience

The signed-in App now provides **Ask AutoPromote**, with EXPLAIN, GUIDE and DIAGNOSE. Open contextual Help inside Studio or use Ask AutoPromote in the dashboard. A Studio help drawer can clear its selected context to ask a general product question. It explains documented workflows, controls, dependencies, preview versus final behavior and current limitations. Sources and task guides expand in the drawer; canonical public documentation links work.

Seven representative help surfaces are wired: Motion / Transform Keyframes; Cam Combiner; Text Behind Subject / Compositing; Captions; Idea-to-Video; Templates; 3D Motion. Stable catalogue IDs are supplied by the button; no private timeline, media, token or project payload accompanies the help query. Panels and Cam Combiner behavior are preserved.

## Architecture and retrieval

`Help affordance / Ask panel → POST /api/product-assistance/ask → strict safe input → reviewed public knowledge projection → topic routing / weighted lexical records → feature/control/task/dependency relationships → status-aware extractive answer + internal grounding receipt`.

This is a deterministic documentation assistance implementation, not an LLM support-agent claim. No embeddings, paid inference or model worker is needed. Topic patterns cover user phrasing rather than matching complete evaluation questions. Public feature names, summaries, workflows, aliases, controls and task text form the retrieval records; explicit graph edges supply dependencies. Exact selected feature IDs resolve contextual follow-ups. Responses copy catalogue facts, with bounded status-specific next steps; there is no arbitrary project context or model-authored factual prose.

Supported context is limited to a safe workspace ID/type, selected public feature/tool/media type, reported capability availability and a block code. Reported availability can restrict instructions; it cannot raise readiness. The receipt excludes workspace IDs. Unknown context keys, private URLs/paths, credentials, email addresses, oversized text and CREATE/APPLY modes are rejected. Request parsing is limited to 8kb and questions to 1,000 characters. A dedicated 30/minute limiter avoids the normal remote account/API limiter for public help. No execution/action endpoint exists.

Every answer retains an internal receipt: exact safe question, matched feature/control/task IDs, product/knowledge/catalogue versions, catalogue hash, readiness values actually used, safe context, creation time and any gap ID. Receipts and gap candidates use bounded private local storage plus a memory index: 256 records each, 24-hour expiry, one atomic 0600 journal file capped at 4MiB. They survive a local API restart; restart/permissions/disk-bound tests pass. There is no public receipt/gap dump endpoint. This is a single-instance local adapter; a reviewed shared store and support-ticket lifecycle remain future work.

Actual emitted diagnostic codes are mapped to existing documentation: MODEL_CAPABILITY_UNAVAILABLE, MODEL_SUBJECT_MASK_REQUIRED, MODEL_TRACK_MASK_REQUIRED, TEMPLATE_IDENTITY_MISMATCH, TEMPLATE_OWNED_MEDIA_REQUIRED, TEMPLATE_FOOTAGE_TOO_SHORT, CREATIVE_TEMPLATE_VERSION_UNAVAILABLE and RENDER_TIMELINE_MISMATCH. Their known requirements/resolutions were added to existing catalogue entries; no feature/control/task records were added. Unknown codes return exactly **“This error is not documented yet.”** and a structured PENDING_REVIEW gap. Assistance never modifies canonical documentation from a question.

FUNCTIONAL explains the scoped normal path. PARTIAL includes supported subsets and missing qualification. PROXY_ONLY explicitly describes a browser placement study and gives no real-operation instructions. BROKEN describes the defect and points only to the documented reviewed workaround. UNIMPLEMENTED states the workflow is unavailable. Generic regenerate advice is suppressed for blocked/proxy cases.

## Native qualification transcripts

The following are actual questions/results from the signed-in, headless, muted App with real API responses. Full answers, source metadata and receipt IDs are retained in [the private UI proof](proof/product-assistance-v1/ui-proof.private.json). All seven actual API [grounding receipts](proof/product-assistance-v1/grounding-receipts.private.json) match the questions, current catalogue hash/version and readiness values. [Detailed 15-question evaluation receipts](proof/product-assistance-v1/evaluation-results.private.json) are also retained.

| Surface | Question | Grounded result |
|---|---|---|
| Dashboard Ask AutoPromote | How is Cam Combiner different from AI Director? | Cam Director switching — PARTIAL; Camera synchronization — PARTIAL; Studio Director proposals — FUNCTIONAL; Review Director changes — FUNCTIONAL |
| Cam Combiner | What is this? | Cam Director switching — PARTIAL |
| Motion / Transform Keyframes | What is this? | Motion / Transform Keyframes — FUNCTIONAL |
| Text Behind Subject / Compositing | What is this? | Text Behind Subject — PARTIAL |
| Safe selected feature context | What do I do next? | Text Behind Subject — PARTIAL |
| Global diagnosis | Why isn't cleanup removing the object? | Object cleanup / replacement — PROXY_ONLY |
| Unknown error | UNKNOWN_EXPORT_GLITCH | This error is not documented yet. |

**A — functional keyframes:** normal Motion → Transform keyframes → Help resolves `studio.keyframes`, FUNCTIONAL. Next step: select an ordinary editable layer; set the initial pose, move the playhead, add a key and inspect motion. Controls include X/Y/scale/rotation/opacity, key time and easing. Static anchor geometry is not an animated property. Dependencies and whole-stage parity limits remain visible. [Screenshot](proof/product-assistance-v1/a-keyframes.png).

**B — complex Cam Combiner:** its existing setup Help resolves `cam_combiner.switching`, PARTIAL. It explains audio-activity/continuity switching and the full related camera guide: ingest, deterministic sync, verified channel mapping, review and export. The comparison question also resolves Studio Director proposals separately. The help does not change synchronization or invoke switching. [Screenshot](proof/product-assistance-v1/b-cam-combiner.png).

**C — non-full AI operation:** Compositing Help resolves the real text-behind-subject path as PARTIAL: a real reviewed, source-bound mask scene with 0.25–10s range and configured execution/authorization requirements. “What do I do next?” retains that selected feature. Cleanup diagnosis resolves PROXY_ONLY: a browser patch study that removes no object, with no qualified final workflow. The 15-question evaluation separately resolves both the real tracking artifact path and Creator placement proxy. [Text-behind screenshot](proof/product-assistance-v1/c-text-behind-subject.png), [cleanup screenshot](proof/product-assistance-v1/c-cleanup-proxy.png).

All **14 saved canonical project documents** remain byte-equivalent under the proof's document hashes. Requests only ask documentation or resolve existing owned media while opening Studio; no model, render, upload, schedule, publish or project command is triggered by assistance. The real documentation link returns the generated public index. The user browser is untouched and the refreshable local login remains protected.

## Evaluation and exclusion checks

All **15 / 15 required questions pass** feature resolution, authoritative readiness, useful next step, relevant task/control/graph relationship, read-only authority and private-data exclusion. The evaluation includes text behind someone, real versus proxy tracking, cleanup, automatic podcast switching, reversed speakers, logo animation, image-to-video, editing Director results, wrong captions, keyframes, manual positioning, metric depth, product launch templates, 3D export and TikTok publishing. See [evaluation definitions](../../test/product-assistance/evaluation.v1.json).

Final scoped checks: **26 assistance tests + 17 knowledge tests + 10 frontend tests = 53 passes**. The local optimized App build passes. Native App qualification covers the three required cases, seven retained transcripts, source-link expansion, unknown-error gap and unchanged projects. This does not qualify the tools' twelve Studio gates or production readiness. Complete broader Studio tests were not run.

Unsupported/hallucination checks reject CREATE/APPLY, arbitrary project contents, unknown/private feature IDs, credentials/URLs, fake availability/readiness and oversized JSON. An instruction to call cleanup PRO_READY still returns PROXY_ONLY. Unsupported/ambiguous questions generate a gap instead of invented features. A deliberately injected private path in public prose fails projection. Internal-only provider records, source evidence, model/checkpoint/worker internals, storage URLs, tokens and project information are absent from answers and public package data.

Initial native QA exposed an inaccessible drawer under Studio; the drawer now portals to the page overlay and passes ordinary clicks. Manual screenshot inspection also found weak input contrast and generic regenerate advice for cleanup; both are corrected and the native proof rerun. The earlier failure screenshot is retained; failures are not counted as passes.

## Public AI-readable package

[Public package guide](../../docs/product/ai/index.md), [structured package index](../../docs/product/_data/ai-package.v1.json), [feature catalogue](../../docs/product/_data/knowledge.public.v1.json), [control catalogue](../../docs/product/_data/controls.public.v1.json), [task guide index/data](../../docs/product/_data/tasks.public.v1.json), [relationship graph](../../docs/product/_data/graph.public.v1.json). Every entry retains scoped readiness and documentation/version links. HTTP document responses are generated from the same reviewed public projection rather than serving arbitrary filesystem bytes. These are local, AI-readable artifacts; no production publication or guarantee of ingestion by ChatGPT/Claude/Gemini is claimed.

## Files changed for this task

- Service and boundary: `src/productAssistance/index.js`, `src/productAssistance/journal.js`, `src/routes/productAssistanceRoutes.js`, bounded mount in `src/server.js`.
- Drawer/entry points: `ProductAssistance.js/.css`, `ProductHelpButton.js`, `App.js`, `StudioAdvancedInspectors.js`, `ViralClipStudio.js`, `StudioLaunchTemplatePanel.js`, `CamCombinerPanel.js`, `IdeaVideoPanel.js`.
- Knowledge: existing catalogue/impact/source lock, `src/productKnowledge/index.js` and `generate.js`; generated public docs/package; no feature/control/task count growth.
- Verification: `test/product-assistance/`, `ProductAssistance.test.js`, the existing knowledge source-review fixture, `scripts/product-assistance-ui-proof.js`, package test command and private proof screenshots/transcripts.
- Continuity: internal audit, this report, the five Studio contract/readiness/matrix records. Earlier dirty work is preserved.

## Documentation gaps and next work

The actual UNKNOWN_EXPORT_GLITCH question produces a structured unknown-error candidate; the unsupported teleport question produces an unresolved-feature candidate in service evaluation. Both await review and never become feature claims. Caption controls are not yet individually qualified in the catalogue; the existing caption guide remains the reviewed workaround for BROKEN automatic words. Exact HQ-3D, caption-validation and provider-specific error-code coverage remains limited: unmapped codes must receive the unknown-error response. English lexical routing can miss unfamiliar or ambiguous wording; weak matches need clarification. Current runtime status/permissions are not independently inspected by this read-only help.

Recommended next assistance capability: a **read-only diagnostic context adapter** for existing real 3D/caption/provider block codes, with a durable, private, human-reviewed gap queue. Keep CREATE/APPLY unavailable. Shared Studio S02 preview/final parity, S03 nesting, remaining S04/AE controls, ordinary-account model lifecycle and showroom qualification remain open.

Zero model/GPU jobs, new final renders, publishing actions, production deployments or main merges in this task. The local scheduler stays disabled. Existing scheduled publishing work is preserved; this help task makes no new external publication claim.
