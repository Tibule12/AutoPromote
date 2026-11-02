# Native clip-transition audio continuity

25 October 2026. The verified decoded music/recorded-speech/imported-cue mix now
keeps one continuous audio clock through native clip changes and a real 120 ms
main-thread stall. The checked local App is installed, with the previous build,
old hashed assets, API origin, UI flags, login and existing projects retained.
No main merge, production deployment, publishing, paid job or new export.

A play request can precede an advancing decoder clock. Studio now waits for the
first decoded frame before starting programme music and waits for a prepared
native play promise before committing a cut. Disabled remix retains Pacing's
rate; standby decoders receive their canonical incoming rate. Native late
pictures use brief bounded playback-rate catchup instead of replaying sound or
seeking/rebuffering. The saved pacing and canonical edit remain unchanged.
Pause cancels pending promotion and stops prepared speech directly, including
when the picture was already paused and emits no second native pause event.

## Verification

- Eight focused editor cases pass across retained runs, including delayed
  startup, prepared cuts, picture catchup/restoration, ordinary discontinuities,
  overlapping cues and later Pause. The two final catchup cases pass; counts
  overlap earlier runs and are not summed. Forty-five source/voice/audio helper
  cases pass in both worktrees; both strict frontend builds pass.
- Normal signed-in Studio restores the exact retained backup and same owned
  terminal export receipt, plays the real Live Edit buses, and cold-reopens an
  unchanged canonical graph. Login bytes stay unchanged; new render requests
  remain zero. A real 120 ms busy-main-thread interval is recorded explicitly.
- The load test has one music start, one prepared speech start and one continuous
  anchor. Music/combined PCM pass over 284,480 scalar comparisons at the unchanged
  0.00004 absolute allowance. Maximum errors are 0.00000041723251 for music and
  0.00003507733345 for the mix. No per-cut alignment or fitted phase is used.
- The installed App repeats the native load/recovery check: one continuous music
  and speech start, with both buses passing over 282,916 scalar comparisons at
  the same limits. The first observed output sample is at 52.958 ms. Original
  reference inputs and export decisions are byte-hash-bound; original routes
  remain connected and the side tap never supplies playback.
- A separate native check clicks the ordinary Pause control before an incoming
  decoder reaches playing. Both videos stay paused and zero audible BufferSource
  nodes remain active after the cancellation. The count excludes a-rate control
  signals. The graph, same-job receipt, saved login and cold recovery are retained.
- Anonymous welcome content matches the previous App at four viewports. Three
  real signed-in product-help answers and normal Studio entry pass. The prior
  App is backed up using hard links; changed files replace atomically with the
  index installed last. The established API/CPU worker need no reload this turn.

The existing three-second/72-frame CPU final remains unchanged, SHA256
`2815b88185195ff572a8eeeb80c810c1dc851b9ab5babb872f3a8902562ae9b6`.
Its separate final, complete matching Studio authoring/playback and exact history
remain at the prior mixed-audio report. New real native playback recordings,
raw PCM, stage journals, source receipts and recovery evidence remain private
in this report's primary `proof/` directory.

## Scope and remaining gates

This audio-master recovery is bounded to muted original sound, no extracted or
B-roll audio, prepared recorded speech and decoded/synthesized cues. Other mixes
retain their existing routes. Picture startup, held/dropped frames, the initial
PCM head and complete audiovisual alignment remain unqualified. General original,
B-roll, extracted/remixed/fallback/long-media mixing, human listening, picture
colour/edge/low-alpha/latency, S04 depth and S03 occurrence/group ownership retain
their gates. No creative or readiness promotion: 17 FUNCTIONAL / 9 PARTIAL /
1 BROKEN / 2 UNIMPLEMENTED / 0 PRO / 0 PRODUCTION-ready.

## Retained failures and observer correction

| Capture | Music starts | Repeated output samples | Continuity |
| --- | ---: | ---: | --- |
| baseline | 2 | 6076 | FAIL |
| native-r1 | 2 | 6068 | FAIL |
| native-r2 | 2 | 5751 | FAIL |
| native-r3 | 2 | 5036 | FAIL |
| native-r4 | 1 | 0 | PASS |
| native-r5 | 2 | 3961 | FAIL |

The baseline repeats 6,076 samples, or 126.583 ms at 48 kHz. Rate-only, muted
warmup and deferred-promotion-only trials do not remove the repeat. The R4 pass
is retained alongside the later R5 failure. R6 also catches an initial-clock
restart before the cut. R7's hard picture-seek trial passes unladen continuous
PCM but its loaded run pauses on the recovery deadline; that approach and its
deadline are removed. All original captures, aborted runners and failed tests
remain. The corrected regression uses native play completion and the actual
sample-anchor arithmetic; the PCM allowance is never changed.

The first installed diagnostic capture retains a separate observer failure:
constructing eighteen stage taps during source.start delays the real music start
past its planned timestamp (called at 7.872 for a 7.871333 start), causing broad
PCM errors despite continuous transport. Tap construction now happens at graph
connection, before the product reads its start anchor; the passing installed
capture calls both speech and music at 9.472 for a 9.482 start. Reference phases,
source buffers and tolerance stay unchanged. Both attempts and exact observer
sources are retained; the diagnostics do not qualify every scheduling/load case.

Primary private evidence:
`AutoPromote-frontend-production-20261022/reports/studio-transition-continuity-20261025/proof/`.
The model worktree retains its own build/test logs. Private credentials, signed
source links and the diagnostic speech are excluded from public documentation.
