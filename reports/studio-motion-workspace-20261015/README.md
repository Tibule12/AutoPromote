# Motion workspace and direct animation editing

15 October 2026 · `agent/studio-professional-continuation-v2`

Studio now exposes direct on-picture position editing and a timeline value/
velocity graph on the existing canonical motion keys. The accompanying edit
uses real headphones footage, 14 graphic layers, music and sound cues. The
moving image has five authored X/Y poses, scale/rotation changes and opacity
keys. This is an editing-engine continuation; the retained template definition
and public catalogue are unchanged.

## Working editor behavior

- **On-picture path:** Add position key writes an X/Y pair at the playhead.
  Drag a point to reshape movement while the picture follows; release commits
  once. Arrow keys nudge by 0.1 programme percent, Shift by1. Escape, lost
  capture and pointer cancellation discard the drag. Selection/seek and locks
  remain available. Temporary pointer state never enters saving or export.
- **Correct path geometry:** Only position keys create path points. The path
  samples actual X/Y interpolation instead of drawing straight lines through
  unrelated opacity/scale times. Animated nested parent transforms map stage
  coordinates to/from the local position at each authored time.
- **Timeline graph:** Select a key and open Graph editor. Value and Velocity
  show the interval arriving at that key, restricted to its owner. A programme
  playhead marks the interval. Return to the same property rows and selection.
- **Velocity/influence:** Start/end velocity is signed property change per
  programme second. Influence changes time handles while preserving that
  endpoint velocity. Enter/blur commits once to the existing cubic curve.
  Influence is1–99%; impossible speeds reject visibly. Hold and flat intervals
  have no editable finite movement velocity. Group plots respect their clamp.
- **Animated inspector repair:** Motion inspector changes to an animated
  property now write a key at the playhead. Previously they changed the static
  fallback while existing animation could keep the picture unchanged. Static
  base values and earlier keys remain intact.
- **Current preview after editing:** Motion-key mutations return After to Live
  Edit, preserving the prior download. A rendered movie cannot remain displayed
  as if it reflected newly edited transform keys. The completed-file production
  component regression checks the source switch and retained download.

The existing compiler and CPU compositor consume the same keys and four cubic
handles. No new animation schema, render-only path, duplicate editor, model or
GPU execution is introduced.

## Actual edit and deliveries

The real account restores the retained owned **ONDA — editorial launch · v1.1.2**
backup through Studio’s ordinary backup control. The server authorizes each
media reference. A normal duplicate becomes **ONDA — motion workspace · r1**,
project `viral-project-d146ee45-1e3a-4ae8-969d-6e608b6772f0`.

Native authoring moves the image through five positions at0.25,4,8,12,16s,
combines scale/rotation/opacity with10 footage shots and14 graphics, shapes the
first X interval with zero endpoint velocity and65%/20% influence, exercises
position and influence undo/redo, cancels a pointer edit, checks a real locked
track and retains the exact saved document through cold reopen. The closing
opacity hold keeps the image visible until its final fade.

The final saved edit has175 property keys, including21 on the moving image.
The closing opacity key is explicitly set through the selected-key inspector;
typing the already displayed value in the evaluated-property field does not
create a hold key. Its final values are0 at0.25s,1 at1.25s and19.5s, and0 at
19.958333s. The renewed actual editing recording shows a path move/undo and
influence change/undo on the final workspace layout; its intermediate hold-key
entry precedes that precise selected-key correction. The full Studio movie
recording and final export bind to the corrected saved document.

- [Actual editing in the final workspace](proof/editing-in-studio.mp4)
- [Original complete authoring session](proof/initial-authoring-in-studio.mp4)
- [Direct editable motion path](proof/editable-motion-path-final.png)
- [Timeline velocity controls](proof/timeline-velocity-editor-final.png)
- [Complete movie beside its editable timeline/graph](proof/motion/edited-in-studio.mp4)
- [Separate final movie](proof/motion/final.mp4)
- [Native authoring and cold-reopen receipt](proof/native-motion-edit.json)

The checkpoint binds final source, project and delivered movie hashes. Both
CPU export observations and the first movie remain retained. The first
post-export recording observer attempted to drag a path while the completed
movie was selected. It is excluded; the retry explicitly selects **Show Live
Edit** through the normal Export controls before authoring. No identity,
project or response was injected and no failed observer qualifies a user flow.

Final canonical SHA-256:
`181624b7e884292581ee1146b9d9e2754a7d9409b622bb20d0e93859a821bed9`.
Final movie SHA-256:
`fe19adad56a691dd12ce868c0c300f3863065a1be4548ca7c2e3457131fdde8f`.
Both native CPU exports complete:253.938s for the first edit and226.154s for
the corrected closing hold. One intermediate space preflight stopped before
submitting a job; a superseded local App build was cleared and the same revised
edit then exported once. All21 image-key tuples, including the custom curve and
closing hold, reach the actual composition request. The final file fully
decodes:20s,1280×720,24fps/all480 H.264 pictures,48kHz stereo AAC.

The exact corrected project plays to its native ended state at20s in Studio.
The full recording shows the editable graph during the first half and source,
graphics, original audio, music and sound-effect lanes afterwards. Its446
captured pictures average22.11fps; playback smoothness is not qualified by that
recording. Its soundtrack is muxed from the exact exported file at the observed
playback offset; the QA browser stays headless and muted. The separate actual
editing recordings are silent. Owned QA App/API/CPU services are stopped.

## Validation and exact limits

44 focused frontend cases pass, plus two complete production-editor motion/
compile and completed-file editing cases (122 other component cases excluded). The final curve-display
check passes all7 cases and the strict ordinary App build passes. Coverage
includes atomic X/Y preservation, live draft/cancel/locks, sampled curves,
nested animated coordinate inversion, signed velocity, degenerate tangents,
influence preservation, invalid-speed rejection and owner-scoped timeline graph
editing. The production-editor case now uses the real seek control and checks
that editing animated values changes arriving keys while preserving the base.

Native scope is one ordinary image animation over the real multilayer edit.
Nested parent mapping and group clamp behavior have helper/component evidence;
dedicated spatial spline/tangent handles, broad masks/3D/retiming, full continuous
picture/raster/live sound and human listening remain unqualified. Worker cubic
curves retain the existing32-sample approximation. The velocity graph measures
one property, not vector path speed or arc-length motion. Screen capture is
separate from decoded movie cadence and does not qualify playback smoothness.

Prior S02 colour/ellipse/source-feature and audio differences and S03 group/
source-occurrence ownership limits remain recorded. No preview/final threshold,
product readiness or creative/public status is promoted. No production deploy,
main merge, paid GPU/model job or publishing action is performed.

Next: coordinated spatial tangents and path timing on the same graph, plus
shared source-occurrence/group ownership. Retain the existing whole-picture/
sound conformance work without substituting repeated small diagnostic movies
for visible editor development.
