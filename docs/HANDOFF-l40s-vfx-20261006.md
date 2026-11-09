# AutoPromote L40S/VFX handoff — 6 October 2026

Read this before working. This file transfers an active, authorized task to a new chat; it is not a completion report. Verify current process/log state instead of restarting successful work.

## Continuation update near the original cutoff

The older process notes below are historical. The continuation completed the
Wan downloads, actual export timing repair, offline SAM2 source-bound tracking
with shot resets, typed subject-aware VFX, preview/final pixel parity, actual
CPU fallbacks, official Blender OptiX rendering and GPU denoising, compact Studio
verification and the welcome backdrop load-race repair. Full receipts, limits
and exact code paths are in `reports/vfx-l40s-20261006/README.md`.

The criticized screen/callout composition was replaced by a local 13-second
1920×1080 review cut: `frontend/public/landing/autopromote-vfx-review.mp4`.
The 36-second product tour is preserved. The revised cut has 390 frames, seven
verified browser seeks, an original music bed and a refined OptiX-rendered close.
Blender's default CPU OIDN denoiser was a real bottleneck: the same 90-frame
24-sample close took 401.07 seconds; explicit OptiX denoising took 26.52 seconds.

An actual browser agent is now runnable via `scripts/run-browser-agent.js`.
It uses an offline pinned Qwen3-VL-8B NVIDIA planner by default, semantic and
visual observations, durable memory, bounded recovery, specific verification,
duplicate-submit protection and evidence. Final portable runtime qualification:
five verified actions, one real submission, six observations; actual welcome
demo open/close also passed. See `docs/browser-agent.md`. No CAPTCHA bypass,
stealth, identity spoofing or fingerprint changes were added.

Final remote images: `autopromote-portable-vfx:20261006-final`,
`autopromote-browser-vision:20261006-portable`,
`autopromote-studio-3d:20261006-final`, `autopromote-media-gpu:20261006-final`.
Original work folders below remain. A complete 208-file model archive is also
at `/data/autopromote-l40s-20261006/models` (69,320,267,095 bytes; matching
relative files/sizes); original caches are retained.

Director/server integration, production hair/edge matting, automatic planar
tracking, authenticated browser workflows and actual RTX PRO 6000 qualification
remain outstanding. The new commands are internal renderer interfaces, not
new production Director operations. Existing split/trim and caption review gates
remain. Google was untouched, no new instance was created, and HEAD remains
`7f7530ad746050c094bfc78d0921190da98d2098`; all prior staged/uncommitted work is preserved.

**Lifecycle complete:** the stop command completed at 20:01:56 UTC / 22:01:56
SAST, before the original cutoff. Brev subsequently confirmed **STOPPED** at the
20:03:51 UTC verification. Storage/model archives were retained. Do not resume
GPU jobs without a newly authorized window. No GPU jobs were launched after
the original cutoff.

## Objective and constraints

The user authorized a full three-hour window on the **existing NVIDIA/Brev L40S**, prioritizing real blockers and fixes over reports or benchmarks. Window: **17:02:25–20:02:25 UTC on 2026-10-06**, ending **22:02:25 SAST**. Handoff prepared around **18:26 UTC**, leaving about 96 minutes. Do not reset the clock in the new chat.

Use **NVIDIA only; leave Google untouched**. No new machines, production deployments, production API requests, order/trading changes, Cam Combiner changes, commits or pushes. Preserve CPU fallbacks. Make fixes portable for a later Google RTX PRO 6000 test, without claiming that hardware has been tested. No cloud credentials or `.env` files have been uploaded to NVIDIA.

User's latest engineering request:

> Push VFX/After Effects-style capabilities hard: subject isolation/rotoscoping, tracking, masks, text behind subject, depth/parallax, motion graphics, 3D titles/objects, particles, glow/light, screen replacement, motion blur, speed ramps, tracked callouts, typography, cinematic compositing and Blender/OptiX where architecture supports them. Fix blockers, rerun failing paths, make reusable by AI Director rather than adding a complicated AE UI. Effects must remain editable, deterministic, renderable from structured commands; preview/final must agree.

Also: cinematic welcome page with actual videos and edited product tours (Uploads/Studio/Schedule/Analytics), distinct AutoPromote style, compact Studio controls. User strongly dislikes synthetic test-pattern screenshots presented as product proof. Use actual podcast or finished films for visual review. Never claim CSS/ThreeJS/generative motion is an authored After Effects `.aep` export.

At the window's end report verified failures/fixes, remaining blockers, and what is ready for RTX testing. Existing GPU costs about $1.79/hour; retain it through authorized window, then handle lifecycle according to existing user authorization. Original qualification brief wanted stop after qualification; subsequent explicit full-window authorization overrode stopping mid-work. Do not destroy instance or storage.

No subagents: current developer instructions disallow spawning unless user or applicable instructions explicitly request delegation. Meaningful commentary at least every 60 seconds while working.

## Exact workspace

- Worktree: `/home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004` (spelling **AutoPromte**).
- Branch: `agent/director-analysis-staging-browser-v1`.
- HEAD: `7f7530ad746050c094bfc78d0921190da98d2098`, unchanged throughout work.
- Default environment cwd may be `/home/tibule12/Projects/SolTrade-Bot`; explicitly set AutoPromote workdir.
- Many homepage/tour changes were already uncommitted/staged before GPU work; preserve all. Do not reset/clean/stash indiscriminately.
- No applicable AGENTS.md was found. No skills apply to the current repo work.
- Local tools: Node 24.14, Python 3, FFmpeg, Pillow, Playwright.
- Node dependencies for scripts: `NODE_PATH=/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules`.
- Local root disk: **233 GB total, 209 GB used, 13 GB available (95%)** at handoff. Model downloads must remain remote. Chat compaction is context exhaustion, separate from filesystem space. No disk cleanup is currently authorized for unrelated projects.

## GPU access and current processes

Existing instance: `autopromote-l40s-staging`, Brev id `xgh6wcu74`, organization `tmtshwelo21-abb980-gp65`, Crusoe provider.

- NVIDIA **L40S, 46068 MiB**, driver **565.57.01**, driver CUDA compatibility 12.7.
- 8 vCPU, ~144 GiB RAM; Ubuntu 22.04.5 host; Docker 27.3.1.
- Root ~124 GB, about 60 GB available before final new assets/images; `/data` separate. Recheck current disk before large pulls.
- `/home/tibule12/.local/bin/brev` v0.6.335 authenticated. No login is currently needed.
- SSH works: `ssh -T -o RequestTTY=no autopromote-l40s-staging '<command>'`.
- SCP works: `scp -o RequestTTY=no ... autopromote-l40s-staging:<path>`.
- `brev copy` hit readiness loops; prefer SCP. `brev exec` works, without `--host`.
- Keep model inference/render containers `--network none`; network allowed for official dependency/model preparation. No `.env`, Google service account, Firebase keys or production auth supplied.

Remote work folders:

1. `/tmp/autopromote-studio-l40s-20261006` — generation, actual Studio worker proof, model cache, source media.
2. `/tmp/autopromote-studio-3d-l40s-20261006` — Blender code/device probe and actual local 3D renders.
3. `/tmp/autopromote-l40s-film-20261006` — authored desktop/portrait product tour film.

At handoff `docker ps` listed **`autopromote-wan-film-20261006`**, up ~25 minutes: third shot finished all 50 denoise steps and saved latents, currently decoding/encoding. Do not duplicate this batch. Log: `/tmp/autopromote-studio-l40s-20261006/wan-generation-decoder-fixed.log`. Old failures retained in other generation logs.

A GPU utilization sampler runs until approximately **18:41 UTC**, writing `wan-gpu-samples.csv` in that same remote directory (`timeout 1800 nvidia-smi ... -l 1`). Collect it later.

Prior chat unified exec sessions (may not be accessible from a new chat; use Docker/logs/ps instead): Wan batch `35060`; sampler `65246`; Studio fixture server `47367`. Studio export and Blender probe sessions completed. No new jobs have been launched during the handoff.

## Local preview URLs

- Welcome CRA hot reload: **http://127.0.0.1:3095** (PID 27290 at earlier check). Keep running.
- Studio real podcast fixture: **http://127.0.0.1:5007/?fixture=podcast**. Actual production component, local no-credentials fixture only.
- Film: **http://127.0.0.1:3095/landing/product-tour-l40s.mp4**.

Studio server compiles webpack at startup. Restart/recompile after Studio code/CSS changes when needed, without killing unrelated node processes:

```sh
NODE_PATH=/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules \
STUDIO_INTERACTION_PORT=5007 \
STUDIO_INTERACTION_FOLDER=reports/studio-l40s-hardening-20261006/interaction \
STUDIO_PODCAST_SOURCE=reports/studio-l40s-hardening-20261006/podcast-source-45s.mp4 \
STUDIO_GPU_CAPTION_ARTIFACT=reports/studio-l40s-hardening-20261006/gpu-output/caption-quality.json \
node scripts/run-studio-interaction-preview.js
```

Synthetic fixtures remain useful for internal regression but do not present their screenshots to the user. Browser fixture blocks external network. Its optional localhost E2E token has no production capability.

## Completed GPU qualification and authored film

### Initial GPU qualification

`reports/l40s-qualification-20261006/README.md`: 27/27 checks, real NVDEC/NVENC, independently GPU-decoded 48 frames, zero errors. Same two-second fixture as preserved historical Google receipt. No new Google calls. Protected hashes unchanged at that gate. Do not repeat benchmarks instead of fixes.

### Authored welcome/product tour film

`reports/public-l40s-film-20261006/README.md`:

- Completed **36 s 1920×1080 desktop** and separately composed **24 s 1080×1920 portrait**.
- Actual sample-workspace recordings of Uploads, Studio, Schedule, Analytics; licensed moving Mixkit creator opening; kinetic typography/diagonal transitions; original synthesized pulse soundtrack.
- Removed captured Analytics loading interval; corrected portrait labels and Studio timeline/preview crop.
- GPU decoding/encoding for eight chapters, editorial filters on CPU. Honest authored compositing, not an AE source export or generative film.
- Script: `scripts/render-public-l40s-film.py`; image `autopromote-l40s-media:20261006` (Ubuntu 24.04 / FFmpeg 6.1.1).
- Assets in `frontend/public/landing/product-tour-l40s*`: desktop and vertical MP4s, WebP posters and VTT.
- `productTour.js` points to new L40S film; older assets retained.
- 11 browser checks passed: playback/chapter seeks/mobile/reduced motion/offscreen pause/modal release/retry/sign in.
- Existing 12 motion/product-tour Jest checks passed after fixing one stale expected Open Film filename. Log `reports/public-l40s-film-20261006/frontend-regressions.log`.

## Real GPU-generated motion: works after decoder repair

Script **`scripts/generate-autopromote-l40s-motion.py`**; current recipe **`reports/public-l40s-film-20261006/Dockerfile.wan`**.

Official Wan **`Wan-AI/Wan2.2-TI2V-5B-Diffusers`**, pinned revision `b8fff7315c768468a5333511427288870b2e9635`, Apache 2.0. ~34.2 GB cached **remote only** in `models/wan-ti2v-5b`.

Working runtime:

- Torch 2.7.1+cu126, **diffusers 0.36.0**, transformers 4.56.2, accelerate 1.10.1, ftfy 6.3.1.
- `autopromote-wan-cuda:20261006`, built from `autopromote-studio-cuda:20261006`.
- WanPipeline bfloat16, VAE float32, model CPU offload, tiled VAE decode.
- 1280×704, 121 frames at 24 fps, 50 inference steps, guidance 5, seeds 20261006/7/8.
- ~18–19 GB VRAM, denoise ~8.85 s/step. Real model inference on GPU.

Three shots:

1. **violet-ribbon** complete, 518.15 s including decode/encode, ~919 KB. Contact sheet inspected: restrained violet glass ribbon/arch on dark background, negative space left, no text/people/obvious corruption.
2. **creative-lens** complete remotely; **not downloaded or visually approved yet**.
3. **story-frames** reached 50/50 and saved latent checkpoint at handoff; **decode/encode pending**.

Files/receipts under remote `generated/`. Status is `GENERATED_PENDING_VISUAL_REVIEW`, do not relabel automatically. Latents saved (~20 MB each) before decode to avoid rerunning inference for decoder failures.

First shot downloaded under local `reports/public-l40s-film-20261006/generated/` and installed as `frontend/public/landing/autopromote-violet-ribbon.mp4` plus `.webp`. MP4s may be gitignored; retain local file, do not blindly add binaries.

Fixed real blockers:

1. Missing `ftfy` caused NameError: pinned/installed.
2. Diffusers **0.35.1** Wan 5B tiled VAE failed temporal tensor 2 vs 4 **after 50 steps**. Upgraded to **0.36.0** with corrected first-chunk/unpatchify behavior. Added `--decoder-check`, actual L40S decode `(1,48,2,44,80) -> (1,3,5,704,1280)`, finite, PASS 2.70 s; full first/second shots subsequently completed.

Portability still pending: generator currently checks literal L40S; parameterize `--expected-gpu` with safe L40S default. Torch CUDA **12.8 or newer** needed for Blackwell RTX PRO 6000; cu126 L40S proof does not establish Blackwell compatibility. Parameterize GPU base/Torch wheel index and provide later cu128 recipe, without executing Google.

## Welcome backdrop integration — needs browser check

New `frontend/src/components/landing/BrandMotionBackdrop.js`, installed violet ribbon poster/video; decorative original generation, not AE export.

- IntersectionObserver offscreen pause, document visibility pause, reduced-motion poster-only, failed-video poster fallback, source cleanup on unmount.
- Shared pause state with `HeroSection.js` / `MotionEditingScene.js`.
- Backdrop stays paused until Three scene available, respects global Hero pause/replay.
- Observer-unavailable fallback retains visibility listener.
- Source cleanup only on unmount/reduced/failure, not every pause (avoids React src reapply bug).
- `LandingCompositing.css`: full hero background, black left gradient/vertical fade, lower mobile opacity.

**Pending** actual browser lifecycle/layout check after new background integration: pause/resume, reduced motion, offscreen, source cleanup, no 404. Existing film lifecycle checks are not proof of this new component. Avoid adding tests that merely mirror implementation.

## Studio compact controls

`frontend/src/components/StudioControls.css`, imported by `ViralClipStudio.js`:

- Desktop controls 28 px / 11 px labels, header 46 px; Undo/Redo reduced 43→28 px.
- Rail 92→72 px (64 clipped labels; widened to 72), buttons 61→42 px, 17 px icons, 10 px labels.
- Inspector 320 px, media pane 210 px; aspect tiles 58→42 px.
- Touch controls 36 px / 12 px; mode labels corrected to 11 px.
- Full-name native tooltips in `ViralStudioChrome.js` / aspect choices.

17/17 interaction checks passed **before final 72 px/tooltips tweak**. Run one final meaningful layout/interaction gate if time; don't spend window endlessly repeating.

## Actual browser edit → actual GPU worker export: PASS

`test/e2e/playwright/run-studio-l40s-podcast.js` uses actual production Studio/buildViralRenderData with real **46-second TMT podcast**, selected **16.08–36.08** (20 s).

4 checks PASS at ~18:00 UTC:

- Pointer scrub output 3 s -> source 19.08 s, picture correct.
- Pointer Split produces two sequence clips.
- Select 16:9; review-copy export through actual button.
- Captures real worker request with editable captions, sequence, framing, 20-second duration, review-required flag.
- No external requests or page errors.

Receipts/screenshots/payloads: `reports/studio-l40s-hardening-20261006/podcast-browser/` (`receipt.json`, `browser-render-request.json`, `gpu-render-request.json`). GPU transport substitution only localhost 5007→8765, no business-logic rewrites. Initial headless metadata wait 15 s was too tight for multiple high-bitrate buffers; 45 s wait plus diagnostics made actual path pass.

Fixture changes only in `scripts/run-studio-interaction-preview.js` and `test/e2e/playwright/studio-interaction-entry.jsx`. No production auth bypass. Podcast captions are real CUDA ASR **draft and require linguistic review**; first 16 s has repetition/low-confidence sections. Never claim published caption accuracy. Render is visibly DRAFT stamped.

### Worker fixes in main_media_server.py

1. `get_faster_whisper_device` probes actual CTranslate2 CUDA availability before optional Torch. Previously Torch absence selected CPU even with working CUDA backend.
2. Strict CUDA mode rethrows ValueError instead of silently falling back; normal soft CPU/int8 fallback preserved.
3. NVENC runtime probe **64×64→320×180**. L40S NVENC rejected old small frame and falsely selected CPU.
4. Studio H264 final encoder uses **h264_nvenc** only after actual probe. `VIRAL_EXPORT_ENCODER=auto` retains CPU fallback; `cpu` forces CPU; explicit `nvenc` fails if unavailable. H265 path unchanged. Correct NVENC CQ/VBR flags, no CRF; watermark pass also uses selected encoder.
5. `validate_final_viral_delivery` now checks **picture-stream timing independently of audio/container**, and fails black-probe decoder errors. Before, complete AAC concealed missing last picture frames.
6. **Just repaired watermark truncation**: looped PNG at 25 fps plus `-shortest` and copied AAC produced 597/601 picture frames while audio continued. Replaced watermark output `-shortest` with source duration `-t`; compositor base EOF still controls overlay. **Real full edited export rerun now PASS: 601 picture frames, 20.033333 s video, 20.033000 s audio**, H264 NVENC, 1920×1080, 17.1 MB. Independent GPU decode passed. Strict GPU CUDA ASR used float16; 8.616 s ASR while Wan competed; export 36.626 s.

Latest actual proof remains REMOTE under `/tmp/autopromote-studio-l40s-20261006/output/`, log `gpu-studio-watermark-fixed.log`. Download latest receipt/render result/stage-media/export for local evidence; local `gpu-output/` currently contains earlier proof and must not be confused with latest success.

Important: original earlier proof had **19.533 video / 20.017 audio** and passed the older weak gate. Its historical PASS is superseded by new timing check. Do not cite it as timing-clean.

### Tests and runtime dependency blockers

New tests `test_whisper_cuda_selection.py` (7), `test_studio_nvenc_export.py` (6), `test_studio_delivery_timing.py` (5): **18/18 passed** before final watermark change. Add actual FFmpeg frame-count regression for watermark (CPU path) and rerun; existing `test_viral_render_contract.py::test_caption_review_copy_is_stamped_and_keeps_audio` only checks audio, not frame preservation.

FFmpeg **4.4** GPU proof image failed real browser audio restoration (`afftdn` missing `gs`). Fixed modern runtime to **CUDA 12.6.3 cuDNN Ubuntu 24.04 / FFmpeg 6.1.1 / Python 3.12**.

Modern build then selected **PyAV 19.0.1**, incompatible with FasterWhisper 1.2.1 (`av.open metadata_errors` unexpected). Pinned **av 17.1.0**, which actually works. Reusable production `python_media_worker/requirements.txt` now pins FasterWhisper 1.2.1, CTranslate2 4.6.0 and av 17.1.0. CPU recipe otherwise preserved.

New reusable **`python_media_worker/Dockerfile.gpu`**:

- CUDA_BASE build arg default 12.6.3-cuDNN-runtime-ubuntu24.04; modern FFmpeg/venv, complete worker dependencies incl. MediaPipe 0.10.21 without optional JAX.
- Source `.py`, approved assets and YuNet model only, no credentials.
- `auto` devices/encoders, strict=false, CPU fallback available.
- Built remote **`autopromote-media-gpu:20261006`**, SHA `73b287e1727d4aaf84f334a7cc48648cc5631a3aafcaa94a7c78332cf768c9b0`.
- Image includes code **before latest watermark fix**; successful proof imports updated bind-mounted `/work/python_media_worker/main_media_server.py`. **Rebuild image with latest source before declaring packaged readiness**.
- Run actual short source caption+export **without `--gpus`** to verify CPU fallback, not merely mocked tests.

Script **`scripts/run-studio-l40s-proof.py`**: strict existing L40S identity, cloud status/upload replaced only inside test boundary, no network container, actual worker processing. Official ASR `digiphyte/swivuriso-turbo`, revision `078ab5ce8bc1666d658680e61893f76d94c0dec7`, ~777 MiB remote cache. Optional observer writes actual stage commands/probes `output/stage-media.json` and retains debug output before cleanup; does not change actual commands.

Local loopback SimpleHTTPServer lacks Range; FFmpeg HTTP input sees partial file and actual worker download fallback succeeds. This is a **test transport limitation**, not an unexplained production codec failure. Can add proper fixture HTTP Range support to exercise direct path and reduce noise.

Latest successful command:

```sh
docker run --rm --network none --name autopromote-studio-edited-proof-20261006 --gpus all \
  -e VIRAL_EXPORT_ENCODER=nvenc -e HF_HUB_OFFLINE=1 \
  -v /tmp/autopromote-studio-l40s-20261006:/work \
  autopromote-media-gpu:20261006 \
  python3 /work/run-studio-l40s-proof.py --request /work/gpu-render-request.json
```

## Blender: real blocker confirmed, next repair

Original image built **`autopromote-studio-3d:20261006-original`** from existing `studio_3d_renderer/Dockerfile` (Ubuntu 24.04 apt Blender **4.0.2**).

Actual local scene baseline PASS: 320×180, 12 fps, 1-second preview, ~5.82 s Blender, 535 KB qtrle alpha MOV + H264 preview. **Engine is EEVEE; GPU being visible is not proof of GPU render**.

New `studio_3d_renderer/check_devices.py` performs actual setup/render then inspects Cycles devices. Fixed diagnostic assumption that `gpu.platform.*` works in background mode; reports unavailable instead of failing.

Latest actual diagnostic `/tmp/autopromote-studio-3d-l40s-20261006/devices-original-fixed-probe.log`:

- Version 4.0.2, engine BLENDER_EEVEE.
- **OPTIX is absent from supported enum** (`NONE, CUDA, HIP`).
- CUDA devices list **CPU only**, AMD EPYC, no L40S device.

This is a real installed-Blender blocker, not solved. Need official **Blender 4.5 LTS** build with CUDA/OptiX, explicit backend selection, actual render/device proof, CPU fallback. Check `libnvoptix.so` injection and run container with `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video,graphics,display`.

Latest attempt: remote Python urllib to `https://download.blender.org/release/Blender4.5/` got **HTTP 403**. That lookup failed before the SAM2 metadata query in the same loop; **SAM2 model revision is not yet fetched**. Use proper user agent/curl or official direct filename/mirror; verify published SHA256. No Blender binary downloaded yet.

Another real source bug: `blender_scene.py::pose` computes entrance/exit **opacity**, but `main` applies location/scale/rotation and **never applies opacity**. Fade is ignored in final alpha. Fix via compositor Render Alpha × current opacity, preserving glow RGB, and verify actual alpha frames. Existing numeric browser/Blender pose parity must stay unchanged.

`render.py` currently discards successful Blender stdout, CPU libx264 preview encode, qtrle alpha output. Keep ownership/assets/cloud boundary unchanged. Local render uses `--spec --output`, no Google imports. Cloud job is authorized owner-bound only; do not call it now.

Spec v1 already supports bounded editable templates: neon_logo, cinematic_title, chrome_lyric, audio_reactive_text, floating_callout, impact_explosion, speaker_intro, comparison_card; timing/keyframes/materials/colors/easing. Scene can be 5 seconds while root preview is 1-second snippet—do not incorrectly force equal durations.

Tests `studio_3d_renderer/tests/test_spec.py`, `test_pose_parity.py`; smoke JSONs and `autopromote-logo-proof.json` already there.

## GPU segmentation and Director VFX — not yet implemented

Recommended next primary capability: **SAM2.1 Hiera Tiny** (official Meta, Apache 2.0), GPU video segmentation/tracking, reusable cached matte for preview and final compositing.

- Existing Wan image Transformers **4.56.2** already imports **Sam2VideoModel**, **Sam2Model** (verified), so can avoid custom SAM2 CUDA extension build.
- Model `facebook/sam2.1-hiera-tiny`, ~90 MB, download remote only. Fetch/pin revision first.
- Official API https://huggingface.co/docs/transformers/v4.56.2/en/model_doc/sam2_video :
  - model `Sam2VideoModel.from_pretrained(local_path).to('cuda', dtype=torch.bfloat16)`.
  - processor `Sam2VideoProcessor.from_pretrained(local_path)`.
  - video list of PIL frames, `init_video_session(video=frames, inference_device=device, dtype=torch.bfloat16)`.
  - `add_inputs_to_inference_session(... frame_idx=0, obj_ids=1, input_points=[[[[x,y]]]], input_labels=[[[1]]])`.
  - first model call frame_idx=0, then `propagate_in_video_iterator`.
  - post_process_masks original_sizes=[[session.video_height,session.video_width]], binarize=False.
  - streaming supported for memory limits; match actual installed API, don't assume newer docs.
- May need torchvision matching Torch 2.7.1; test actual imports before changing all runtimes.
- Build optional separate VFX CUDA image to preserve lightweight CPU worker.
- Use reviewed structured source points/boxes; SAM2 binary segmentation isn't a perfect hair matte. Cache source hash, frame timestamps/fps, model revision, prompt hash, masks/centroids. Exact same artifact must drive preview/final.
- CPUMediaPipe existing fallback retained; no new model downloads at render time.
- Official SAM2 source HEAD observed `2b90b9f5ceec907a1c18123530e92e794ad901a4`, not installed. RVM GPL3 was inspected and **not used**.

### Architecture to build on; do not fake capabilities

- `python_media_worker/motion_sculpture.py`: real CPU MediaPipe person matte, source face pixels preserved, subject echoes/environment depth, deterministic compositing. `MediaPipePersonSegmenter.matte(frame, previous_mask)` and `render_motion_sculpture`.
- `content_aware_reality.py`: subject mask, 2.5D background/parallax/light/particles, portal/screen perspective composition with owned story assets.
- `studio_layer_motion.py`: real editable layer transforms/keyframes/easing, shadow/glow, multisample motion blur, alpha MOV, speed-clock mapping; meaningful pixel tests.
- `viral_creative_effects.py`: bounded normalized `beat_echo`, `motion_sculpture`, `reality_break`, `tracked_reveal`; max three temporal effects, owned assets retained.
- `studio_face_tracking.py`: actual CPU YuNet camera/speaker tracking.
- `studio_3d_overlay.py`: owned signed HTTPS storage qtrle alpha overlays; do not weaken URL/ownership validation to make offline test convenient.
- `RenderViralRequest`: creative_plan, finish_plan, composition_plan, overlays, speed_segments, resolved 3D overlays already exist. Exercise these with real footage.
- `StudioCreatorWorkbench.js`: several advertised tools are explicitly **Preview proxy** (cutout, text_behind, tracking, screen_replace, cleanup, parallax). They are not proof of final render capability. Avoid declaring proxy features production-ready.
- **`frontend/src/components/studioDirectorProposals.js`** allows only `split_clip`, `trim_clip` through bounded-operation capability/review/identity guard. Preserve gates. An internal strict VFX plan/matte renderer can be reusable by Director, but do not silently enable unsupported Director actions or bypass project fingerprints/reviews.
- Prefer strict versioned structured commands (bounded time/layers, seeded randomness, approved asset resolver, source/matte hashes), one shared renderer/cached result for preview and final. No complicated new editing UI required.

## Next work in priority order

1. Download latest timing-clean Studio receipt/export/stage probes; add genuine watermark frame-count CPU regression and run focused tests. Rebuild final GPU image with latest fix. Verify actual short no-GPU CPU caption/export fallback.
2. Fix apt Blender absence of GPU/OptiX using verified official build; execute actual Cycles OptiX/CUDA, preserve fallback. Fix ignored opacity and inspect alpha frames.
3. Start real SAM2 video tracking/matte on actual podcast; produce reusable source-bound mask artifact and render text behind subject / tracked callout / depth or screen composite through structured commands. Verify preview/final reuse and deterministic output. Inspect actual real footage; do not claim hair-quality from segmentation alone.
4. Exercise supported real existing VFX stages (glow/particles/layer motion blur/speed ramp/cinematic composition) and repair actual failures. Distinguish supported vs proxy-only/unimplemented.
5. Collect completed Wan shots, visually review second/third, install only good assets if helpful. Collect utilization log.
6. Parameterize motion CUDA recipe/device guard for RTX cu128 later; not tested on Google.
7. Verify new welcome backdrop and final compact controls in browser. At fixed deadline deliver honest readiness/blocker summary with proof links.

Keep task running until authorized deadline or genuine external blocker. A new chat must not interpret this handoff as all VFX complete.

## Primary references

- Wan https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers and https://github.com/Wan-Video/Wan2.2
- Diffusers fix source https://raw.githubusercontent.com/huggingface/diffusers/v0.36.0/src/diffusers/models/autoencoders/autoencoder_kl_wan.py
- FasterWhisper https://github.com/SYSTRAN/faster-whisper
- CTranslate2 https://opennmt.net/CTranslate2/hardware_support.html
- Blackwell CUDA 12.8 https://pytorch.org/blog/pytorch-2-7/
- Blender https://www.blender.org/download/releases/4-5/ and https://docs.blender.org/manual/en/4.5/render/cycles/gpu_rendering.html
- SAM2 https://github.com/facebookresearch/sam2 and https://huggingface.co/facebook/sam2.1-hiera-tiny

No secrets are stored in this handoff. Re-read actual code/diffs when making changes; don't infer completion from earlier labels.
