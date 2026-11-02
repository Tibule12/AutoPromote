# Linked timeline and preview sound precision — 21 October 2026

Owner scope: complex timeline behaviour and preview picture/sound accuracy.
This work extends the existing Studio graph, commands, compiler, preview and
final mixer. It introduces no alternate editor or renderer.

## Repairs

- Source trims, script cuts and silence removal now share one linked edit
  transaction. Nested visibility gates ripple with their children. Surviving
  layer pieces retain their group, mask, blend settings and adjacent paint
  order; empty groups and deleted targets are removed from that projection.
- Ordinary overlay splits use the same ownership/animation rules. The second
  piece retains its source phase, group and stack position. Both pieces retain
  independently editable animation keys instead of leaving the continuation
  static or outside its original group.
- Retained animation and audio-volume curves preserve their values across a
  removed interval. Linear, Hold, cubic easing, custom Bézier and the existing
  sampled spatial path use ordinary editable keys. A programme join is an
  explicit discontinuity on the existing 90 kHz clock. Overshoot turning points
  are retained as additional Bézier segments. Continuation identity allocation
  is independent of legacy intake order versus canonical paint order.
- Discrete framing/speaker selectors retain their right-edge state without
  acquiring a camera interpolation flag that disappeared on history restore.
- Voice preview and music preview now multiply overlapping attack/release
  fades as the final FFmpeg chain does. Music also uses the final mixer's
  duration/five-second fade limits. Synthesized SFX retain their distinct
  minimum-envelope behaviour. The native speech fallback and prepared mono
  speech buffer share the corrected envelope.
- Repeated image occurrences reuse the first successful download within their
  render request. Splits no longer issue redundant reads of the identical
  signed source. The cache never crosses a job/project/owner boundary; failed
  partial reads remain uncached and bounded transport retries are retained.

## Evidence and boundaries

`signal-proof.cjs` evaluates the actual frontend modules and passes their
compiled graph to `signal-proof.py`, which uses the actual final worker helpers
and FFmpeg PCM. This is CPU engineering evidence, distinct from authenticated
Studio evidence:

- 148 retained layer-pose observations match the final worker exactly; seven
  parent-group opacity observations also match.
- Three speech and two music cases compare every PCM sample, including zero
  fades, overlapping fades, source trim and fades longer than the take. Maximum
  observed sample error is 3.73e-9, below the preselected 4e-5 tolerance.
- 241 gain observations use the compiled variable-speed output map after a
  source trim. Maximum gain error is 0.000375, below the preselected 0.006
  tolerance for FFmpeg's existing small audio blocks/curve sampling.
- The fixture uses repeated occurrences of the same source while retaining
  distinct occurrence identities, nested masks and canonical cold projection.

Native browser results, build checks and test totals are recorded in the final
session checkpoint. All browser work is headless and muted, on a separate local
App using the existing authenticated API. Private native graphs, recordings,
source media, local builds and raw signal artifacts remain ignored by Git.

The final focused run passes 126 frontend cases in twelve suites. Thirty-six
server cases pass, including the actual CPU speech-preview service and the
shared Director replay kernel. Twenty-three worker tests pass, including a real
two-occurrence render whose second download is deliberately unavailable: both
placements render correctly after a single image fetch. Fifteen selected Studio
component cases pass across focused runs; the two initial failures during the
concurrent build/load remain recorded and both pass in their isolated recheck.
Strict App build, generated replay check and five-authority validation pass.

The real signed-in native flow passes leading trim, source split, a middle trim,
28 grouped layers, 224 motion keys, exact Undo/Redo decisions and exact cold
reopen. The source backup is retained. Eight anonymous viewport comparisons and
three authenticated help questions retain the current welcome content, with no
browser errors.

The first native run exposed the framing flag Redo mismatch; its original
checkpoints and failure remain in `first-native-attempt/`. A second observer
retained the previously active graphic after Redo and split that graphic instead
of the source; it remains in `second-native-attempt/`. The corrected observer
explicitly selects the source before splitting. Inspection of that normal
graphic split also exposed the ownership/animation defect repaired above.
The first native export stops on a redundant second read of an already-used
image URL. Its failed terminal job, project, request, frames and recording remain
in `first-native-delivery/`. The source binding itself is unchanged and correct;
the request-local image reuse repair addresses the extra read. A fresh attempt
is made only after the first job is confirmed failed and worker tests pass.
The second terminal export encounters first-image Storage/TLS disconnects and
an API acknowledgement timeout. Its duplicate POST observations and final worker
failure are retained in `second-native-delivery/`; two intervening session-entry
failures start no job. Later Node and three independent Python download probes
succeed. A fresh normal Studio export is then accepted once and completes in
141.448 seconds. `native/delivery-receipt.json` binds its exact downloaded movie
hash, 144 frames, independent exact restore, full H.264/AAC decode, complete
matching Studio playback and native backup. This is a six-second engineering
regression, not a newly approved creative film or listening review.

All four fixed geometry/visibility pairs pass the existing IoU≥0.95 and
boundary-p95≤2px limits: minimum IoU0.96945, maximum boundary1px. The hidden tail
at5.5s is blank in both. The original3.5s capture includes the editor's selected
layer toolbar; its failed measurement and raw images remain in
`native/initial-pairs/`. The fresh observer dismisses selection through ordinary
canvas/Escape interaction, asserts no visible overlay controls and the exact
unchanged project hash, and captures all four times again. It starts zero jobs
and compares the same retained movie, without image masks, alignment fitting or
changed thresholds. See `native/geometry-receipt.json`, `pair-recheck.cjs` and
`pair-recheck.log`.

An early server command named two nonexistent test paths; its failure was
followed by the actual five server suites. No tests were skipped or weakened to
qualify a failure.

The first entry-point probe used the helper's default historical evidence
directory; the subsequent probe explicitly uses this session's `entry-check/`.
Neither probe changes application/project/publishing state.

## Remaining shared work

These repairs do not qualify whole-picture raster parity, all nested effects,
3D, arbitrary long/retimed combinations, human listening or production readiness.
The earlier typography film still has thirteen failing colour/edge comparisons
out of sixteen; those original measurements and thresholds remain unchanged.
Speed-map integration, processed source sound, audio cut/fade phase, complex
effect tracking, capture smoothness and export latency need broader paired
checks. Existing layer/group key budgets remain in force.

Formal readiness counts remain **17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN /
2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY**. Keep S02 paired picture/sound
and S03 ownership open. Preserve the selected identity, prior films/projects,
publishing receipts and daily/retention timers. No main merge, deployment,
paid GPU/provider generation, publishing or creative/readiness promotion is
included. Concurrent caption-source-language changes in the shared workspace
are preserved and are not claimed as this session's implementation.

Both temporary QA services are stopped after the successful worker job and browser playback complete. The original local preview, shared authenticated API, other workers, native projects, schedules and retention/daily timers are preserved. Changes are local; no branch push or deployment is part of this verification.
