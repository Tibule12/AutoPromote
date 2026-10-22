# Professional timeline workflow — 14 October 2026

The normal Studio timeline now has editable group clips. Dragging a group moves
its descendant layers and keys in one history transaction; frame-accurate In/Out
trims its visibility while retaining hidden keys and source phase. Composite
exposes the same timing fields, Fit to children and reversible group deletion.
Selecting a group focuses its property rows. Child-track locks apply to the
whole group. Nested timing and linked motion sound cues use the same canonical
graph, programme clock, preview and CPU compositor.

This delivery uses the existing real 20-second coffee footage edit, restored and
duplicated through normal signed-in Studio controls. Its template reference is
unchanged; no template definition, Publisher or marketing work was added.

- [Actual editing session: pointer move, trim, keys, history, source split and reopen](proof/editing-in-studio.mp4)
- [Complete finished movie playing in Studio with the editable timeline](proof/workflow/edited-in-studio.mp4)
- [Separate finished 20-second movie](proof/workflow/final.mp4)
- [Final full timeline and focused group properties](proof/workflow-studio.png)
- [Exact checkpoint, source hashes and qualification limits](checkpoint.json)

## Delivered native workflow

The 128.84-second actual editing recording includes a 0.5s pointer move of three
owned title layers and their keys, exact undo/redo, numeric timing, two group
opacity keys, one-frame Out trim, graphics lock, group-and-children deletion with
undo, and a real footage split with undo/redo. Save and cold reopen retain the
exact canonical document. The resulting project has 11 editable source shots,
14 graphic layers, 164 property keys, the original music and 10 sound effects.
The group gate is [0.75, 1.95833333333333) programme seconds.

Project: `viral-project-358d4e56-32ef-492a-82e3-4be2ec1fe380`.
Canonical SHA-256:
`e4217013e5887d711f34ace4e9affb5d961cbec8176a2c2a7b2fc6b6e5afb11e`.
Template: `product_launch_cinematic_v1@1.1.2`, definition
`6432bd27c16769283529278b62a4c228b5a06476b113b5ab74d852e12c0dea2d`.

One accepted local CPU job completed. Native owned recovery and download plus
independent full decode verify exactly 20s, 1280x720, 24fps/480 H.264 frames and
stereo 48kHz AAC. Movie SHA-256:
`fcbec914c6cdd34d5ece1f95eccd5e2b0e03eb19ad6f6bd70ceb478193a70942`.
The finished film then plays to its native ended state beside all populated
source, graphics, motion, B-roll, source-audio, music and SFX lanes, the group
clip and its five property rows. The playback recording carries the exact
export soundtrack at the observed 0.082s start offset; QA remained headless and
muted. Its approximately 19.47fps capture does not establish smooth playback
of the 24fps movie or human listening approval.

## Preview/final result and retained failures

Native group visibility passes all nine predeclared half-open gate samples.
Shared timing, nested movement, key/asset identity, ripple-deleted zero windows,
ancestor cue clipping and actual FFmpeg gates have bounded regression coverage.
These checks qualify group mechanics, not the whole rendered picture.

The broader real-footage comparison fails **0/9 passing pairs** at the unchanged
2-display-pixel p95/eight-match bound. Exact programme frames and fixed source
regions were declared before measurement. No fitted transform, crop, time
search or relaxed threshold was used. Most diagnostic feature matches fit close
to identity, so false descriptor matches may contribute to the reported p95;
that diagnostic is not acceptance evidence. The dim ending background also
looks different. The bounded investigation did not establish a repair. Full
source/grade/glyph/matte/continuous picture remains unqualified. See
[retained comparisons](proof/paired-workflow.json).

Canonical audio and linked-cue decisions remain unchanged in the actual edit.
Decoded PCM differs from the retained earlier film (correlation 0.998821,
relative RMS error 0.048557); that film has a different canonical hash and does
not establish a same-graph regression. Live whole-mix parity and human listening
remain open. No audio equivalence is claimed.

The original 12-minute render watcher expired while the same CPU job continued.
The first recovery observer also expired; its selector was corrected. The job
was recovered and downloaded without resubmission. Exact worker runtime is not
available in the recovered receipt; CPU export latency remains a major defect.
The initial editing failure and all watchers/comparisons are retained.

The private QA session later opened signed out. Initial recovery inspected
persistent-context storage before registering the origin and missed its copied
QA stores. The helper now registers an empty origin before reading storage;
the exact final edit was restored through normal owned-project backup checks,
and the same completed movie through normal export-receipt checks. Original
profiles, every project backup and movie remain preserved. The final authentic
session/project stores are retained privately. No fabricated identity or API
mock was used; the empty document is limited to storage initialization.

## Files and validation

`studioGroupTiming.js`, `StudioGroupTimelineClip.js` and
`StudioGroupTimingInspector.js` implement descendant timing, clip gestures and
numeric controls. `StudioProTimeline`, `StudioGroupInspector`,
`StudioGroupPreview`, `ViralClipStudio`, `studioGroups` and timeline CSS wire the
existing shared graph/history/locks/cue path. `studio_composition.py` validates
and renders the same half-open programme gate. Focused native/component/worker
checks and the retained proof helpers cover the changed behavior. The reviewed
knowledge catalogue and five continuity records document the same scope.

Final validation: 111 frontend cases, 140 compositor/motion cases plus six
subtests, 21 legacy audio/motion cases plus 255 subtests, and the strict normal
App build pass. The 17 knowledge checks, reviewed 1.0.14 generated documentation
and five-record contract validation pass; ten existing deferred help surfaces
remain warnings. The full Studio suite was not run. Owned local QA services
are stopped; other tracks and the user browser are preserved. Zero model/GPU jobs, paid
runtime or cost. No production/main merge, readiness, creative or public
promotion. Counts remain 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL /
0 PRO-READY / 0 PRODUCTION-READY.

Group split/duplicate, source-occurrence attachment/remapping, anchor and
mask/blend animation remain open. The highest-leverage continuation is the
real-footage pre-final picture and slow CPU export, followed by shared group
occurrence ownership and remaining main-timeline mechanics. S02 and the prior
ellipse raster failure stay open; S03/S04 use the same graph.
