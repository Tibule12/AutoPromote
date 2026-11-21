# Independent selected-area grading — 21 November 2026

**Owner rejected the delivered demonstration. The requested grading and retouching system is unfinished.** [Review findings](owner-rejection.json). Arithmetic/export passes below remain bounded engineering evidence; they do not qualify the requested visual quality.

The owner rejected the earlier global podcast grade and required editable corrections for arbitrary parts of people and objects. This candidate adds independent timed colour regions to the existing adjustment-layer system. It does not introduce a separate editor or rendering engine.

The Color inspector now adds up to 32 named regions. Each has an ellipse, rectangle, 3–64-point polygon or freehand outline, editable points, rotation/size/position, feather, inversion, range, strength and manual motion keys. The ordinary adjustment controls supply exposure, lift/gamma/gain, white balance, curves/HSL/LUT and finish settings inside that coverage. Recolouring preserves HSL lightness; an explicit clone tool samples nearby texture from the same frame for a small local defect. Clone strength is mixed inside the mask. Masks and their keys remain attached to the timed adjustment when it moves; keys are converted to programme time for export.

The programme canvas and Node source-grade viewer use the same region geometry as the worker. Static coverage is a lossless image; moving coverage is streamed to FFV1 without retaining the whole programme in memory. Small-mask rasterization evaluates only its bounds. Recolour parameters are compact descriptors; their matching LUT is built by the worker. Source/project data is retained normally, and originals are unchanged.

## Real Studio evidence

A fresh signed-in headless/muted Studio imported a 3.8-second ungraded excerpt of the original podcast using the ordinary uploader. Real pointer actions drew an upper-screen polygon and a seven-point upper-lip mask; four manual motion keys followed the lip. A third small rectangle cloned clean wall texture. The result deliberately demonstrates different corrections on parts of the picture; it is not an approved beauty treatment or a replacement full-podcast creative grade.

Meaningful Undo/Redo, ordinary Save/cold reopen and independent backup restore retain the editorial values and owned source identities. Only ephemeral access URLs renewed. The exact Color/Export request was dispatched through a private loopback transport into the same canonical worker, using the verified uploaded source bytes and no cloud render/charge. Its final output is 114 frames at 1920×1080/30fps, 3.8 seconds, Rec.709 H.264 with stereo AAC. The final gates and full decode pass. [Sanitized receipt](verification.json), [four native preview/final measurements](picture-comparison-corrected.json), [nine JS/Python coverage comparisons](coverage-parity.json).

The ordinary Studio download is checked against the canonical output hash. Original recordings, failed attempts, editable project and final movie are retained privately in Videos. Capture/playback outcomes are reported in the receipt rather than inferred from the movie's metadata.

## A real failure found and corrected

The first landscape output passed container duration and audio checks but repeated picture frames: independently timestamped masks could trigger extra frames in `maskedmerge`, and the downstream CFR packet clock stretched those frames. The source comparison found a 0.6× picture progression. That movie is rejected and preserved. Mask samples now use the exact integer 90k programme clock, with rounded frame ticks; no tolerance or final gate was weakened. Unique moving-picture regressions at 24, 25, 29.97, 30 and 60fps now preserve every source-frame identity. The corrected real clip aligns with source frames 30/60/90 at 1/2/3 seconds; the first-frame match has a one-frame phase ambiguity. Four whole-frame MAEs are 1.95–2.47 RGB levels, not a claim of universal pixel parity.

The editor's toolbar also initially obscured an upper outline point. Its controls now render in the preview heading so drawing targets remain available over the picture. A first portrait test, browser disconnects, expired local media transport, and failed capture observers remain recorded. Independent restore proves editorial identity, not uninterrupted cloud-media transport. QA used a bounded exact-byte Range adapter after checking source identity; that does not certify a production source-loading repair.

## Deployment and remaining work

The API exposes a version handshake; pre-charge readiness and dispatch both require a worker advertising the new mask support. Unsupported GPU/CPU lanes refuse these jobs rather than applying their grades globally. Fallback still follows existing acceptance rules. No main merge, deployment, paid allocation, scheduling or publishing occurred.

This is a scoped local candidate. Automatic tracking, semantic part selection, compound/subtractive mask authoring and advanced skin healing remain unfinished. Clone retouch is a manually placed clean texture patch. Skin/edge quality on varied media, occlusion/cut handling, long-form speed, full predictive picture/audio parity and owner creative/listening approval remain open. Preserve shared S02/S04/S03 and historical typography failures. Formal counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY.

Next: precise moving selections, boundary/texture preservation, tracking and actual healing; then a convincing ordinary-Studio edit. Owner rejection remains authoritative. Production deployment and qualification remain separate.
