# Studio playback opening and continuous sound

26 October 2026. Local Studio preview repair; no merge, production deployment,
paid model/GPU job, publishing or new movie render. Existing films, sources,
project backups, failed attempts, login and concurrent work are retained.

## Reproduced problem and change

An explicit Play/Resume could start the decoded music at a later native video
position, after waiting for its first decoded-frame callback. The retained real
baseline requests output zero but starts at 0.046125 seconds: 2,214 opening
samples are skipped at 48 kHz. The production-editor regression separately
requests programme 3.00 seconds and reproduces a start at 3.11 seconds.

The prepared comparison transport now pins its paused programme position before
requesting native playback. Native readiness permits the decoded music to start
at that position. The transient intent is bound to the current project, decoder,
source, selected song, seek, time map and play request. Pause clears it; late
readiness cannot resurrect sound. Actual discontinuities retain their existing
resynchronization path. No new persisted edit fields or separate editing engine
are introduced.

The existing eligible silent-picture route also handles a picture leading its
continuous sound clock. It temporarily slows that decoder, just as the earlier
transition repair accelerates a late decoder. The ordinary authored pacing and
source position remain unchanged. The existing 80 ms correction trigger and
20 ms settling band remain; correction factors range from 0.5 to 1.5 before the
ordinary media-rate limits. Original sound must be muted, with no extracted or
B-roll audio, and speech/cues must be on the supported prepared routes. This
eligibility restriction is retained.

## Native evidence

The separate headless, muted, normally signed-in Studio restores the exact prior
mixed speech/music/SFX backup and the same owned completed export receipt. It
plays the real Live Edit under an actual 120 ms main-thread delay, saves and
cold-reopens the identical canonical graph. Saved login bytes remain unchanged;
new render requests are zero. The retained three-second/72-frame CPU final is
unchanged, SHA256
`2815b88185195ff572a8eeeb80c810c1dc851b9ab5babb872f3a8902562ae9b6`.
Its original authoring and complete matching Studio playback remain in the
[earlier native delivery](../studio-mixed-audio-20261025/README.md).

The candidate starts at output sample zero with one continuous music source,
one prepared speech source and one shared anchor through the cut. Actual music
and whole mixed PCM each pass 287,808 scalar comparisons against the same
byte-hash-bound source files and actual export decisions, starting at sample
zero. Maximum errors are 0.00000041536987 for music and 0.00003507733345 for the
mixed bus, within the unchanged 0.00004 allowance. No phase fitting, per-cut
alignment, source replacement or relaxed threshold is used.

All 79 observed programme-canvas draws retain their exact native decoded frame
timestamps. This preserves the earlier picture-clock repair; it is not a claim
that every frame is displayed without delay. Native evidence is in private
`proof/native-r1/`, including full Studio recording, transport/picture journal,
PCM, exact backup/cold recovery and comparison receipts. Baseline and failed
attempts remain in the same private proof tree.

## Presentation limits and next work

The new observer records actual programme-canvas paint plus the browser's
`getOutputTimestamp()` estimate. In this candidate, 49 observations have a
median picture-minus-audio difference of -20.3935 ms and a range of -139.8072 to
+46.4787 ms. These are browser presentation diagnostics under load, not a
physical display/loudspeaker measurement or a passing full audiovisual gate.
The source frame timestamp alone does not certify presentation accuracy. The
120 ms busy main thread still holds displayed pictures, and quantized browser
frames are not the final movie's CFR presentation.

The captured continuous sound ends at output 2.998 seconds; the last 2 ms of the
three-second delivery are outside this capture. Sample-zero opening coverage is
verified, while exact terminal delivery and unrestricted full picture/sound
remain separate work. Next: measure and repair held-frame/terminal transport,
then broaden overlays/hooks/subjects, other source decoders and original,
extracted, B-roll, remixed, fallback and longer media. Retain the existing
colour/edge/low-alpha, human listening, S04 motion/vector depth and S03
occurrence/group ownership gates.

## Verification scope

Fifty-eight focused source/music/playhead helpers pass in each worktree. Both
strict App builds pass; the current anonymous page and real signed-in help and
workspace are checked separately. The primary editor regressions retain their
initial failed expectation that an unactioned leading decoder must restart
music; the corrected case distinguishes continuous drift from an actual native
seek. Older model fixtures also lacked the required initial decoded frame and
are corrected without changing the runtime's source-clock guard. Early scoped
patch/build-runner and transport-placement failures remain preserved. None are
reported as successful tests.

Formal readiness remains 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN /
2 UNIMPLEMENTED / 0 PRO / 0 PRODUCTION-ready. No creative/public-showcase or
whole-product approval follows from this repair. Product documentation retains
these limits. Private login, signed source URLs and diagnostic speech are
excluded from public documentation.

## Installed local verification

The checked model App is installed locally after four anonymous viewport
comparisons, three real signed-in help answers and normal Studio entry pass.
Prior App files and old hashed assets remain; changed files replace atomically
with the index last. The API origin and welcome-preview flag are preserved.
No API/worker reload or unrelated frontend source replacement is needed.

The installed replay independently passes ordinary backup/owned receipt/Save/
cold recovery, unchanged canonical graph and login, zero new renders and one
continuous music/prepared-speech anchor. Music and mixed PCM again pass 287,808
scalar values per bus from output sample zero at the unchanged 0.00004 limit.
All 97 observed canvas draws use exact native timestamps. Browser presentation
estimates across 67 observations have median -2.7218 ms and range -103.2955 to
+41.6028 ms; they retain the held-picture limitation rather than qualifying
complete audiovisual parity. Captured sound again ends at 2.998 seconds.
The installed public/help/workspace check also passes separately.

Eleven targeted primary editor cases pass across the retained regression runs,
including the corrected leading-picture/actual-seek cases. The model branch's
three selected editor cases pass; they overlap primary coverage. No full-suite
claim is made. Fifty-eight helpers per worktree and both strict builds pass.
The five authority files, product knowledge review/build/check and their offline
validators retain exact scope and remaining gates.
