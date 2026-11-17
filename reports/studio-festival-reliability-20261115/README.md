# Studio colour and export repairs — 15 November 2026

The isolated candidate fixes reproduced Studio defects before the festival package. The business remains prelaunch, with the founder testing the product; these checks are not customer traction or production approval.

## Changes

- An identity LUT no longer changes the picture. The WebGL sampler addresses texel centres; the measured channel error fell from 32 to 0 on the retained reference.
- Importing a different cube with identical endpoints invalidates the texture. The previous cache silently kept the old interior colours.
- Imported LUT strength is applied once in Live Edit, matching the already compiled export cube. A 25% choice previously mixed the effect twice.
- LUT values of 1% and fractional values keep their percentage meaning. Small curve values keep their actual slider scale.
- Continuous playback now paints directly from the decoder without allocating optional bitmap snapshots. Paused capture keeps source dimensions, allows one capture in flight, and teardown releases a late bitmap. This bounds unnecessary live work; playback results are recorded separately below.
- The isolated local API and worker accept a valid full colour-cube request within a finite 4 MiB limit. Production limits are unchanged.
- Authenticated oversized refusals receive a signed, durable no-dispatch failure receipt. Normal reconciliation can release a reservation. An explicit local cancellation can seal an unclaimed execution; it refuses possibly started jobs and prevents later dispatch of the sealed execution. No missing-process inference, synthetic measured exit code, wallet reset or direct account edit supplies settlement.
- Product help routes LUT and colour-grading questions to the colour documentation. The first native candidate check caught the previous incorrect effects result; that failed check is retained.

The nine unsupported advanced 3D controls were already disabled in the input candidate. Their availability regression passes; this batch does not claim to implement those controls.

## Evidence and scope

[Before](grade-before.json) and [after](grade-after.json) use the actual production WebGL2 shader in headless Chrome/SwiftShader, with the canonical CPU cube as reference. This is actual shader execution, not a mocked WebGL context. Fractional sampling is within one 8-bit channel level. The retained `atCurrentCall` diagnostic deliberately demonstrates the old double-mix call; the repaired Studio uses `atOne`.

Private native evidence retains real emulator sign-in, LUT import, 25% mix, Undo/Redo, exact canonical save/cold reopen, accurate paused source frames, and the initial failed HTTP 413 request. The old failure settled through a supervisor-signed no-dispatch receipt and ordinary background reconciliation. The attempted retry's capacity rejection and the two observer attempts that did not wait for missing-submission recovery are preserved. They did not launch accepted duplicate renders.

The final build keeps the original local API origin and welcome setting. Eight anonymous baseline/candidate viewport comparisons and normal signed-in Studio/contextual-help checks pass before local selection. Prior builds and all failed takes remain retained. [Final verification](verification.json) records the completed checks and remaining limits.

41 focused frontend,14 worker-boundary/receipt,52 knowledge/help and4 isolated Python engine tests pass. The first three groups and actual LUT shader checks repeat in the active `AutoPromote-pro-studio-20261114` branch after applying the fixes. Its later concurrent optical/VFX changes are preserved and are outside the isolated native proof.

The [native test movie](private/native/festival-colour-native.mp4) is12 seconds/288frames/720×1280/24fps H.264 with AAC. Normal export/download, full decode, complete playback of that same finished file, the [editable backup](private/native/Festival%20colour.autopromote.json), matching Studio recording and a complete Auth/Firestore/Storage checkpoint are retained. There are two terminal test operations, one failed and one succeeded, with zero active reservations; final playback recovery launches no new render.

The earlier uncaptured WebGL playback interval dropped 207 of 356 decoded-source frames on this machine; it is not smoothness evidence. An exact channel-table preview experiment did not improve measured smoothness and was reverted; its source patch and measurements remain private. Profiling then identified unnecessary full-size bitmap snapshots. Final source-video deltas, compositor path and paired finished-frame measurements must be read from the final verification. Neither decoded-frame counts nor complete finished playback establishes whole picture/audio parity or human listening approval.

Optional bitmap-capture self time falls from1.369s to0.006236s in the retained profiles. Overall smoothness remains unqualified: the final profiled software-rendering interval still drops253 of355 decoded-source frames and observes96 programme-picture updates. Four unaligned, full-raster paused/final pairs have minimum28.14dB PSNR. These are diagnostic results, not a parity pass. Further software-rendering throughput and full colour matching still need work.

Formal Studio counts stay **17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY**. The previous typography failures and shared S02/S04/S03 backlog remain. This candidate does not contain all caption improvements from the separate `AutoPromote-studio-live-owner-20261105` worktree; those must be integrated and verified before a combined release. No deployment, publishing, scheduling, paid inference or GPU allocation is part of this repair.
