# Spatial motion handles and shared preview/export

17 October 2026. Branch `agent/studio-professional-continuation-v2`.

Studio now authors spatial cubic position routes through the existing X/Y keys.
Select a paired position interval in Motion → Transform keyframes, choose
**Curve path**, then drag or keyboard-nudge the amber handles. **Straighten path**
retains endpoints and timing. The temporal graph exposes normalized travel
velocity/influence even when one axis has equal endpoint values. Changes use
the ordinary history, track locks, save/reopen, compilation and backup path.

The arriving keys carry two relative offsets per axis (`spatialCurve`), bounded
to ±200 canvas percent. Both axes share temporal easing when edited through
these controls. Browser, image raster and FFmpeg expressions consume the same
128 travel-time samples. FFmpeg uses a balanced lookup to avoid its parser's
recursion limit and compact clock coefficients; six curved main-transform
intervals pass an actual FFmpeg argument/parser-limit regression. Existing keys without spatial handles retain their old behavior.
These are motion routes; they do not add editable vector artwork or contour morphs.

The native export exposed an unrelated clock defect: an eight-second edit
became 193 frames because speed normalization used an intermediate container's
AAC-padded duration. The worker now uses the requested source intervals on the
canonical 90 kHz clock and validates the declaration derived by the frontend.
The repaired normal Studio export is exactly **8 seconds / 192 frames**, with
48 kHz stereo AAC and a complete independent decode. The original 193-frame
movie remains at `proof/first-export/final.mp4`; its assertion was not relaxed.

## Actual native example

This is a private eight-second engineering study, not a public campaign or
the planned one-minute creative film. A grid source and image mark enter through
ordinary upload and Graphics import. Native controls author four curved routes,
change travel timing on an equal-endpoint Y interval, and reposition two titles.
Ten position keys/eight spatial channels remain editable. There is no project,
authentication, response or render injection, and no GPU/model execution.

- [Separate movie with IDE-compatible sound](proof/curved/final-review.mp4)
- [Complete movie beside the actual editable timeline](proof/curved/edited-in-studio-review.mp4)
- [Native AAC master](proof/curved/final.mp4)
- [Downloaded editable backup](proof/Spatial-path-study.autopromote.json)
- [Native editing checks](proof/native-edit.json), [render receipt](proof/curved/render-receipt.json),
  [complete playback receipt](proof/curved/studio-playback.json) and
  [independent signed-in restore](proof/fresh-restore-receipt.json)

The review copies preserve the master's encoded video packets and transcode
only audio to MP3 for the IDE. Original AAC masters remain separate. The Studio
recording retains the observed screen cadence (22.09 captured fps for a 24 fps
movie) and muxes the exact exported soundtrack at the observed playback offset;
the QA browser is muted. Capture cadence does not qualify playback smoothness
or human listening.

## Verification and limits

Native curve/handle Undo/Redo, Escape cancellation, track locking, coordinated
travel timing and exact cold reopen pass. A separate real-auth Studio restores
the exact downloaded project and ten position keys without rendering or publishing.
Scoped frontend regression: **119 tests / 11 suites**. Worker regression:
**169 tests plus 19 subtests**, including actual FFmpeg expression/raster checks.
Server/browser command replay and project-binding regression: **9 tests / 2 suites**.
Strict normal App build and generated replay-kernel check pass.

Six paused geometry pairs pass the existing ≥0.95 IoU / ≤2 native-pixel p95
boundary checks: minimum IoU **0.982869**, maximum boundary p95 **1 pixel**,
without fitted alignment or timing. Exact comparison and the continuity checkpoint
are recorded with the same project/output identities in `checkpoint.json` and
`proof/spatial-parity.json`. Early black/stale captures and observer failures are
retained; they cannot qualify agreement.

GUI handles require neighboring paired X/Y endpoints. Independent channels keep
their existing semantics. Changing or inserting individual keys does not split
the old cubic analytically. Travel is normalized path progress, not constant
physical distance or arc-length speed. Group-field compilation/worker checks
are covered, but native animated-parent/group authoring, broader retiming,
continuous picture/raster/sound, speech-cut precision and production latency
are separate remaining qualifications. No creative approval, public scheduling,
deployment, main merge or readiness promotion is claimed.

Continue shared S04 motion/vector depth and S02 speech/cut/preview precision,
then S03 occurrence/group ownership. Normal-account self-hosted generation and
the polished one-minute demonstration remain distinct work, using this same engine.

Storage follow-up: redundant diagnostic project/document JSON snapshots are retained byte-exact as `.gz` archives; original native backups, movies, source media and measured results remain. The lossless archive ledger is [here](../studio-creator-film-20261018/diagnostic-snapshot-archives.json).
