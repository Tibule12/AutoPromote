# Cycling preview/export comparison and sound timing

10 October 2026. Scoped repairs and a verified private export; **full Studio playback and picture/sound parity remain unqualified**.

The same 20-second cycling edit has a corrected native CPU export and a matching server/download hash. Live built-in sound starts now follow decoded video frames: the observed Tape Stop delay fell from **344 ms to 21 ms**. The paired picture comparison also exposes remaining differences. A new complete Studio recording did **not** pass: the actual rendered-film monitor stalled at roughly 14 seconds, and subsequent cold entry encountered a signed-out QA session. Do not present the retained partial capture as a finished Studio demonstration.

- [Corrected 20-second movie](proof/launch-template/cycling-parity-20261010/corrected-export-r3/cycling/final.mp4)
- [Actual editable Studio timeline](proof/launch-template/cycling-parity-20261010/corrected-export-r3/cycling-timeline.png)
- [Actual Studio workspace](proof/launch-template/cycling-parity-20261010/corrected-export-r3/cycling-studio.png)
- [Playback-stall diagnostic](proof/launch-template/cycling-parity-20261010/corrected-export-r3/cycling/native-capture-diagnostic.jpg)
- [Exact native render/download receipt](proof/launch-template/cycling-parity-20261010/corrected-export-r3/cycling/render-receipt.json)
- [Checkpoint and remaining blockers](proof/launch-template/cycling-parity-20261010/checkpoint.json)

The footage is the retained three real cycling sources, previously obtained from Mixkit. No new stock, model inference or generated material was added. The shared `cycling_rhythm_v1@1.0.2` template remains the author of the ordinary editable occurrences, typography, motion, music and sound cues. This session corrects and checks that existing edit rather than claiming a new creative style or approved showcase.

## Identity and actual execution

The QA duplicate is `viral-project-ed5c7f62-d197-401b-a234-68325490629a`, canonical SHA256 `b3999bdc503369988968610cf6cc46b9f17b6bf286f93038f9fa776dd1414e38`. It contains thirteen clip occurrences, sixteen graphics and seventeen sound cues. The template definition hash is `efcdf13fa2055544297a1253e390e5f55c4b6c03e8d916ad7867c0661fb6772a`. Repeated native saves around the raw-frame/audio captures preserve this hash. The original cycling project and output remain untouched; a duplicate's project hash is not the original's identity.

Three local CPU submissions occurred:

| Attempt | Result |
| --- | --- |
| `viral_339333f937bf0e528650406129b7e5c49320b091a3e7b60153878d5da66b1f2d` | Failed: the task-owned local worker used a package entry without its sibling import path. Corrected to the production `main_media_server` entry; no output. |
| `viral_c13abdbb3e52a4ecdf411e2af188619718eb4afe358f3fd4be5b40ac078932ea` | Completed 17:50:18–17:53:33 UTC; download/full decode succeeded, strict receipt failed because direct-to-Storage output omitted its hash. |
| `viral_b9954d19a8d4dc959d4ce362fda4819081d63c3072050710b792be284e842b5e` | Completed 18:00:24–18:04:32 UTC; native download and server/download hash comparison pass. Subsequent full Studio playback fails at about 14 seconds. |

The two completed movies have identical SHA256 `b203664f168d4c847de013d84f21871c03093400d2603e8013a317dd4ee1e403`. The corrected receipt is therefore bound to the same bytes used in the 47-frame comparison. The movie is 720×1280 H.264/libx264, 24 fps, 480 frames, 20 seconds, stereo AAC/48 kHz. Independent complete picture/audio decode passes. Audio decoding includes the recorded AAC padding tolerance; this is not full mix or listening approval. Packet inspection finds 480 packets, monotonically increasing DTS and a maximum DTS gap of one frame.

The real signed-in normal local App and existing Firebase authorization/storage/render APIs were used; no fabricated identity, injected edit, route mock or render mock. The legitimate retained session was reused, so fresh login was not qualified. The existing local development charging bypass remains active; entitlement/charging is unqualified. Browser QA was headless and muted. No GPU job, paid instance, model download, production deployment or main merge occurred.

## Repairs and measured limits

**Source framing:** sequence framing now evaluates after selecting the delivery FPS and resetting its clock. Owned source bytes are preserved for this reviewed framing path instead of first being normalized to 30 fps. A real FFmpeg gradient-pan regression reproduces the historical 30→24 fps error and verifies every delivered frame's expected framing. Native cycling comparisons still fail at multiple fast pans and cut frames; the regression does not qualify every real source/frame mapping.

**Media preview:** the generic overlay box shadow and the image element's implicit rectangular shadow are removed. Explicit authored `layerShadow` remains the media-shadow path. The first native paired capture after the outer-shadow change still showed the image element's backing, which led to the second source repair. The final optimized App build passes, but that last image-shadow change has **no fresh authenticated native visual retest** after the session expired. Logo appearance timing is also unqualified; captures did not gate on image decode.

**Sound starts:** the existing SFX synchronizer now runs on decoded frame callbacks as well as native media events, without publishing React state on each callback. The inactive decoder is guarded. A single-pass native observation finds all **15/15 built-in cues**, maximum first-start delay **49 ms**, Tape Stop **21 ms**, compared with **344 ms** before the repair. Twenty-two matched starts indicate restarts around seeks/cuts; this does not establish seamless audible continuity or full-mix parity. The two sampled-file cues, music balance/fades, whole soundtrack listening and mastering remain open. `audio-fixed` includes repeated loops and is diagnostic only; use `audio-fixed-single-pass/mapped-audio-starts.json` for these figures.

**Output receipt:** the worker now hashes the final bytes before returning its direct-to-Storage result; the backend preserves a well-formed worker hash/byte count and continues to use its own durable-copy hash for transient transport. No hash is invented if absent or malformed. The fresh native render/download exercises this repaired path.

**Picture comparison:** 47 actual paused raw Studio frames were paired with the exact corrected movie. The declared two-preview-pixel geometry check gives **24 PASS / 22 FAIL / 1 insufficient**. These results are retained without relaxing tolerance. Each record includes the actual programme/source clock and output-frame rounding. Some requested UI positions fall between delivery frames; that does not excuse the failing exact-cut frames or establish text/raster conformance. All ten paired contact sheets were visually inspected: source selection, text and end card are recognizable, but the soft dip at 14.5 seconds is black in the export while the preview remains visible. The legacy preview caps its dip opacity; the renderer fades fully. This difference remains open. Text raster, animated-logo onset and full picture/audio parity remain unqualified.

The first five-frame baseline did not clear native playback intent correctly and advanced during seeks; it is diagnostic, not evidence of incorrect source selection. `paused-baseline` is the corrected baseline. The final Studio recording reached the 14-second frame and then stopped advancing for the rest of its 60-second observation. The following recovery and retained-profile attempt were signed out. The exact downloaded movie subsequently played all20seconds in standalone muted Chromium147:480 decoded frames, zero drops and natural end. This narrows the stall to the Studio playback path, without establishing its root cause or replacing the failed native Studio playback. The first standalone diagnostic reached natural end but used an unsupported metrics serializer; the corrected second observation supplies the retained receipt.

## Files and validation

Product changes: `ViralClipStudio.js`, `ViralClipStudio.css`, `studioSourcePreview.js`, `python_media_worker/main_media_server.py`, `src/services/videoEditingService.js`.

Regression/QA changes: `studioSourcePreview.test.js`, `test_studio_reframe_cuts.py`, `videoEditingService.templateOutput.test.js`, `scripts/creative-templates/cycling-parity-proof.js`, `compare-cycling-parity.py`, `studio-proof.js`, `materials-editing-proof.js`. QA timers now clear after a render; capture clears native playback intent after seeking. These harness changes do not repair or qualify the 14-second playback stall.

Eighteen focused checks pass: five worker framing checks, nine source/audio-clock helper checks, one existing component metadata/seek guard and three output-provenance/integrity checks. The component run skips 104 unrelated cases; no full-suite pass is claimed. Final optimized normal App build passes with existing lint warnings. Record validation, replay-bundle consistency, syntax and whitespace results are retained in the checkpoint. Readiness counts are unchanged.

Next shared **S02** slice: recover a legitimate authenticated QA session, diagnose the existing completed film's native 14-second stall with media/network/decoder observations, and finish playback without a new render. Then retest the media-shadow repair, align dip transitions and exact frame/crop mapping, capture the live full mix, and obtain actual whole-film/sound creative review. Keep the current thirteen-cut edit, existing timeline layout and original films. Broader S02/S03, ordinary-account model runtime, publication adapters and showroom qualification remain partial. No creative approval, public release, hero or production readiness is claimed.

## Bounded playback follow-up

10 October 2026, after the founder rejected further lengthy cycling checks: the original retained QA profile was checked through the normal App in headless muted Chrome153. The Studio entry is absent, Sign In is visible, and the Firebase auth-user record is absent. This is stronger evidence than merely assuming an expired token; the cause of lost browser state remains unconfirmed. No render, GPU, fixture or authentication bypass was run. A valid existing signed-in project-owner profile was requested; the private native playback remains blocked on that session. The recording observer now retains actual decoder, buffer, transport, source-change and output-mode state when a native recording times out. This source/syntax change is diagnostic only; it has no fresh authenticated run. [Exact entry check](proof/launch-template/cycling-parity-20261010/playback-recovery-auth-check.json).

## User login recovered

The user was already signed in. The private saver incorrectly expected wrapped string primitives inside Playwright rich IndexedDB records. It now accepts the actual stored format and refuses signed-out overwrites. The live saver was repaired without closing the user’s signed-in browser. The authenticated recovery copy and previous version remain private outside repository/cache cleanup. A fresh normal App browser context and reload authenticate without another login; the backend returns HTTP200 for the same existing completed job and unchanged output hash. Three focused session guard checks pass. No render or GPU job was submitted.

This removes the authentication blocker only. The retained snapshot has no local canonical project database and lacks the corrected job receipt. Restore the exact project backup through ordinary owned controls, repair/requalify normal completed-job reconnection and diagnose full Studio playback. No full-playback, parity, creative approval or public-release qualification is claimed. [Session evidence](proof/launch-template/cycling-parity-20261010/session-recovery-verified.json).
