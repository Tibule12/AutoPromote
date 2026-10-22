# Group masks and blending — 14 October 2026

Graphic groups now use the ordinary rectangle, ellipse and percentage-polygon
mask fields, with corner radius, programme-unit feather and inversion. The mask
clips assembled child alpha in the local programme canvas before the existing
group transform/opacity. Group blending then combines that result with its
sibling backdrop. The shared canonical `editGraph.settings.compoundClips`
records retain `mask` and `blendMode`; existing transform keys remain in
`linkedTiming.keys.motionKeyframes`. No separate editor, effect store or renderer
is introduced. Composite supports graphics locks, valid-only polygon commits,
Escape cancellation, mask reset, history and cold persistence.

The CPU compositor reuses the ordinary geometric matte rasterizer and registered
request-owned PNG scratch inputs. RGB blend color now weights the blend result
by the backdrop alpha, preserving foreground color over transparent isolated
parents. This also enables the existing ordinary child blend modes inside groups.
All nine supported modes share the existing RGB/alpha leaf compositor. The
old static/Normal path retains its pixels; unsupported fields and malformed
mask/blend decisions fail preflight. Existing group depth/key/intermediate/graph
bounds remain. Mask and blend decisions are static; group transform keys still
animate around them. The preview uses the shared SVG geometric-mask helper at
the measured local canvas size and CSS isolated group blending.

One real signed-in nested image/two-motion project preserves all 16 master keys,
eight animated channels, child keys and base poses. Its inner group uses Multiply
and a feathered polygon ending at 75% canvas width; its parent uses Screen and
a rectangle with 12% corner radius. Native invalid draft/Escape, inversion
undo/redo, mask reset/undo, graphics lock and exact full-hash cold reopen pass.
One CPU export/native download/full decode produces a 3-second 720×1280/24fps
H.264 movie with 72 frames and mono 48kHz AAC. Its complete hash-verified playback
is recorded beside the editable timeline and expanded child/group property rows.

- [Final movie](proof/composite/final.mp4)
- [Complete Studio recording with editable timeline](proof/composite/edited-in-studio.mp4)
- [Native group mask/blend controls](proof/composite-native-properties.png)
- [Exact graph/input/output hashes, measurements and remaining blockers](checkpoint.json)

Four exact paused native/export samples at 0.5, 1, 1.5 and 2.5 seconds pass the
unchanged 2px boundary-p95 and 0.95 visible-magenta IoU limits: maximum 1px,
minimum 0.988634. Masked/blended image interiors also pass the existing S02
RGB RMSE 4.0 limit: maximum 3.226846. The unchanged magenta classifier was
declared before geometry measurement; the six-pixel interior margin and RGB
bound were declared before the first color measurement. Graph/source hashes
and frame indices bind each pair; no spatial/time fitting is used. This qualifies
this artwork footprint and bounded interior color, not full glyph/alpha/raster
or every blend/mask/media. All 288,768 decoded source-tone PCM bytes remain
identical to the previous export; live sound and listening remain unqualified.

91 frontend canonical/compiler/hierarchy/timeline/control cases, 131 actual
compositor/motion cases and 21 legacy audio/motion cases pass: 243 distinct cases
plus 261 subtests. Seventeen product-knowledge checks also pass. New actual FFmpeg fixtures cover eight non-Normal modes on
transparent, partial and opaque backdrops, group overlap/opacity, group mask
placement/feather/inversion and malformed-mask rejection. The strict normal
App build passes. Product knowledge 1.0.13 documents the new controls and exact
limits. The first native runner used the wrong lock locator; its saved edits,
failure screenshot/JSON and logs are retained. Correcting the runner passes
without changing product code or resubmitting an export.

One local CPU export; zero model/GPU jobs or paid GPU cost. Owned QA services
are stopped and the user’s existing App/other editing services are preserved.
Readiness remains 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / zero
PRO-READY or PRODUCTION-READY. Group anchor and clip/occurrence ownership,
mask/blend animation, broad modes/retiming/deeper/video/owned 3D stacks, full
picture/alpha and live sound remain open. The earlier strict S02 ellipse raster
failure and diagnostic-duplicate recovery gap remain open. Next: shared group
clip/occurrence ownership and timing, then remaining S04/AE controls.
