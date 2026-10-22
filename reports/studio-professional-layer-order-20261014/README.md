# Shared flat layer order —14 October2026

The Composite inspector now moves ordinary graphics, individual motion scenes
and existing owned3D scenes through one back-to-front stack. The existing
canonical document's layer array owns the order. Its snapshot projection restores
that order through history and cold reopening, and its compiler carries the same
IDs to the worker. Prepared ordinary, motion and owned3D alpha blocks reconnect
on the requested backdrop. Source footage/source VFX and generated captions
retain their programme stages; caption preview priority follows the full stack.
Older projects retain their batched motion rendering until their order is edited.
No model generation or alternate project/rendering engine is introduced.

Two actual signed-in native edits place the image beneath both motion scenes,
then between them, with an ordinary title above the stack. Both pass undo/redo,
save/cold reopen, owned CPU export/native download/full decode, and complete
finished-movie playback beside their editable timelines. Each export is3s,
720×1280 H.264/AAC at24fps. The visible change is direct: at1s, the front motion
card covers the magenta artwork in the first movie; the artwork covers that card
in the second while the upper motion scene remains above it.

- [Motion above image — final movie](proof/motion-front/final.mp4)
- [Motion above image — complete Studio timeline/playback](proof/motion-front/edited-in-studio.mp4)
- [Image between motion scenes — final movie](proof/between/final.mp4)
- [Image between motion scenes — complete Studio timeline/playback](proof/between/edited-in-studio.mp4)
- [Exact input/order/project/output hashes, checks and remaining blockers](checkpoint.json)

All eight declared-frame native/final visible-image occlusion comparisons pass:
maximum boundary p95 is1px against the existing2px limit; minimum footprint IoU
is0.98642 against the declared0.95 limit. Native images use exact720×1280 stage
geometry and accurate owned source samples, bound to the delivered graph. No
spatial/time fitting or tolerance change is used. This checks the original
magenta image's visible footprint and occlusion, not complete color/glyph raster.

Validation:24 frontend canonical projection/compiler/stack cases,42 actual
FFmpeg compositor cases (including all six cross-family alpha orderings), and21
legacy audio/motion worker cases with255 subtests pass. The legacy test adapter
was updated for the added validator; an older materialization assertion was
updated to include the existing preserve-source flag. Native proof selector
failures and an ESLint build failure were corrected; their available logs remain
private. Final strict build status is recorded in the checkpoint. The full Studio
suite remains unqualified. Knowledge1.0.10 documents the new partial control.

Two native CPU exports; zero model/GPU jobs, paid GPU runtime or cost. These are
private engineering proofs, without creative/public or readiness promotion.
Actual owned3D cross-family native export, ordinary video overlays, large stacks,
full motion/title/color/live picture/sound and nested compositions remain open.
The earlier S02 ellipse1.5s RGB RMSE4.26944 still exceeds its unchanged4.0 limit.
Next: S03 nested composition/group transforms on the existing canonical graph,
then group masks/blends and clip ownership. S02 broad conformance remains open.
