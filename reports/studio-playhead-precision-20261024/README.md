# Studio playhead precision — 24–25 October 2026

This repair addresses the visible timeline position and the position consumed by
ordinary split/trim commands. It does not qualify all Studio editing, predictive
picture/sound parity or professional/production readiness. No main merge,
deployment, publishing, model generation or paid GPU work is performed.

## Reproduced failure and implementation

The retained signed-in build falls 0.329467 seconds behind its real decoder over
an unchanged eight-second, two-occurrence project. Its timeline marker is
0.328541 seconds behind. Both exceed the declared one-output-frame allowance
of 1/24 + 1/90000 seconds. The canonical document remains unchanged.

The existing programme decoder remains the only source clock. A small transient
clock distributes source, programme and output positions through the existing
90 kHz maps. Lightweight display sampling uses animation frames; expensive
canvas composition retains decoded-frame callbacks. Readouts and individual marker
styles update directly without rendering the editor per frame. Source identity,
trim bounds, buffering/seeking, decoder cancellation and finished-file mapping
are explicit. Clock synchronization after editor commits and canvas drawing
prevents an expensive update from restoring an older display position.

Source/overlay splits, source start/end trims and the existing at-playhead key,
framing, grade, adjustment and placement handlers sample the decoder on action.
Finished-file source commands map output time through the canonical programme map to the correct source occurrence, then return to Live Edit. Edge cursors reject instead of falling back to stale UI time. The other handler wiring is source reviewed; the bounded command regressions cover source split, both trims, repeated-source finished-file mapping at 2× and stale edge cursors. It does not qualify every inspector value,
filter, key-navigation or nested/source-ownership combination.

## Evidence and retained failures

Private, ignored `proof/` contains the ordinary signed-in backup restore,
unchanged document hashes, browser recordings, screenshots, raw timing samples,
strict builds and test logs. No auth state, signed media URL or private source
is included in this tracked report.

- Baseline: 248 native samples; position error 0.3294673333s, marker error
  0.3285412022s. No render submission or canonical change.
- First decoded-only display: 137 samples; errors 0.1458946667s / 0.1379538595s.
  Failed the same allowance; retained as `first-decoded-display-failure`.
- First React display-cadence attempt: 183 samples; errors 0.1183333333s /
  0.1280176039s. Failed; retained as `first-react-display-cadence-failure`.
- First direct display attempt: 224 samples; errors 0.0900193333s /
  0.0853991031s. Failed; retained as `first-direct-display-failure`.
- The first helper run used an incorrect test import. The failed log remains;
  correcting that fixture does not count as a product repair.

- Post-commit attempt: 215 samples; position error 0.0433336667s and marker
  error 0.0331895022s. The slider's frame-sized native step adds rounding error;
  the failed run remains `first-postcommit-range-rounding-failure`.
- Continuous-range attempt: 204 samples; errors 0.0426663333s / 0.0427297115s.
  The same strict gate still fails; retained as `first-continuous-range-frame-limit-failure`.
- Three finished-file command regressions first fail against the earlier
  implementation, then pass after output/programme/source occurrence mapping.
- An edge-cursor test incorrectly rejected a legitimate 10ms end trim. The
  retained failure is corrected to test the exact end boundary; product trim
  limits are unchanged.

The lightweight clock also refreshes once after a display turn; cancellation on
buffering, seeking, pause and disposal covers that pending callback. The output
slider displays continuous time while arrow keys retain the authored frame step.

Final post-commit browser qualification and the local installation receipt are
recorded below. No failed run is promoted by changing
its tolerance or dropping its large errors.

## Existing delivery and remaining qualification

The real project and 192-frame CPU final are retained in
[the source-audio clock evidence](../studio-source-audio-clock-20261024/README.md).
This UI repair reuses that exact project/movie; it starts no extra final render.
Playing a finished file is a recovery/display check and is not pre-final parity.

Still open: whole processed sound and picture comparisons/listening; retained
13/16 typography colour/edge failures; low-alpha masks, broader retimed and nested
media combinations, source-occurrence/group ownership, inspector/filter refresh
and playback/capture latency; S04 motion/glyph depth. The formal capability
counts remain 17 FUNCTIONAL, 9 PARTIAL, 1 BROKEN, 2 UNIMPLEMENTED and zero
PRO-READY/PRODUCTION-READY. A source review, unit test or successful build does
not verify a normal customer flow or an unrun completion gate.

## Final bounded verification

85 distinct focused frontend cases pass across the final helper/timeline and
editor runs:39 helper cases,34 timeline cases and12 editor cases. These counts
overlap earlier attempts; they are not added again. The model-runtime branch's
17-case focused run passes separately. Both strict App builds pass. The original
three finished-file regressions fail before the repair and six applied-command
checks pass afterward, including retained windows in the untouched occurrence.
No entire Studio suite is claimed.

Latest native live playback: 215 samples, maximum position error 0.023966333s and marker error 0.024008900s. Finished playback: 350 samples, errors 0.032733000s / 0.032723582s. Unchanged allowance 0.041677778s. The latest paired native run passes the unchanged one-frame bound; retained failures keep broader latency qualification open.

Normal export-receipt recovery, complete original-film playback, a finished-file
split into the correct first occurrence while the live selection remains on the
last occurrence, exact Undo/Redo decisions and exact cold recovery after Undo
pass. The eight-second canonical graph is unchanged by playback; the temporary
split is undone. Independent original backup restore is exact. No new render,
publishing request or saved-login change occurs. This is native1× authoring;
finished-file2× repeated-source mapping is an applied-command/component check,
not a claimed native rendered2× lifecycle.

An inherited marker variable invalidated the timeline subtree. The final helper
writes only absolute marker positions, including newly opened rows, without
inherited style propagation or editor renders per frame. Browser metrics for
the same source playback are retained below; these bounded runs are not a broad
performance qualification.

| Metric | Inherited marker | Direct markers |
| --- | ---: | ---: |
| TaskDuration | 7.890709 | 7.227326 |
| ScriptDuration | 4.855984 | 4.820735 |
| RecalcStyleDuration | 1.693750 | 0.956638 |
| LayoutDuration | 0.374187 | 0.381541 |
| RecalcStyleCount | 1916.000000 | 2080.000000 |
| LayoutCount | 477.000000 | 519.000000 |

Earlier post-turn runs retain a0.053592s primary live marker failure and model finished-file failures up to0.373396s /0.299459s. A later passing bounded run does not erase those latency failures or qualify arbitrary load. The initial export-view observer also omitted the separate export receipt; normal receipt recovery corrects that observer without a new job.

## Documentation and local installation

The five Studio authorities keep the formal counts unchanged and distinguish
applied-command/component checks, actual native authoring and unrun whole-system
gates. Public Timeline guidance and generated docs are reviewed and rebuilt;
17 knowledge tests pass. The existing12-entry source-evidence bound is retained
by consolidating redundant UI-wrapper pointers; the original native group and
selection evidence remains. Ten inherited adjacent documentation warnings stay
explicit. Strict catalogue loading, generated-document checks and both Studio
contract validators pass.

The production-worktree welcome-entry verifier passes eight desktop/phone checks
and its existing film/docs navigation. The model App separately preserves its
current anonymous page at four viewports, answers three real signed-in help
questions and opens normal Studio. Its source-bound candidate is installed into
the existing local App only after those checks.118 files are replaced atomically
with index last; the prior build and old hashed assets remain. Served index
SHA256 `051fea846e69999cd043babd2b96c36139ea5151149f7b2b089904bba6d9d007`
and `/api/health`200 pass. API origin remains `http://localhost:5119`; the App
process is not restarted. Saved private login is unchanged. Changes remain local;
no main merge or production deployment occurs.
