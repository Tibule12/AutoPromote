# Background movement repair — 1 November 2026

The owner identified changes behind the person during movement. The same three-second shot now has a steadier chair silhouette and background gaps. **The professional visual target remains unmet**: fine plant spill/detail loss, microphone-rim mottling and localized opacity changes inside the corrected microphone region persist.

[Play the revised actual export](</home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Motion stability revision/Revised background replacement.mp4>) · [simultaneous moving comparison](</home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Motion stability revision/Motion comparison - previous and repaired.mp4>) · [enlarged chair-boundary movement](</home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Motion stability revision/Chair boundary - moving comparison.mp4>) · [source/alpha/project evidence](</home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Motion stability revision/review.html>).

## What changed

1. The existing temporal alpha adapter uses a median alpha reference only where source RGB remains within 12/255 across a corrective interval, including a conservative spatial-neighborhood check. Moving or newly occluded source pixels keep their per-frame result. Source RGB is neither frozen nor warped.
2. A later click resets its affected object's region, rather than every unrelated object. This preserves a whole-shot reference for the unchanged chair/backdrop while keeping the microphone's correction interval independent. The first native global-boundary candidate increased the frame-36 jump and was rejected; its artifacts remain retained.
3. The existing feathered colour-key cleanup now transitions continuously around HSV thresholds. A one-code-value source lighting/compression change can no longer trigger the old fully-opaque/fully-absent threshold switch. Fully keyed colour and different foreground colours remain covered by pixel regressions; zero-feather hard keys retain their behavior.

No new editor feature, source, replacement scene, paid inference, manual primary roto, merge or deployment. The source, plate, six object selections, frame-36 correction, effect settings and output geometry remain the same. Adapter version **2.3.1** records the new behavior; prior immutable results are not relabelled.

## Actual result

All **72 actual preview frames and 72 exported frames** were inspected, plus enlarged previous/current chair, microphone-gap, microphone-body and plant movement sequences. The chair is steadier; the moving person, hands and microphone supports remain present in that inspection. This does not establish that every flicker or fine-edge defect is fixed.

On the unchanged-source diagnostic population, actual exported pixel/frame RGB jumps above 16/255 fell **16,163 → 6,536 (59.6%)**. Model-alpha jumps above 32/255 fell **9,318 → 3,923**. These are bounded stability diagnostics, not labelled alpha ground truth or professional quality scores. The remaining frame-35→36 alpha jump count is **2,992**, down from **3,341**; its maximum is larger (**222/255 versus 174/255**), so full correction-boundary continuity is expressly unqualified.

The actual 3-second final is **1920×1080, 24fps, 72 frames, H.264/AAC**, SHA-256 `81e01a9f5ddd3d8c725fd8d9be97d3b25ad17ed8724f44cdb5586c6307d6dfe3`. Preview SHA-256: `5b89077a7db24886bd5da2fceaa1f25ca37f9d43df15a8fed84cb189aa4b9e4c`. Mean preview/export SSIM after exact Fit full mapping is **0.987270**, minimum **0.986072**; encoding differences remain. The movie fully decodes with its speech soundtrack. A separate read-only headless evidence-page playback reached ended with 72 total video frames but reported 30 dropped frames; that browser run does not qualify playback performance. All actual movie frames were separately decoded and inspected.

Native Save → cold reopen retains the exact canonical document and subject scene; final export keeps that scene. Model job `d7d2bfbebf6d9e9d8f3dfbbaffd6a3f9b4ebda5796b3055b9e55fec9385606cb` / attempt `0b6c1afa-73af-4743-969c-37d780e10ccc` produced artifact `c0cb8d20e7c41ee4385e61f73bdf25bb9a4d715c4e02607069bcf38ebf674f10` in **124.18 seconds** locally. It refines the verified prior neural alpha; **no new model inference** is claimed. Native preview job: `818e837c-275c-4515-ab61-6061e507323f`.

## Recording limitation and verification

The actual native preview was played through its ended event and recorded with the editable timeline. The supplied fourteen-second excerpt is an authentic, device-muted workflow capture. **A complete new final-export Studio playback recording is missing.** The first recorder failed before playback because it had received no initial headless compositor frame. That startup wait was fixed, but during retries the isolated Auth/Firestore/Storage processes stopped and the API exited with `ECONNREFUSED` to its local Firestore port. The exact stop cause is unconfirmed. No mock responses or reconstructed database records are represented as a successful recovery. Native save/reopen/export had already completed; the movie, backup, frozen execution artifacts and earlier complete Studio recording remain. The new backup references the stopped local demo's media; universal offline restore is not claimed.

**161 cases reran and passed** in this continuation: 48 model-runtime, nine temporal-alpha, 53 compositor/export and 51 documentation/assistance. Unchanged frontend/wallet suites retain earlier evidence. Studio contract validation preserves the formal counts. No production systems, credentials, queues, media or unrelated worktrees were changed. Raw frozen receipts, rejected candidates, contact sheets and failed recorder attempts remain restricted under `private/motion-repair-r2/`.

[Exact metrics and limits](motion-repair-validation.json). Next work: qualify the remaining affected-region correction transition and fine plant/mic alpha; a clean professional result, arbitrary hair/motion, physical scene relighting and a new complete final Studio recording are still outstanding.
