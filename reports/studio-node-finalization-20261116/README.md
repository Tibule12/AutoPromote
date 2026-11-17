# Node Flow finalization — 16 November 2026

**Status: not fully finished.** Four of six strict final picture pairs and both heavy playback profiles still fail.

This continuation fixes real picture, rendering and playback defects in the existing Studio Node Flow path. Verification and the delivered files are recorded in `verification.json`; earlier failed candidates remain under `private/`.

## Changes

- Retain native A/B viewer nodes and canvas buffers instead of rebuilding the mirrored programme every frame. Reuse static processed media, projected surfaces, title layout and matte coverage; defer unfinished filmstrip decoding during playback.
- Match the source ingest and continuous delivery clock, including aligned 24 fps cuts. The local transport now changes only source access, retaining canonical CFR30 ingest and original-byte profiles. Two encoder threads make source samples deterministic across preview and worker execution.
- Share a versioned grain/chromatic kernel between the browser and canonical CPU renderer. The masked-grade worker generates one bounded lossless grayscale noise stream and uses the same integer offsets for RGB. Actual FFmpeg comparisons check every resulting byte against the original kernel. There is one chained masked finishing graph and one finishing encode, with original audio copied through it.
- Preserve timed vignette controls and raster dimensions. Retain several radial maps rather than evicting them every frame. Short, bounded connected-mask projects reuse the existing lossless assembly/framing profile to avoid repeated compression damage before finishing.
- Correct wrapped title backgrounds and kerning in title mattes. Reuse the licensed Inter outlines, shaped widths and the same title parameters. Standard titles retain fractional placement in the canonical compositor. Static title pixels and shadows are cached; the existing adaptive moving preview uses simpler matte edges, while paused inspection retains full detail.
- Retain inline SVG title mask definitions and update their decoded-frame pose without re-decoding a mask image per picture. Paused ordinary titles reuse supersampled shared title pixels; the text remains editable.
- Bake image effects and homography, including plain Corner Pin without other effects, into reusable surfaces. Preserve padded canvas dimensions despite the app's global canvas width rule, and use the delivery raster for paused inspection.
- Explicitly convert composed RGB pictures into limited-range Rec709 before tagging final delivery. Metadata alone did not establish the conversion matrix.

## Verification and continuity

The work uses headless muted browsers, normal sign-in, ordinary backup restore/save, native controls and the canonical local CPU renderer. The final control recording includes actual keyer editing/Undo, bypass/re-enable and both viewer assignments. Every original layer's authored effect and geometry parameters are checked after those actions.

All earlier films, rejected experiments, failed captures and snapshots are preserved. One canonical diagnostic exceeded the unchanged 300-second ceiling while other tests and rendering were active; it remains failed. A later native submission was refused with `PILOT_CLOSED` before job acceptance. The expired owned local replay window was temporarily renewed in its local configuration, without a credit grant or financial-document edit. The original deadline is retained separately.

Formal Studio readiness is unchanged: **17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY**. These bounded Node cases do not establish every source, device, effect combination, moving edge/colour/audio condition, model-generated matte service or human creative/listening approval. Existing strict typography 13/16 failures and shared S02/S04/S03 work remain separate. Concurrent logo/vector/3D changes are preserved and excluded from Node qualification.

No production write, paid provider/GPU job, publication, scheduling, push, merge or deployment is part of this continuation. Complete local Auth/Firestore/Storage/worker checkpoints preserve the test history rather than reconstructing operation or wallet records.

## Final measured result

The frozen client is `/tmp/autopromote-node-finalization-build-20261116-r21`, with 37 individually hashed JavaScript/CSS assets. Its six-rig native preview passes **2/6** unchanged fixed picture comparisons (MAE maximum3; p95 channel error maximum12). Actual MAE values are2.848,2.823,3.369,3.500,3.344,3.741. The base live profile drops1/95 pictures; the heavy profile drops17/96; the dual-viewer heavy profile drops21/112 and reaches6.842 frames of layer-clock distance. The latter two profiles remain failed under the original5% drop/two-frame limits. These measurements are not reclassified as completion.

The normal native six-rig export has SHA-256 `1a5ae8a1eae3880287b749ea3d38973d24d99b80d3815147b37d0195b8491154`: four seconds,720×1280,24fps/96 pictures, H264 and48kHz stereo AAC. The Studio finished player reaches its ended event at4s and its actual playing bytes match the downloaded movie hash. Full decode and audible PCM pass; native base, heavy and optimized replay decoded audio match exactly. The optimized current canonical replay is a separate unbilled local test, with different movie bytes and lower measured CPU usage; it does not replace the native receipt.

181 frontend tests/18 suites and325 worker tests/26 additional subtests pass. Later viewer and Corner Pin changes also pass50 and42 focused frontend cases. Eight final welcome checks, normally signed-in help, three expanded desktop layouts, keyboard wipe, Escape/collapse, invalid-operation feedback and the phone desktop-only guard pass. The corrected native resize check verifies that cached projected/effected bitmaps follow three monitor sizes. The earlier over-eager assertion checked a Corner Pin before its authored entry; that failed setup remains retained, and the corrected check verifies it only while active.

Files are in `/home/tibule12/Videos/Studio Node Flow - Final Checks - 2026-11-16/`: the native movie with sound, its editable QA backup and the actual control/export/finished-playback recording. They are private engineering evidence and are not approved showroom/festival assets. Completing the remaining shared S02 picture and heavy software-throughput work is still necessary to fulfil the owner's full-finish request.
