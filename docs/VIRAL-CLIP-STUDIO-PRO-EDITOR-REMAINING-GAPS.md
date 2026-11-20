# Viral Clip Studio — Complete Remaining Gaps for Professional Editors

**19 November 2026 · Code-verified technical & workflow inventory**

Companion to [VIRAL-CLIP-STUDIO-PRO-EDITOR-READINESS.md](VIRAL-CLIP-STUDIO-PRO-EDITOR-READINESS.md), [STUDIO-COMPLETION-CONTRACT.md](STUDIO-COMPLETION-CONTRACT.md), and the formal registers ([studio-capability-matrix.json](../test/e2e/studio-capability-matrix.json), [studio-combination-matrix.json](../test/e2e/studio-combination-matrix.json), [studio-preview-render-parity.json](../test/e2e/studio-preview-render-parity.json)).

This document records **every remaining product, technical, and workflow gap** on Viral Clip Studio that professional editors will notice, ask about, or hit **during a live demonstration** and **when using Studio on real paid jobs, client revisions, and finishing handoffs**.

---

## Baseline Status & Branch Split (Read First Before Demoing)

The [transport and handoff continuation](../reports/studio-transport-handoff-20261119/README.md) updates the local status below. The timeline now uses an owned-source frame-rate check for Match Source, the existing shuttle shortcuts move through the preview independently of authored retiming, and the editor offers trimmed SRT/VTT plus OTIO/EDL handoff. Live release and broader qualification remain open.

- **Formal Studio qualification counts** (`reports/studio-completion-20261118/README.md`, `test/e2e/studio-capability-matrix.json`):
  - **29 Capabilities:** `17 FUNCTIONAL` (on specific scoped flows) · `9 PARTIAL` · `1 BROKEN` (`captions`) · `2 UNIMPLEMENTED` (`generated_image`, `generated_raw`) · **`0 PRO-READY`** · **`0 PRODUCTION-READY`**.
  - **13 Combinations:** `2 FUNCTIONAL` (`mask_track_text_behind`, `color_composite_overlays`) · `11 PARTIAL`.
  - **17 Preview-vs-Render Parity Checks:** `1 FUNCTIONAL` (`completed_output_seek`) · `15 PARTIAL` · `1 BROKEN` (`three_d_audio_envelope`).
  - **Additional unimplemented / proxy-only entries in `docs/product/studio/`:** `studio.stabilization` (`UNIMPLEMENTED`), `studio.compositing.depth_estimation` (`UNIMPLEMENTED`), and five Creator Workbench tools (`studio.creator.text_behind_subject`, `background_replacement`, `screen_replacement`, `object_cleanup`, `tracking`) rated **`PROXY_ONLY`**.
- **Critical build difference between `origin/main` (`d3952ba6`) and this IDE worktree (`feat/pro-studio-engine-20261114` at `81e4b791` + uncommitted changes):**
  - **`origin/main` (`d3952ba6`, live/deployed path)** includes PRs `#531–#542`: `Full`/`Half`/`Quarter`/`Auto` preview resolution selector (`1bd4b89c`), shared Inter text outline precision (`78a7683a` / `20636708`), atomic title positioning (`d2ff015c`), GPU worker recovery/routing (`4e274e63` / `ce76f219`), and welcome showcase (`d3952ba6`). **However, `origin/main` still exposes four unwired Export dropdowns/inputs (`videoBitrate`, `targetFileSizeMb`, `audioCodec`, `colorSpace`)** in `ViralClipStudio.js` (`30528–30609`) that the worker ignores.
  - **`feat/pro-studio-engine-20261114` (`81e4b791` + uncommitted working tree)** removes those four unwired Export inputs behind a Rec.709/AAC disclosure note (`ViralClipStudio.js:30558–30566`), passes `audio_bitrate` into `render_audio_remix`, adds continuous-source karaoke split highlighting verified in [studio-pro-editor-proof-20261119/README.md](../reports/studio-pro-editor-proof-20261119/README.md) (*"Still Trying"*: 8.5s 720×1280 24fps H.264/AAC export, continuous caption cue across a 4.500s split, and fresh-browser backup restore), and adds 8-track Director/3D/selective-grade changes (`StudioDirectorCreativePanel.js`, `studioDirectorComposition.js`, `studioDirector3DPlan.js`, `studioDirector3DPlanner.js`). **However, this worktree does not yet include `origin/main` PRs `#531–#542`** (it lacks the `Full/Half/Quarter/Auto` preview selector in `studioPreviewBudget.js`, lacks `flags=accurate_rnd+full_chroma_int` on worker BT.709 scaling, and has zero live/demo verification on the uncommitted Director archetypes).
  - **Local follow-up:** Space now controls playback, and Match first source completed two normal signed-in exports at 24000/1001 fps. The candidate removes the unwired stabilization, proxy and batch-hook controls. These fixes still need integration into the serving release. [Native proof](../reports/studio-source-rate-20261119/README.md)

---

## Part I — What Pro Editors Will Ask About & Challenge During a Live Demo

These are the immediate credibility risks and "try doing this right now" moments during an 8-minute or 30-minute walkthrough.

### 1. Visible UI Controls That Do Nothing or Fail Parity on Export

| Control / Feature in UI | Where in Code | What Happens Today if an Editor Clicks It Live |
| --- | --- | --- |
| **Video stabilization** | `ViralClipStudio.js` and `viralRenderPayload.js` | Studio stabilization remains unimplemented. The current candidate removes the ineffective controls and identifies unavailable settings in older projects. The inspected main snapshot retains the controls. |
| **A/B hook pack / Split export** | `ViralClipStudio.js` and `viralRenderPayload.js` | Export delivers the selected hook in one movie. The current candidate removes the ineffective batch controls and explains saved hook drafts. Batch delivery remains open. |
| **Export bitrate, target MB, Opus/PCM, sRGB/P3/HDR10** (live on `origin/main`) | `origin/main:ViralClipStudio.js:30528–30609`; `main_media_server.py:6510–6575` | On `origin/main`, editors can select explicit Mbps, target file size MB, Opus/PCM audio, or Display P3 / HDR10, **but `resolve_viral_export_profile` ignores them** and outputs CRF H.264/H.265 + AAC + Rec.709 (or untagged RGB/YUV for non-Rec.709). *(Hidden with a disclosure note in the uncommitted worktree.)* |
| **Optimized media / proxies** | `ViralClipStudio.js` and main commit `1bd4b89c` | Both candidates omit the old proxy drawer. Editorial proxy generation, attachment and reconform remain open. |
| **Creator Workbench FX** (Cutout, Background Replace, Text Behind, Screen Replace, Cleanup, Clone, Tracking, Stabilized Preview) | `StudioCreatorWorkbench.js:244–260, 388–399`; `docs/product/studio/subject-effects.md` | Explicit CSS/HTML `PROXY_ONLY` placement previews (`"FOUR-CORNER PREVIEW PROXY"`, `"PLACEMENT STUDY · NO OBJECT REMOVED"`, `"MANUAL POSITION · NO TRACKING DATA"`). **None of these produce a finished render**; real subject VFX requires the separate bounded `StudioSubjectVfxPanel` flow. |
| **3D Panel disabled & non-parity controls** | `threeD/Studio3DPanel.js:12–16, 126`; `threeD/studio3DParity.js:61–103` | 9 controls are disabled (`fontFamily`, `fontWeight`, scene `easing`, `audioReactiveIntensity`, `lightDirection`, `shadows`, `reflections`, `background`, `quality`). **Audio-reactive 3D is `BROKEN`**: Three.js scales live in browser while Blender receives zero audio envelope. Note also UI/code drift: `blender_scene.py:346–362` actually reads `lightDirection`, `shadows`, and `reflections`, even though `Studio3DPanel.js` disables them. |
| **Node Flow unwired operators & invalid UI port wiring** | `studioNodeFlow.js:405–428, 560–580, 1097, 1505, 1618`; `StudioNodeFlowPanel.js:143–158, 3330–3410` | `chromaKey.despillTint`, `opticalFx.chromaticSplit`, `opticalFx.displacementScale`, `prismSplit`, and `texturePreset` have **no renderer consumers**; `macroGroup.publishedControls.{macroGlowBoost, macroBlendMode}` are omitted from UI; and the graph UI lets users connect `SubjectMatte:` to `Mask`, which `compileStudioNodeMask` and Python `validate_node_mask` reject. |
| **Pro timing Reverse / Freeze / Optical Flow** | `ViralClipStudio.js:26516–26577`; `main_media_server.py:32174–32212` | **No live browser preview** (`proTimingMode` reverse/freeze and `opticalFlowSlowMo` only run on export). Worse, in `main_media_server.py:32189`, reverse/freeze **silently falls back to forward `build_speed_filter_complex` if `len(requested_speed_segments) > 1`**, and `optical_flow` (`32202`) only triggers for a single `< 1.0` segment. |

---

### 2. "Will the exported movie look and sound identical to this monitor?" (Preview/Render Parity — `S02`)

Pro editors will pause on a frame with titles, B-roll, grades, masks, and sound cues, then compare preview vs. downloaded MP4. Remaining gaps:

1. **Scaled monitor typography mismatch (`966×544` failure):** Even on `origin/main` after the shared Inter outline fix passes 16/16 frames at native `1280×720`, **scaled `966×544` displays still fail `1/16` strict text-overlap checks** (`reports/studio-completion-20261118/README.md`). Live titles still render as DOM/CSS `.draggable-overlay` nodes (`--title-layout-width`, `--title-preview-scale` in `ViralClipStudio.js:15064–15070, 20654–20708`), not the Python worker rasterizer, and the historical minute-film remains `13/16` failed.
2. **Moving playback resolution, 30 fps cap & seek lag:**
   - `studioPreviewBudget.js` caps preview paint scheduling at **30 fps** (`Math.min(30, ...)`), even on 50/60 fps projects.
   - Under load, moving playback drops frames (`studioPreviewFrameDue`) and `auto` scales the preview canvas down to **25%**. On `HEAD`, there is no `Full detail` user lock (`studioPreviewScale` always scales down when `fullCost > 8`).
   - Moving playback skips the two-stage solo reframe scratch canvas used when paused (`ViralClipStudio.js:14759–14777`), creating soft/cropped edge differences between play and pause.
   - Multi-clip 3-slot double buffering (`sourceSequenceDoubleBuffer`, `8292–8294`) is **disabled during multi-cam (`speakerStackPreviewIsLive`) and `directorModeActive`**, causing visible stalls across cuts.
3. **Color scopes not reading the editor's grade or footage honestly:**
   - `StudioNodeFlowPanel.js:882–891` calls `computeLiveGradeScopes()` without `rgbaBytes` — so **Node Flow's waveform/parade/vectorscope measure a synthetic 48×27 color chart (`buildReferenceColorChartRgba`), not the video frame**. The current candidate labels it Reference chart scopes.
   - `VideoScopes.js:94, 112–130, 164` samples a **64×36** 8-bit downscale of `afterCanvasRef` every 180 ms, which **includes burned UI overlays, captions, rounded corners, and letterbox bars** rather than isolated footage.
   - `StudioSourceGradeViewer.js:27–30, 82` samples a 320px 8-bit `<canvas>` (excluding graphics) and passes `lumaBins: 12` (an ignored option name — `computeColorScopesFromRgba` reads `bins`, defaulting to `24`).
4. **Color pipeline preview-vs-export breaks:**
   - **Finish Rack Revitalizer dropped on export:** `StudioFinishRack.js` writes `dehaze`, `clarity`, `shadowRecovery`, `highlightRollOff`, `vibrance`, `skinToneProtect` to `finishFx`; `compileStudioFinishForRender` (`studioRenderCompiler.js:139–165`) copies them to `finishPlan.color`, **where `build_studio_finish_filter` (`main_media_server.py:30450–30455`) and `studio_precision_grade.py` ignore all six fields**. They only export if authored via `StudioNodeFlowPanel` (`advancedColor.revitalizer` → `color_cube`). Moreover, adjusting those sliders in `StudioFinishRack` without clicking a preset leaves `finishFx.precisionGrade === false`, so preview skips them too (`ViralClipStudio.js:7834`).
   - **HSL Qualifier double-applied with mismatched math:** `buildAdvancedColorCube` (`studioColorCube.js:189–193`) bakes `qualifier` into `color_cube`, AND `compileStudioFinishForRender` (`studioRenderCompiler.js:154–159`) emits a separate `hsl_qualifier` pass — so both browser and worker apply it **twice**, and Python's `write_hsl_qualifier_cube` (`studio_pro_render_engine.py:292–354`) omits `desaturateOutside`, `colorizeColor`, `colorizeStrength`, `exposureStops`, `temperature`, and cyan matte tint (`showMatte`).
   - **Power Window & Adjustment Layer omissions:** `build_power_window_filter` (`studio_pro_render_engine.py:357–400`) lacks `rectangle`/`linear` shapes and `temperature`; `studio_adjustment_grade.py:5–26` ignores `power_window` and `hsl_qualifier` on adjustment layers.
5. **Node isolated viewer & audio meter approximations:**
   - `StudioNodeSignalViewer.js:81, 89, 2141` strips `opticalFx`, `displacementWarp`, and `dofBlur` on isolated `MediaIn`/`Transform`/`CornerPin`/`ChromaKeyer`/`PolygonMask`, has no isolated branch for `GlowBlur`, and leaves `SubjectMatte` with `includedOverlayIds: []`.
   - Browser audio meters (`studioAudioDspEngine.js:13–84`, `audioRemixPreview.js:321–346`) use a 1-pole K-weighting approximation (sharing filter state across interleaved channels) and **raw sample peak** (`Math.abs(s)`), not 4× oversampled BS.1770 **dBTP true peak**; `audioRemix.speed` changes preview `playbackRate` **but is ignored by `render_audio_remix` on export**.

---

### 3. NLE Keyboard Ergonomics, Timecode & Viewport Constraints

If you hand the keyboard and mouse to a Premiere/Resolve/Avid editor with no coaching:

- **Spacebar Play/Pause is verified locally.** It uses the native monitor transport and preserves text entry and normal button activation. [Native proof](../reports/studio-source-rate-20261119/README.md)
- **Shuttle shortcuts.** `Shift+J` and `Shift+L` scan the preview in reverse and forward at up to 4×. `K` stops the scan. Unmodified `J` and `L` still make J-cut and L-cut audio edits. Conventional unmodified shuttle mappings and user remapping remain open.
- **Arrow-key collisions & zero focus management:** When an overlay is active, `ArrowLeft/Right/Up/Down` nudge its X/Y coordinates (`13739–13751`); in Hand tool they scroll the timeline (`1656–1663`). Frame stepping only triggers when `StudioPlaybackRange` or a timeline clip has DOM focus, and **neither `StudioProTimeline.js` nor `StudioSequenceClip.js` restores `.focus()` after splits, trims, or deletes**. No shortcut remapping exists.
- **Output SMPTE timecode.** The timeline shows output `HH:MM:SS:FF` and 29.97/59.94 drop-frame where applicable. Press `G` in the timeline to jump through the authored speed map. Embedded source start timecode and wider timecode-based media sync remain open.
- **Hard desktop gate:** `VideoEditor.js:35–43` blocks opening Studio unless `window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)")` matches — blocking narrow split-screen windows, tablets, and touch laptops.

---

### 4. Demo Infrastructure & Unverified Branch Work

- **GPU cold starts & `concurrency: 1` contention:** On `origin/main`, the private RTX PRO 6000 worker (`20 vCPU, 80 GiB`) is configured with `min-instances: 0`, `max-instances: 1`, `concurrency: 1` (`reports/media-worker-recovery-20261119/README.md`). Idle demos incur container/CUDA startup latency (`MEDIA_WORKER_HEALTH_TIMEOUT_MS = 60000` ms), and concurrent jobs either fall back to slow CPU (`>120s` estimate still routes to CPU if GPU is busy in `mediaWorkerRouting.js:111–116`) or reject pre-charge with `503 STUDIO_RENDER_WORKER_BUSY`. Furthermore, `selectMediaWorker` (`mediaWorkerRouting.js`) does not factor `threeDGraphics`, `subjectVfx`, or heavy Node effect kernels into its CPU vs. GPU cost floor.
- **Uncommitted Director code has zero live proof:** The new 5 brief templates (`viral_social_reel`, `noir_splash_artistic`, `holographic_ribbon_film`, `creator_split_50_50`, `hybrid_3d_film`), 3 choreography archetypes (`viral_hook_cutaway`, `noir_color_splash`, `editorial_poster_fusion`), `wantsSculptureOverlay`, and `81e4b791` omniscient 8-track showpiece in `feat/pro-studio-engine-20261114` have not yet passed a live/demo build export check (`docs/VIRAL-CLIP-STUDIO-PRO-EDITOR-READINESS.md:18, 25`).

---

## Part II — What Pro Editors Hit When Actually Using Studio on Real Jobs

Once past the first demo, editors test real client media, multi-camera shoots, transcript fixes, mix revisions, and finishing specs.

### 1. Media Ingest, Proxies, Relinking & Bins

- **No true editorial proxy workflow:** No proxy generation/attach/relink/conform pipeline (`origin/main` only scales preview canvas pixels).
- **Unqualified camera formats, VFR & long timelines:** No published verified codec/container matrix. Analysis/normalization helpers (`build_cfr_video_filter`, `materialize_video_input` in `main_media_server.py:1086–1099, 1283–1352`) transcode non-preserved inputs to fixed `30 fps` CFR; native VFR phone `.mov` clock drift, mixed-rate projects (`23.976` / `25` / `29.97` / `50` / `60` in one sequence), 10-bit camera originals (ProRes, XAVC, Canon/Sony Log), and long `10–60 min` timelines remain unqualified (`mediaFixtures` marked `PLANNED` in `studio-capability-matrix.json:216–290`). Accurate paused preview pictures are bounded to **90-second windows and 128 MiB sources** (`docs/product/studio/index.md:1449`).
- **Flat media bin & no local relink:** `projectMedia` (`ViralClipStudio.js:19231–19357`) offers only filename search (`mediaBinSearch`) and 12-item paging — **no bins/folders, tags, colour labels, metadata columns (fps/codec/resolution/timecode), or sorting**. Offline media (`status === "unavailable"`) only supports refreshing a Firebase signed URL (`refreshSourceUrlByPath`); **no interactive relink-file picker exists** if local media moves or is reopened on another machine.
- **Incomplete filmstrip thumbnails:** `TimelineSourceFilmstrip.js:10–16, 104, 132` runs **only on `V1` (`trackId === "video"`)** — B-roll (`V2`), graphic video layers, and secondary multicam angles have **no filmstrips**. Even on `V1`, it caps sampled frames at **24** across the whole timeline, caps `thumbnailCache` at **24 entries**, only decodes while paused, and permanently hides thumbnails on signature mismatch or single CORS/decode errors.

---

### 2. Timeline Topology, Repeat Source Occurrences, Groups & Motion

- **Gapless `V1` & missing track patching:** `offsets()` (`studioSequenceEdits.js:21–24`) packs `V1` edge-to-edge (no timeline gaps or free drag positioning). No `V1/A1` track targeting or source patching exists; `StudioSequenceClip` roll/slide modes apply only to `V1`, not `V2` B-roll, graphics, or audio tracks.
- **Trim, J/L & detached-audio roadblocks:**
  - `editStudioSequence` (`studioSequenceEdits.js:185–187`) and `studio_sequence_audio.py:56–58` clamp J/L audio cut overhangs to **`±3.0 seconds`**.
  - Once an unlinked edit detaches audio (`clip.audioDetached = true`), **`removeStudioProgrammeRanges` (`studioSequenceEdits.js:233–234`) refuses all marked cuts, transcript/filler cuts, silence removals, and clip deletions** until the user resets audio with Straight Cut.
  - `assertRippleLocks` (`studioSequenceEdits.js:92–100`) throws an error if any linked item sits on a locked track rather than rippling unlocked tracks around locked tracks.
  - Sequence replacement (`docs/product/studio/index.md:1727`) fails if speed ≠ 1, speed keys exist, or opening hook/silence removal are active.
- **Repeated-source occurrence ownership (`S03`):**
  - `studioOverlayBelongsToClip` (`studioOverlayBinding.js:4–9`) returns `true` for all `bRollMode` layers and layers without `clipId`; `soundEffects`, `voiceovers`, and `adjustmentLayers` live in global programme-timed arrays (`studioProjectDocument.js:274`, `studioSequenceEdits.js:33`). When the same source clip appears twice in `V1`, titles, music cues, B-roll, and grades do not bind cleanly to a specific occurrence (`occurrenceId`).
  - `mapCaptionSegmentsToTimeline` (`viralRenderPayload.js:180`) matches cues without `source_clip_id` onto **every** matching source occurrence.
- **Graphic group limits:** `editStudioGroupTiming` (`studioGroupTiming.js:38`) only supports `move`, `trim-start`, `trim-end` — **no group split (`C` razor is omitted on `row.kind === "group"` at `StudioProTimeline.js:1725`), no group duplicate**, and group trim only clips visibility/motion audio cues without stretching/retiming child layers or keyframes.
- **Fixed cross-stage layer ordering:** `studioLayerOrder.js` (`compositionOrder`) orders only `overlays`, `motionScenes`, and `threeDScenes` inside `worker_overlay` / `worker_motion` / `final_alpha` (`studioProjectDocument.js:235–236`). Editors cannot interleave `V1` footage, `adjustmentLayers`, `worker_caption`, and `threeDGraphics` arbitrarily across stages (e.g., placing a 2D overlay or caption behind an arbitrary 3D object or between two `V1` cuts without `text_behind_subject`).
- **Speed, ramps, anchor points & keyframe curve gaps:**
  - Speed ramps remain bounded to **0.5×–2.0×** and 240 segments. The current candidate delivers Match first source at 24000/1001 fps at constant 1× and 2×. The inspected main snapshot still has the unconditional Source parse failure. VFR and variable-rate segments require broader qualification. [Native proof](../reports/studio-source-rate-20261119/README.md)
  - Editable `Anchor X/Y` (`StudioAdvancedInspectors.js:224–272`) exists only for static `image`/`video` overlays — **not `text`, `main-video`, or `graphicGroups`** (`StudioGroupInspector.js:40`), and anchor points **cannot be keyframed**.
  - `finishKeyframes` compile as `linear` only (`studioRenderCompiler.js:176–177`); `planeCorner` keys allow only `linear`/`hold` (`StudioKeyframeCurveEditor.js:19, 73`); Bezier numeric sliders clamp Y to `0–1` despite `-2..2` schema overshoot; worker Bezier interpolation (`studio_motion.py:93–101`) approximates curves with **32 piecewise linear segments**; spatial motion paths (`±200%`) lack constant-speed arc-length parameterization and roving keyframes.

---

### 3. Captions, ASR, Diarization & Sidecars (`S05`)

- **Automatic transcription still rated `BROKEN`:** Real GPU/Faster-Whisper ASR still produces repeated/hallucinated tokens on representative multilingual/noisy audio; proper names, overlapping speakers, code-switched lines, and pauses require manual review/fixing (`test/e2e/studio-capability-matrix.json:1039–1045`). Language selection is a hint rather than verified language detection, and automatic English translation is unavailable for explicit South African language choices (`docs/product/studio/index.md:418–420`).
- **Diarization disabled when language is specified:** `transcribe_captions_with_provider` (`main_media_server.py:2139–2158`) only uses OpenAI `gpt-4o-transcribe-diarize` when `OPENAI_API_KEY` is configured, translation is off, **and `source_language == "auto"`** (or explicit provider). Choosing `"en"`, `"xh"`, `"zu"`, `"za-mixed"`, etc. falls back to Faster-Whisper with `speaker="unknown"`.
- **Uniform word highlighting ignores speech pauses:** `viralRenderPayload.js:61–138` strips `words[]`, and both `studioCaptionPreviewStyle.js:51–65, 306–343` and `viral_render_contract.py:405–431` divide `(end - start) / len(words)` uniformly — causing karaoke/active-word highlights to drift through mid-cue pauses.
- **Caption deliverables.** The local caption and export panels now download SRT/VTT from the current trimmed and retimed sequence. Approved final sidecar recovery is in a separate delivery candidate. ASS sidecars, combined clean and burned-in delivery, and broader caption timing and suppression coverage remain open.

---

### 4. Audio Mixing, Mastering, Voiceover & Stem Handoff

- **No stereo panning or stem exports:** Zero per-track or per-clip pan controls (`StereoPannerNode` / FFmpeg pan), and **zero stem export** (no isolated Dialogue / Music / Voiceover / SFX WAV/AIFF tracks with matching head/tail sync for an external mixer).
- **Master bus misses loudness normalization & preset conflicts:** `build_dialogue_filter` (`studio_audio.py:50–77`) runs single-pass `loudnorm` **only on `originalAudio`**, not on the combined final `[a_mix]` bus (`main_media_server.py:33759–33763`) where music, voiceover, B-roll, and SFX sum. In `StudioAdvancedInspectors.js:968–972`, repair presets set `podcast: -14 LUFS` and `broadcast: -13 LUFS / -0.8 dBTP`, contradicting `AUDIO_MASTER_PRESETS` (`-16` / `-23 LUFS`, `-1.0 dBTP`).
- **`Voice isolation` is `PROXY_ONLY`:** `StudioAdvancedInspectors.js:1020–1030` advertises *"Reduce room, music bleed and competing noise"*, but `docs/MODEL-CAPABILITY-FEATURE-AUDIT-V1.md:40` confirms it only applies stronger `afftdn` + EQ filtering — **no neural vocal/music/noise separation**.
- **Ducking, J/L & Remix limitations:**
  - B-roll ducking (`main_media_server.py:33512–33523`) applies abrupt step gain (`enable='gte*lt'`) without attack/release envelopes; music sidechain ignores B-roll audio.
  - Overlapping J/L/detached audio slices mix via `adelay` + `amix` without edge crossfades (`studio_sequence_audio.py:20–34`).
  - `audioRemix` `target="voice"` skips `voiceovers` and skips/fails if `originalAudio` is muted (`main_media_server.py:33524–33533, 33904`); `target="master"` runs as a post-pass that **double-encodes AAC** and hardcodes `loudnorm=I=-16:TP=-1.5` (`33889–33903`).
- **Voiceover recorder limitations:** `toggleVoiceoverRecording` (`ViralClipStudio.js:11043–11110`) lacks mic input selection, headphone input monitoring, count-in/punch-in, input clipping meters, and decoded sample duration (`Date.now()` estimate); browser WebRTC noise/echo cancellation isn't explicitly disabled; un-uploaded local `Blob` takes fail export if lost or exceed the 20 MB backup limit (`studioVoiceover.js:89–100`).

---

### 5. Multicam & Reframing on Real Shoots

- **No waveform or SMPTE timecode auto-sync inside Studio:** `studioAngleGroups.js:8–73` and `ViralClipStudio.js:23829–23874` rely exclusively on manual non-negative `offsetSeconds` and a manual confirmation checkbox (`"Angles share the same source timecode"`). Automated waveform sync exists only in the separate `MultiCamCombiner.js` tool (which itself has browser file-size/duration caps). No sub-frame audio sample offset or long-take clock-drift compensation exists.
- **No external master recorder or per-angle audio switching in Studio:** Angle `<SafeVideo>` elements (`ViralClipStudio.js:20028–20081`) are hardcoded `muted`, `studioAngleGroups.js` admits only video assets (not external WAV recorder tracks), and `build_studio_multicam_command` (`main_media_server.py:8118–8128`) copies audio solely from `programme_path`.
- **Live multicam sync jitter & flat reframe track:** Angle sync (`11343–11386`) polls every `120 ms` and seeks on `> 0.14s` drift; `reframeKeyframes` are programme-timed rather than occurrence-scoped, and the command-kernel `reframe` contract requires forward `1×` rate and unchanged multi-clip zoom (`studioCapabilities.js:189–190`).

---

### 6. Colour, Typography, Vector Graphics, 3D, Subject VFX & AI Director

- **Colour pipeline (8-bit SDR only):** Browser canvas/WebGL2 and worker filters (`rgb24` / `yuv420p`) are strictly 8-bit SDR BT.709. No 10-bit/12-bit pipeline, Display P3, HLG, or HDR10 PQ delivery exists. `CAMERA_COLOR_PROFILES` (`Apple Log`, `Sony S-Log3`, `DJI D-Log`, `Canon C-Log`, `HLG` in `studioColorScience.js`) transform 8-bit decoded pixels and overwrite `advancedColor.lut` — **so a Camera Input CST cannot be stacked with a creative 3D `.cube` LUT**.
- **Brand kit & Preset Exchange gaps (`studioPresetExchange.js:6–84`):** Cannot save a reusable multi-cut client brand kit (custom fonts + logo + colours + caption style + mix). Even Look/Audio presets drop `.cube` `lutData` bytes, Revitalizer parameters, `sharpness`, `audioRemix`, `captionStyle`, `adjustmentLayers`, `finishKeyframes`, and `mainFrame`, and `StudioNodeFlowPanel` (`4495–4536`) drops `audioRestoration` on export/import and swallows parse errors silently.
- **Typography & vector artwork constraints (`docs/product/studio/index.md:466–484, 2187–2335`):**
  - Bundled `Inter` weights `{400, 600, 800, 900}` only (**no custom font uploads**; weight `700` rejected; text choreography capped at `180` Latin characters / `12` rows with no RTL, complex scripts, combining marks, or emoji).
  - Graphics packages rasterize uploaded SVGs into static PNGs (max `512 KiB` SVG, `2048 px`); editable vector artwork caps at `8` contours / `64` pts / `256` pts total with static geometry (**no contour morph keyframes, boolean union/subtraction, bitmap auto-tracing, or arbitrary SVG/PDF path import**); outlined Logo Workshop letters lose live text-to-outline editability.
- **3D & Blender limits (`studioCapabilities.js:407–500`, `threeD/studio3DParity.js`, `studio3DService.js`):**
  - Capped at **720p (`<= 921,600 px`), 30 fps, 10s/scene, 8 scenes/project, 24 objects, 256 keys**. No `.blend`/`.glb`/`.fbx`/`.obj` model import; no native 1080p/4K; Three.js `clearcoat`/`iridescence`/HDRI/bloom/floor-reflections differ from Blender; cuts/retimes across 3D scenes remain unqualified.
  - Remote/non-durable 3D jobs dispatch in an unawaited Node background IIFE (`studio3DService.js:83–116`), leaving global `concurrency: 1` leases stuck for 20–35 min on API restart, with a hard `4/user` and `20/global` daily quota.
- **Subject VFX, tracking & missing AI backends (`MODEL-CAPABILITY-FEATURE-AUDIT-V1.md`, `studioSubjectVfxContract.js`, `studio_vfx_plan.py`):**
  - Subject scenes capped at **`0.25–10s`** (requiring manual timeline splits at range edges) and gated to private mask cohorts (`STUDIO_SUBJECT_MASK_PREVIEW_ENABLED` / `403 STUDIO_SUBJECT_MASK_UNAVAILABLE`).
  - Point tracking (`TAPNext++`) returns **`503 MODEL_CAPABILITY_POINT_TRACKING_UNAVAILABLE`** (`src/modelRuntime/contract.js:111–112`) — only mask centroids exist; open-vocabulary detection (`Grounding DINO`), dense/metric depth, neural super-res/frame interpolation, neural voice isolation, and generative lip-sync are **`MISSING_BACKEND`** / unimplemented.
  - Any point correction detaches existing `preview`/`modelArtifactRef`/`trackingArtifactRef` (`studioSubjectCorrections.js:28–62`); `maskComponents` with `propagate: false` and `foreground_holdout`/`source_patches` are static fixed-camera coordinates, not frame-by-frame matte painting or reacquisition across cuts; `screen_replace` exists in `studio_vfx_plan.py` (static 4-corner quad) but is omitted from frontend `EFFECT_FIELDS`; ViTMatte image matting fails wispy hair, motion blur, and the 4-minute clean-edge gate; watermark cleanup (`python_media_worker/studio_watermark_cleanup.py:25–35`) has a bounded single-occurrence manual static-badge path using a locally installed LaMa model (`local_lama_masked`), while adaptive/tracked/multi-segment cleanup falls back to FFmpeg `delogo` rather than general generative video inpainting.
- **Generated media gating:** `generated_image` and `generated_raw` are `UNIMPLEMENTED` in normal Studio; `generated_video` (`Wan2.2 5B`, locked `1280×704`/`704×1280`) is gated behind founder/workstation/tester flags (`403` for general users) with a global concurrency-1 GPU lock, hardcoded `12/day` budget, and no unified credit billing (`studioBRollGenerationService.js`).
- **Director revision & perception gaps:**
  - `measureDirectorSources` (`studioDirectorComposition.js:616–749`) inspects only 3 RGB frames at `96×54` — no transcript semantics, audio beats, or face identity.
  - Creative Director plans (v2–v5) bypass `/api/studio/director/reviews` (v1 review only accepts `split_clip`/`trim_clip`/`reframe`): `"Discard plan"` stores no persistent rejection record, stale revisions throw instead of rebasing over manual edits, `finish_grade` overwrites `advancedColor` wholesale, and compiled graphics payloads hardcode `1280×720` (`studioDirectorComposition.js:1141`).

---

### 7. Delivery Specs, NLE Interchange, Team Review, Persistence & Billing

- **Restricted deliverable formats (`main_media_server.py:6489–6575, 33836`):**
  - Container/codecs: **MP4 + H.264/H.265 + AAC (`128/192/256/320k`) + 8-bit `yuv420p` Rec.709 SDR only**.
  - Missing specs: **no ProRes / DNxHR mezzanine, no alpha-channel final video (ProRes 4444 / WebM VP9 alpha), no Opus/PCM audio, no CBR / VBV maxrate / target-MB enforcement, no user export presets**, `h265` always falls back to CPU `libx265`, and intermediate passes (`cleanup`, `finish`, `speed`, `visualizer`) hardcode `libx264 -crf 19` and `160k`/`192k` AAC even on `master`/`320k` exports.
- **Desktop NLE interchange.** Local OTIO and CMX 3600 EDL exports now exist. Review the translation checklist for effects that need baking and media that needs relinking. Resolve import, portable relinking, FCPXML, Premiere XML, AAF and re-import remain open.
- **Fragile project portability (`studioProjectBackup.js`, `studioProjectBackupMedia.js`, `teamProjects.js`):**
  - `.autopromote.json` backups fail above **20 MB total JSON / ~15 MB per local Blob / 256 inline files**, reject duplicate project IDs (`ViralClipStudioPanel.js:128`), omit render receipts, cap versions at 12, and require Firebase `storagePath` re-authorization via `/api/media/studio-assets/resolve` (blocking offline/cross-account assistant handoff).
  - `teamProjects.js:inspectBackup` rejects any backup containing `*jobId`, `*artifactId`, `*artifactRef`, or `*cacheKey` (`409 project_asset_not_portable`), preventing Subject VFX / 3D project handoff.
- **No hosted client review links or team co-editing:**
  - `src/config/teamRollout.js:6–32` disables Team Collaboration on all hosted runtimes (`503 team_rollout_pending` — emulator/QA only).
  - Even when enabled locally: no external password/link client review portal (requires registered workspace `members`), comments (`teamWorkspace.js:308–326`) have **no frame number, timecode, or layer anchor**, sharing uses manual `.autopromote.json` 30-min checkouts (no live co-editing), and `owner` render credits cannot be delegated to team editors.
- **Browser-local unscoped storage & cross-device conflicts:**
  - `viralStudioProjectStore.js` persists projects in local IndexedDB `autopromote-viral-studio` with **no `ownerUid` scoping** (different logins in one browser share/overwrite the project store), and `localStorage` render receipts don't sync across devices.
  - Server `studioProjectRevisionService.js` only registers revisions during Director/capability flows and returns `409` on conflict with no interactive conflict-merge UI.
- **Credit pricing & revision cost friction:**
  - `POST /api/media/estimate` and `/process` (`src/mediaRoutes.js`, `src/config/subscriptionPlans.js`) charge flat `CREDIT_COSTS` (`render-clip: 5`, `process: 10`, `analyze: 8`, `transcribe: 3`, `clean-audio-sync: 18`) independent of clip length, 720p vs 4K, FPS, or GPU cost (`unifiedCredits` is sandbox/disabled in production), charging the full flat fee on every minor client-revision re-export. (`render-multicam` at `src/mediaRoutes.js:2429–2442` calculates dynamic cost from render tier and duration via `estimateMulticamRenderCredits`, distinct from the `150` catalog value.) Founding Tester accounts without `clipRender` entitlement receive `403 TESTER_FEATURE_NOT_INCLUDED`.

---

## Part III — Prioritized Closure Checklist

| Priority Tier | What to Close | Why Editors Care / Acceptance Signal |
| --- | --- | --- |
| **1 · Before Any Pro Demo** | 1. Reconcile `origin/main` (`#531–#542`) with `feat/pro-studio-engine-20261114` and test uncommitted Director archetypes.<br>2. Integrate the Source rate, keyboard and control corrections into the serving candidate, then check remaining Node and 3D fields.<br>3. Fix `Finish Rack` Revitalizer export drop, `HSL Qualifier` double-apply, `Node Flow` chart-only scopes, `audioRemix.speed` export drop, and `966×544` scaled title overlap (`S02`). | Nothing visibly lies or crashes when an editor clicks a slider, scrubs a scaled monitor, or compares a cut + caption + B-roll + grade + audio cue against the downloaded MP4. |
| **2 · Single-Editor Real Client Work** | 1. Standard `J/K/L` continuous shuttle, `HH:MM:SS:FF` / DF timecode + jump-to-timecode, post-edit `.focus()` management.<br>2. Per-occurrence (`occurrenceId`) binding for titles/B-roll/audio/reframe (`S03`), `>3s` J/L cuts, non-blocking detached-audio/track-lock ripples, group split/duplicate.<br>3. Editor-facing **SRT/VTT sidecar export** (post-edit timeline clocks), real word-aligned caption timing (`words[]`), clean+captioned dual output, and reliable ASR/diarization (`S05`).<br>4. True combined-bus BS.1770 LUFS/dBTP metering & normalization, panning, smooth ducking, and **stems export** (Dialogue/Music/VO/SFX).<br>5. Real proxy/relink workflow, bins/metadata, `V2` filmstrips, waveform/timecode multicam sync + external WAV master, and verified VFR/MOV/10-bit ingest matrix (`S10`). | An editor can bring unfamiliar phone/camera/recorder footage, tighten pacing, fix transcripts, survive a client revision unassisted, and deliver broadcast/social audio + clean/captioned/sidecar files without re-paying full render fees per typo. |
| **3 · Finishing, Team & Agency Scale** | 1. **NLE interchange export** (OTIO / FCPXML / Premiere XML / EDL / AAF) + translation loss report.<br>2. **Mezzanine & spec exports** (ProRes/DNxHR, alpha output, explicit bitrate/VBV/target-MB caps, 10-bit/P3/HDR10, GPU H.265).<br>3. **Hosted client review & team workspace** (`ownerUid`-scoped cloud projects, frame-accurate external review links + approval, conflict merge, portable VFX/3D backups, delegated team credits).<br>4. Real **stabilization**, **3D audio-reactive final parity**, durable 3D/GPU job reconciliation, and **general-user generated media/subject VFX** entitlements. | An assistant editor finishes in Premiere/Resolve, a mixer takes synced stems, a client leaves frame-pinned approval notes, and agency jobs run reliably on real accounts and budgets. |


---

## Verified Implementation Progress (Sprint 1–6 Update · 20 November 2026)

All buildable software, UI, FFmpeg worker, audio DSP, color pipeline, timeline engine, and portability gaps identified above were implemented and verified on `feat/pro-studio-engine-20261114`:

- **Audio Mixing, Stems & Compliance (Sprint 1):** Equal-power stereo panning (`L100..R100`) per bus, click-free linear-ramp `volume` ducking (`build_smooth_ducking_filter`), combined-bus master `loudnorm` + `alimiter`, ITU-R BS.1770-4 K-weighting + 4x oversampled true peak meters (`studioAudioDspEngine.js`), aligned multi-bus 24-bit FFmpeg WAV stem export (`studio_audio_stems.py`), and browser-side sample-aligned 16-bit WAV stem `.zip` export (`studioAudioStems.js`).
- **Captions, Diarization & Dual Masters (Sprint 2):** Pause-aligned word-level `words[]` / `wordTimings[]` preserved across `studioProjectDocument.js`, `ViralClipStudio.js`, `viralRenderPayload.js`, `studioCaptionPreviewStyle.js`, `viral_render_contract.py`, and ASS karaoke `{\\k...}` pause waits (`studio_caption_renderer.py`, `main_media_server.py`); post-edit `.srt`/`.vtt` sidecar export (`studioCaptionSidecar.js`); OpenAI `gpt-4o-transcribe-diarize` language-hint routing for non-`auto` ISO languages while retaining local `swivuriso` routing for regional South African choices; one-click **Export Captioned + Clean Master Pair** (`Dual Clean` + captioned master).
- **Color, Scopes, Power Windows & CST Stacking (Sprint 3):** `StudioNodeFlowPanel.js` live scopes sample real decoded HTML5 video pixels (`Live footage scopes` falling back to `Reference chart scopes` only when footage is unavailable or cross-origin tainted); `build_power_window_filter` supports `ellipse`, `rectangle`, `linear`, `temperature` warmth, and unique stream prefixes; `studio_adjustment_grade.py` & `main_media_server.py` apply `power_window` + `hsl_qualifier` cubes without double-application; `buildAdvancedColorCube` stacks Camera Input CST before creative `.cube` LUTs; `studioPresetExchange.js` preserves `sharpness`, Revitalizer fields, `lutData`, `mainFrame`, `captionStyle`, and `audioRemix`.
- **Occurrence Binding, Detached Audio, Filmstrips & Multicam Waveform Sync (Sprint 4):** `studioOverlayBinding.js`, `studioEditDecisions.js`, and `studioProjectDocument.js` support `occurrenceId` / `clipOccurrenceId` layer isolation; `removeStudioProgrammeRanges` trims/shifts clips with `audioDetached` instead of blocking edits; `BrollClip` on `V2` renders `TimelineSourceFilmstrip`; `studioAngleGroups.js` + `ViralClipStudio.js` provide coarse-to-fine waveform cross-correlation auto-sync (`computeWaveformSyncOffsetSeconds`, `alignStudioAngleGroupOffsets`).
- **Pro Delivery Specs, Reverse/Freeze Speed & Workbench Controls (Sprint 5):** `resolve_viral_export_profile` and `build_viral_export_encode_args` honor explicit `videoBitrate`, `targetFileSizeMb` rate sizing, `prores` (ProRes 422 HQ `.mov` + `pcm_s16le`), `rec709`/`rec2020`, and multi-segment reverse/freeze concat (`split`/`asplit`); `studioPreviewBudget.js` supports up to 60 fps preview; `StudioNodeFlowPanel.js` / `studioNodeFlow.js` publish `macroGlowBoost`/`macroBlendMode` and reject unsupported `SubjectMatte -> Mask` drops with an actionable warning.
- **Portability & Team Handoff (Sprint 6):** `viralStudioProjectStore.js` scopes IndexedDB records per signed-in `ownerUid`; `studioProjectBackupMedia.js` supports `allowOfflineRelinkManifest` for `>20 MB` sources paired with a Media Bin **Relink offline file…** picker in `ViralClipStudio.js`; `teamWorkspace.js` / `teamWorkspaceRoutes.js` accept frame-anchored (`timecode`, `frameNumber`, `fps`) review comments; `VideoEditor.js` lowers viewport lock to `min-width: 720px` with an explicit `"Open anyway"` compact bypass.

### Remaining External / Infrastructure Dependencies (Honest Status)
- **Neural GPU Weights / External Services:** Full neural inference paths requiring unbundled model weights or external API keys (`TAPNext++`, `Grounding DINO`, `Wan2.2 5B`, local Whisper/Swivuriso weights) remain gated when weights are absent in the local environment.
- **Hosted Team Rollout:** `src/config/teamRollout.js` remains intentionally gated in production until Firestore rules/index deployment and Storage authority rollout are completed outside code.
- **Live Cloud Run E2E Render:** End-to-end live Cloud Run job execution and hosted owner-account re-qualification require deployed staging/production worker credentials.
