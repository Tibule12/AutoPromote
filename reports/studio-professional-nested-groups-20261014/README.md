# Nested graphic groups — 14 October 2026

Composite now groups ordinary graphics, motion scenes and existing owned 3D
scenes into a hierarchy with static X/Y position, uniform scale, rotation and
opacity. The existing canonical `editGraph.settings.compoundClips` owns the
hierarchy; the canonical leaf array owns its back-to-front order. The shared
compiler carries both to the CPU worker. Groups render their children onto a
transparent programme canvas, clip that result, then apply the parent transform
and whole-group opacity. Child edits and keys remain local. Preview uses the
same hierarchy, with local canvas dimensions independent of ancestor rotation.
Legacy caption overlays remain outside the group wrappers; a regression guard
checks this. Explicit null transform values are rejected by both validators.
No alternate manual/Director/template engine or model generation is added.

The native signed-in three-second project groups one keyed image and a motion
scene, then nests that group beside a second motion scene. The outer ordinary
title stays separate. Both groups have nonzero position/rotation, non-unit scale
and opacity (inner0.8, outer0.9). Normal controls pass group creation, nested
membership, child-key preservation, root/child sibling moves, undo/redo,
reset/removal, invalid-scale rejection, save and cold reopen. One real CPU
export completes, downloads through Studio and fully decodes:720×1280,
24fps,72 H.264 frames and mono48kHz AAC. The exact completed movie plays to
its end beside the editable timeline, with its key rows expanded.

- [Final movie](proof/nested/final.mp4)
- [Complete Studio recording with editable timeline](proof/nested/edited-in-studio.mp4)
- [Native group controls](proof/nested-native-groups.png)
- [Exact graph, hierarchy, project/output/recording hashes and checks](checkpoint.json)

Four native accurate-paused preview/final comparisons at0.5,1,1.5 and2.5 seconds
pass the existing2px boundary p95 limit and declared0.95 footprint IoU limit.
Maximum p95 is2px; minimum IoU is0.980417. The magenta footprint classifier
(R>140,G<90,B>140) was declared before measurement for combined0.72 opacity;
no fitted spatial/time alignment or tolerance change is used. This qualifies
visible artwork geometry and occlusion in this exact nested edit. Complete
motion/title/color raster, continuous picture and sound remain unqualified.

40 frontend canonical/compiler/hierarchy/inspector cases,59 actual FFmpeg
compositor cases and21 legacy audio/motion worker cases with255 subtests pass.
Actual pixel fixtures verify overlapping children fade once as a composed group,
nested right-angle geometry/opacity, scaling, timing, alpha and flat-stack
regressions. Invalid cycles, multiple parents, unsupported decisions, noncontiguous
membership, over64 groups and over8 nesting levels fail explicitly. Each rotated
intermediate is limited to the existing4K pixel budget. The first strict build's
ESLint failure is retained; the final strict build passes. A native diagnostic
duplicate tests the final group-name uniqueness repair and retains distinct root
and nested sibling history receipts; the delivered project/movie stays unchanged.
The final App repeats all four live geometry pairs unchanged without another
export. A follow-up guard initially waited for a completed-output card that was
not visible after the diagnostic duplicate; the live-only capture prerequisite
was corrected. Automatic completed-output cold adoption after duplication stays
unqualified; the earlier complete exact-movie playback is retained.
Knowledge1.0.11 describes all five static transform controls and their limits.

Groups currently export Normal-blend children. Unsupported grouped blend modes
fail clearly; master blend/mask, editable anchor and master keyframes are not
exposed. Removing a group removes its transform and promotes its children; it
does not bake the visual result. Grouped timeline drag reorder directs the user
to Composite. Existing old compound metadata is retained without inventing a
rendering hierarchy. Owned3D still needs its existing current alpha asset; no
3D generation is triggered by grouping. Larger/deeper/video/owned3D stacks,
full glyph/effect raster and wider grouped drag/deletion remain unqualified.

One CPU export; zero model/GPU jobs, paid GPU runtime or cost. This is a private
engineering proof, with no main merge, production deployment, public scheduling,
creative/showroom or readiness promotion. The earlier S02 ellipse1.5s RGB
RMSE4.26944 failure remains above its unchanged4.0 bound. Next: shared group
transform keyframes and group property rows, then group masks/blends and clip
ownership. S02 broad picture/sound conformance remains open.
