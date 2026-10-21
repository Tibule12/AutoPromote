# Editable vector artwork in Studio

18 October 2026. Branch `agent/studio-professional-continuation-v2`.

Graphics → **Vector artwork · editable paths** now creates an ordinary artwork
layer whose contour remains editable. Square anchors and round incoming/outgoing
tangents support pointer gestures and arrow keys; Shift increases the nudge.
Release commits one ordinary history entry and Escape cancels. **Split after
point** uses exact De Casteljau subdivision to retain the existing cubic shape.
Remove, Corner and Smooth commands reshape points. Open/closed paths, solid or
two-color linear fills, gradient direction, and stroke width/color are editable.

The geometry is a bounded `vectorShape` parameter on the existing image layer,
preserved in the canonical project and composition compiler. Motion uses the
existing transform/spatial keys. No additional timeline, animation engine or
generated-media service is introduced. The worker rasterizes the authored
contour inside the existing image compositor before applying its ordinary
transforms, effects and programme timing. The original owned PNG remains the
normal media-authorization reference; stale PNG pixels cannot override geometry.
Browser SVG is generated solely from validated numeric/color data and uses the
same explicit even-odd fill rule as the worker. There is no arbitrary SVG code
or external resource input in this contour model.

## Native evidence

The unique native project is **Editable vector contours — native Studio ·
20261018-v2**. A normal owned eight-second source is opened, the artwork added
through Graphics, and a point/tangent edited. Exact split and point Undo/Redo,
Escape cancellation, actual image-track locking, gradient/stroke editing and
exact cold reopen pass. Four transform poses and a spatial route are authored
through the same Motion controls as other layers. The seven-point contour and
its transform keys are retained at [native editing receipt](proof/native-edit.json).

- [Separate final movie](proof/vector/final-review.mp4)
- [Full matching movie and editable Studio timeline](proof/vector/edited-in-studio-review.mp4)
- [Native AAC master](proof/vector/final.mp4)
- [Downloaded editable backup](proof/Vector-artwork.autopromote.json)
- [Export receipt](proof/vector/render-receipt.json),
  [paired geometry](proof/vector-parity.json),
  [full playback](proof/vector/studio-playback.json) and
  [independent restore](proof/fresh-restore-receipt.json)

This is a private engineering example of authored artwork and motion controls,
not a new AutoPromote identity, automatic tracing of the supplied gradient logo,
or the planned one-minute creative production. Existing selected logo projects,
films and scheduled entries remain intact. No model, GPU, publishing, deployment
or main-merge action belongs to this implementation.

## Verification and boundaries

Scoped frontend regression: 84 cases across seven suites. Worker regression:
163 cases plus eleven subtests, including an actual image-compositor movie that
uses edited contour data instead of a deliberately stale green cached image.
Server/browser replay and project binding: ten cases across three suites,
including preservation of the contour through the same trim transaction.
Strict normal App build, scoped lint and replay checks are recorded in `proof/`.
The native export is exactly eight seconds/192 frames with stereo 48 kHz AAC
and full decode. All seven contour nodes and 28 transform keys compile exactly.
Five fixed-threshold contour-fill pairs pass: minimum IoU **0.981630**, maximum
boundary p95 **one native pixel**, without fitted alignment or timing. Full native
playback beside the editable timeline and independent backup restore pass.
Screen capture measured 23.27 fps for the 24 fps movie; this is distinct from
playback smoothness. Review copies preserve encoded video and transcode only
audio to MP3; native AAC masters are retained. Exact observations are bound in
`checkpoint.json`.

Early observer attempts remain: one optional rounding control was absent;
one capture stopped at the existing five-GiB disk reserve; one save reader
selected an older duplicate-name record. The unique v2 name fixes the last
observer issue. Original records and failure captures remain. Only the prior
session-owned generated build cache was removed to recover space; current app
builds, source media, movies, projects and login were preserved. New app and CPU
scratch use distinct loopback ports and bounded tmpfs; other active QA remains.

The feature supports one contour with 2–64 anchors, relative tangents bounded
to ±200 layer percent, and one fill/stroke. Geometry and paint are static;
animate the layer with existing transform keys. No automatic bitmap/text outline
extraction, arbitrary SVG/PDF import, animated contour morphs, trim paths,
multi-contour booleans or full pen/zoom workspace are supplied. Smoothing
initializes collinear handles; later handle edits remain independent.
Native evidence is limited to the retained project. The remaining paint qualifications include exact gradient/stroke raster,
arbitrary self-intersection, all retimed/nested combinations, whole continuous
picture/audio, listening and creative/public qualification remain separate.
Formal Studio readiness counts remain unchanged.

Continue shared S04 motion/vector depth and S02 speech/cut/preview precision,
then S03 occurrence/group ownership. Normal-account self-hosted generation and
the polished one-minute production remain distinct work on the same engine.

Storage follow-up: redundant diagnostic project/document JSON snapshots are retained byte-exact as `.gz` archives; original native backups, movies, source media and measured results remain. The lossless archive ledger is [here](../studio-creator-film-20261018/diagnostic-snapshot-archives.json).
