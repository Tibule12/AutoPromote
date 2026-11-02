# AutoPromote Motion & Flow — Comp & Rig + Signal Node Flow Parity Report (2026-10-31)

## Scope & Governance Boundaries

- **Worktree**: `/home/tibule12/Projects/AutoPromte/AutoPromote-ae-fusion-20261031` (`feat/studio-ae-fusion-workbench-20261031`)
- **Product Identity**: 100% native AutoPromote Studio terminology (`Motion & Flow` / `FX Flow`, `AutoPromote Comp & Signal Flow`, `AutoPromote Comp & Rig`, `AutoPromote Node Flow`, `Signal Node Flow`). Zero third-party competitor brand strings (`competitorBrandLeaks: 0` across live DOM text, `aria-label`, and `title` attributes).
- **Execution Mode**: Headless muted Chromium (`HeadlessChrome/147.0.7727.15`, `--disable-gpu`, `--mute-audio`) against local loopback fixture server + local CPU FFmpeg worker (`python_media_worker/verify_motion_flow_parity.py`).
- **Safety Boundaries**: `authBypassUsed: false`, `gpuJobsStarted: 0`, `cloudUploads: 0`, `apiRequests: []`, `pageErrors: []`, `consoleErrors: []`.
- **Readiness Claims**: Scoped local loopback preview/CPU FFmpeg parity receipt only. Does **not** promote formal Studio capability readiness counts (`2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY`) or alter `Next highest-priority task: S02`.

## Commands Executed

```bash
# Frontend unit & brand-hygiene regression suites
npm --prefix frontend test -- --watchAll=false \
  src/components/__tests__/StudioMotionFlowWorkbench.test.js \
  src/components/__tests__/studioNodeFlow.test.js \
  src/components/__tests__/studioCompRigging.test.js \
  src/components/__tests__/StudioProgrammeFrame.test.js

# Studio workspace mode integration test
npm --prefix frontend test -- --watchAll=false \
  src/components/__tests__/ViralClipStudio.test.js \
  -t "switches into Motion & Flow workspace mode"

# Python CPU FFmpeg track matte & rig composition unit tests
/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python -m unittest \
  python_media_worker/test_studio_track_matte.py -v

# Headless browser QA + local CPU FFmpeg 4-frame pixel parity suite
node test/e2e/playwright/run-studio-motion-flow-parity.js
```

## Canonical Artifact Digests

| Artifact | SHA-256 |
| --- | --- |
| Preview bundle (`bundle.js`) | `d4c5afabf99a777dff36db4ffbdf882a3da2096c2f8c226dbf00e234cd77d627` |
| `studioDocument` (before & after cold reload) | `c6d184b9eae1ecff15baf618645fc31676ee17d4794ad2d3da9ed376b1bebc7c` |
| `render-request.json` | `1e51d89314d2e7e2e94092ba51f7998ef3831b5af9f14b122531b9c1342f333f` |
| `final.mp4` (`360x640`, `24fps`, `144` frames, stereo `aac`) | `df5725ce202cae2943c2ed56df41b62fc63f24d75cc04132d22ade9c64cff7c3` |

## Paired Browser Stage vs Local CPU FFmpeg Render Parity

Thresholds: `IoU >= 0.95`, `boundary_p95_px <= 2.0` (`360x640` stage).

| Time (`s`) | Frame | Measured `IoU` | `boundary_p95_px` | `boundary_mean_px` | Centroid Delta `(dx, dy)` | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `0.50` | `12` | `0.976516` | `1.4142` | `0.8127` | `(1.060, 0.443)` | `PASS` |
| `1.50` | `36` | `0.980351` | `1.4142` | `0.7659` | `(1.079, -0.492)` | `PASS` |
| `2.50` | `60` | `0.983891` | `1.0000` | `0.6671` | `(0.048, 0.934)` | `PASS` |
| `3.50` | `84` | `0.992661` | `1.0000` | `0.3042` | `(0.381, -0.035)` | `PASS` |

- **Summary**: `min_measured_iou = 0.976516`, `max_measured_boundary_p95_px = 1.4142`, `frames_checked = 4`, `full_decode_clean = true`.

