# Marquee selection and cross-layer animation

15 October 2026 · `agent/studio-professional-continuation-v2`

The ordinary Studio property timeline now supports rectangular key selection
across expanded property rows and pasting copied animation onto another
compatible layer. Both operate on the existing canonical `motionKeyframes`;
manual editing, history, saving, preview and final compilation keep one graph.

## User-visible editing

- Drag empty property-lane space to select key centres inside a rectangle.
  Shift/Ctrl/Command adds to the prior selection; Alt subtracts. Escape,
  pointer cancellation or lost capture restores the prior selection. Timeline
  edges scroll during a drag. Selection itself creates no graph/history edit.
- Copy keys, choose an existing destination in **Paste to**, and paste at the
  playhead. The destination expands and its inspector opens. Property names,
  values, relative timing, easing and curves survive; pasted keys have fresh
  identities. **Original layers** retains the earlier mixed-owner paste mode.
- Cross-layer paste requires one source owner and compatible destination
  properties/value bounds. Destination locks, missing targets, programme-range
  overflow and timing collisions reject the whole operation. Copying a locked
  source into an unlocked destination is allowed. Conflicts now appear beside
  the keyframe controls instead of relying on a separate inspector message.
- Paste uses the existing half-output-frame authoring tolerance. A frame-snapped
  playhead cannot silently create an almost coincident key beside an authored
  subframe key. Existing keys are not overwritten.

## Actual Studio edit

Project **Property animation — marquee and layer paste · r3**:
`viral-project-e09695ba-cd91-40d2-a995-2d4d1a17b3f9`.
Canonical SHA-256:
`c90fa3d8204013fea0ec640c1ac3cd42fc7d5c058490943e3090dd806ad19587`.

This is a normal duplicate of the retained real-footage project, with 11 source
shots, 14 graphic layers, 166 property keys and the existing music/SFX. The
template definition is unchanged. No graph, identity, API or worker response was
injected. The actual authenticated browser stayed headless and muted.

The native run box-selects four scale/opacity keys on `feature-one-line-1`,
subtracts and adds two, cancels a replacement selection and confirms that
selection leaves the saved document hash unchanged. It scales timing by 1.25,
applies Ease out, copies, verifies a rejected collision leaves the graph
unchanged, clears four destination keys and pastes onto `feature-one-line-2`.
All four values/curves/interpolations/relative times retain their meaning with
new owners/identities. Undo/redo restores the exact decisions; a real destination
track lock disables paste. Save/cold reopen retains the complete canonical hash.
The selected scale values are equal (1.12); this run proves their authoring
timing/ownership, while opacity supplies the visible animation change.
An additional native rectangle scrolls 129 pixels into lower rows and Escape
restores all four selected keys. The first edge observer started from a clipped
row in the collapsed dock; the retained retry uses the normal timeline resize
control and verifies its pointer begins inside a visible property lane.

- [40.48-second actual editing session](proof/editing-in-studio.mp4)
- [Marquee across property rows](proof/marquee-across-properties.png)
- [Editable layer animation in Studio](proof/layer-animation-studio.png)
- [Native edit/history/reopen receipt](proof/native-marquee-edit.json)
- [Full finished playback beside the editable timeline](proof/animation/edited-in-studio.mp4)
- [Separate final movie](proof/animation/final.mp4)

## Validation and retained limits

35 focused frontend cases and the strict ordinary App build pass. These cover
multi-row/add/subtract/cancel gestures, destination expansion and lock policy,
cross-layer identities/curves, incompatible crop/value bounds/multiple owners,
timing collisions and the prior selection/batch behaviors. Native selection,
paste/history/lock and exact cold reopen pass on the final build. Worker code
and interpolation algorithms are unchanged.

One native CPU export completes in **239.067 seconds**, with no resubmission.
The downloaded movie fully decodes: 20 seconds, 1280×720, 24fps, all 480 H.264
pictures, stereo 48kHz AAC. SHA-256:
`f1fecb87d9d665250f0a228c6ea5215baba7bbfd050c54b757ba09d7cfcc1ba3`.
Its saved canonical hash remains the exact cold-reopened hash above. All eight
edited source/destination property tuples reach the actual native composition
plan, including retained curve data. This verifies decision transport through
the shared compiler; it does not qualify whole-picture pixel agreement.

The complete native export/playback/decode receipts are in `proof/animation/`;
the full native movie reaches its ended state at 20 seconds. The recording
shows source, graphics, music and sound lanes at the opening/ending and the
destination property rows during the changed title animation. Graph identity
stays exact throughout. The 390 captured pictures average 19.30fps for a 24fps
movie. The checkpoint records their measured result and hashes. The full-playback recording uses
the exact completed movie soundtrack at the observed playback offset while the
browser remains muted. Capture cadence does not qualify playback smoothness or
human listening.

Earlier attempts remain in `proof/attempt-1/` and `proof/attempt-2/`: the first
exposed near-frame paste collisions; the second exposed error feedback hidden
outside the active workspace. Both product defects are repaired. Their
intermediate projects/recordings remain available and are excluded from the
delivered project/movie identity. Regenerable HTTP caches and a superseded local
App build were cleared for bounded media space; source assets, authentication,
IndexedDB, project snapshots and delivered films were retained.

Native coverage here is two ordinary text-property channels. Component coverage
checks group/media property compatibility and mixed locks. Cross-project/OS
clipboard interchange, freehand lasso, spatial interpolation, velocity handles,
broader media/retiming, continuous/full raster and live whole-sound agreement
remain unqualified. Existing S02 colour/ellipse/source-feature and audio
differences remain recorded; S03 source-occurrence/group ownership remains open.
No preview/final acceptance threshold, capability readiness or creative/public status is
promoted. No paid GPU/model job, deployment or main merge was performed.

Owned local QA API, App and CPU worker are stopped. Other tracks remain untouched.

Next: S04 temporal velocity/influence and spatial path editing using the same
canonical key/curve evaluation, with S02/S03 limits retained.
