# Studio Reframe and Moments repair — 5 November 2026

Local validation checkpoint: `fix/studio-reframe-moments-20261105`, incorporating main `1bae70bb`. Studio had not been pushed, merged or deployed at this checkpoint. The owner subsequently approved pushing to main after successful release checks; track the PR/release follow-up for the actual outcome. The separate, approved Queue repair is already live through [PR #521](https://github.com/Tibule12/AutoPromote/pull/521), with all PR checks passing.

## Changes

- The playback range, counter and timeline follow the active native decoder through the existing lightweight clock. Source-slot changes rebind media listeners. Framing actions read that same clock, even without a React `timeupdate`. No synthetic clock or second player was introduced.
- Moments puts its range controls before the creative suggestions, opens its own inspector/library, selects the correct source range after trimming, preserves reviewed captions when previewing the same moment and retains all discovery suggestions at the Studio handoff. Generated caption drafts use source timestamps and the correct source ID.
- Creators can save a trimmed range as a named moment, switch between ranges, Undo/Redo, save and reopen. The original footage and existing moments remain available.
- Reframe preview uses normal transport. Speaker shortcuts create cuts; smooth/cut transitions are editable. Split-panel positioning, tracking points and speaker-order cuts remain native project edits.
- Timed transitions into Multi-Camera now reuse the existing synchronized camera renderer and bounded framing compositor. They previously failed on export. Camera muxing uses the existing explicit-duration helper: `-shortest` was dropping final pictures. Unused intermediates are cleaned on success/failure.
- The existing twelve-angle source-bank limit applies across imports. Removing unused angle references is reversible and does not delete media or saved versions.
- Local-only test transport supports actual CPU face/audio analysis and includes every owned camera source in the existing wallet's dispatch manifest. Foreign sources remain rejected. No new wallet or production billing path was added.

## Actual application evidence

All tests use the ordinary signed-in React app, Auth/Firestore/Storage emulators and real canonical CPU processing. Browsers are headless/muted; external application/worker traffic is blocked. Synthetic camera inputs are explicitly labelled layout tests, not a real synchronized shoot.

| Workflow | Verified |
| --- | --- |
| Playback under bounded CPU contention | Native video, range, counter and timeline advance; Pause and Chipmunk preserve transport. |
| Discovery → Moments | Real CPU speech/scene analysis → suggestion → preview → trim → Undo/Redo. This sample produces one suggestion; multi-suggestion retention also has a focused handoff regression. |
| Face/camera-cut analysis | Low-confidence detections preserve existing framing; the real source-shot model supplies reviewed points and owned durable artifacts. |
| Recovery and delivery | Save/cold reopen preserves source ranges, captions and framing; canonical export, private download/full decode and complete finished playback pass. |
| Named moments | Save current range → Undo/Redo → switch → save/cold reopen → consent → actual CPU export/full decode. |
| Four output aspects | 4:5, 1:1, 16:9 and 9:16 export at the requested geometry. |
| Framing controls | Left/right, smooth/cut, Alternate Speakers, remove/Undo/Redo, independent split paths and timed speaker placement; split export/full decode. |
| Multi-Camera | All seven layouts preview; two-, three- and four-source representative outputs export/full decode, including timed mode changes. |

[Visible Moments controls](evidence/moments-controls-visible.png) · [Playback samples](evidence/playback-stress.json) · [discovery/recovery](evidence/moments-analysis.json) · [named ranges](evidence/moments-ranges.json) · [framing controls](evidence/framing-controls.json) · [camera layouts](evidence/camera-layouts.json) · [output aspects](evidence/aspect-exports.json).

## Checks and practical limits

[Validation](evidence/validation.json) records **129 focused passing tests across recorded runs, 11 real FFmpeg subtests**, clean targeted lint and both isolated and production-configuration builds. Eight desktop/mobile welcome comparisons pass; generated help and Studio continuity validation pass. Real FFmpeg tests verify exact cut pictures and unchanged original audio samples; the fractional three-camera regression requires every expected picture frame. The old mux's missing tail was reproduced on local FFmpeg 6.1.1; newer muxers need not reproduce that historical defect. The earlier broad editor run had two obsolete range-step assertions; their corrected terminal-hold cases passed. A later broad selection was interrupted with exit 143 and is not counted as passing. PR [#522](https://github.com/Tibule12/AutoPromote/pull/522) runs the normal release checks. The first worker-image check exposed test-harness assumptions across FFmpeg versions; the follow-up below records the correction. Main remains unmerged at this checkpoint.

Failed analysis, export, telemetry, temporary-path and harness attempts remain in private evidence. Their successful reruns do not erase them. A repeated-import QA project grew beyond the advertised twelve-angle bank and failed a subsequent backup. Its later pruning → Undo/Redo → named-moment selection → backup/cold reopen → actual export now passes. Capability-link refreshes are compared by stable object path, not expired access queries.

This qualifies the listed local workflows, not unrestricted footage, voice identity detection, automatic transcript accuracy, every project combination, full live picture/audio parity, creative approval or production Auth/worker infrastructure. Formal Studio readiness counts stay unchanged: 17 FUNCTIONAL, 9 PARTIAL, 1 BROKEN, 2 UNIMPLEMENTED and zero PRO/PRODUCTION-ready. Shared S02/S04/S03 work remains open.

All processing measurements are local resource observations, not cloud invoices or credit prices. No paid cloud/GPU job, advertising, production credit, balance/subscription change, schedule/publication, Rules/IAM change or production record mutation occurred. [Preservation hashes](evidence/preservation.json) cover 47 protected security, financial and Queue files against current main. Historical balance/session risks and the seven production test documents remain separate and unresolved.

## Release boundary

This repair needs both the frontend/API release and the canonical media-worker image. Deploying only the frontend would leave timed Multi-Camera export unsupported. After review and explicit release approval, use the existing checks and candidate-worker verification before traffic promotion, followed by the frontend/API release and live smoke verification. Retain the repaired permissions on rollback. A main merge automatically triggers the existing worker deployment workflow, including cloud build/render verification. Its synchronous candidate smoke render uploads test media to the production bucket. Release approval must explicitly cover those bounded test artifacts and their retention, or the candidate must first be isolated; the latest owner instruction authorizes the tested main release. No test-storage write, cloud build or deployment had started at this local checkpoint.

Production migration, live ads/rewards and commercial credit allocations remain excluded. Cost attribution, provider qualification and the existing monetization pilot gates remain open.

The image verification gate now includes the new real framing-cut and multi-camera regressions, so both PR verification and the normal worker release exercise them. The pre-release worker baseline is `media-worker-v1-00123-vop`; scaling/concurrency/runtime limits and IAM are preserved.

## PR image verification follow-up

The first CPU image gate ran 148 tests: 145 passed and three assertions failed. Local FFmpeg 7.1.5, built from the official source tag, reproduced the two camera-cut failures: after `setpts`, FFmpeg 7 no longer inferred the fixture rate, so the raw-video muxer duplicated the early frames at its implicit 25 fps. The fixture now preserves each actual frame with `-fps_mode passthrough`; exact switch-pixel assertions remain. Production exports already specify their delivery rate. The third assertion required the old `-shortest` truncation to reproduce on every FFmpeg version; it is removed while the fixed-command exact picture-frame count remains mandatory. No renderer behavior was changed for these harness corrections. The 19 framing/camera tests pass again on local FFmpeg 6.1.1. The official FFmpeg 7.1.5 check and image rerun are tracked separately; earlier failures remain retained.
