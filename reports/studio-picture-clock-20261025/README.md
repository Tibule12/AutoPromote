# Decoded picture clock for Studio effects

25 October 2026. Local shared Studio repair. No merge, production deployment,
paid model/GPU job, publishing or new export. Prior films, projects, sources,
failed attempts, login, CPU worker and concurrent background work are preserved.

Studio painted decoded video pictures but evaluated some effects on continuous
`video.currentTime` or the slower React playhead. These are different clocks.
The baseline observes 76 real programme-canvas draws during the first audio
window: the continuous clock differs from the latest decoded picture timestamp
in all 76, with 51 beyond half a 24 fps source frame and a maximum difference
of 217.414 ms. This measures the clock discrepancy; it is not a claim that every
pixel or subject effect was incorrect by that amount.

The existing native frame subscription now retains the decoded `mediaTime`,
bound to that video element and source. Seek/load/play invalidates the receipt;
a late callback cannot repaint a reused source slot. Paused exact-frame/scrub
behavior and display/audio clocks remain separate and unchanged. Ordinary
inspector repaint retains the latest real picture rather than resampling its
clock from UI state. Unsupported browsers retain their existing native fallback.

The main-video canvas evaluates motion position/scale/rotation/opacity, crop,
finish-key curves/zoom, timed adjustment grades and join fades from that sampled
picture time. It uses the existing canonical evaluators and render decisions;
no second edit engine or new persisted project fields are introduced. A small
transient canvas receipt supports diagnostics without changing the project.

## Evidence

The focused production-editor regression restores an ordinary saved project
before playback, then deliberately separates source `currentTime` 2.02 from
decoded frame 2.175. Rotation, scale, transition opacity and the programme time
follow that decoded frame. The initial test had observed the pre-restore project
and also shared a canvas context with unrelated canvases; those failed fixtures
are retained with the corrected restore/context isolation. Native helper
regressions fail before the change and pass afterwards. Forty-eight focused
source-frame/playhead/finish cases pass in each worktree. Broader editor cases
are recorded separately, not added as independent duplicate coverage.

The signed-in native check restores the exact prior mixed-speech/music/SFX
backup and its same owned terminal export receipt. It plays Live Edit under an
actual 120 ms main-thread stall and cold-reopens an unchanged canonical graph.
Saved login bytes remain identical and new render requests remain zero. All
99 observed main-canvas draws use the decoded native timestamp exactly within
the fixed 0.000001 s diagnostic allowance. Baseline and after observations,
actual Studio playback recordings and all failed runs remain private in `proof/`.

The same capture retains one continuous music start and one prepared speech
start. Both native music and combined PCM pass the unchanged 0.00004 absolute
allowance against byte-hash-bound sources and the actual existing CPU export
decisions, with no fitted phase or per-cut alignment. The completed native
three-second/72-frame final is reused unchanged, SHA256
`2815b88185195ff572a8eeeb80c810c1dc851b9ab5babb872f3a8902562ae9b6`.
Its original authoring/full matching playback and separate final remain in the
prior mixed-audio evidence. No new film is submitted to prove a clock repair.

Both strict builds pass. The model branch has older motion-preview naming;
its scoped patch keeps its original `motionKeyframes` contract rather than
introducing the other branch's path-preview state. Initial import-context and
strict-build failures remain alongside the corrected builds. Unrelated source
and background-work changes are retained.

## Qualification limits

This qualifies native picture-clock consumption and the bounded main-canvas
behavior above. It does not establish pixel-perfect preview/export colour,
edge or low-alpha parity; complete audiovisual presentation/lip synchronization;
every overlay, hook, subject/alternate-camera decoder; initial PCM head; long
media, original/extracted/B-roll/remixed/fallback mixing; browser load/latency or
human listening. The verified continuous mix uses muted original sound, prepared
speech and decoded/synthesized cues. Existing S02/S04/S03 gates remain. Formal
readiness stays 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO /
0 PRODUCTION-ready. No creative or public-showcase approval is implied.

Primary private proof directory:
`AutoPromote-frontend-production-20261022/reports/studio-picture-clock-20261025/proof/`.
The model worktree retains its own build/test logs. Private source URLs, login
credentials and diagnostic speech are excluded from public documentation.

## Installed local playback

The checked App is installed after the anonymous page matches at four viewports,
three real signed-in help responses and Studio entry pass, and source membership
and hashes match the candidate. The previous App and old hashed assets remain;
changed files replace atomically with the index last. No API/CPU-worker reload
is needed. Eight targeted editor regressions pass, including paused scrubbing,
retimed music, prepared sources and the new sampled main-picture transform.

The installed localhost App passes exact backup and same-owned-receipt recovery,
then complete real Live Edit playback with the canonical graph unchanged. All
101 observed canvas draws use their decoded frame timestamps with zero mismatches.
One music start and one prepared speech start remain continuous through the
120 ms main-thread stall. Both PCM buses pass over 283,854 scalar comparisons at
the unchanged 0.00004 allowance: music maximum 0.00000042095780, mixed maximum
0.00003507733345. Observation begins at output 43.188 ms; initial coverage and
full audiovisual/pixel parity remain separate gates. New movie requests stay zero.

The installed all-in-one run retains a failed cold-reload step: the page returned
to the anonymous welcome page and its Studio-entry wait expired. No browser
exception or new render was recorded, and the exact graph was already saved
before the reload. This attempt is retained separately from the candidate's
passing cold recovery and from a fresh installed recovery check. Its cause is
not established by the screenshot; it is not counted as a successful cold run.

The separate fresh installed run passes the ordinary backup, owned same-job
receipt, Save, cold reload and exact canonical recovery with unchanged login and
zero new render requests. All 11 observed Firebase token-refresh responses return
200 in that run. The original failed cold attempt remains; no sign-in bypass,
Auth code change or removal of project records is used to qualify recovery.
The installed public/help/workspace entry check also passes independently.
