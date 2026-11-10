# Corrective-click repair — 4 November 2026

This continuation changes the existing background-replacement implementation. It does not establish a fully clean shot or a clean four-minute result. No paid inference, provider upload, production operation, deployment, merge or `.env` change.

## Verified implementation defects

1. Overlapping person and hand masks could veto each other's explicitly agreeing background corrections. In the actual failed source, both exclude frame23 pixel `(364,390)`, but its old native alpha remained **100/255**. The patched, completed native execution gives **0/255**. A third uncorrected kept object still protects its pixels; an explicit foreground click wins. Moving corrections do not leave circles frozen at their old source coordinates.
2. The observed moving-detail pass regenerated its trimap without giving authored corrections to the detail network. Reapplying them after prediction forced individual pixels while the network still saw the wrong guidance. The same source-coordinate, component-aware constraints now condition the actual neural input. A real adapter-loop regression with a small model stub verifies the foreground/background tensor values received by inference. Two actual-source neural probes are retained separately; they are not a moving qualification.

Pinned weights and commercial-licence selection are unchanged. Private local model versions are SAM2 `2.0.3` and temporal ViTMatte `2.5.9`. The latter is an image-conditioned network with source-flow/temporal processing, not a newly trained video-matting model. Both existing local transports attest/materialize the implementation helpers.

## Actual output so far

The intermediate `2.5.8` run completes ordinary native Refine → replacement preview → Save → cold reopen → final export. All48 actual source/preview frames in five regions were inspected. Source RGB identity passes48/48; canonical document and subject scenes survive reopen/export exactly. Its separate actual Studio recording includes the editable timeline and complete final playback. Final48-frame decode is1544×1080; fitted-preview/final mean RGB difference is0.820838/255, not identity. Original-speech zero-lag correlation is0.980936; QA is muted and no subjective listening approval is claimed.

Intermediate preview SHA256: `4590f8194a60ff0fadd52a735303eaa2257511b6cc78dba75d9a58b39ac5d5bf`.
Intermediate final SHA256: `2e906410e17434c01e74a8fdce1f2f9afb20676e8d58555b6ac93563a6e04102`.

The combined `2.5.9` native run also completes exact Save/cold reopen/export and full matching Studio playback. All48 actual source/preview frames were reviewed in five regions; all48 final frames decode. Fitted preview/final mean RGB difference is0.821477/255. Preview SHA256: `5d799124e5933a3c1d8156718b5c9ee5093133df4c9ffbff17ce52a6c40ecbe6`; final SHA256: `fa1d1fa11413e0dfbd6517c36b33cdc9cedea6b72234974e69f9c2768c50d643`. The actual Studio playback reaches2s with the editable timeline visible and33 captured screen frames. Capture smoothness and subjective listening remain unqualified.

**Visual target still fails.** Actual fast fingers retain dark/coloured mixed boundaries; fine equipment/plant edges and physical scene integration remain imperfect. The corrected pixel is concrete evidence of the bug fix, not evidence that every edge is repaired. Earlier wording that the gap was removed was too broad; residual opacity and mixed source colour remained.

The owner explicitly requests **only the finished four-minute proof**. Both short native runs and probes stay internal. No new short delivery is presented and no new four-minute result is claimed.

## Verification

116 distinct scoped checks pass: temporal/trimap28, moving-detail9, source-edge15, tracker6, CPU media/normalization5, Node ownership/runtime/correction/access53. Five regressions were added for the two verified bugs; other passing cases are existing coverage. No tests were skipped or assertions weakened. No frontend rebuild or unrelated Studio development is part of this change.

Private evidence is under `private/corrective-click-agreement-r65/` and `private/corrective-click-agreement-r66/`. It includes the actual source-click crop, completed old/new alpha proof, native movies/projects, model implementation hashes, all frame comparisons and the intermediate complete Studio recording. Credentials and raw private configuration remain outside delivered media.

The next gate is reliable moving mixed-pixel alpha/foreground-colour recovery and both-speaker/full-rate four-minute processing, followed by actual review across all camera intervals. Scene lighting/perspective/contact shadows, whole Studio parity and shared S02/S04/S03 remain unqualified. Formal readiness counts are unchanged.

Further private actual-frame checks remain rejected: the source-trained joint model (including its physical projection), converged CF/ML foreground solvers, protected-person choke, moving-source trimaps, observed-background unmixing and source-interior premultiplication do not establish clean fast fingers. Removing false opaque finger seeds alone is insufficient; directly unmixing noisy RGB can introduce blue/coloured outlines and speckle. None is promoted into the product. A new full-rate room-feature registration measurement is running across all5,760 original frames/51 retained camera intervals; it does not render or modify media and is not visual approval. A pinned publisher Apache2 FeyNobg comparison is isolated in RAM; strict loading initially rejected incompatible Swin library layouts, with no partial/random weight acceptance. No footage/provider upload or paid inference.

The registration measurement subsequently completed all5,760 frames with accepted room-feature fits;16 actual source pairs, covering both cameras, cuts and large differences, were inspected. The previous transform sequence steps by up to4.3032px within a shot; the fitted/smoothed candidate steps by at most0.6716px at the measured anchors. These are transform measurements, not proof that the final composite is stable. A17-frame source/retained-alpha recomposition was rejected before a new long render: stand/plant contamination and holes remain. Alignment cannot repair defective extraction by itself.

FeyNobg was actually evaluated with complete strict state loading, original published weights and original CPU operator after rebuilding30 deterministic nonpersistent Swin position-index buffers. The earlier library mismatches/crashes/NaN output are retained as failed harness attempts; they are not visual evidence against the model. Actual successful evaluations of frames6/9/23/36 reject this checkpoint for the task: frame23 improves the finger gap, but frame6 loses hand/forearm opacity and gains cyan, while frame9 retains dark blue rims. It is not registered or deployed. Its1,051,353,168-byte temporary RAM checkpoint was removed after preserving the exact hash/card/licence/code provenance and actual comparison media. An unsuccessful GPU package metadata probe downloaded a partial wheel; it was cancelled and its663,232,512 allocated temporary disk bytes removed. That removal reverses this probe's own temporary use and is not an additional net saving.

## Requested disk cleanup

Reclaimed725,970,944 allocated disk bytes (692.34MiB):290,344,960 from exact sealed local model/preview duplicates,435,625,984 from identical generated temporary test-build assets. Every path and content hash remains; source/build aliases and browser configuration/sessions are excluded. A post-pass inode audit verifies that static assets share only temporary-build inodes, with no external source links. Free disk measured3.2GiB afterwards; unrelated disk activity also changed global free space, so do not attribute its entire increase to this pass. No original user video, project, delivered movie or model weights were deleted.

After the second native run sealed, a further34,963,456 allocated bytes were reclaimed from192 exact duplicate media paths, retaining all paths. Total for this continuation is760,934,400 bytes (725.68MiB). Root free space later measured3.6GiB. RAM-backed diagnostic/model files are separate from this disk saving and are not counted as reclaimed root storage.
