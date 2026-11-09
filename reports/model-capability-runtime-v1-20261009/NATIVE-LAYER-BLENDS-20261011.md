# Native layer blends, real Studio export and recovery — 11 October 2026

One signed-in native compositing edit now survives history, cold reopening, CPU export/download, complete finished-file playback beside its editable timeline, and exact backup restoration. This is a bounded S03 improvement, not completion of Studio or creative approval.

- [Complete movie playing in Studio with the native timeline and soundtrack](proof/launch-template/native-layer-blends-20261011/render/blend/edited-in-studio.mp4)
- [Actual exported movie](proof/launch-template/native-layer-blends-20261011/render/blend/final.mp4)
- [Editable project backup](proof/launch-template/native-layer-blends-20261011/render/blend/VELO-native-blend.autopromote.json)
- [Graphics, music and SFX lanes](proof/launch-template/native-layer-blends-20261011/render/blend/native-music-sfx-timeline.png)
- [Native Difference control and timeline](proof/launch-template/native-layer-blends-20261011/lifecycle-r2/native-blend-and-timeline.png)

## Implemented and exercised

Ordinary image, video and text overlays now export Normal, Multiply, Screen and Difference through the existing worker. RGB blending retains layer alpha and the existing geometry, timing, motion and saved flat-layer order. Real FFmpeg tests exercise three RGB modes at alpha0/0.5/1, outside-layer pixels, cue boundaries and reversed layer order. This does not unify separate motion-graphics/3D/caption stages or implement nesting.

Overlay, Soft light, Hard light, Color dodge and Luminosity remain unavailable and are disabled in existing controls. Saved values remain recoverable and fail compiler preflight explicitly. Main-video non-Normal blending is also unavailable; Normal remains selectable to repair saved projects. No ignored active blend is silently exported as Normal.

The authenticated API rejects unsupported or contradictory blend decisions before source resolution, worker readiness, job creation or charging. Existing owned-attempt recovery remains authoritative. Two real signed-in HTTP requests return400/UNSUPPORTED_STUDIO_BLEND with no job identity, with the CPU worker already offline. Worker request parsing rejects unsupported overlay modes. Production charging remains unqualified because the retained local development credit bypass is unchanged.

The normal App duplicates **VELO — SFX value curve · 20261011** into **VELO — native blend · 20261011**, changes its existing hook-kicker to Difference through Composite controls, exercises Undo/Redo, saves and cold reopens. Other layers and audio decisions remain unchanged; the original project is preserved. No project edit is injected by the test harness.

## Exact delivery and measurements

Project `viral-project-0f0fc5b6-b392-400f-93e3-1be83ad3aba8`; canonical SHA256 `ec6726a4db4f5f8277b025bfaf8c28a41abe94efa7bea1eeba54db29604d60b6`. Template remains `cycling_rhythm_v1@1.0.2`, definition SHA256 `efcdf13fa2055544297a1253e390e5f55c4b6c03e8d916ad7867c0661fb6772a`.

One CPU render `viral_27a8b848e73e039f37144dde58ee3a1656be82515b85a974f56441f63ae9ec23` completes in179.565s from submission to downloaded/verified receipt. Output SHA256 `356aba95cf937564ddf745feab5ecf9fa0d63be453b44174f0745d70ee68836c`:720×1280,24fps,465 decoded frames/19.375s picture,19.385s AAC stereo. Native download matches the owned completed job; complete picture/audio decode passes.

Compared with the preceding SFX-curve export, the first48 decoded frames differ and all remaining417 are byte-identical. The authored kicker ends at1.75s; differences through frame47 may include opening-GOP compression differences, so this is not evidence that its visible cue lasts2s. All decoded PCM is byte-identical. Paired final-frame inspection confirms the intended changed opening kicker, with later sampled images unchanged. Full live preview raster/sound parity remains unqualified.

Full1× finished-file playback reaches `ended` inside Studio;461 frames advance during the run. The graphics, logo/B-roll, original audio, music and SFX tracks are shown. The recording lasts19.539s with539 captured screen frames. Its audio is muxed from the exact verified export at the observed playback-start offset because QA is muted; it is not a recording of live predictive PCM. Decoded opening frames, the contact sheet and native screenshots were visually inspected. The low-contrast Difference kicker is a technical compositing test, not an approved creative improvement. Full moving-film/sound human creative review is still pending.

Downloaded backup SHA256 `144ec4ca5f80c967289a9ccbc55204f3dc3aec657bba7ba1cf5a0e61bc28ff9c` restores and opens unchanged in a fresh real-auth Studio store after12 actual owned-media authorization requests. The retained login/profile is preserved. This qualifies local backup recovery. Finished-output renewal is separately verified below; general cloud project sync remains unqualified.

## Owned output recovery with the worker offline

A subsequent shared-backend task fixes a real access-expiry gap. Direct worker uploads previously left completed jobs pointing at a seven-day signed cloud URL without an owned export identity. New Studio completions now adopt the exact configured-bucket/job object into private `studio/exports` storage, while existing completed owned jobs are migrated on normal authenticated recovery. Unrecognized or unhashed legacy outputs remain unmanaged rather than being falsely attested.

The backend reads the exact source object generation through the Storage SDK, verifies its size and completed-render SHA256, then creates the owner/job output with a generation-zero precondition. Existing matching output is reused; an owner/hash conflict is rejected. Original source objects and canonical project decisions are preserved. Renewed download access requires the saved job owner and matching object metadata and does not depend on the old signed URL or a running worker.

[Strict native owned-output recovery](proof/launch-template/native-layer-blends-20261011/owned-output-confirmation/owned-output-recovery.json) confirms object generation `1791734428639581`, the same canonical hash/job ID/output hash, a fresh normal Studio cold reopen, native download and complete decode with all owned CPU workers absent. No second render or GPU job occurred. The normal status endpoint confirms the owned storage identity, beyond the deliberately limited completed-attempt response. This is real recovery of this private output, not broad retention/security/project-sync or ordinary-account billing qualification.

## Verification, files and remaining work

127 scoped checks pass:36 frontend,26 worker checks (16 real FFmpeg blend/10 request-schema),63 backend checks across five suites, and2 existing transient-worker-output guards. These include existing regression cases; no aggregate claim of127 new tests is made. Strict local App build, generated Director kernel consistency, syntax, diff and Studio record validation pass. The full Studio suite was not run. Readiness remains2 UNIMPLEMENTED/1 BROKEN/9 PARTIAL/17 FUNCTIONAL/0 PRO/0 PRODUCTION.

Implementation files: `frontend/src/components/studioBlendModes.js`, `StudioAdvancedInspectors.js`, `studioRenderCompiler.js`; `src/generated/studioDirectorReplayKernel.cjs`; `python_media_worker/studio_composition.py`, `main_media_server.py`; `src/mediaRoutes.js`, `src/services/studioWorkerOutputService.js`, `src/services/videoEditingService.js`. Supporting tests are `studioBlendModes.test.js`, `test_studio_composition.py`, `test_studio_blend_contract.py`, `mediaRoutes.viralRenderAttempts.test.js`, `studioWorkerOutputService.test.js`, `videoEditingService.templateOutput.test.js`, plus existing Studio source/billing and transient-output regressions. Native QA and diagnostics are `cycling-blend-proof.js`, `compare-layer-blend-films.py`, `run-local-backend.js`. Earlier unrelated dirty-worktree changes remain preserved.

Retained failed attempts: initial native exact-label selection; incomplete worker test fixtures missing x/y; a diagnostic FFmpeg seek written `.75` instead of `0.75`; and native API probes reaching the old local process after SIGTERM failed to close its custom listener. These are corrected and rerun. The new local API launcher checks actual listen errors and closes its own listener on shutdown. No failed render or second render submission is hidden.

Owned CPU workers are stopped. Models executed in this continuation:none. GPU jobs/runtime:0/0s. Existing source/music/SFX inventory stays12 videos/4 music choices/21 sound choices. No new purchase, public output, hero, production deployment or main merge.

Next shared task remains **S02**: variable startup readiness; mapped live picture/raster/staging; full music/SFX/VO/ducking/trim conformance. Continue bounded **S03** global ordering/nesting and remaining blend modes, then **S04** unsupported advanced controls. The nine advanced3D fields, caption ASR failure, normal-account runtime/billing/security/durable-media qualification, broad combinations and reviewed public showroom remain open. Native graph/curve/timeline work does not establish full After Effects equivalence.
