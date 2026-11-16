# Node Flow audit — 15 November 2026

The core Node Flow lifecycle and workspace have been repaired and exercised through the real local Studio UI. This is a bounded functional audit, not a claim that every advanced node renders.

## Changes

- Fixed real mouse wiring that cancelled on click or immediately disconnected after connecting. The wire banner no longer moves ports during a gesture; refused operations show an inline error.
- Bypass now neutralises the canonical controls and animation channels consumed by preview/export, retains scoped originals in the project, and restores them after save/reopen. Corner Pin defaults to its correct 100% progress and stays available while bypassed.
- Node changes validate atomically before application, including track/layer locks, deleted-layer keys, cycles and source references. Rapid additions receive unique IDs.
- Parameter links sample their source at the programme clock and use the shared pose evaluator and export baker. Canonical persistence retains links/macro/effect metadata. Macro scale applies once and relative opacity survives a zero-opacity round trip.
- Added an expanded Node Flow workspace, responsive desktop toolbar, visible focus, accessible ports and selection, keyboard A/B divider, Escape return and focus trapping. Node shortcuts no longer intercept Delete elsewhere in Studio.
- Restricted the status-banner Top Up Credits action to actual credit errors. The existing desktop-only Studio requirement remains. Experimental keyer/depth/optical-displacement sections now disclose their missing preview/export consumers.

## Verification

85 focused frontend tests across nine suites and 135 actual CPU composition/track-matte tests pass. The strict production build passes. Seventeen knowledge and 35 product-assistance tests also pass. Final desktop/mobile guard and welcome/help checks are retained in `private/ux`, `private/build-check-final`, and `private/signed-help-final.json`. Eight final anonymous welcome comparisons and three native signed-in help/follow-up checks pass. The first signed-in help observer omitted Firebase IndexedDB from its state export and timed out; the corrected proof uses normal sign-in.

The ordinary signed-in native flow covers all nine palette actions on compatible targets, six Smart Rig insertions with Undo, physical pointer connect/disconnect, canonical Corner Pin bypass/restore, history, locked-track refusal, save and semantic cold reopen. The native flow used Glass Current footage and an ordinary image from Videos. Authoring/serialization checks of experimental operators do not qualify rendered results.

One normal approved local CPU export completed through the shared wallet/worker/download path. The exact native download is four seconds, 720×1280 at 24fps, H.264/AAC, fully decodes and plays to its end with 97 decoded frames. SHA-256: `0b7e445df42f67727cce4659e1dfb0d650f14c1c5ea8eec6f6c30fe178fa98c9`. See `private/final-native/verification.json`, the matching `.autopromote.json`, movie and recorded authoring/finished playback. This engineering test is not a creative or listening approval.

## Retained failures and limits

The first lifecycle tests exposed ten failures before fixes. Earlier failed strict builds, file-chooser/observer timeouts, an incompatible Corner Pin target, wire double-event failure, hidden Smart Rig button observer and transient blob-URL equality failure remain retained. Corrections use native visible controls; semantic restore equality excludes renewed blob URLs only. No failed take has been relabelled as a pass.

ChromaKeyer background removal, optical halation/displacement, depth/rack-focus, arbitrary effect mask-source routing and generic node-isolated A/B evaluation still require shared preview/worker implementation and real paired render tests. Their stored fields and Smart Rig insertion are not functional render qualification. Legacy bypass documents without recovery values and overlapping visibility aliases need broader migration/combination checks. Whole moving-picture/audio parity, strict typography colour/edge (13/16 failures), capture smoothness and shared S02/S04/S03 remain open.

Readiness stays 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY. Next: implement these remaining operator consumers through the existing canonical renderer, then native preview/export comparisons; preserve the working lifecycle fixes.

All execution used fresh owned local emulators, headless muted browsers and the local CPU worker. No production writes, paid model/GPU job, publishing, deployment, push or main merge occurred. Private checkpoints and source-sync receipts preserve the audit and original active-file bytes. The final Storage-emulator export attempt failed because its target directory had not been pre-created, terminating its owner after complete Auth/Firestore snapshots. All four original raw Storage blobs and worker artifacts are preserved, but exact original Storage metadata replay is incomplete. Final UI continuation restored the exact Auth snapshot and explicitly reconstructed the original source metadata from its recorded owner/path/generation and exact verified bytes, including its Studio-upload purpose; this is recorded separately and does not qualify a complete original runtime replay. No additional render or wallet/cohort reset followed. Later UI observer failures (trying navigation underneath the reopened Studio, clicking a hidden palette, and inadvertently hiding the timeline) remain retained alongside the corrected native checks.
