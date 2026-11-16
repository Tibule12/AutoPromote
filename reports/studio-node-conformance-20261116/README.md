# Node Flow conformance — 16 November 2026

This continuation tests the real preview and combined rigs, rather than inferring their behavior from authoring/unit tests. It fixes additional source, timing, masked-grade and playback defects. It does not qualify all Studio picture/edge/audio/device combinations or promote product readiness.

## Changes

- Both native SVG rig images now pass through the existing browser media boundary and materialize in the canonical CPU renderer. The first six-rig export exposed the former HTTP-only image restriction; that failed operation remains retained and settled.
- Decoded-picture timestamps now control paint cadence. Ordinary overlay timing in Creator mode also uses the existing decoded-frame painter, rather than coarse React transport updates. A coarse `timeupdate`/React callback no longer consumes a frame's paint slot, and 30→24 fps sampling retains its phase. Moving preview retains its labelled adaptive raster; a paused inspection keeps full detail. The tested automatic frame-rate experiment is rejected and removed because it regressed basic playback.
- Static processed images and branch masks reuse identical evaluated surfaces. Ordinary media/title branches skip unused CPU pixel kernels. Canvas alpha compositing replaces full-programme pixel readbacks for opaque grade pictures; actual Chromium tests compare it with the original byte blend.
- Software GL can copy its exact shader output directly to the CPU programme canvas. The actual browser comparison has zero channel difference. Primary-only adjustment grades reuse the canonical CPU grade on software graphics.
- Masked grades skip a neutral texture pass and retain RGB between stages instead of repeatedly encoding H.264/YUV420. Final mux attaches untouched source audio once. A diagnostic export exposed a 1,024-sample audio shift through Matroska; the corrected native movies match the prior programme's decoded stereo PCM exactly without alignment.

## Native evidence

The original local Auth, Firestore, Storage and worker checkpoint was replayed exactly. Every export used normal sign-in, owned backup restore, native duplication/save, ordinary approval, canonical local CPU rendering, native download and complete finished playback. No reset or direct financial write supplied the results.

The final mask-routing movie and the combined six-rig movie are each four seconds, 720×1280, 24 fps, H.264 with 48 kHz stereo AAC. All 96 finished pictures play to the end. Both decoded audio streams match the earlier unchanged programme exactly. Movies, native backups and actual Studio action/full-playback recordings are in `~/Videos/Studio Node Flow - Conformance - 2026-11-16/`. These are private engineering demonstrations, not approved creative showcase material.

The combined graph contains all six Smart Rigs together: 12 overlays, two adjustment layers, parent rigs, alpha/luma mattes, Corner Pin, a keyer and optics. Semantic cold reopen and backup restore preserve the authored fields. The retained first failed export is separate from the corrected final.

130 frontend cases across 14 suites, 249 worker cases and 52 knowledge/help cases pass. Actual Chromium mask checks include normal/inverted projected coverage, title coverage and ten opacity/inversion comparisons. Immutable candidate build, served assets, responsive UI, ordinary signed-in help and welcome checks are bound separately in private evidence. Routine observer failures remain retained.

## Picture and throughput limits

Five of the six fixed final mask-routing preview/export pairs pass their original MAE ≤3 and 95th-percentile channel-error ≤12 thresholds. The final pair remains narrowly outside MAE (3.17); an earlier RGB-only candidate passed all six, and its later-discovered audio shift makes it a rejected delivery. The earlier last-frame failure is retained, along with the initial loading-overlay capture. No alignment or threshold fitting supplies the pass. Full texture/matte/optics combinations still show measured colour/edge and projected-layout differences. The six-rig comparison remains failed at those strict thresholds; this is not hidden by the successful export or audio check.

Playback measurements use separate runs without screen recording, with retained decoder callbacks, dropped frames, programme paints and layer times. Heavy live preview on software graphics retains measured throughput failures; automatic frame-rate reduction did not qualify and is removed. The final basic edit has 1 dropped picture in 96 decoded pictures, zero layer clock distance and passes the fixed throughput criteria. The six-rig run drops 30/104 pictures; with both node viewers it drops 39/98. Both retain zero layer clock distance and fail throughput. See `conformance.json` for exact measurements and criteria. Final exports retain their selected 24 fps. This does not qualify universal real-time performance.

Keep 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY, the earlier strict typography 13/16 failures and shared S02/S04/S03. Next work is the measured combined-grade/texture/projected-layout fidelity and device throughput gaps. Concurrent logo/design/vector/3D edits are preserved and excluded from this Node qualification.

All work is local. No paid/provider/GPU allocation, production write, publishing, scheduling, push, merge or deployment occurred. The original full emulator checkpoint and every new worker request/terminal receipt remain retained. The export-run services ended before a new full Firestore/Auth/Storage export: this run does not qualify final full-state replay. The last read-only observation recorded five succeeded operations, one failed operation and zero held/active work, with wallet balances 0 and 5. A separately identified replay of the original single-render checkpoint supplies final UI checks only; it submits no new render and does not reconstruct the lost export-run database.
