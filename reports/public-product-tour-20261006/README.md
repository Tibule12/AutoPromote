# AutoPromote product film — October 6, 2026

**Status: `READY_FOR_VISUAL_REVIEW`. Local changes; not pushed or deployed.**

[Open the homepage](http://127.0.0.1:3095) and select **Product Tour** in the
navigation or **Watch Demo** in the hero. [Watch the 36-second film directly](http://127.0.0.1:3095/landing/product-tour.mp4).

[Desktop composition](tour-desktop-1440.png) · [Mobile composition](tour-390.png) ·
[Studio cut closeup](studio-closeup.png) · [Recorded browser proof](product-tour-browser.webm).

## What changed

The public homepage now has an edited tour of the actual Uploads/Publisher,
Studio, Schedule/Queue and Analytics pages. Four selectable chapters start at
00:00, 00:09, 00:18 and 00:27. Watch Demo opens the same film in its accessible
native dialog. Native playback controls, English captions, retry and a direct
film link are provided. The film loads on user intent, pauses offscreen and
releases its source when the player unmounts.

The AutoPromote visual signature uses ink backgrounds, violet edit lines,
a diagonal cut mark, strong sentence titles and purposeful cuts into working
controls. The public wordmark now uses an A mark. The film has branded mattes,
context/detail cuts, short dissolves, chapter titles and an original two-note
sound bed. Studio footage shows a real output-frame choice, source/edit
comparison and an actual timeline split. Its closeup centers the resulting cut.

All software pages were recorded from the existing application in an isolated
local sample workspace. Schedule and analytics data are fixtures and visibly
labeled as sample workspace/metrics. No production accounts were accessed or
posts published. No generative video model was run. The sample podcast is the
licensed Mixkit recording documented in [media provenance](../../frontend/public/landing/README.md).

## Engineering receipt

| Item | Result |
| --- | --- |
| Branch | `agent/director-analysis-staging-browser-v1` |
| HEAD | `7f7530ad746050c094bfc78d0921190da98d2098` |
| Files changed | [58 source/assets files, including prior homepage work](changed-files.json) |
| New components | `ProductTourPlayer`, `productTour` chapter data, scoped `ProductTour.css` |
| Dependencies | None added |
| Motion | DOM/CSS controls, offline FFmpeg film edit and NVIDIA H.264 encoding; existing Three.js hero retained |
| Routes verified | Actual public root, full tour dialog and existing sign-in route; actual app pages captured with local fixtures |
| Lint | **44 JavaScript files, 0 errors / 0 warnings** — [receipt](lint.json) |
| Typecheck | N/A: existing JavaScript/CRA app, no standalone TypeScript gate. Python renderer compiles and executed successfully. |
| Tests | **20 tests / 5 suites** — [Jest](jest.json); **11 browser checks** — [browser receipt](browser-verification.json) |
| Production build | **PASS** — [build log](build.log), [compiled source and final static-asset verification](build-verification.json) |
| Protected scope | **11 protected hashes unchanged**, including App/router, auth, dashboard, Studio, Cam Combiner and lockfiles — [receipt](protected-scope.json) |

The browser checks exercise all four chapter seeks, decoded playback, active
chapter state, 1440/1920/390 layouts, zero film downloads before user intent,
reduced motion, offscreen pause, modal focus/Escape cleanup, original sign-in
cleanup and recovery from invalid video data. The production source map matches
all 24 changed compiled JavaScript sources. The final edited media was copied
into the build's static assets; all seven tour asset hashes match their source.

The [capture receipt](capture-receipt.json) records actual UI steps and local API
fixtures. The [render receipt](render-receipt.json) records source/output hashes,
chapter source times, crop windows, media metadata and the actual encoder.
FFmpeg filters compose on CPU; `h264_nvenc` performs NVIDIA video encoding.
This is not an AE export or AI inference.

## GPU and remaining work

[Direct GPU audit](gpu-audit.json): local **Quadro M1200 / 4 GB VRAM**;
`autopromote-cc6d3`, Compute Engine, `us-central1`, regular and preemptible L4
quotas **16**, usage **0**. No Compute Engine instances exist. The Cloud Run and
global service-quota API lookups returned 404 and remain unverified:
[separate quota receipt](service-quota-audit.json).

AI generated creator footage needs a provisioned inference worker and a measured
model run. Neither exists in this delivery. The prior homepage brief explicitly
prohibits GPU infrastructure changes; no cloud infrastructure was changed.
[The visual language and generation pilot](../../docs/autopromote-visual-language.md)
define asset families, source provenance and the next bounded creative shot.
The document also classifies live web (A), future AE (B), Three.js (C) and hybrid
(D) sequences. AE candidates remain future authoring work.

The film is a sample workflow demonstration. It does not certify production
publishing or analytics integration. Browser filming is edited for presentation,
not a latency benchmark. Full UI text is easiest to inspect fullscreen on mobile.
The existing application still has CRA's large main-bundle advisory.

## Run locally

From `/home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004`:

```bash
npm --prefix frontend run start:landing
```

The preview is already running at port **3095**. No new environment values or
credentials are needed for public visual review.

Reproduce the film from an isolated local sample workspace:

```bash
NODE_PATH=/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules node test/e2e/playwright/capture-public-product-tour.js
python3 scripts/render-public-product-tour.py
```

Use `--encoder libx264` for CPU encoding on a machine without NVIDIA NVENC.
The renderer requires FFmpeg and the specified system fonts; it downloads no
model weights. Task-generated failed recordings were removed; their retained
failure receipts are under `development-attempts/`.
