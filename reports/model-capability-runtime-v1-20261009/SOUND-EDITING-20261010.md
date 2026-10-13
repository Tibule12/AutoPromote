# Template editing and sound — 10 October 2026

The moving source recordings are Mixkit stock footage. I authored the shot order,
source windows and cut timings in the shared launch template; AutoPromote
instantiated and rendered the edit. The coffee-maker recording also contains
its own internal cuts. The first delivery omitted the editor/timeline view.

- [Actual native timeline](proof/launch-template/sound-editing-20261010/timeline.png)
- [Actual sound inspector](proof/launch-template/sound-editing-20261010/sound-editor.png)
- [New 20-second sound revision](proof/launch-template/sound-editing-20261010/ember/final.mp4)
- [Six-effect listening reel](proof/launch-template/sound-editing-20261010/sound-samples/six-effects-preview.wav): cinematic hit 0s, airy whoosh 3s, bass punch 6s, metallic hit 9s, tape stop 12s, sparkle tail 15s.

Studio exposes fifteen synthesized presets: the previous five, four existing
renderer-supported sounds and six new sounds. Built-in cues can change sound
without losing identity, timing, gain or fades, and can be duplicated. Preview
SFX now uses the worker's deterministic PCM instead of a different random-noise/
oscillator approximation. Timeline cues restart at their waveform offset/rate
after seek, buffering or playback-rate changes. This does not qualify the entire
mix, automation, speed or preview/final audio pipeline.

The normal signed-in edit used the unchanged exact
`product_launch_cinematic_v1@1.0.0` definition, hash
`7dd1e31dbcb1fdf83b84baaa76b2e7902ada116646e1c3dab1946d9ed8e1d080`.
Eight original cue types/gains were edited through controls and two tape-stop
cues added, giving fourteen cues on twelve footage clips. Earlier films were
preserved. This is an instance edit, not a new template version.

One normal authenticated API CPU render completed in 293.189 seconds. Its
request-bound completed-job receipt retains project/template identity. Actual
output fully decodes: 1280×720, 24fps, 480 frames, 20 seconds, stereo audio.
Rendered frames were visually inspected; full 1× muted media-review playback
reached the end with 480 decoded frames. Sound listening and creative approval
remain pending. This playback is not Studio predictive-preview parity.

Delivery limits: the native completed-output panel did not qualify. The MP4 was
copied unchanged from that actual completed local worker job, not downloaded
through Studio. Native duplicate Undo/Redo checks did not decrease cue count;
an explicit history baseline was added and native requalification is pending.
Cold-reopen automation encountered page and hidden-media-rail failures; exact
recovery is not claimed. Keyboard timeline resizing also reached graphic
movement shortcuts; propagation is now stopped. Requalification must avoid
changing the edit while a render is outstanding. Earlier attempts are retained.

Validation: eleven existing CPU motion/audio tests and a new full-length
15-preset browser/worker 48kHz PCM comparison passed (tolerance 1e-7).
Focused component fixtures verified type replacement, retained timing/gain and
independent duplication. The custom-audio fixture passed when rerun alone after
a concurrent render/build timeout. Local optimized builds passed. Fixtures do
not qualify failed native gates, listening or professional creative quality.

No model inference, paid GPU allocation, production deployment, layout redesign,
Cam Combiner changes, public release or main merge. The public catalogue remains
empty. Highest shared backlog remains S02: exact-state native history/recovery/
delivery and paired picture/sound preview conformance.
