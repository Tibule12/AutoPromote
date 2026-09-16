# Viral Clip Studio motion and GPU audit

Audit date: 2026-09-16

Branch: `agent/viral-studio-3d-gpu-director`

Repository source of truth: the working tree on this laptop

## Outcome

The existing Studio is a substantial editor, not a blank 3D demo surface. Its current tested workflow includes real timeline cuts, hook editing, captions, B-roll, layered audio, 2D motion, transform keyframes, Creator FX, comparison modes, persistence, undo/redo and final-render contracts. This change adds an editable 3D Motion workspace to that same editor state and timeline, a browser Three.js preview, a strict Blender renderer, an authenticated HQ-preview boundary and verified final alpha compositing.

The isolated L4 Cloud Run Job is not deployed. Google Cloud rejected the project's one-GPU, no-zonal-redundancy quota request. No paid GPU execution occurred. Shipping an unmeasured AI matting implementation or silently enabling redundant GPUs would violate the assignment's quality and cost constraints, so the existing CPU MediaPipe Motion Sculpture fallback remains the production subject-segmentation path for now.

## Verified existing Studio capabilities

The current regression suite and browser workflow exercised:

- authenticated local source upload and playable source loading;
- Quick, Creator and Signature views over one shared edit;
- visual timeline seeking, clip reordering, split, trim, delete and ripple cuts;
- hook selection, range movement, focus point, freeze frame and duplicate-span removal;
- Before, After and synchronized comparison playback;
- generated and editable timed captions, styles, position, scale and hallucination rejection;
- B-roll upload, timing, trimming, long duration, layout, return/loop/hold behavior and original/overlay/mixed audio;
- original audio mute, music, speech ducking, fades, SFX, custom SFX and voice-over export contracts;
- speed ramps with pitch preservation, smart reframe and reviewed speaker layouts;
- 2D motion presets, motion paths, editable pose/keyframe values, linked sound cues and safe-edge tests across 16:9, 9:16, 1:1 and 4:5;
- Motion Sculpture, Beat Echo, finish presets and other Creator FX preview/export contracts;
- undo/redo for overlays, B-roll, motion and grouped edits;
- project snapshot persistence fields, render progress, completed After output and explicit download/use actions.

No publish, schedule or final end-user project action was performed.

## 3D system implemented

### Editor and timeline

Eight templates are available in Motion → 3D Motion:

1. Cinematic 3D Title
2. Neon Logo Reveal
3. Chrome Lyric Burst
4. Audio-Reactive 3D Text
5. Floating Social Callout
6. Impact Word Explosion
7. Speaker Introduction
8. 3D Comparison Card

Basic mode exposes the useful creative choices: text, supporting text, material, entrance, primary/glow colours, exact start/end, intensity and a secure logo/image upload. Advanced mode exposes font, weight, alignment, easing, hold/exit, background, quality, transform, extrusion, bevel, line spacing, focal length, camera motion, lighting, bloom, audio response, layer order, shadows and reflections.

The completed HQ result is explicitly available in the frontend as **Download standalone motion**. That download is the separate rendered ident, not a podcast composite. The transparent alpha output remains private and is resolved server-side only when the same scene is used on a programme timeline.

3D scenes are real project/timeline objects. They are persisted, included in history, selectable, movable, trimmable, duplicated, deleted, reset, retimed after destructive cuts and exported in layer order. Editable pose keyframes cover X/Y/Z, scale and X/Y/Z rotation with per-keyframe easing. Moving the object shifts its keyframes; trimming and cuts remove or retime out-of-range keys.

### Preview and render

- Interactive preview: lazy-loaded Three.js, bounded pixel ratio, reduced geometry and a preserved-state fallback when WebGL cannot initialize.
- HQ preview: explicit request, queued/rendering/completed/failed/retry UI, job ownership, scene-revision checks and a returned in-Studio video.
- Export safety: an active or edited 3D scene cannot export until its current revision has a completed HQ job. The media API resolves the opaque job ID to an owned signed alpha asset; the browser never supplies the final storage URL.
- Blender: strict versioned JSON, bounded frame/resolution/duration budgets, no client Python or shell, Eevee preview rendering, transparent PNG frames, H.264 preview and QTRLE ARGB overlay output.
- Final worker: validates the signed Google Storage path, file size, dimensions, codec, pixel format and duration before retiming and compositing the alpha layer on the edited timeline.

## Defects found and fixed

| Defect                                                                                                                                         | Reproduction evidence                                                                        | Fix                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live/HQ 3D preview worked but final export silently omitted every 3D scene.                                                                    | The browser parity test reached `/api/media/process`; `viralData.threeDGraphics` was absent. | `buildViralRenderData` now forwards the exact HQ job/aspect/scene array; unit and browser tests assert it.                                                                               |
| The new Python request guard broke older request-shaped callers that legitimately omitted the optional 3D field.                               | Full worker suite failed 1/321 with `AttributeError: threeDGraphics`.                        | Optional access now uses `getattr(..., None)`; the focused suite and full suite pass.                                                                                                    |
| A Studio rotation test asserted rotation on the image although the implementation correctly applies the CSS variable on its transform wrapper. | One existing component regression failed while the rendered transform was correct.           | Assertion now checks the real wrapper contract.                                                                                                                                          |
| `AudioRemixPanel` contained a duplicated click prop in the working tree.                                                                       | Source inspection before implementation.                                                     | Removed only the duplicate prop; audio regressions remain green.                                                                                                                         |
| The first logo render had overexposed highlights, weak tagline legibility and a portrait composition that was too small.                       | Rejected local contact-sheet passes in temporary QA output.                                  | Rebalanced lights/glow, added the dimensional A mark and separate Auto/Promote staging, adjusted portrait layout, glints, plate, orbit and exit timing, then rerendered and reinspected. |

## Visual inspection

The accepted standalone 9:16 logo proof is 360×640, 18 fps and 4.0 seconds. All 72 frames were decoded. The inspected contact sheet shows a deliberate empty opening, dimensional mark construction, split wordmark reveal, readable supporting line, controlled orbit and clean exit. The QTRLE export is ARGB and 4.0 seconds.

The real 60-second source `/home/tibule12/Videos/cam-combiner-60sec.mp4` was also used for a 4-second 9:16 final-composite check. The contact sheet showed no black/empty output, unsafe-edge clipping or face obstruction. The source and output both contain 44.1 kHz stereo AAC; output video is H.264.

Every template was Blender-rendered into an eight-tile QA matrix. All eight outputs were non-empty and inside the inspected 16:9 frame. The first Neon Logo matrix pass was rejected because the A mark crowded the wordmark; the corrected landscape spacing was rerendered before acceptance.

Browser proof was visually inspected at 1440×900. The live canvas showed the dimensional mark, split wordmark, supporting line and orbit within the 9:16 safe area. The Advanced inspector remained usable without covering the output canvas. At 390×844 the product deliberately shows its desktop-tool guard; the guard has no horizontal overflow.

## Performance measurements

| Operation                    | Result                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Local Blender logo proof     | 72 frames, 360×640, 18 fps; Blender 407.13 s; FFmpeg preview 0.37 s; alpha encode 0.30 s                                           |
| Local Blender keyframe smoke | 12 frames, 320×180, 12 fps; Blender 52.33 s; preview encode 0.13 s; alpha encode 0.11 s                                            |
| Logo preview                 | H.264/yuv420p, 360×640, 18 fps, 4.000 s                                                                                            |
| Logo alpha                   | QTRLE/ARGB, 360×640, 18 fps, 4.000 s                                                                                               |
| Frontend workflow recording  | VP8, 1440×900, 25 fps; final successful run captured after standalone-download and mobile assertions                               |
| Local hardware               | Intel i7-7820HQ, 23 GiB RAM, Quadro M1200 4 GiB                                                                                    |
| Local AI GPU result          | Installed PyTorch CUDA build does not support the Quadro's compute capability; no credible local GPU matting benchmark is possible |
| Disk                         | Monitored throughout; assignment artifacts are small and dangling images created by this work were removed                         |

The local CPU result is deliberately a correctness reference, not the intended interactive HQ service. It supports the browser/cloud split: Three.js for immediate editing and an on-demand L4 for HQ frames once quota exists.

## Execution responsibility matrix

| Work                                                 |            Browser |        Existing CPU worker |                  Local laptop |                         Isolated Cloud GPU |
| ---------------------------------------------------- | -----------------: | -------------------------: | ----------------------------: | -----------------------------------------: |
| Timeline state, controls, history, persistence       |            Primary |                         No |                   Development |                                         No |
| Interactive 3D proxy                                 | Primary (Three.js) |                         No | Browser GPU/software fallback |                                         No |
| Captions, audio mix, cuts, 2D motion, final assembly |   Preview/manifest |                    Primary |                   Tests/smoke |                                         No |
| HQ 3D element rendering                              |   Request/playback |       Alpha composite only |        Slow correctness smoke |            Intended primary; quota blocked |
| Person segmentation / Motion Sculpture               |  Preview treatment | Current MediaPipe CPU path |      Measured/tested fallback | RVM candidate only; not shipped unverified |
| Final audio preservation                             |           Controls |                    Primary |                    FFprobe QA |                                         No |

## Cloud safety and status

Verified project identity: `autopromote-cc6d3`; authenticated account matched the existing Firebase project.

Created:

- private bucket `gs://autopromote-cc6d3-viral-studio-3d` in `us-central1`;
- uniform bucket access, public-access prevention and one-day cleanup for `temp_studio_3d/`;
- service account `viral-studio-3d-renderer@autopromote-cc6d3.iam.gserviceaccount.com`;
- object viewer/creator access only on the isolated bucket and Firestore user access;
- Artifact Registry image tag `viral-studio-3d-renderer:agent-20260916c`, digest `sha256:6b97198c6770c8f211caf8b018be7dc85290035ba5a3922580a4a324179ed522` (accepted logo spacing and editable keyframes included);
- quota preference `viral-studio-l4-no-zonal-us-central1`, requesting exactly one no-zonal-redundancy L4.

Not created or modified:

- no Firebase/Google Cloud project;
- no public bucket;
- no always-running GPU service;
- no existing production worker or production render job;
- no billing account, contract, publishing or scheduling configuration.

The Cloud Run deploy failed before job creation because no-zonal-redundancy L4 quota was zero. The quota preference was automatically denied (`grantedValue: 0`). Paid execution count: **0**. Approximate GPU test cost: **USD $0.00**. Normal Google Cloud budget alerts are warnings, not hard spending caps.

## Security checks

Implemented and tested:

- authenticated API access and clip-render entitlement;
- owner-bound jobs and owner-bound asset paths;
- opaque job IDs at the browser boundary;
- strict unknown-field rejection in Node and Python;
- bounded strings, colours, enums, transforms, keyframes, resolution, fps, frames, duration and files;
- image MIME/size/ownership checks and staging into an isolated bucket;
- no arbitrary Blender script, command, shell argument or container command;
- path traversal, foreign-owner path and forged signed-URL rejection;
- one global lease, per-user/day and global/day limits, idempotency keys and duplicate protection;
- stale-revision, aspect-ratio, ownership, codec, alpha and duration checks before export.

## Test evidence

- Frontend Studio/Motion/component suites: **110 passed, 0 failed**.
- Backend 3D service boundary: **24 passed, 0 failed**.
- Python media worker: **321 passed, 0 failed**, plus **284 parameterized subtests**.
- Renderer schema plus overlay-focused Python run: **29 passed, 0 failed** (renderer schema cases are outside the worker directory run).
- Focused browser workflow: **1 passed, 0 failed** after the keyframe, standalone-download, export-parity and mobile-proof assertions.
- Production frontend build: passed. Three.js remains in lazy chunks; the main gzip bundle is approximately 852.31 kB.
- Local Blender renders and FFprobe validations: passed.

Warnings are limited to existing Pydantic v2 migration notices, protobuf Python 3.14 deprecations, stale Browserslist data and the existing bundle-size advisory.

## Remaining priorities

### P0

- Obtain one unit of `NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion` quota in `us-central1`, deploy the already-pushed final renderer image and run the bounded five-second GPU validation with `nvidia-smi`/Blender-device evidence.
- Only after that measurement, implement and benchmark a small RVM MobileNet matting path for behind-speaker graphics; retain MediaPipe CPU fallback. Do not claim GPU matting before this is measured.

### P1

- Add a true isolated-canvas live editing view so standalone idents can be designed without programme footage visible behind the interactive proxy. The current HQ result and download are already standalone; this remaining item is specifically the interactive editing backdrop.
- Add font upload/licensing and a curated brand-kit font list.
- Add renderable curve handles rather than only named easing choices.

### P2

- Move more of the very large `ViralClipStudio.js` controller into tested domain hooks without rewriting editor state.
- Continue route-level code splitting to reduce the existing main bundle advisory.
