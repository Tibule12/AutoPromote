# NVIDIA VFX continuation — 6 October 2026

All work used the existing `autopromote-l40s-staging` L40S. The original window
ends 20:02:25 UTC / 22:02:25 SAST; it was not restarted. Existing changes and CPU
recipes remain. No Google jobs, production requests, new machines, deployments,
commits or pushes were made.

The stop command completed at 20:01:56 UTC, before the cutoff. Brev reported
STOPPING during shutdown and confirmed STOPPED at the 20:03:51 UTC check.
The instance and storage were retained; no GPU job started after the cutoff.

## Review the actual result

`cinematic/autopromote-vfx-review.mp4` is a 13-second 1920×1080 review cut, 390
frames, from real podcast footage, an actual recorded Studio, reviewed Wan
generation and an OptiX brand close. It has an original synthesized music bed.
Local preview: <http://127.0.0.1:3095/landing/autopromote-vfx-review.mp4>.
The existing 36-second product tour is preserved. This study is not installed
as the product tour, an AE `.aep` export, or a claim that all these commands are
already exposed in production Studio.

The initial screen/callout sample was a poor composition: crowded type, oversized
panel and a connector crossing the face. It remains as diagnostic evidence.
The review cut removes those layers, uses a generated violet stage and restrained
type, and keeps the original speaker pixels. Matte softness on microphone/edge
details remains visible. Segmentation is not production hair matting.

## Verified fixes and evidence

| Path | Evidence |
| --- | --- |
| Real edited export no longer loses picture frames after caption-review watermarking | `../studio-l40s-hardening-20261006/timing-clean-output/gpu-studio-receipt.json`: 601 frames; video 20.033333 s, audio 20.033000 s |
| Real no-GPU worker fallback | `cpu-fallback/receipt.json`: CUDA devices 0, CPU/int8 ASR, libx264, 4-second podcast with retained audio; container explicitly used runc and `NVIDIA_VISIBLE_DEVICES=void` |
| Official Blender CUDA/OptiX runtime | `devices-optix.log`, `render-optix.log`; actual L40S OptiX render, not just CUDA enumeration |
| CPU denoising bottleneck in GPU Cycles jobs | `blender-fade/cinematic-close-refined.log` versus `cinematic-close-optix-denoise.log`: same 90 frames, 24 samples, 1280×720 close; 401.07 s with default OIDN, 26.52 s with OptiX denoising. Different denoisers are not asserted pixel-identical |
| Shared Blender timeline opacity reaches encoded alpha output | `blender-fade/alpha-receipt.json`: 24 frames, first alpha 0, middle 255, fading final frames; no-GPU automatic CPU render also succeeded |
| SAM2 video tracking resets at actual camera cuts | `cinematic/subject-matte-cinematic/manifest.json`: original source/hash, 144 full-HD frames, reviewed prompts at 90 and 102; initial drifted cache is rejected |
| Subject-aware typed commands and frozen cache | `studio_subject_matte.py`, `studio_vfx_plan.py`: text, animated tracked type, grade, reviewed moving background, callout, controlled 2.5D background movement, glow, seeded particles, reviewed static screen quadrilateral |
| Same preview/final pixels, clock and source | `screen-replacement/preview-final-parity.json` and `cinematic/cinematic-preview-final-parity.json`: every raw frame digest agrees, encoded files also agree |
| Portable optional runtime works offline | `portable-matte.log`, `portable-final-image.log`: actual SAM2 tracking and composition from the self-contained final VFX image |
| Final runtime CPU fallback preserves compositor pixels | `cinematic/cpu-gpu-pixel-parity.json`: 144 raw frame digests agree between automatic CPU/libx264 and NVIDIA encoding; `blender-fade/cpu-final-fallback.log`: real CPU fallback in the final Blender image |
| Real speed ranges and creative echo retain delivery timing/audio | `speed-creative/receipt.json`: six source seconds become seven output seconds at .5×/2×/1×; independent NVIDIA decode succeeds |
| Cinematic seeking no longer loses first chapter frames | `render-vfx-editorial.py` resets decoded PTS and uses explicit frame counts; final 390-frame / 13-second check passes |
| Welcome backdrop resource-loading race | `backdrop-browser/receipt.json`: nine checks, including playback, pause/resume, offscreen, preference changes, mobile and failed-source poster |
| Compact production Studio is usable with actual source | `studio-podcast-final-retry.log`: four actual podcast/edit/payload checks; `studio-compact-layout.json`: 72 px tool rail and intact timeline at 1440×1000 and 1280×800 |

Caption runtime success does not mean accurate words. The multilingual drafts
contain repetition/low-confidence wording and remain review copies. Existing
caption review/publishing gates were preserved.

## Validation

- `subject-vfx-tests-final.log`: 12 real pixel/identity/clock/asset tests.
- `blender-spec-final-tests.log`: 23 spec/pose checks, including existing parity cases.
- `vfx-existing-regressions.log`: 48 existing tests, 246 subtests.
- `cpu-regressions-final.log`: 19 focused checks, including the real CPU watermark regression.
- `cinematic/playback/receipt.json`: actual final film playback, metadata and seven seeks.
- `browser-agent-tests-final.log`: 12 real browser controller checks.
- Live model evidence is under `../browser-agent-nvidia-20261006/`.

## Browser agent

The runnable operator is `scripts/run-browser-agent.js`, with an offline pinned
Qwen3-VL-8B NVIDIA planner by default. It combines screenshots and semantic
observations, bounded settling, current refs, section/modal context, natural
scrolling and actionability, postconditions, popup/dialog/redirect handling,
durable intent before dispatch, duplicate-submit protection, retained downloads,
failure PNG/JSON and traces. Consequential actions cannot use vague page-change
verification. Passwords, files and CAPTCHA require user input. There is no stealth,
fingerprint modification or identity spoofing.

The real welcome-page open/close passed. A dynamic modal/form/offscreen/delayed
redirect workflow completed with one POST. Earlier Qwen2.5 and unconstrained
Qwen3 runs failed and remain recorded; grammar constraints, nullable-string
handling, current target enums, immediate verification and examples corrected
those failures. See `docs/browser-agent.md` for running and limits.
The final portable model image passed again in `dynamic-workflow-portable-final`:
six observations, five verified actions, one actual submission, no recovery errors.

## Remaining integration and hardware limits

- New matte/VFX commands are internal render interfaces. Director still executes
  only its existing supported split/trim operations. Owned model-cache jobs,
  asset resolution, proxy generation, cancellation, render leases and server API
  integration are still needed before exposing these new effects in Studio.
- Camera cuts require reviewed prompts. Hair, glasses, microphone edges and fast
  occlusions need stronger matting and broader visual review.
- `depth` is controlled 2.5D set movement, not a depth-estimation model. Screen
  replacement uses reviewed static corners, not automatic planar tracking.
- The browser agent has bounded successful live tests, not universal web
  reliability. Canvas manipulation, complex drag gestures and authenticated
  production workflows are not qualified.
- CUDA base/Torch wheel parameters support preparation for an RTX PRO 6000
  Blackwell runtime (12.8/cu128), but that hardware has not been tested. Google
  remained untouched. CPU worker dependencies stay separate from model runtimes.
- Model caches and failed diagnostics remain on NVIDIA; stopping the instance
  must retain its storage.

The 208 model/cache files (69,320,267,095 bytes) were copied to
`/data/autopromote-l40s-20261006/models`; `model-archive-receipt.json` records
matching relative files and sizes. The source cache is preserved as well.
The final review cut uses the refined typography and OptiX-denoised close;
`cinematic/initial-review-v3/` retains the earlier close. Browser screenshots
now wait for actual video-frame presentation after seeking, rather than relying
on currentTime/readiness alone.
