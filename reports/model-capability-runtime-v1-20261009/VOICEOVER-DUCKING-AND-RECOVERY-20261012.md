# Native voiceover, ducking and recovery — 12 October

Two separate real authenticated Studio edits now import recorded speech, edit
its trim/timing/gain, undo/redo, save, cold reopen, export on CPU, download and
play the complete finished movie beside all eight editable lanes. Four actual
CPU exports complete, including exact-project rerenders after the unit-speed
speech repair. They retain
the same cycling template `cycling_rhythm_v1@1.0.2`, thirteen cuts and seventeen
sound cues. Original projects and prior outputs remain unchanged.

| Actual edited project | Canonical SHA256 | Finished output SHA256 |
|---|---|---|
| `viral-project-b0d51923-dd74-4151-93fd-b04626f0fa10` — constant ducking | `52e8248f4a408569ef1349b59485da9b7bf88e9a36785d8b3ef2f571188b25ef` | `24849a1857233e0b41ec6b40bd03e07abc0eac5c118424eb0eac5b4fcd77ed72` |
| `viral-project-20b5632f-612c-45c1-8e6e-d1168f88f027` — speech ducking across the ramp | `ef909a80a8c839436b8c41bf4eb13c17ae607b5eebd37ef1dac60f63d451c6ea` | `71564c66fa897649edfc988b7397ed4aab1da3303c02c23f8396658ac0eac817` |

- [Constant-ducking film and its actual Studio timeline](proof/launch-template/voiceover-ducking-20261012/native-r1/voiceover/edited-in-studio.mp4)
- [Retimed speech film and its actual Studio timeline](proof/launch-template/voiceover-ducking-20261012/native-speech-retimed-r1/voiceover/edited-in-studio.mp4)
- [Constant project](proof/launch-template/voiceover-ducking-20261012/native-r1/final-reopened-project.private.json)
- [Retimed speech project](proof/launch-template/voiceover-ducking-20261012/native-speech-retimed-r1/final-reopened-project.private.json)

The corrected latest deliveries retain those exact canonical projects:

- [Corrected 1× speech film in Studio with its complete timeline](proof/launch-template/voiceover-ducking-20261012/native-unit-speed-rerender/voiceover/edited-in-studio.mp4), output SHA256 `1dcd13e44416166779d5aa65832feef532a1f37ee05df3d7800611e916d3bb86`.
- [Corrected retimed speech film in Studio with its complete timeline](proof/launch-template/voiceover-ducking-20261012/native-retimed-unit-speed-rerender/voiceover/edited-in-studio.mp4), output SHA256 `d0092296f8600a67c330da609535fb1459ef52206e4c8669992ab6d3c189ad24`.

The two corrected normal render/download windows are168.837s and170.692s. Each
uses a new owned job, independently decodes the complete film, preserves all465
decoded picture frames, changes actual sound and records full finished playback
beside the same eight editable lanes. Earlier outputs remain retained.

Both downloaded files contain all 465 frames at 720×1280/24fps: 19.375 seconds
of picture and 19.385 seconds of stereo 48kHz AAC. Every decoded picture frame
equals the retained zero-effects cycling movie; actual sound changes. The two
normal render/download windows are 177.117s and 183.877s. These include dispatch,
polling and download; they are not GPU runtime or measured CPU utilization.

Speech is the retained private podcast recording, extracted from source18–26s
into an eight-second WAV. It is not generated narration or an authored cycling
script. The first take starts2.5s, trims1.25s and plays3.25s at gain0.7. The second
starts6.5s, trims1.25s and plays5s across the existing7–9s speed ramp. This is a
private technical sound proof, not a creative promo approved for publication.
The [source derivation](proof/launch-template/voiceover-ducking-20261012/materials/podcast-speech-18-26.derivation.json)
records original/derived hashes and source range. Both recordings retain owner,
owned storage path and exact SHA256 in the same request/saved canonical revision.
Existing server ownership resolution and generation-pinned CRC32c downloads
independently verify the actual music, three imported cues and each recording.

The worker previously ignored the ducking mode and listened only to original
video audio. Constant mode now applies its actual authored reduction; speech
mode includes the trimmed/faded/retimed/automated voiceover bus. Muted speech
and SFX do not become dialogue sidechains. Existing source audio and deterministic
final rendering remain authoritative. Real CPU handler/FFmpeg fixtures fail
both new cases before repair and pass all eleven audio cases afterward.

The Sound inspector now imports an actual voice recording through its existing
take controls and exposes the ducking mode. Preview readiness retries when
speech decoding/seeking finishes; decoded picture events drive synchronization.
A real gain node supports the existing200% automation without an illegal HTML
volume. Voiceover uses the existing music/SFX audio context and programme clock;
it retains the native pitch-preserving route during speed changes. Speech
analysis observes real source/voice buses and follows the active picture decoder.
The former disconnected analyser fallback is removed.

Completed-output access clearing/recovery no longer overrides an explicit
Live Edit choice. A new explicit successful render selects its result, and
changing projects resets the monitor choice. The transient-access regression
fails before repair and passes afterward. Two early capture failures remain
retained. Their observer could skip the Live Edit click before recovery finished;
they do not establish a customer click being overridden. The script now waits
for and clicks that actual control and fails immediately if finished playback
replaces the live source during capture.

Actual constant-ducking prepared replays complete in19.371s and19.360s with one
music start, all seventeen cues and zero observed waits/capture errors. The
music-only PCM matches the worker at gain0.12 (0.2 volume ×0.6 reduction).
The initial whole bridge mix has minimum correlation0.910329 during speech.
Sharing the context removes bridge attribution, but its direct whole mix still
has minimum0.929228 and about9.6–10ms voice-relative residual while non-speech
windows match closely. Those failures remain open; they are not reclassified as
success. The subsequent programme-clock trial still fails (minimum0.888247).
Short mono recordings that stay at1× now use bounded prepared PCM scheduled
through the existing cue clock/envelope helpers. That route preserves actual
owned samples and pins its choice for each playback, so a late decode cannot
add a second audible path. Speed-changing, long and stereo speech retain the
native pitch-preserving route; their exact sample conformance remains unqualified.
AAC loss is measured separately from live timing and raw level/DC/RMS errors
remain available alongside correlation.

The decoded route first exposed another renderer defect: `atempo=1` changes
unchanged speech and shifts this take about3.1–3.5ms. The actual native buffer
starts at exactly2.5s on the music clock, so this residual belongs to rendering.
The renderer now omits tempo processing at unit rate. Exact retained mono source
samples pass a real FFmpeg regression;2× speech retains pitch/output duration.
Native PCM versus the corrected worker projection now measures0.999999 in all
three speech windows with zero observed residual; the minimum across thirteen
whole-mix windows is0.999205. Short-window alignment does not qualify the entire
soundtrack, broader SFX curves or human listening. New actual renders are retained
separately from the older files and these explicitly diagnostic references.
The [corrected actual-export audit](proof/launch-template/voiceover-ducking-20261012/audio-audit-corrected-export/audio-stage-audit.json)
binds the new output hash. The three speech-window relative RMS errors are
0.001104/0.000665/0.000407, with gain ratios1.000325/1.000293/1.000216.
The actual AAC speech correlations are0.999921/0.999724/0.999985; encoding and
human listening remain separate from pre-codec sample-phase qualification.

The speed-changing live proof reproduces a real slowdown:28.288s with twelve
observed waits. Muted original speech no longer allocates video analysis sources,
and its energy cannot duck the music. The rerun verifies zero such sources but
still takes25.269s with thirteen waits/fourteen music starts. Removing those
allocations is not a verified cure for the picture/decode stalls. That slowdown
and exact retimed speech/ducking PCM remain open.
Outgoing decoder pause/frame events are now ignored by the voice controller
after a prepared cut takes over; the meaningful transport regression passes.
The final actual replay still takes29.440s with twelve waits/thirteen music
starts, zero capture errors and zero muted-video speech sources. This is a
retained failed smoothness/parity run, not a successful performance repair.
Speech rate observations span1–1.9375× with pitch preservation enabled, but
37 of73 sampled take-window observations are paused. No further repetition
of this unchanged failing configuration qualifies it.

The actual cut-stall cause is now identified and repaired: the legacy speech
ducking condition disabled all three prepared picture decoders, including when
original-video audio was muted. Muted-source/voiceover ducking now preserves the
prepared cut path; audible original dialogue and complex camera/remix paths
retain their existing restrictions. The active decoder ref is committed before
the outgoing pause, so stale events cannot stop the current speech.
The real component regression fails the speech case before the change and
passes both off/speech cases afterward. No render or canonical edit changes are
needed for this live transport repair.

The [same actual retimed live replay after repair](proof/launch-template/voiceover-ducking-20261012/native-pcm-speech-retimed-r4-prepared-cuts/native-preview-mix.json)
completes in19.456s with zero observed waits/capture errors, one voiceover start,
two music starts and zero video speech sources. Voice rates span1–1.9375× with
pitch preservation enabled. Seven of46 take-window snapshots are paused near
the take's boundaries, versus37 of73 earlier. This is a bounded prepared replay,
not cold-loading, all-frame smoothness or exact speech-DSP qualification. One
late music reanchor and full retimed PCM remain open; all earlier failures remain.

Validation: thirteen voice/binding helper cases; five focused production Studio
regressions; thirteen real worker audio/pitch/source cases; strict local App builds and diff
checks. The full Studio suite was not run. Full movie playback is observed by
headless muted Chromium, and representative timeline/picture captures are
visually inspected. This does not claim human review of every moving frame or
fresh listening approval. Screencapture cadence does not qualify smoothness.
Each recording's temporary JPEG scratch is released after retaining the full
movie and three representative frames. Saved real authentication is preserved.

Implementation files: `ViralClipStudio.js`, `StudioVoiceoverPreview.js`,
`studioVoiceover.js`, `studioAudioSourceBindings.js` and their scoped tests;
`main_media_server.py`, `viral_motion_graphics.py` and audio/source/pitch tests;
the native voiceover proof, retained-source verifier, live-audio observer and
explicitly diagnostic audio-stage audit. The five shared continuity records
are updated and validated. No template/showroom policy expansion or frontend
layout redesign was performed.

S02 remains open: exact live voice/speech-DSP/retime/mix conformance, cold source
preparation, mapped picture/raster/matte/grade/staging and paused sampling after
retime; nonzero filter units/order and anamorphic sources. S03 global order and
actual compound/nested composition, remaining S04/After Effects controls and
nine advanced3D fields follow. Ordinary-account runtime/billing/security,
durable media/cloud conflicts, broader combinations and creative/public review
remain unqualified. All readiness counts remain unchanged. No model/GPU job,
production deployment, main merge, public insertion or hero approval occurred.

Next bounded work is the remaining retimed audio clock reanchor and exact
speech-ducking/voice PCM, then mapped pre-final picture/raster/matte/grade/staging
and paused sampling. Preserve both canonical projects, newly corrected movies,
the passing short1× PCM/prepared-cut repairs and all failed evidence. A completed
film with its timeline remains distinct from qualifying its entire live preview.
