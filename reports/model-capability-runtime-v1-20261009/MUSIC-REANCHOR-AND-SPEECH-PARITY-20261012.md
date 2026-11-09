# Native music continuity and speech parity — 12 October

The same saved retimed voice project now plays through all twelve native cuts
with one uninterrupted music start, one voiceover start and zero observed waiting
events. The final measured replay takes **19.392s**. All eight
editable timeline lanes, including the complete SFX row, are visible through the
existing resize control. No new final render or model/GPU job was started.

Project `viral-project-20b5632f-612c-45c1-8e6e-d1168f88f027`, canonical SHA256
`ef909a80a8c839436b8c41bf4eb13c17ae607b5eebd37ef1dac60f63d451c6ea` remains unchanged before/after every capture.
Existing corrected export SHA256 `d0092296f8600a67c330da609535fb1459ef52206e4c8669992ab6d3c189ad24` is retained;
preview repairs do not change that final render's decisions or bytes.

- [Existing complete edited film in Studio beside its timeline](proof/launch-template/voiceover-ducking-20261012/native-retimed-unit-speed-rerender/voiceover/edited-in-studio.mp4)
- [New fully visible eight-lane timeline](proof/launch-template/voiceover-ducking-20261012/music-reanchor-speech-thread-r3/timeline.png)
- [Actual native replay receipt](proof/launch-template/voiceover-ducking-20261012/music-reanchor-speech-thread-r3/native-preview-mix.json)
- [Before/after exact editable documents and projects](proof/launch-template/voiceover-ducking-20261012/music-reanchor-speech-thread-r3)
- [Measured source/mix/codec comparison](proof/launch-template/voiceover-ducking-20261012/music-reanchor-speech-audit-r3/audio-stage-audit.json)
- [Checkpoint and retained fail/pass logs](proof/launch-template/music-reanchor-checks-20261012)

## Repairs and evidence

The earlier prepared speech-mode replay had two music starts. Its late restart
occurred after accumulated picture delay exceeded the unchanged80ms audio resync
limit. A trim between decoded frames was not armed until a later frame crossed
its boundary. A meaningful preceding-frame/source-clock regression fails before
repair and passes afterward. The same boundary watcher now arms the deadline
near the trim and still waits for actual media time, with pause/seek/source/
cancellation guards intact. It does not shorten the clip on a queued future
picture frame or widen the music drift tolerance.

The first native replay after this change takes19.392s, keeps one music/voice
start and has zero waits. Twelve observed outgoing cut clocks overshoot their
trims by at most3.708ms. This establishes scoped warm playback improvement;
it does not qualify cold preparation or complete mapped picture conformance.

The actual audio comparison then reproduced speech-mode music fades using
programme seconds and the unretimed duration after a speed ramp. A production
component test at2x fails before repair: expected tail gain0.05, observed0.2392.
The fade now uses the running music sample position and canonical output duration.
Smoothing applies to speech attenuation alone, preserving immediate fader/zero
changes. The second actual replay has one music start/no waits and improves the
19s tail, but its frame-driven fade still measures4.202% relative RMS error.
That intermediate result remains retained.

Music fade/volume and speech attenuation now have independent gain stages.
Ordinary fades retain their existing audio-thread scheduling while speech
analysis updates its own stage. The observer taps the actual terminal output,
including ducking, without replacing/seeking/muting the product's audio route.
Final native replay: one music start, one voice start, zero waits, twelve observed
cuts and maximum cut overshoot6.044ms.
The19s music-only PCM window has correlation0.999993793, level ratio
1.001370, relative RMS error0.378% and
zero sample-phase residual. This is one bounded tail measurement, not complete
sound qualification.

The28 helper cases and5 focused production Studio cases pass, including both
speech/off retimed-fade cases, prepared cuts and real Pause consumers. Strict
optimized local App build passes.118 other component cases were skipped; the
full Studio suite was not run. Original failed assertions/logs remain retained.

## Exact remaining sound differences

The diagnostic now supports the actual renderer's speech sidechain. It uses
owned hash-verified sources, stereo48k s16 materialization, the existing
`write_sound_mix`/automation/delivery helpers, and the worker's post-trim/fade/
retime/automation voice bus. Muted source video and SFX do not become speech.
The renderer's compressor is threshold0.025, ratio7.60, attack18ms/release280ms
for this strength0.4 edit. Voice owner/generation/bytes and canonical/output
hashes are checked against the retained real delivery evidence. Diagnostic WAVs
are labelled references, not AutoPromote exports or public examples.

The fourteen paired windows still show a minimum whole-mix raw PCM correlation
of0.376123 during the speed ramp. Native
pitch-preserving speech and segmented FFmpeg atempo have different processing;
this raw waveform metric alone does not establish intelligibility or creative
quality. Representative later voice-dominant windows also retain a timing
residual of about30ms. A speech/onset/pitch/listening qualification is still needed.
The preview's FFT-driven attenuation differs from the worker's compressor:
minimum music-only correlation0.857442;
maximum measured level ratio1.681525.
These are recorded mismatches, not passes. AAC differences are separately measured
against the actual export and diagnostic encoding.

## Files and continuation

Implementation: `studioSourcePreview.js`, `ViralClipStudio.js`, their helper/
production tests, `cycling-audio-proof.js`, `audit-native-audio-stages.py`.
Required readiness/combination/parity records and this checkpoint are updated.
Saved authentication, original media/projects and all earlier films/failures are
preserved. Browser QA stayed headless/muted; only local CPU resources were used.
No paid GPU, production deployment, main merge or creative/public promotion.

S02: align retimed speech timing/pitch semantics and music speech-ducking DSP; human listening remains unqualified. Continue bounded mapped picture/raster/matte/grade/effect order and paused sampling after retime, cold source preparation and anamorphic handling. Then S03 global order/nesting and S04/3D; ordinary-account runtime/billing/security/durability and creative/public qualification remain open.

Readiness remains2 UNIMPLEMENTED /1 BROKEN /9 PARTIAL /17 FUNCTIONAL /0 PRO-READY
/0 PRODUCTION-READY. Human full moving-film/sound review remains unqualified.
