# Editable cinematic evidence scene — local milestone, 31 October 2026

Implementation and visual qualification are tracked separately. This is an isolated development feature, not a declaration that the professional editing foundation or production integration is complete.

## Source and isolation

- Worktree: `AutoPromote-cinematic-evidence-20261031`; branch: `feat/studio-cinematic-evidence-20261031`.
- Base: `origin/main` at `eedf45a4`. The 47 relevant committed Studio/CPU-worker files from `4305b6da` retain the later sequence, perspective, source-preview and remix foundation used for this source. Billing, public pages, deployment files and other worktrees' uncommitted work were excluded.
- Real editor: `frontend/src/components/ViralClipStudio.js`, `StudioProTimeline`, existing project store, canonical document and history. The engineering shell imports that component directly. It does not recreate the editor or use a customer's login.
- Source: `/home/tibule12/Videos/The Video I Never Recorded - Presenter Tests/Original Take 1.mp4`, an existing eight-second 1920×1080/24fps presenter performance. Original bytes remain untouched. The evidence surface currently reuses that source; the UI can select a separate local video.
- The source's opening dialogue does not reach the clock revelation. Both readings are invented **illustrative local test cues**, explicitly disclosed throughout the rendered movie and panel. No missing narration, real timestamp, new generation or identity continuity is claimed.
- All HTTP connections use a separate loopback port. Firebase is replaced at build time with an adapter that denies storage/auth operations. The local server has no Firebase, billing, cloud-job or provider SDK imports. Existing App builds and browser sessions are untouched.

## Run locally

Use the repository's installed root/frontend dependencies and a Blender 4.5 executable:

```sh
npm run studio:cinematic:build
BLENDER_BIN=/path/to/blender npm run studio:cinematic -- /path/to/local-video.mp4
```

Open `http://127.0.0.1:6341`. Choose **Motion → Cinematic scene → Apply Director clock plan** (or Add cinematic scene). Sources are imported only into this host's separate local media catalogue. The preset uses 16:9. Edit the camera, screen angle, material, lighting, two clock readings, typography, source offsets, duration and programme start. Render the 360p processed preview or 720p scene export. Use the ordinary Studio checkpoint/history/project controls to save and reopen the scene; the rendered MP4 is a derived cache, not the editable effect.

`BLENDER_BIN` defaults to the existing local 4.5.9 runtime if present. `CINEMATIC_WORK_DIR` selects an isolated output directory; `CINEMATIC_PORT` selects another loopback port (the standalone QA build currently targets 6341).

```sh
npm run test:cinematic
node scripts/build-studio-director-replay.js --check
NODE_PATH=/path/to/installed/root/node_modules node scripts/cinematic/verify-local-studio.cjs
```

The last command uses a fresh dedicated headless/muted browser profile, real editor controls and actual CPU renders. It never fulfils render requests with canned results. Processing may take several minutes per scene.

## Implemented boundary

`cinematicContract.js` supplies the versioned, strictly validated preset and deterministic Director action `reconstruct_clock_and_return`. It emits media surfaces in physical space, a parented clock/callout group, material definitions, area lights, a perspective camera with focal length and sampled C2 easing, source offsets, programme timing and the original presenter audio reference. Unsupported versions/actions, unknown parameters, missing/short sources and ungrounded narration claims fail validation. The same contract is exported by the ordinary generated Director replay kernel.

The scene lives in the existing `threeDScenes` collection and canonical `three_d` layer, including history, layer timing, save/reopen and legacy project roundtrips. New normalization explicitly preserves `cinematic`, `sceneType` and derived local export references. Ordinary 3D titles retain their original normalizer and panel.

`src/cinematic/localServer.cjs` is an opt-in local adapter, not mounted by the production server. It validates source hashes and duration, permits only local asset IDs, rejects cross-origin mutations and serves actual range-readable media. The manifest identity covers the scene graph, source bytes, renderer/FFmpeg versions, builder/runner/font bytes, dimensions, sampling and frame clock. Active/completed identical jobs are reused; corrupt outputs are not reused. One CPU job runs at a time. Wall time, memory/output limits, process-group cancellation, failure progress, scratch cleanup and interruption recovery are explicit. No credit charge is made.

Blender creates moving video planes with physical housings, a lit architectural stage, shadows, geometric clock dials/hands and editable forensic text. FFmpeg decodes the sources at their explicit offsets, assembles exact programme frames, adds the permanent test-cue disclosure and muxes the presenter's original sound. The retained `.blend`, manifest and local source sequences allow diagnostic re-editing; Studio regenerates the effect from the saved parameters rather than treating that file as user code.

The programme canvas can show a processed movie from the same scene semantics using Studio programme time. For a scene covering the complete programme, **Review scene movie on programme** feeds the single rendered movie into the editor's existing finished-file monitor with its editable timeline visible. Picture/audio then share one decoder. The panel labels this as a scene review, excluding other programme effects. Editing invalidates the review and returns to authoring. The separate authoring overlay still has observed decoder drift under load; it is not an interactive 3D renderer and is not parity-qualified.

## Renderer/dependency decision

The existing FFmpeg and Blender subprocess boundaries were retained. No new rendering framework or paid infrastructure was installed.

- Blender uses GPL terms; its rendered artwork/data are not automatically licensed as Blender software. A redistributed runtime/container still needs its software notices/source obligations reviewed. [Blender's license guidance](https://www.blender.org/about/license/).
- FFmpeg's applicable license depends on build configuration; enabling GPL components such as the local x264 encoder changes binary-distribution obligations. Do not assume every FFmpeg build is LGPL-only. Codec/patent and container distribution review remain release work. [FFmpeg legal guidance](https://ffmpeg.org/legal.html).
- MLT offers useful multitrack/filter infrastructure, but would duplicate the existing canonical timeline and FFmpeg assembly for this slice. It was not adopted. Its framework and modules/applications have differing LGPL/GPL boundaries. [MLT copyright policy](https://www.mltframework.org/docs/copyrightpolicy/), [module installation list](https://mltframework.org/docs/install/).
- Natron/OpenFX were evaluated and deferred: another node host, plugin ABI/licensing inventory, sandbox and maintenance surface do not improve this bounded Blender stage. Natron is GPL-2.0-or-later; the OpenFX standard/support code uses BSD-3-Clause, while individual plugins require their own license review. [Natron license](https://github.com/NatronGitHub/Natron/blob/RB-2.6/LICENSE_SHORT.txt), [Natron capabilities](https://natrongithub.github.io/about), [OpenFX license](https://github.com/AcademySoftwareFoundation/openfx/blob/main/Support/LICENSE).
- OpenTimelineIO is a suitable future editorial interchange boundary under Apache-2.0. It carries cuts/ranges/media references and metadata; it is not this scene renderer, does not embed the source media, and cannot guarantee another application reconstructs AutoPromote effects. Future interchange should carry explicit unsupported-effect metadata and media relinking reports. [OTIO project](https://github.com/AcademySoftwareFoundation/OpenTimelineIO), [file/schema specification](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html).

Local CPU execution has no external invoice but consumes local time, memory and disk. Source import is capped at 128 MB/UHD, scenes at 4–10 seconds/24fps and one opaque landscape stage. Uploaded scripts, arbitrary `.blend` files, remote media fetches and arbitrary node execution are not supported. A production worker still needs container-level network/filesystem isolation, tenant authorization, shared leases, storage lifecycle, quota/cost policy and controlled cloud qualification before deployment.

## Evidence and remaining work

The completed [360p scene movie](review/cinematic-preview.mp4), [raw-versus-edited comparison](review/raw-versus-edited-preview.mp4), [complete actual Studio timeline playback recording](review/edited-in-studio.mp4), [native timeline screenshot](review/native-timeline-clock.png), [editable canonical project](review/editable-project.json), [Director plan matching the real render](review/director-plan.json), [browser checks](review/studio-preview-verification.json), [audio measurements](review/audio-validation.json), [check logs](checks/) and [validation record](validation.json) are retained locally. The large local assets/build/browser profile are ignored by Git; source, summary and check logs are committed separately. No customer's media/session was copied into the branch.

The scene movie contains 192 frames / eight seconds at 24fps and fully decodes. Original audio measures 384,000 mono reference samples at 48kHz, zero-sample best offset, 0.9992546 zero-offset correlation and 0.98977 measured gain after AAC encoding. These measurements do not establish fresh human listening or perceptual lip-sync approval. The Studio recording is muted and must be reviewed alongside the separate movie for sound.

175 distinct focused checks pass: 140 frontend cases across core/canonical/3D, existing render/compiler/perspective/sequence/timeline and scoped editor/history tests, seven Node contract/local-server checks and 28 Python worker checks. The first complete mounted-editor attempt was interrupted after running without a report for over eighteen minutes; it is inconclusive. A later scoped history run passed seventeen cases and timed out one unchanged B-roll test at its existing fifteen-second limit. The same B-roll test passed unchanged when the local Blender process was briefly paused, then resumed. Test selection/CPU contention are retained in the logs; neither thresholds nor assertions were weakened. The four existing backup/media cases also pass; the first backup command referenced a nonexistent companion test file and that command failure is retained separately. Final local build, Python compile, generated Director consistency, Git whitespace and Studio continuity validation pass.

Native browser verification uses the real editor and no fulfilled mock render requests. It adds the deterministic scene, processes/reuses actual Blender frames, checks canonical save/cold reopen, changes a clock, rejects its stale preview, exercises Undo/Redo, waits through autosave and reopens again, then downloads the actual movie and checks its SHA-256. The autosave test uncovered and repaired an existing history race: Undo/Redo now replace the pending autosave with the restored snapshot. The dedicated review recording also exercises the existing single-movie monitor from zero through the end, then seeks to the clock at four seconds.

The first occluded-video render was rejected during visual review and cancelled; its screenshot/log remain in the local review directory. Single-frame Cycles/EEVEE performance trials were only diagnostics; Cycles CPU was retained. The full preview was visually reviewed as a contact sheet and moving playback in Studio. It has physical perspective, separate screen depth, geometric clock hands, lit bezels and grounded shadows, plus a readable held comparison and return. Its set/design remains restrained; the secondary surface reuses the presenter source, the reveal lacks matching narration, and no professional creative approval is claimed. The higher-resolution 720p scene export is still processing in the same isolated worker and is not yet a qualified delivery.

Local export profiles use fixed deterministic CPU samples (360p: eight, 720p: four) with denoising. They share the scene/camera/source clock, not identical noise or pixels. Quality/pixel-equivalence and whole-editor real-time authoring are not asserted. The measured source/scene clocks in processed review are the same single movie by construction; this is not an independent live-render parity result.

Required next stage: finish whole-programme assembly through the existing compositor with owned source/receipt validation, then containerize and qualify the same adapter under existing cloud dispatch only after approval. Add actual clock narration and accepted evidence media; extend camera/keyframe authoring and typography; qualify longer scenes, mixed sources, real accounts, preview playback, motion blur/colour management and creative quality. Interchange and additional effects should follow those shared boundaries rather than introduce another editor.

No production deployment, main merge, production session/data access, paid GPU/model call, subscription change, credit-policy change or publication is authorized or performed by this work.
