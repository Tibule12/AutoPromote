# Property timeline keyframe selection — 15 October 2026

Studio's property timeline now supports Shift/Ctrl/Command selection, dragging
selected keys together, frame nudges, copying and pasting at the playhead,
time scaling from the first selected key, batch interpolation and deletion.
Each operation edits the existing canonical motion keys in one history step.
Values, property ownership, easing curves and unaffected keys are retained.
Track locks block the entire selected edit; copy remains available. Timing
collisions are rejected instead of overwriting another key.

- [Actual 38.32-second property editing session](proof/editing-in-studio.mp4)
- [Complete Studio film with editable property timeline](proof/keyframes/edited-in-studio.mp4)
- [Separate exported movie](proof/keyframes/final.mp4)
- [Native property timeline](proof/keyframes-studio.png)
- [Exact checkpoint and remaining limits](checkpoint.json)

The signed-in native workflow duplicates the retained real 20-second footage
edit through normal controls. Two group opacity keys are Shift-selected, dragged
together with exact undo/redo, time-scaled by2, nudged one delivery frame, changed
to Ease out, copied and pasted at1.375s. Pasting creates new identities at1.375
and1.875s. Paste undo/redo, batch delete/undo, save and exact cold reopen pass.
The project retains11 editable shots,14 graphic layers, original music/SFX and
166 property keys. This is editor engineering using existing footage; no
creative-template definition, marketing or Publisher changes were made.

Clipboard paste retains its original layer/property ownership. Cross-layer or
cross-project paste, marquee/lasso selection, spatial interpolation and temporal
velocity handles remain open. Native batch evidence covers one group opacity
channel; component checks cover multi-property and mixed locked selections.
Existing render/easing coverage protects the shared renderer. This does not
qualify all curves, retiming, masks, owned3D or full picture/sound parity.

The same cycle repairs the Finish Rack's stale source-decoder clock and caches
time-dependent source opacity/crop values per row in FFmpeg. The real20s repair
export completes in244.079s within the unchanged12-minute observation budget;
all480 decoded picture frames are byte-identical to the earlier export. The
1080p motion-filter benchmark is3.28–3.37 times faster with identical decoded
RGB. See [exact repair evidence and limits](../studio-source-parity-repair-20261015/README.md).
Decoded audio differs from the earlier film; whole-mix/live sound remains
unqualified. Prior strict source-feature comparisons and colour/raster gaps
remain recorded, without relaxed thresholds or readiness promotion.

The native keyframe export completes in233.54s and passes download/full decode.
All four retimed/copied Ease out keys reach the actual render plan, and the exact
saved project plays to its native ended state beside the expanded properties.
Canonical SHA-256: `2ad4e14c5b4ee2e53d1a2fae63349e018b4c7ce31eef33ceed4b9a01d08cf929`.
Movie SHA-256: `bdace79115b63a6924275a81874432861c1555acdd1d87ef83144c2af4b4d0b0`.
Final receipts, source/recording hashes and precise limits are in the checkpoint.
The focused frontend, real FFmpeg regressions and strict normal App build are
retained. All browser work is headless and muted. Recordings retain the real UI;
finished playback carries the exact verified export soundtrack at its observed
start offset. No paid GPU/model jobs or cost; no deployment/main merge,
creative/public qualification or product-readiness promotion.

Validation:35 focused frontend cases,146 worker cases plus8 subtests and the
strict App build pass. The full component suite was not run (121 cases excluded
from the three-case editor regression selection). The initial property draft
TDZ, strict CSS lint failure and floating-point test expectation failure are
retained with their corrected runs. A separate native two-key selection proves
locked batch controls, allowed copying and restored controls after unlocking.
Both owned CPU exports complete; all owned local QA is stopped. Other tracks,
sources, projects, movies and auth are preserved.
