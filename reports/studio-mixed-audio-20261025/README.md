# Mixed music, speech and sound-effect precision

25 October 2026. Local Studio engineering verification; no merge, deployment,
publication, paid model or GPU job. Existing projects, source media, failed
attempts, login and other local workers are retained.

The shared CPU volume envelope previously held gain in64-sample blocks. Actual
FFmpeg stereo/unaligned-Hold tests reproduce the error before the repair. The
same bounded canonical curve now evaluates per sample, preserving channels,
length and exact Hold boundaries. Browser music projects the renderer's sampled
programme curve onto the existing output clock. Separate attack, release and
automation gains preserve overlapping fades without stopping the song on fader
edits. Transport starts use sample-frame anchors; replacement ramps and prepared
speech ducking retain the outgoing envelope until handoff.

Imported cues now project their already decoded/trimmed/faded samples with the
final mixer's linear sample mapping and play the resulting transient PCM at1×.
Their source edit and canonical controls remain intact. The music clock schedules
ready cues ahead of video callbacks. Unsupported/oversized projections retain
the existing native route; this is not a second editing engine. Prepared speech ducking retains its verified audio control-source route with
sample-bound start/offset values. A dense AudioParam curve trial was rejected
after it caused worse native startup timing; that trial is retained privately.

## Retained evidence

Private precision inputs are a30-second stereo chord bed and a quarter-second
cue; they are test inputs, not a new creative movie produced outside Studio.
Existing owned eight-second dialogue/video are reused. The normal signed-in
Studio restores its portable linked-cut backup, duplicates it, sets2× pacing,
imports music/SFX through Sound, authors20→180% music gain, overlapping2s fades,
speech-aware ducking and a cue at programme1.5s. Imported cue projection now
finishes while paused, before the shared transport starts; fader changes reuse
that PCM. Source dialogue is muted; the
two edited recorded-voice takes remain audible.

One normal CPU export completes and downloads:3s,1280×720,24fps/72frames, stereo
AAC, SHA256 `2815b88185195ff572a8eeeb80c810c1dc851b9ab5babb872f3a8902562ae9b6`.
Actual authoring, full finished playback with matching editable timeline, exact
Undo/Redo, cold reopen and independent project backup restore are retained in
`proof/native-r2/`. Media upload changes the source bindings; both pre-upload and
materialized canonical hashes are recorded. The exported movie remains immutable.
Subsequent checks restore that same owned export receipt; they submit no new film.

`proof/browser-worker-music.json` uses a real browser OfflineAudioContext and real
FFmpeg, including stereo overlapping fades, a Hold, retiming and a seek. Maximum
absolute error is0.000000111758709 against the unchanged0.00004 allowance. This
isolated DSP check is separate from the native whole-mix lifecycle.

`proof/worker-final-from-root.log`:28 tests plus77 subtests pass, covering CPU
automation, voice fade phase, voiceover and delivery clock. `proof/helpers-prepared-cues.log`:
40 focused frontend helper cases pass; `proof/component-cue.log`:5 editor cases
pass. Runs overlap earlier tests and are not summed as independent extra coverage.
The model branch's scoped predecessor run passes7 frontend cases and16 CPU cases;
later scoped updates are recorded separately. Neither full suite is claimed.

The native side tap observes original AudioContext terminal outputs without
replacing their routes or supplying playback. References independently project
the actual submitted export decisions from byte-hash-verified source files.
There is no phase search or fitted offset. Every observed transport anchor and
all failed samples remain in the comparison, including handoff/startup failures.

First whole-mix comparison fails at the retimed cue. R3 retains a broad startup
phase failure. R4 music passes both anchors; the combined mix still fails96
samples, maximum0.0000585387461 against0.00004. R5 additionally retains a late
cue attack and handoff failure. The verified prepared duck buffer itself matches
the independent CPU compressor exactly. These observations motivate the final
ready-cue lookahead and control-clock changes; they are not erased by a later
passing test. A native R3 reload timeout is also retained separately. R6 rejects the dense
parameter-curve trial: music error reaches0.03677 and voice startup trails its
anchor. The trial is removed; the verified control-source route remains.

## Remaining qualification

Whole mixed processed picture/sound and human listening remain unqualified.
Output-clock reanchors at a late picture handoff can repeat or skip a programme
interval; comparing each declared anchor does not qualify continuous transport.
Other source rates/formats, B-roll/original-audio mixing, overlapping cue clipping,
long jobs, edited SFX bus curves, browser fallback routes, picture colour/edge,
low alpha, playback load/latency, S04 motion depth and S03 occurrence/group
ownership retain their existing gates. Formal readiness counts remain17
FUNCTIONAL/9 PARTIAL/1 BROKEN/2 UNIMPLEMENTED/0 PRO/0 PRODUCTION-ready. Technical
verification is separate from creative approval. No new public example is selected.

R7 (after removing the dense curve) retains a roughly10.7ms voice-start delay
and strict music errors up to0.0000423985. The subsequent paused cue preparation
removes the observed allocation from Play; its native verification is retained
separately. No failure is hidden by moving the comparison anchor or tolerance.

## Latest bounded result

Native R9 passes both observed music and combined-mix anchors at the unchanged
0.00004 absolute PCM allowance. Combined maxima are0.00003507733345 and
0.00002300739288 across300,746 scalar comparisons; music maxima are
0.00003447337076 and0.00000502495095. Voice/music starts share the same initial
anchor and the cue is scheduled well before onset. There is no fitted phase.
Exact original backup, owned same-job export receipt, unchanged canonical graph,
cold reopen and unchanged saved login pass; no new movie is submitted.

The first anchor covers output0.016354→1.680354s; the next starts at1.531229s.
That roughly149ms repeat at the late picture handoff is explicitly outside a
continuous-transport qualification. Material beyond the declared3s programme
is excluded from its PCM reference, not fitted or counted as programme audio.
Native R8's missing side-tap tail is retained; the observer now waits for a
future scheduled stop to pass the audio clock before flushing its actual data.

The model branch's older cue contract rejected the retained voice-fade fields.
Its save/restore, ripple cuts, voice preview/cache/export, source-validation and
worker mixer now retain the same envelope.35 relevant model frontend cases,
six owned-preview service cases and26 worker tests plus77 subtests pass. This
is a scoped integration; unrelated model/podcast changes remain preserved.
A model rebuild initially failed because the backport inserted an extra brace;
the corrected strict build passes. An incorrect missing test filename is retained
separately from its corrected passing run.

An additional component regression reproduces an expired music start when node
setup consumes20ms. Reading the picture/context anchor after node/graph setup
repairs it; all four music cases pass. Together with two native-cut cases this
is six distinct editor cases, not an extra full suite. Other heavy-load startup
and continuous picture/audio handoffs remain separate gates.

## Final shared-graph repair

The18-channel native diagnostic observes actual source/fader/attack/release/
automation/duck outputs without supplying playback. It identifies106 attack
ramp cancellations within the first anchor: equal timeline/key arrays had new
object identities. Semantic envelope comparison prevents those resets; the
same measurement now records one planned handoff cancellation. The regression
fails before and passes after. The stage capture also retains the original
quantum-sized gain dips and the prepared duck samples' exact CPU match.

Prepared speech now stages its existing owned PCM node before the transport
anchor, synchronizes directly with the current decoder during promotion, rejects
stale decoder events/obsolete requests, and retires the outgoing voice at the
same future handoff. Pause/waiting cancel current and retiring nodes; natural
end releases them. Gain is initialized before the first sample. Six production
voice-component/helper cases pass, including standby-decoder promotion, mute,
future stop and cancellation; forty shared helper cases remain distinct.

Final model native stage comparison PASS: music maxima0.00000030733645 /
0.00000041723251; combined mix0.00003507733345 /0.00002288818359 across298,048
scalar comparisons. Both voice starts match their corresponding music start
and sample offsets. Exact backup/cold recovery, same-job receipt and unchanged
canonical graph/login pass; no additional render. Output observation begins at
0.017520833s; the next anchor starts at1.519291667s and ends at2.991958333s.
The approximately130.229ms repeated interval, unobserved opening/tail and broader
picture/load/media/listening gates are explicit limits, not a continuous whole-
programme PCM qualification. All earlier failed model runs remain.

## Installed local verification

The checked model App is installed locally after its anonymous welcome page
matches the retained page at four viewports, three real signed-in product-help
answers succeed, and Studio entry succeeds. The previous App and every old
hashed asset remain. The established API on port 5119 and idle CPU worker on
8019 reload with their original arguments, directories and environment. No
production deployment, merge, provider generation or new export is performed.
Install/reload receipts are `proof/local-build-install.json` and
`proof/local-runtime-reload.json` in the primary evidence worktree.

The installed App restores the exact native backup and same owned export
receipt, plays the real Live Edit buses and cold-reopens the same canonical
graph. Login bytes stay unchanged; new render requests remain zero. Its strict
PCM comparison passes both observed anchors across 297,024 scalar comparisons.
Music maximum error is 0.00000041536987; combined maximum is 0.00003507733345
against the unchanged 0.00004 allowance, with no phase search. The installed
capture still repeats approximately 113.292 ms at a picture handoff. Captured
opening/tail and uninterrupted whole-programme picture/sound remain separate
qualification gates.

The read-only transport journal confirms that the next decoder is already
loaded at 2×. Correct rate/readiness alone therefore does not resolve the
handoff repeat. Next work is native boundary/play/commit timing and shared
transport continuity, retaining the PCM allowance and all prior failures.
Formal readiness and creative/listening approval are unchanged.

The native project, full authoring/finished-playback recordings, source hashes,
raw PCM, comparisons and local installation receipts are retained in the sibling
`AutoPromote-frontend-production-20261022/reports/studio-mixed-audio-20261025/proof/`
worktree. The model worktree also retains its own strict-build and scoped-test
logs; no signed-in session or private source URL is published in this report.
