# Perspective revision — result and remaining failures

**The requested cinematic 60-second opening is still unfinished.** The first flat 16-second title treatment was rejected. This revision adds actual native perspective to the available 16 seconds; it does not establish After Effects-level creative quality or full-production approval.

[Current movie](</home/tibule12/Videos/The Video I Never Recorded - Perspective Revision.mp4>) · [Review package](</home/tibule12/Videos/The Video I Never Recorded - Perspective Revision/>) · [Actual Studio playback](../proof/recovery-perspective/opening/edited-in-studio.mp4).

## What changed

The presenter footage itself now projects onto animated four-corner planes. Entry and exit keys match the original full-frame picture before returning to the presenter. Larger “NEVER SAID,” “THE FACE,” “THE VOICE” and “THE ROOM” titles follow the measured speech. These are ordinary editable Studio layers and keys, authored through the actual frontend, compiled from the existing project graph and rendered by its canonical CPU compositor. Adobe After Effects and externally pre-rendered motion effects were not used.

The local repair adds Composite → Perspective plane and Motion → Perspective progress. Preview uses the decoded programme-frame callback for the plane. Four-corner geometry, progress and native interpolation survive the project/compiler path. Crossed, concave, near-degenerate and nonfinite geometry reject; projected groups, titles, vector contours, crop, masks and motion blur are outside the supported subset. Existing projects keep their previous rendering path.

The real UI exposed a zero-crop-key validation error and the quote path exposed Firestore's nested-array restriction; both were repaired. Large transparent working files repeatedly exceeded the existing 20 MiB limit. The projected-media path now encodes a bounded RGB picture stream and lossless alpha, then rejoins them inside the native compositor. Its RGB working encode is CRF18 with an 8 Mbit/s ceiling; it is **not lossless colour**. Limits were not raised. A final-frame disappearance caused by intermediate timestamp rounding was found with the native grid, repaired and re-exported. Earlier failures and movies remain retained.

## What is verified

- Actual updated frontend on `127.0.0.1:45119`, correct monetization worktree/branch, normal demo sign-in, fresh Auth/Firestore/Storage emulators, local-only API/worker access. No production deployment, production user-data write, new model generation or paid GPU operation.
- Native authoring, Undo/Redo, rejected crossed-corner mutation, independent exact project restore, completed owned export and full matching Studio recording. The first recording finished but its browser closed during the subsequent project check; independent owned recovery verified it without another render. The corrected final has a complete successful recording and final project check.
- A separate native labelled-grid project covers straight, easing midpoint, oblique and restored poses. Its four marker centres differ from the actual paused preview by less than one export pixel at the measured poses. The corrected grid retains all markers on frame 71/72; a real FFmpeg regression also verifies disappearance exactly after the cue. This is scoped geometry evidence, not whole-picture parity.
- Final movie: **1280×720, 24fps, 384 frames / 16 seconds**, complete decode and no identical adjacent decoded pictures. Original provider files retain their hashes. Source-audio correlation is **0.998066** at **zero measured relative offset**. Those measurements do not approve acting, voice identity or lip sync.
- Unscreencast finished playback completes with **one dropped display frame**; live-edit playback completes with **26 dropped display frames**. The live plane's recorded clock differs from the observed decoder by median **one frame**, 95th percentile **two frames**, maximum about **0.292s**. Real-time predictive parity and smoothness remain unqualified. The matching screen recording captures about **19.64 frames/second**, despite its 24fps encoding.
- **60 focused frontend tests, 164 worker tests and eight anonymous entry-point comparisons pass.** Studio continuity validation passes with no formal readiness promotion.

## Creative verdict

The actual moving-picture projection and larger type are an improvement over the rejected flat treatment. They demonstrate a usable bounded native capability. They do **not** supply the complete suspense/reconstruction/clock-comparison/emotional-return sequence. The depth is a projected plane, with limited lighting and spatial choreography. The design still falls short of the requested cinematic standard.

Take 2's sharpening/skin-texture change remains visible. Natural voice continuity, acting and perceptual lip sync still need listening review. The available narration ends before the clock observation; neither 02:17 nor 11:06 is shown out of context. Both readings and the complete script remain intact for the longer film.

The next bounded engine repair is one shared presented-frame update for the canvas, media planes, typography and playhead, followed by paired moving-picture/audio checks. The separate callbacks and React time updates still diverge under load. Supported combinations also need broader mutation/recovery qualification before release. Better art direction and reusable choreography are required alongside the engineering work.

## Review files and portability

The package contains the current movie, untouched original takes, exact raw working proxy, synchronized raw/edited comparison, native authoring and final-playback recordings, screenshots, assets and matching editable project. Utility side-by-side assembly and recording soundtrack muxing are comparison/capture packaging only; evaluated motion comes from the native project.

The current editable backup's canonical hash exactly matches the final movie receipt. It references private emulator assets; an independent restore was verified in the isolated runtime. **Standalone/offline media portability is not qualified.** Keep the included raw proxy, originals and backdrop asset. The earlier backup with embedded backdrop artwork is also retained separately. The previous review export is preserved in `The Video I Never Recorded - Perspective Revision - First Export`.

[Movie/asset verification](../proof/recovery-perspective/verification.json) · [Native export](../proof/recovery-perspective/native-render.json) · [Live/finished observation](../proof/recovery-perspective/live-and-finished-playback.json) · [Grid measurements](../proof/recovery-plane-grid/grid-parity-corrected.json) · [Corrected last frame](../proof/recovery-plane-grid/corrected-boundary.json).

The owned isolated QA services were stopped after retaining the files and receipts. The unrelated application services were preserved. Review the saved movie and recording; the old QA URL is no longer running.
