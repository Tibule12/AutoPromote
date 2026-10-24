# Native preview gain and dialogue overlaps

24 October 2026. Shared Studio continuation for complex timeline behavior and
preview/sound accuracy. The owner explicitly stopped the pending release; no
main merge, production deployment, publishing or paid execution is included.

## Changes

The 0–200% gain control could assign values above one to HTML media volume,
which only accepts 0–1. Native source, extracted background, B-roll, fallback
music and fallback SFX now use the existing per-element audio graph for boosts.
A separate gain node follows remix processing, so changing a bus does not replace
the remix output fader. Ordinary attenuation needs no new graph. Unchanged gain
does not enqueue redundant native volume events. An unavailable browser audio
graph reports the preview's 100% limit while retaining the authored export gain.

Graph creation for metering/gain now starts with dry, neutral dynamics and no
reverb; enabling remix still applies its selected processing. Original-source
preview follows the final mixer's existing precedence: explicit original-audio
keys, otherwise the legacy master-podcast curve. The first regression reproduced
40% master automation incorrectly playing the source at 100%.

J-cut/L-cut proxy audio previously bypassed original-track gain, mute and solo,
and retained its default playback rate. It now uses the same original-source
mix decisions and source rate. Changes and seeking update paused overlaps too;
Pause/unmount stop their playback without restarting them for a fader change.

Final review also reproduced B-roll automation resetting from 140% to 70% when
opening another inspector. The media ref callback no longer overwrites the
automated mix during unrelated renders; the existing synchronization owns gain.
This additional case has component-level regression coverage. The native movie
below covers source/master and dialogue overlaps and contains no B-roll layer.
Its original build/source hashes are retained separately from the later build.

Finished-video monitoring also reapplied source gain to the already mixed movie:
the regression observed 2× after switching to the finished file, where 1× was
required. The finished view now applies monitor mute/volume only, stops dialogue
proxies and extracted/B-roll audio, and returns to authored buses in Live Edit.
Existing remix, recorded-speech, music and SFX finished-view bypasses are retained.

## Verification

- Eleven final focused frontend cases pass, covering both source/master curves,
  200% boosts, attenuation, independent remix gain, mute/solo, playback rate,
  history and seek, B-roll modes and gain surviving inspector changes, and
  finished/live monitor switching. Six frontend suites cover **167 distinct passing cases
  across the wide run and unchanged failure-isolation runs**. The wide run
  itself failed: one existing spoken-story B-roll case exceeded its 30-second
  budget, leaving 27 subsequent fixtures empty. That case passes alone in
  24.701 seconds; all 28 affected cases pass together in 272.471 seconds, with
  their original assertions and deadlines. This is not a claim of a green
  uninterrupted wide run. The earlier interrupted observation is also retained.
- **16 CPU worker cases pass**, including three actual encoded source/master
  gain examples, J/L-cut audio and existing envelope/mix checks. The new AAC
  gain comparison declares a 3% RMS allowance; it does not claim identical
  lossy samples.
- The strict optimized App build passes. Eight anonymous viewport comparisons
  retain the welcome page; three real signed-in help questions pass. The initial
  stale documentation review failure is retained, followed by reviewed knowledge
  1.0.48 and successful checks. Original saved login bytes remain unchanged.

The ordinary signed-in Studio flow exercises 200% master gain, a 150% explicit
source override, exact Undo/Redo, linked split, 0.8-second dialogue lead/trail,
proxy mute/solo, save and exact cold reopen. The actual authoring recording and
failed observer attempts remain. A normal backup continuation preserves that
same project ID and identical canonical document before rendering; these are
not independent projects combined into a fictitious lifecycle.

The native CPU final is **192 frames, 1280×720, 24 fps, eight seconds**, with
stereo 48 kHz AAC. Downloaded and owned server bytes have SHA-256
`13bd964ffd5ef831bdc1802b11d09fff9b545bf01306d216dbd763d1ad3f48d0`.
Full picture/audio decoding and complete playback with the matching editable
Studio timeline pass. Independent fresh-context restoration of the downloaded
backup recovers the exact completed canonical graph with zero render requests.

The final build independently restores that same backup and its owned export
receipt through normal controls. Finished gain is exactly 1×, monitor attenuation
is 0.25×, and Live Edit restores 1.5× source gain times 0.25× monitor volume.
Complete matching finished playback passes again without a new render or graph
change. `monitor-native/receipt.json` and its separate timeline recording retain
these observations; `final-build-provenance.json` identifies the later build.

The live browser measurement taps before/after the existing post-effects gain
without changing edit decisions. All twelve non-silent observed 1,024-sample
windows match the authored 1.5× gain, maximum absolute error
**0.000000059604645**, below the existing 0.00004 PCM allowance. This is scoped
browser gain evidence, not a whole preview/final mix or listening qualification.

Private evidence is under ignored `proof/`: the authoring recording in
`native-fourth-transport-attempt/`, final/movie/timeline/backup in `native/`,
`monitor-native/`, `native-lineage.json`, PCM observations, original failed comparisons and test
logs. Retained App builds remain separately under the task's `/tmp` directory.
The movie reuses the retained private AI-human source; there was no new model
or provider generation. There was one native CPU export and no new schedules.
Local development execution does not qualify ordinary-account charging or
production restart recovery.

## Limits and next work

The first three native observer attempts mishandled the closed More actions
menu/its summary selector. Later observers sampled a coarse UI clock near a
sequence loop and initially misidentified playback as stalled. Retained
telemetry proves the decoder reached eight seconds and looped. The corrected
observation uses the actual last decoder, the same 7.8-second end threshold and
the verified identity programme/source map; it does not lower the movie's
unchanged 192-frame requirement. The UI's coarser clock remains a separate
precision limit.

Formal counts remain **17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED /
0 PRO-READY / 0 PRODUCTION-READY**. Whole live mixed picture/processed sound,
human listening, strict typography colour/edges (the earlier 13/16 failures),
low-alpha paint, capture smoothness and CPU latency remain unqualified. Broader
motion/glyph depth and occurrence/group ownership remain separate. The selected
identity, existing projects/media, publishing receipts and daily/retention/
observation timers are preserved.

Next: continue S02 whole mixed picture/sound and decoded-frame versus UI clock
precision, then the retained colour/edge/latency work alongside S04 depth and
S03 ownership. No merge or deployment is authorized by this continuation.
