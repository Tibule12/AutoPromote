# AutoPromote Studio completion contract

Contract version: **1**. Established **8 October 2026** from the user's permanent product instructions and the [8 October reliability checkpoint](HANDOFF-studio-reliability-repair-20261008.md). This contract governs Studio completion claims. Existing reports remain immutable historical evidence; they do not override this contract.

## Permanent sources of truth

Read these at the start of every Studio session, in this order:

1. This contract.
2. [Product readiness and ordered backlog](STUDIO-PRODUCT-READINESS.md).
3. [Capability matrix](../test/e2e/studio-capability-matrix.json).
4. [Combination matrix](../test/e2e/studio-combination-matrix.json).
5. [Preview/final parity matrix](../test/e2e/studio-preview-render-parity.json).

At the end of every session, update readiness, capability and combination matrices, exact blockers, evidence, and the next highest-priority task. Update parity whenever preview/render behavior or evidence changes. Run `node test/e2e/validate-studio-contract.js`. This validates the records; it does not run or qualify Studio features. Never replace missing evidence with a successful command exit, a source-code inspection, a mock, or a standalone engine render.

## One product, one edit graph

Studio must serve **automatic creative mode**, where AutoPromote/Director makes the edit for ordinary users, and **professional editing mode**, where editors control the same edit directly. These are workflows over one canonical project graph, not separate engines.

Every accepted Director operation must become ordinary editable asset references, clip occurrences, tracks, layers, effects, parameters, keyframes, audio routes, time maps and project revisions. Automatic decisions must expose their resulting state and uncertainty. Professionals must be able to change, undo, save and reopen that exact result. An analysis artifact or creative proposal is evidence, not an accepted edit. No hidden irreversible AI state.

Preserve the existing 90 kHz integer clock, occurrence IDs, content-hash/owned media references, command/revision/review guards and working compatibility adapters. Extend the current document and shared compiler incrementally. Do not rewrite proven paths or create another editor for generated content.

The current architecture is a **hybrid foundation**: `studioProjectDocument.js` records canonical occurrences, maps and selected layer/audio references, while legacy snapshots still carry substantial effect/audio/scene state. `studioRenderCompiler.js` now covers migrated sequence/speed, finish/main-transform and visual composition plans; hook and global stage ordering still lack full canonical compilation and paired output proof. Canonical coverage must be completed before claiming a single authoritative graph for all output decisions.

## Twelve completion gates

For each capability, record evidence for all of these gates:

| ID | Required real user behavior |
|---|---|
| add_use | Add or use the capability through the normal authorized Studio entry. |
| timeline_project | See its assets, occurrences, tracks or layers in the project/timeline. |
| meaningful_controls | Change meaningful supported parameters with observable output consequences. |
| preview | See/hear a trustworthy preview before the final-render purchase/wait. |
| interactive_adjustment | Adjust it and see the new result without hidden stale output. |
| combine | Combine it with other supported capabilities without losing decisions. |
| undo_redo | Undo and redo the change, restoring state, references and output meaning. |
| save | Save the edit through the normal project workflow. |
| close_reopen | Close/reload the app and reopen through the normal saved-project entry. |
| exact_state_recovery | Recover equivalent canonical decisions and stable asset identities. |
| render_export | Execute the real owned render and download usable output. |
| preview_final_parity | Verify that the final output materially matches the pre-final preview. |

Gate states are `VERIFIED`, `FAILED`, `BLOCKED`, or `UNVERIFIED`. A renderer receipt alone verifies none of the unrelated gates. Several row-level successes from different projects cannot be combined into a fictitious twelve-step run. Service capabilities must exercise these gates inside an integrated edit. All gates must be verified for completion; unknowns prevent completion.

## Readiness model

| Readiness | Meaning |
|---|---|
| UNIMPLEMENTED | The claimed Studio user path or essential implementation is absent; provider/CLI foundations may exist. |
| BROKEN | A real implemented path fails its required result. Working subsets are recorded separately. |
| PARTIAL | Some implementation or working subsets exist, but the assessed scope is incomplete, unqualified, or has known control/parity gaps. |
| FUNCTIONAL | One explicit representative end-to-end user path is verified. This is a scoped foundation, not finished work. |
| PRO-READY | The twelve gates, supported professional controls, combinations, persistence and preview/final parity are verified for the advertised scope. |
| PRODUCTION-READY | Pro-ready plus broad claimed media coverage, normal-account entitlements, ownership/security, concurrency, recovery and operational qualification. |

Readiness always names its scope. A working cinematic title does not qualify every 3D control. Known ignored active controls or decision parity defects prevent the broader feature from being labelled FUNCTIONAL even when a smaller working slice is functional. Legacy PASS/FAIL/BLOCKED remains evidence provenance only. Unknown support must be called unqualified, not falsely described as implemented or broken.

No current capability is assumed PRO-READY or PRODUCTION-READY. A milestone requires dated evidence, input/output hashes, actual user steps, graph revision/digest, renderer/version/device receipt where applicable, control settings, visual review and audio listening where relevant. Engineering qualification and creative approval are separate records.

## Preview and final render

Browser interactive preview, inexpensive proxy/draft rendering and representative GPU previews must all project the same canonical edit graph. The final render may differ in resolution, samples or encoding quality. Creative decisions, source selection, aspect/crop, geometry, timing, animation, masks, occlusion, compositing, layer order, audio routing and 3D camera/scene state must agree.

Use a shared time map for source, clip-local, programme and final output clocks, including trims, repeated sources, hooks, freezes and variable speed. Keyframe interpolation/easing and layer stages must be explicit graph semantics. A signed access URL refresh must not change asset identity or invalidate a finished edit. A real content/parameter change must invalidate stale previews and renders.

Every expensive-effect proxy must record the graph/scene digest, owner, source hashes, analysis/model revisions, settings, time window, dimensions and worker version. Reuse it only for that matching state. Show when it is stale or unavailable. GPU preview review must use the same source and decisions as final composition. Playback of an already-finished file is recovery evidence, **not proof of a trustworthy pre-final preview**.

Paired checks must compare the pre-final preview with final output at the same mapped times: just before/at/after cuts, cue boundaries, easing extremes, overlaps and speed-map boundaries. Use state/geometry/timing checks and paired image/matte/audio comparisons. Quality tolerances must be explicit per check; they cannot permit different decisions. Require exact graph identity and ordering; frame conversion may differ by at most one output frame where the declared boundary rounding permits it. Audio onset/routing must agree and undergo listening review. Text must preserve wording, line layout and safe areas. Mask comparisons require correct target, edges and temporal stability. 3D requires matching camera, transforms, asset/material intent, animation and alpha. Establish measured rasterization tolerances on representative paired fixtures before promoting parity; do not invent scores for unrun comparisons.

## Parameter/control contract

Every active visible control must identify its canonical field, allowed values/units, default, time space, command/update path, undo inverse, save/reload representation, preview consumer, final-render consumer and conformance check. Unsupported fields or enum values must be rejected or explicitly unavailable; a disclaimer beside an active ignored slider is insufficient. Do not silently accept no-op fields.

Required control families, where the capability claims support:

- Transforms: position, scale, rotation, anchor, opacity, crop, perspective and blend mode.
- Timing: start/end, trim/split, speed and ramps, freeze, supported reverse, transitions.
- Animation: keyframes, easing/interpolation, duration and motion paths.
- Text/captions: font/size, position, line layout, animation/emphasis, timing, styling and safe areas.
- Masking/tracking: seed/mask points, feather/expansion, target, correction/reset, occlusion/confidence and frame-level correction where necessary.
- Audio: gain/mute, fades, supported pan, ducking/restoration, music/SFX/VO, placement and mix.
- 3D: supported scene/assets, material/light/camera, transforms/animation, depth/alpha/composition, quality and audio-reactive parameters after real implementation.
- VFX/compositing: effect parameters/strength/timing, masks, track source, blend and global layer order.

The capability matrix distinguishes confirmed unwired fields from merely untested ones. Family-level source inspection is not an exhaustive control qualification. Complete the field inventory through the shared parameter registry before claiming professional controls.

## Media and combinations

Publish the actual implemented support surface and its qualification separately. Uploaded and generated video/images/audio/music/SFX/VO, text, captions, shapes/graphics, overlays, supported 3D assets and multi-source/B-roll must use ordinary asset references and timeline structures.

Required fixture coverage includes landscape, portrait, square, short/long recordings, mixed/rational/VFR rates, multiple sources, images with video, video with 3D/tracking, captions with speed, masking with reframing, tracking with camera cuts, audio with speed and nested stacks. Also cover silent/no-audio sources, speech/music overlap, representative claimed containers/codecs and diverse motion/subject edges. Missing fixtures are tracked as missing, not tested. A rendered portrait output is not proof of portrait source ingest. Broad format support cannot be inferred from one H.264/AAC clip.

At minimum qualify the eleven requested combinations in the combination matrix. Exercise shared graph/clock/order/media boundaries, undo/redo, cold reopen and paired preview/export in each. Do not fix combinations by detecting a QA fixture or special-casing a test. Timebox an individual blocked investigation at approximately 25 minutes, record the exact blocker, and move to other high-priority coverage.

## Generated-media and Director integration

Implement the founder/admin Studio path first: brief/script → reviewable generation plan → real generated assets → provenance and owned durable storage → review/reject/regenerate → accepted asset import into the canonical Studio project → ordinary editing, preview, save/reopen and final render. Reuse existing Factory contracts, providers, review/provenance guards and `contentFactoryStudioAdapter.js`; that private compiler foundation is not currently a normal Studio generation/import UI.

Generated assets become ordinary uploaded-equivalent asset records after creation, retaining provider/model/settings/seed, job, content hash and review history. Rejected/unreviewed or other-owner artifacts cannot be imported as approved media. No separate generated-media editor, no hidden flattened-only Director output, and no unrelated generation provider substitution. Keep the founder/admin boundary until ordinary-user qualification is explicitly completed.

## Shared-system work order and continuity

1. S01: finish canonical decision inventory/compatibility and prove normal mixed UI cold recovery.
2. S02: paired browser/proxy/HQ preview and final conformance from the same graph.
3. S03: deterministic composition, global order, nesting and clip ownership.
4. S04: every professional control and preview/render consumer; accessible editing layout.
5. S05: captions, manual correction, coverage/review, metadata and animations.
6. S06: complete 3D/Blender fields/assets/camera/material/light/animation/alpha.
7. S07: founder/admin generation/provenance/review/import into normal media.
8. S08: Director output with professional manual continuation of the exact graph.
9. S09: every requested real combination through download/inspection.
10. S10: broad claimed source formats, clocks, lengths and media qualification.
11. S11: durable GPU readiness/dispatch/queue/recovery/ownership/capacity/scale-to-zero.
12. S12: production and ordinary-user qualification, including durable cloud conflict/media recovery.

This order follows the latest 8 October user instruction; older task numbering is historical. Continue between work blocks without asking what next. A narrow state proof does not end the sprint. Persist the five records after each block and continue the next shared-system task. Only production changes, destructive actions, required credentials, genuinely uninferable product decisions or a new paid GPU authorization may require stopping.

Priorities and exit criteria live in product readiness. An urgent verified regression may interrupt this order; record why and resume the highest shared-system task afterward. No branding/logo work or isolated creative experiments. Preserve all proven October 8 fixes and prior work. Keep browser automation headless and muted; never display the app on the user's work screen. Historical GPU authorization/checkpoints do not authorize restarting paid jobs. This contract/reclassification session starts none.

The ultimate acceptance flow is a new user ingesting supported media, choosing automatic editing or manual controls, trusting the pre-final preview, adjusting and combining the edit, saving/reopening, rendering and receiving the expected result. Separately verify a sophisticated Director edit that a professional opens and continues manually in the **same project graph**.


8 October continuation: [115-field serialization inventory](../reports/studio-canonical-completion-20261008/decision-inventory.json) and [normal mixed recovery proof](../reports/studio-canonical-completion-20261008/browser-flow/receipt.json) extend the canonical foundation. This does not qualify every nested control, output stage, media format or preview/final pair. Exact output/gate evidence remains necessary. No new GPU job or creative approval is implied.

Bounded NVIDIA continuation (8 October): fresh authorization covered one 30-minute window ending 14:06 SAST. Verified preview artifacts are retained in the current completion report. Stop requested before expiry. Existing output may be used for CPU delivery/recovery checks; this window grants no subsequent GPU restart. Native final delivery and paired conformance are still mandatory.

Current S02 outcome: r17 normal signed-in CPU preview/final/download/full decode PASS; same canonical finish and composition requests. Three-line title geometry at 3.5s PASS, max1px at declared2px tolerance. Eighteen Minimal cue-presence/no-unexpected-word-animation guards PASS. Font scale, white text and cue boundaries visually reviewed; complete caption raster, all styles/retiming, outer-frame stages and full audio remain UNQUALIFIED. Real saved expired subject playback recovers automatically through its same owned job, retaining matching review with zero GPU dispatch. Frame controls: Native toggle/history/reset/save/cold-reopen retains disabled frame and identity transform. Real final delivery and embedded-source-border visual review PASS; r11 bad envelope assertion/r12 seek harness failure/r13 interrupted; complete all-gate framing run remains unqualified. Historical GPU window ended; instance STOPPED. Continue broader S02 conformance then S03; no readiness or creative promotion.

Private founder-film v3 evidence is recorded in [its production report](../reports/flagship-founder-film-production-v3-20261008/README.md). Its Factory/Director CLI assembly and shared-worker delivery are bounded private render evidence, not ordinary-user Studio preview/final parity or a readiness promotion. Creative review rejected public use, and the next shared Studio task remains S02.


User stop checkpoint (2026-10-08T14:15:07.243718+00:00): User explicitly stopped work; resume only after a new user instruction. NVIDIA window ended and instance was last verified STOPPED; no new GPU authorization. Main frame on/off, history and reset implementation is repaired; real save/cold-reopen/final delivery remains unverified. Latest r6 harness failed because it tried the in-editor project rail after App reload instead of opening the normal Saved Studio projects entry. No render was submitted by this framing run. Next: repair that harness entry, rerun unchanged framing test and inspect the actual final; continue S02 outer-frame/retiming/audio parity, then S03. All changes/attempts preserved.


Resume checkpoint (2026-10-08T17:33:35.466545+00:00): Actual same-edit 2x subject+3D NVENC output is 6s/60fps and fully decoded. Paired .25s programme/.5s source review reproduces omission of reviewed SAM2 effects from programme and a separate Three.js/Blender geometry mismatch. Main programme now consumes only matching source-bound verified subject frames; muted decoder follows source seek/rate/playback. Owned URL recovery retains pixel-bound approval, and refresh URLs are excluded from edit history. Real r7 undo/redo/cold recovery and subject monitor PASS; final was rejected with real worker-unavailable 503 while another existing job held the GPU lock. Real 503 failure was hidden from Export; inline error is repaired and native no-charge/retry visibility PASS. Same complete flow is retesting through the real CPU worker, reusing the owned GPU subject job without inference. Full subject/3D/composition parity is not yet qualified. Current authorized GPU cutoff 22:00 SAST; next S02 then S03. No readiness or creative promotion.

Current authorized Studio GPU window: [22:00 SAST hard cutoff](../reports/studio-canonical-completion-20261008/gpu-resume-2200-window.json). Existing instance reused; two actual NVENC deliveries ran. No creative generation is part of this sprint.

Subject programme/worker outage checkpoint (2026-10-08T17:33:35.466545+00:00): Actual same-edit 2x subject+3D NVENC output is 6s/60fps and fully decoded. Paired .25s programme/.5s source review reproduces omission of reviewed SAM2 effects from programme and a separate Three.js/Blender geometry mismatch. Main programme now consumes only matching source-bound verified subject frames; muted decoder follows source seek/rate/playback. Owned URL recovery retains pixel-bound approval, and refresh URLs are excluded from edit history. Real r7 undo/redo/cold recovery and subject monitor PASS; final was rejected with real worker-unavailable 503 while another existing job held the GPU lock. Real 503 failure was hidden from Export; inline error is repaired and native no-charge/retry visibility PASS. Same complete flow is retesting through the real CPU worker, reusing the owned GPU subject job without inference. Full subject/3D/composition parity is not yet qualified. [Actual failure and repair evidence](../reports/studio-canonical-completion-20261008/subject-speed-gpu-r2/visual-review.json), [native worker error visibility](../reports/studio-canonical-completion-20261008/native-worker-unavailable-ui/receipt.json). Three new helper guards and one new production component guard bring the distinct retained total to 228.

Latest execution checkpoint (2026-10-08T17:56:09.117356+00:00): Two measured Blender camera projection guards and one late-source-metadata/newer-seek component guard PASS. Live 3D camera now uses Blender sensor/lens projection and camera drift. Same real r11 source-bound subject programme, undo/redo/cold recovery PASS; native final rejected with actual worker unavailable 503 as competing founder GPU jobs repeatedly replace the media worker. Prior intermediate saved-project selection/rail failures were test-runner faults (prefix matched copies; native selection now exact and waits for identity). No additional GPU inference or final render completed in this block. Fresh Blender 50mm scene is prepared; native capacity test queued. Shared-GPU priority is resolved: user chose to let existing renders finish and queue Studio behind them. [Same real programme recovery](../reports/studio-canonical-completion-20261008/subject-speed-gpu-r11/receipt.json), [installed Blender measurements](../reports/studio-canonical-completion-20261008/blender-camera-projection.log). Distinct retained automated total: 231; verdict remains NOT READY.

Shared GPU scheduling checkpoint (2026-10-08T18:03:19.226159+00:00): User selected: let existing founder renders finish; queue Studio GPU tests. Preserve their containers, outputs and controllers. Studio CPU checks continue. GPU deadline remains 22:00 SAST on 8 October 2026; only start queued jobs with sufficient remaining budget. Native fresh Blender submission was BLOCKED by six real 429 responses within its three-minute capacity budget; no new OptiX job was accepted. CPU worker is healthy and the owned QA API has been switched to CPU for the pending complete subject-preview/final retest. No other task is interrupted. Whole Studio remains **NOT READY**.

Latest scoped execution checkpoint (2026-10-08T18:33:08.197117+00:00): Real same-edit CPU final/native download/full decode completed: 6s60fps SHA bb31674ce3e35c9fcc429e88b300d9e4bb86b817066baecce4d5138b75a6a94d. Subject pixels are now visible in programme; split-source title binding native checks pass on both sides of the cut. Paired output revealed late picture/cut timing after 2x speed and delivery FPS conversion. Real FFmpeg regression reproduced the wrong red frame at the mapped blue cut before repair; explicit intermediate resampling fixes the controlled replay. Complete native postfix retest is running. Fresh Blender accepted job 29d3304d-1cc3-4a5d-97a2-050622273b15 failed without a retained SSH exit reason; original root cause is unconfirmed, without confirmed GPU execution. Bounded same-job acquisition was repaired and guarded; native retest is queued behind founder renders. No other job is stopped; 22:00 SAST cutoff remains. Distinct retained automated guards: 234; the additional speed regression is not yet counted. Whole Studio remains **NOT READY**.


Current queued-GPU checkpoint (2026-10-08T19:05:37.178658+00:00): User confirmed queueing Studio GPU tests behind founder renders; those jobs and controllers are preserved. Hard cutoff remains 22:00 SAST. Explicit speed-stage CFR repair passed the real FFmpeg before-fail/after-pass replay and all 56 CPU-configured worker guards. Same saved Studio r11 retest captured six correct source-mapped pre-final frames; its test timeout expired while the accepted CPU job was still processing. Recovery observes that same owned job without resubmission. Split-source title visibility passes natively. Seven actual FFmpeg motion checks pass, including byte-identical transformed output with identity mask keys; unnecessary identity pixel work is skipped in source, pending live worker reload. Fresh Blender rerun is BLOCKED by real daily allowance. The original accepted failure has no retained SSH exit reason, so its root cause is unconfirmed. Bounded GPU lock wait, lease deadline and redacted diagnostics are guarded implementation repairs, without fresh GPU qualification. Whole Studio remains NOT READY. Distinct retained automated checks: 236. [Current evidence and execution table](../reports/studio-canonical-completion-20261008/README.md).


Current exact-delivery checkpoint (2026-10-08T19:43:51.270489+00:00): Real saved r11 CPU r7 native delivery/download/full decode PASS at exactly 6s/60fps/360 video frames with 6s stereo AAC. Bounded source-frame tail padding before CFR and a one-output-frame picture timing gate repair the reproduced 358-frame short-alpha export. Late completed-output recovery forcing Export over the chosen editing tool reproduced in native r6 and a failing component guard; forced navigation removed, native r7 Pacing controls PASS. Lossless 2x/60fps replay reproduced 90/180 ordered source frames; selected-FPS speed stage repairs this, 68 worker/timing checks PASS; same saved r11 native r8 is running. Identity-mask optimization is live: same prior CPU edit improved from 705.84s to 62.352s, a single-case observation. 3D font/material/vertical appearance and clipped tracking label still fail full paired scope. User priority preserves founder renders; latest foreign v4-vace occupies NVIDIA and stops the Studio worker. No new confirmed Studio GPU execution in this block. Cutoff remains 22:00 SAST. Existing Google GPU resource verified read-only as a Cloud Run Job with zero running executions; no idle GPU compute between Job executions, one-minute task minimum, storage/related costs excluded. No new Google execution authorized or started. Whole Studio NOT READY. Distinct retained scoped checks: 249. Continue S02 conformance, then S03; no readiness or creative promotion.


Latest verified GPU-window completion (2026-10-08T20:14:31.419187+00:00): Native same saved r11 CPU r9 export/download/full decode PASS: 6s60fps/360 frames, 6s stereo AAC SHA 576fa3b2c4e7fe24b7e5cfc804e135189a53d9b3891a5ea6e70d3d484a0a3e51. Premature crop before rotation/translation reproduced and fixed; tracked label fully survives in actual final. Static paired geometry p95 1.29–1.37px at declared 2px tolerance. Exact mapped cut at 1.5s and split title PASS. Previous repaired EOS padding, selected-FPS speed preservation and editing-tool recovery retained. 68 worker/timing and 8 real FFmpeg motion guards PASS; scoped aggregate 250. Fresh seven-effect SAM2/NVENC preview completed on L40S: 72 frames/3s. Initial real status 503 stopped automatic polling; native Check saved render recovered the SAME owned job, saved it, downloaded matching bytes and fully decoded with exact reviewed-proxy PCM. Representative visual review PASS; this seven-effect project final export not run. Underlying transient 503 cause unconfirmed; redacted route diagnostics added in source/syntax checked, without a reproduced diagnostic rerun. NVIDIA window ended; exact instance freshly verified STOPPED. No new paid restart. Cloud Run read-only audit: five us-central1 services are CPU/minimum0/request-based; existing GPU qualification Job has no running execution. No new Google execution. Whole edit 3D font/material/vertical parity still FAIL; captions ASR BROKEN; whole Studio NOT READY. Continue S02 3D/raster/matte/audio parity, then S03. No creative/pro/production approval.


9 October user edit: the user requested a two-minute podcast with background treatment, colour and captions and authorized a maximum two-hour GPU window ending **07:59:54 SAST**. Existing capabilities and normal signed-in, headless Studio paths are used; no logo, new editing engine or creative feature is authorized by this edit. Repeated source-range selection and safe worker-read recovery are repaired foundations; complete requested output and broader Studio qualification remain separate. See [session/evidence](../reports/podcast-two-minute-20261009/session.json). Preserve every existing change. Stop GPU earlier after finishing, never extend the cutoff without user authorization. Resume shared S02 after this requested delivery.


### October 9 requested podcast edit — complete background assets, final edit pending

All twelve real signed-in Studio subject-background previews have completed on the authorized NVIDIA L40S. Each owned 10-second download has 240 frames at 1080p/24fps; independent worker receipts match all twelve output hashes and source ranges. Samples from every section were visually reviewed. This is segmentation evidence, not a hair-matte or all-frame quality guarantee. Existing per-scene and per-project limits were retained. Two saved six-scene source projects remain separately adjustable. Their rendered media was assembled into an ordinary derived source with continuous original audio; decoded sample equality, complete 2,880 frames and normal final-project ingestion are verified. Final colour/caption/framing export and persistence checks remain pending. Manual condensed English captions do not qualify automatic multilingual transcription or translation. No capability, combination, parity, creative or product-readiness promotion is made. The hard existing-instance cutoff remains 07:59:54 SAST on October 9, with earlier stop after GPU work. Evidence: `reports/podcast-two-minute-20261009/checkpoint.json`, `background-assembly.json`, `gpu-background-receipts.json`. Shared backlog resumes at S02 after the requested edit.


9 October B-roll continuation (2026-10-09T06:27:04.028070+00:00): User explicitly requested generated B-roll for the podcast and a reusable system path for content that benefits from cutaways. Latest GPU cutoff is **11:00 SAST on 9 October**, independently supervised. Twelve verified background sections and original continuous audio remain preserved. Added normal authenticated B-roll planning/generation/review/owned-media integration over the existing NVIDIA Factory providers and shared Studio graph; 9 transcript/range guards and 23 caption/canonical regression checks PASS. Actual normal UI generation-to-export is still in progress; no readiness promotion or creative approval. Caption import normalizes 44 supplied cues into 51 editable lines; batch language/reaction/explicit wording controls preserve identity review blockers. Browser remains headless and muted.


9 October podcast continuation (2026-10-09T07:25:22.600134+00:00): First actual GPU B-roll plan failed exact transcript grounding. Selected caption IDs now bind the authoritative quote/clock; generated replacement introductions are excluded. Native authenticated retry is processing; no generated output or final export is claimed yet. All 51 caption identities/wording flags are corrected in the saved project. Five panel guards cover stale plans, exact-hash review, recovery, corrected validation retries and idempotent network retries. Saved-state audit found default framing/style/grade; native correction and cold-reopen verification are pending. Idle podcast render worker is deferred while inference uses the shared GPU lock. Hard cutoff remains 11:00 SAST; no readiness or creative promotion. Evidence: reports/podcast-two-minute-20261009/checkpoint.json.


9 October podcast block (2026-10-09T07:38:32.667665+00:00): Native saved-project cold reopen PASS at revision161 for landscape/mode/colour/Minimal captions and all six held transforms. Wan TI2V5B generation is using the L40S; output review/export remain pending. One real FFmpeg raster regression reproduces captions hidden by full-screen B-roll and passes after burning captions after composition. Literal visual-subject/existing-beat guards extend the generation tests to12 PASS; panel guards5 PASS. These do not qualify final pixels or all Studio controls. GPU cutoff11:00 SAST remains enforced.


9 October motion/grounding block (2026-10-09T07:57:48.623874+00:00): First real Wan church artifact rejected for missing planned motion. Full121-frame decode passes, but decoded phase correlation reports zero camera translation; initial contact-sheet motion assessment is corrected. No rejected generated footage was imported. Unsupported room generation was cancelled. Another plan combined split-cue wording and was rejected before inference; literal subject tokens are now enumerated per cue. Native corrected job is processing; final export remains pending. Independent shutdown now starts at10:59 to allow stop confirmation by11:00 SAST. No readiness/creative promotion.


9 October corrected-plan block (2026-10-09T08:07:07.913618+00:00): Native generation now has actual Qwen/L40S plan proof with literal church/singer subject tokens and exact saved cue clocks. First corrected Wan shot is rendering; no generated footage is yet approved/imported. Actual saved revision163 retains51 reviewed manual English cues, Minimal style, precision grade,42 held transform keys,16:9 and disabled AutoPromote watermark. Saved SRT was extracted read-only; native SRT export is not qualified. No readiness or creative promotion.


Podcast shared-system checkpoint (2026-10-09T08:25:22.711068+00:00): Same saved revision161/163 cold recovery verified for 16:9, off main frame, held framing, precision grade and51 manually authored captions. Both real L40S Wan cutaways finished; original candle quantity and microphone motion reviews rejected. Shared owner/hash-bound same-artifact recheck implemented and21 focused guards PASS (backend14,panel7). Native candle recheck202 is in progress. Original failed reviews retained. Caption-last FFmpeg raster regression PASS and shared worker source synchronized; native final parity/download still pending. Hard GPU cutoff11:00 SAST with stop requested10:59. No readiness/creative promotion.


Explicit GPU extension (2026-10-09T08:38:21.984881+00:00): User explicitly extended the existing NVIDIA window to13:00 SAST today. New independent watchdog is alive and will request stop12:59, deadline1791543600. Prior11:00 watchdog removed only after exact owner verification and replacement startup. No new instance created. Same native final submission retry is in progress after genuine coverage preflight was cleared by holding the unchanged completed phrase across its source pause; native coverage check PASS. No final success or broad readiness claimed.


Podcast delivery correction (2026-10-09T08:52:44.950435+00:00): Actual native final job viral_10f7… failed quality gate: picture119.916667s/2878frames, audio120.023s. Real NVIDIA repro confirms -shortest with NVENC reordered packets loses4frames at intermediate audio mux. Shared explicit-duration intermediate mux repairs reframe and timed-grade paths; L40S before-fail/after-pass test retains181/181frames and selected24fps delivery144/144frames, audio preserved and full decode PASS. Failed output retained. Worker now uses repaired source with13:00 cutoff. Deliberate near-EOF trim guard repair and same saved native final are retesting. No final export success claimed.


Podcast parity/controls checkpoint (2026-10-09T09:00:52.535047+00:00): Same actual founder-generated church asset passes native placement, duration undo/redo and cold recovery. Shared NVENC intermediate EOF loss is reproduced and repaired with explicit planned-duration mux, retaining4missing buffered frames; L40S replay PASS. Existing AAC bitrate selector was ignored; shared export now honors128/192/256/320 selection, two guards include actual128vs256AAC decode/bitrate separation. Near-EOF trim now permits intentional sub100ms tail edits; actual120s end verified. Development HMR restored stale initial-project caption/export values; normal fresh reopen with no further frontend changes is required and running. These checkpoints do not establish a completed final or production readiness.


Podcast decoded-audio correction (2026-10-09T09:35:02.175999+00:00): Two native120-second NVIDIA finals have been attempted: first dropped picture tail, second preserved2880frames but independent audio packet/sample audit found a104ms loudnorm tail-clock gap at117s. Both underlying paths are repaired in the shared worker. Real worker FFmpeg before119.904s/oversizedpacket vsafter120s/48kHz/nooversizedpackets PASS. Same normal Studio final retest is now running; no completed delivery or whole-Studio readiness claimed. Latest user cutoff13:00 SAST remains authoritative.


Podcast delivery checkpoint (2026-10-09T10:15:46.220401+00:00): The requested opening two-minute edit is available for review: 1920x1080, 24fps, 2880 frames, H.264 NVENC, AAC256 stereo at48kHz and exactly120s decoded picture/audio. Twelve real native SAM2 background treatments, subtle precision grade, six held camera-cut poses, 51 reviewed authored English captions and one exact-SHA accepted church cutaway are included. The microphone take remains rejected and excluded. Added AutoPromote output watermark is absent. Actual final tail loss and104ms AAC clock discontinuity were reproduced, repaired and retested. Sampled pre-final/final visuals pass; no full raster/matte, fresh human listening or creative approval. Natural-restoration audio reference correlation0.987 does not meet the uncalibrated0.99 threshold; processing fidelity remains unqualified although exact sample continuity and no full-scale clipping pass. Native paused-result scrub now clears stale Play intent. Cold normal entry, paused97.5s seek and repeat native download with identical SHA pass with the worker offline. Brev authenticated control-plane reads/stops repeatedly EOF/time out. Owned worker stopped; guest poweroff accepted and subsequent SSH closed. Provider STOPPED/billing shutdown is unconfirmed. Independent13:00 SAST cloud stop watchdog retained. No GPU restart or new generated take after final completion. Founder generation is a tested private foundation; ordinary-user automatic B-roll is unqualified. Whole Studio remains NOT READY; next shared task S02 then S03. Current counts: **2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY**. [Delivery and full execution table](../reports/podcast-two-minute-20261009/README.md).


Final operating handoff (2026-10-09T10:28:52.820101+00:00): Final operating handoff: selected 120s native delivery and same-job, worker-offline, paused 97.5s recovery/repeat browser download PASS with identical SHA. Owner/path/object metadata checks precede separate signed attachment access, avoiding failed full-file blob buffering. Seven render-attempt route checks PASS, including offline readiness rejecting queueing before credit charge or phantom job; these are engineering tests, separately from native E2E. Tracking evidence remains the retained attached-callout test; mask-derived text occlusion is distinct from unqualified full depth-map editing. No new full tracking/depth execution is inferred from background-tone previews. Provider STOPPED/billing remains unconfirmed. Immediate bounded cloud-stop retries replace the waiting watchdog; guest and owned worker are already off. No restart or generation occurs. Full Studio NOT READY; next S02 then S03. [Full table and top ten blockers](../reports/podcast-two-minute-20261009/README.md).
