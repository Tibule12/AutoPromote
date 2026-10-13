# NVIDIA L40S welcome-page film — October 6, 2026

**Rendered, reviewed and working locally.** The existing NVIDIA/Brev L40S produced the corrected desktop and vertical masters in **71.1316 seconds**. All **11 browser playback checks pass**.

[Watch desktop film](http://127.0.0.1:3095/landing/product-tour-l40s.mp4) · [Watch vertical film](http://127.0.0.1:3095/landing/product-tour-l40s-vertical.mp4) · [Open welcome page](http://127.0.0.1:3095)

[Complete render commands, timings and GPU decode evidence](output/render-receipt.json) · [Browser verification](browser/browser-verification.json) · [Desktop frames](desktop-contact-sheet.jpg) · [Portrait frames](vertical-contact-sheet.jpg) · [Local asset hashes](published-local-assets.json)

## What changed

The homepage and Watch Demo now use a 36-second 1920×1080 edit with a moving creator opening, kinetic typography, a diagonal transition into the actual application, an enlarged synchronized Studio preview/timeline shot and an ending invitation. Uploads, Studio, Schedule and Analytics retain their 0/9/18/27-second chapter positions. The 24-second 1080×1920 version has its own composition.

The frame review found a recorded Analytics loading interval and clipped portrait labels. The corrected render removes that interval and uses complete interface regions. The Studio closeup now combines the actual programme pictures with the matching timeline instead of cutting through the faces. Prior attempt receipts and frame sheets remain in `first-attempt/` and `review-attempt/`.

## NVIDIA proof and scope

All eight chapter encodes used `h264_nvenc` on **NVIDIA L40S, driver 565.57.01**. CUDA/NVDEC decoded the VP8 application recording and H.264 creator footage. Both completed films were decoded again through NVDEC, with their expected complete frame counts. Editorial filters and typography use CPU FFmpeg; this is authored motion design, not generative video or an After Effects source export.

The actual app recording is the previously verified local sample workspace, with sample metrics visibly labeled. Creator footage retains its Mixkit license documented in the [asset provenance](../../frontend/public/landing/README.md). No production accounts, publishing actions or Google Cloud workloads were used. The soundtrack is original synthesis without speech or external music.

Render source: [render-public-l40s-film.py](../../scripts/render-public-l40s-film.py). The CLI and GPU are ready for subsequent Studio work on this same instance. The user explicitly requested that it remain running within the three-hour working window.

## Browser verification

Desktop and mobile playback, all four chapter seeks, offscreen pause, modal decoder cleanup, focus return, unchanged sign-in navigation, no film request before intent and malformed-media recovery passed. The harness was corrected to intercept the new film filename and remove a failure route from its owning context; the initial harness failures are preserved under `browser/`.

Only local public film assets, film metadata, render tooling and the relevant browser harness changed. The original public film remains available. No deployment, commit, push or main change occurred.
