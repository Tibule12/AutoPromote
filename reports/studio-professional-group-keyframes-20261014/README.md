# Nested group keyframes and property rows — 14 October 2026

Groups now animate X/Y position, uniform scale, rotation and whole-group opacity.
Keys stay in the existing canonical `linkedTiming.keys.motionKeyframes`, targeting
the group ID. Membership/base poses remain in `editGraph.settings.compoundClips`.
Composite and the shared timeline edit those same keys, use the same property
bounds and curve editor, and preserve the children’s own edits and animation.
Timeline key selection opens Composite; keyboard nudging and graphics locking
apply to group keys. Reset removes the group’s keys and restores its neutral
base; removing a wrapper removes its keys and promotes children without baking.
Empty-group removal prunes its owned keys from the canonical snapshot.

The shared compiler projects group keys into the existing composition plan. The
CPU compositor transforms the assembled transparent canvas using the existing
interpolation expressions and the inverse programme clock. It retains a fixed
transparent surface per group, bounds it over the actual scale/angle range, and
applies one group fade after child overlap. A four-pixel opacity field evaluates
the curve once per frame before multiplying existing alpha. Constant keys preserve
the prior static pixels and avoid unused base/diagonal allocations. Preview uses
the shared interpolator with the same control limits, including clipped Bézier
overshoot; animated ancestor poses also map child pointer coordinates locally.
No alternate manual/Director/template renderer or model execution is introduced.

One real signed-in native image/two-motion project has 16 group keys across eight
channels and a custom inner X curve `[.2,0,.8,1]`. Group1 animates all five
properties; its parent animates Y, rotation and opacity. The original child keys
remain unchanged. Native property/curve editing, evaluated midpoint, undo/redo,
reset/remove/undo, timeline rows, one-frame keyboard nudge/undo, graphics lock,
save and exact cold reopen pass. One CPU export/native download/full decode
produces 72 H.264 frames at 720×1280/24fps with mono 48kHz AAC. The complete
hash-verified movie plays to its end beside the editable timeline, with child
and group property rows expanded.

- [Final movie](proof/animated/final.mp4)
- [Complete Studio recording with editable timeline](proof/animated/edited-in-studio.mp4)
- [Native group/property controls](proof/animated-native-properties.png)
- [Exact graph/key/input/output hashes, checks and remaining blockers](checkpoint.json)

Four declared accurate-paused samples at 0.5, 1, 1.5 and 2.5 seconds pass the unchanged
2px boundary p95 and 0.95 visible-magenta footprint IoU limits: maximum 1px,
minimum 0.990628. The classifier R>140,G<90,B>140 is retained from the static
group proof and declared before measurement. Group data, canonical/source hashes
and frame indices bind each pair; no spatial/time fitting is used. This checks
artwork geometry/occlusion in this exact edit, not whole glyph/color/alpha/live
picture or all curves. All 288,768 decoded source-tone PCM bytes are identical to
the prior static-group movie; live sound and human listening remain unqualified.

77 frontend canonical/compiler/hierarchy/timeline/curve controls, 82 actual
compositor/motion cases and 21 legacy audio/motion cases pass: 180 distinct cases
plus 261 subtests. Actual FFmpeg fixtures cover animated scale/rotation, nested
position/opacity, overlapping-child fades, hold endpoints, constant-key pixel
identity and the 2x inverse clock. Validation rejects malformed/unsupported group
keys, duplicate property times, over 256 keys per group and invalid curves. Each
intermediate must fit the existing 4K pixel budget; overly large filter graphs
fail explicitly. Both strict App builds pass. The first capture missed a late
recovered export card; the dependent comparison lacked its capture. Available
failures are retained; waiting for the normal recovered export before choosing
Live Edit repairs the harness, with no resubmission. Knowledge 1.0.12 documents
the five keyframeable group properties and these limits.

One local CPU export; zero model/GPU jobs, paid GPU runtime or cost. Owned QA
services are stopped; the user’s existing IPv6 App is preserved. No main merge,
production deployment, publishing, creative/showroom or readiness promotion.
Group masks/blends, editable anchor and clip ownership remain open. Non-Normal
child blend fails explicitly. Broader curves/retiming, moving/cold/live sound,
video/owned3D/deeper stacks and whole raster remain unqualified. Existing worker
Bézier expressions approximate 32 samples; browser interpolation solves the
curve. The earlier S02 ellipse 4.26944 strict raster failure remains open. Next:
group masks/blends through the shared hierarchy, then clip ownership and S04/AE.
