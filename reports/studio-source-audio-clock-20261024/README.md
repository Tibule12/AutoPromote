# Source fades and dialogue playback clock

24 October 2026. Continuation of the owner's complex timeline and preview/sound
work. This repairs the shared Studio source-audio path; the completed choir edit
and its files are preserved.

Original/master source gain previously followed React's coarse media-time
updates. J/L-cut proxy dialogue also depended on `timeupdate`, unlike the
existing decoded-frame music and SFX paths. A short fade could hold its prior
gain, and an overlap could start late or continue while the picture buffered.

Source gain and J/L dialogue now use the existing decoded audio clock, with
the current decoder, source URL, occurrence range and readiness checked before
frame-driven updates. Audio updates do not render the whole editor each frame.
Original-source keys keep precedence over the master-podcast fallback. Proxy
dialogue follows the same gain, mute/solo and playback rate. Waiting, seeking,
source removal, errors and end suspend it; playing/seek completion reanchor it.
A paused proxy resumes at the current source position and a renewed access URL
replaces its old lease. Listener cleanup cancels callbacks and pauses proxies.
Finished movies retain their already rendered mix and monitor controls.

A separate actual local-App run exposed a remaining main-thread stall: among
191 samples the frame-only version reached 0.110934 gain error, exceeding the
same 0.035467 allowance. That failed clock observation is retained. Source
gain now schedules a bounded 65-point, at-most-half-second curve on the existing
post-effects AudioParam, renewing before its reserve expires. The audio thread
continues that curve during a short editor stall. Rate changes, drift, seek,
buffering, pause and cleanup reanchor/cancel it; a curve cannot extend beyond
the current occurrence. Unsupported audio APIs retain immediate gain. No final
mixer or project decisions change. Six additional scheduler regressions pass,
alongside the seven focused editor cases. This is bounded lookahead, not a claim
that arbitrary stalls or all nonlinear/source-rate combinations are qualified.
The AudioParam scheduling/cancellation follows the
[Web Audio specification](https://www.w3.org/TR/webaudio-1.1/#AudioParam).

The final native check measures actual same-quantum pre/post source PCM in an
AudioWorklet, using a fixed source/context anchor with no fitted phase. It keeps
AudioParam property snapshots as a separate observation. During an explicit
180 ms main-thread stall, the retained frame-only build fails at **0.123664**
relative PCM error across 384 audible blocks. The scheduled build passes across
**858 audible blocks**, maximum relative error **0.034134**, against the unchanged
**0.035467** allowance. Its 276 property samples also pass, maximum **0.034150**.
This qualifies the sampled first-occurrence source gain, not complete mixed
audio, every dialogue proxy, arbitrary stalls or human listening.

Four actual anonymous viewport comparisons and three signed-in help questions
pass on the active project's candidate. Its normal backup restore and playback
retain the exact saved document, with zero new render submissions and unchanged
saved login. After these checks the local build is installed with the same API
origin, prior build and hashed assets retained, and index installed last. A page
refresh loads it. The helper and component source hashes are checked against
the qualified build. Primary checks now include 13 focused cases across the
component and scheduler suites; the model-runtime scheduled follow-up passes
nine cases in addition to its earlier eight-case run. These overlap and are
not added as distinct full-suite counts.

The patch is also integrated into the model-runtime worktree by replacing only
the affected source-mix/clock blocks and adding their verified post-effects gain
dependency. Its unrelated VFX, caption and other existing changes are preserved.
The earlier neutral graph and valid above-100% gain implementation are retained
in the production-frontend worktree and brought into this older local source.

## Checks and actual Studio flow

- Corrected normal-Play regressions: three failures before the repair. The first
  observer used direct decoder Play while the ordinary preview intent was still
  paused; that failed observer is retained separately. The corrected tests use
  the normal Play control and still fail on the original implementation.
- Production-frontend worktree: seven focused full editor cases pass, covering
  both source buses, decoded J-cut onset and waiting/seeking, gain/history,
  mute/solo/rate, and finished/live monitoring. Another 56 cases pass in five
  source-clock, timing, split-audio, linked-edit and audio-graph helper suites.
- Model-runtime backport: eight focused cases pass across two suites, with 127
  unrelated cases unselected. Both strict App builds pass. No full-suite result
  is inferred from these focused checks.

In the real signed-in Studio, a duplicate of the retained two-occurrence gain
project uses three native Sound gain keys: 20% at 0s, 180% at 2s, 20% at 7.5s,
with linear interpolation. Both 0.8s dialogue wings remain. Normal Undo/Redo
retains the same edit decisions, and cold reopen retains the actual post-Redo
document, including its journal. The first observer incorrectly compared the
pre-history journal; that failure remains and no product edit is attributed to it.

Actual source-clock observation gives **243 gain samples**, maximum gain error
**0.026600**, below the declared **0.035467** allowance: maximum authored slope
times one 24 fps picture interval plus one 48 kHz audio render quantum. This
checks frame-driven gain timing, not sample-exact whole-mix or listening parity.

One new native CPU export, normal download, independent full decode and complete
finished playback beside its editable timeline pass: **8 seconds, 192 frames,
1280×720 at 24 fps**, stereo 48 kHz AAC with exactly 384,000 decoded sample frames.
The native downloaded bytes agree with the owned output SHA-256:
`43a76dad513f6229d0caaceab4a39752ffa70f4b72a43aa56d6a727d9478d2ed`.
Independent normal backup restore is exact and submits zero additional renders.

Private evidence is under ignored `proof/native/`: actual authoring recording,
`native-gain-clock.json`, saved graphs, `receipt.json`, normal project backup,
`independent-restore.json` and `source-audio-clock/` containing the final movie,
full matching Studio recording and byte/decode receipts. Browser QA is headless
and muted. The recording soundtrack comes from the exact export at the observed
native playback offset. Its 18.70 fps capture does not qualify smoothness for the
24 fps movie. The saved login is unchanged; there are no provider/content writes.

## Remaining shared work

This does not finish whole Studio qualification. The coarse UI playhead/inspector
clock, full mixed processed sound, strict typography colour/edge and low-alpha,
broader source/retiming/occurrence combinations, latency and listening review
remain. Continue S02 on those measured cases, alongside S04 motion/glyph depth
and S03 occurrence/group ownership. Counts remain 17 FUNCTIONAL / 9 PARTIAL /
1 BROKEN / 2 UNIMPLEMENTED / zero PRO-READY and PRODUCTION-READY.

No main merge, production deployment, publishing, paid GPU or model generation.
Preserve all sources/projects/previous movies, chosen identity, published and
scheduled receipts, and daily/retention/observation timers.
