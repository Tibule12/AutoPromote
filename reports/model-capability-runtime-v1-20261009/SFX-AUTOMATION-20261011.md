# Native Studio sound-envelope revision

The existing cycling edit now has a separate, native editable sound revision:
**VELO — SFX envelope · 20261011**. The original project and movie are preserved.
This is one sound-editing continuation, not a new creative style or public approval.

- [Watch the entire edited movie inside Studio with its full timeline](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling/edited-in-studio.mp4).
- [Exact finished movie](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling/final.mp4).
- [Source preview and editable timeline](proof/launch-template/cycling-recovery-20261011/sfx-envelope/edited-source-and-timeline.png), [full timeline](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling-timeline.png).
- [Native duplicate/control/save/cold-reopen evidence](proof/launch-template/cycling-recovery-20261011/sfx-envelope/native-edit.json), [canonical document](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling-document.json), [owned render/download receipt](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling/render-receipt.json).

## Product change and actual editing

Built-in effects previously took the SFX bus gain only when their buffer started.
The shared Studio frame clock now updates the already-playing cue's GainNode.
Its own fades remain embedded in the existing shared deterministic PCM and are
not applied twice. Ended-node cleanup checks source identity; Pause/seek/project
cleanup and delayed-resume cancellation remain authoritative.

Adding a volume key also copied the selected track/cue's base fader, then applied
that level again as a bus multiplier. A new key now preserves the current bus
envelope, defaulting to neutral100%, while leaving the base fader intact.

The normal signed-in App duplicated the original, added/edited three **linear**
SFX bus keys through Sound controls and saved/reopened the new project:
**13.5s:100%;14.25s:20%;14.5s:100%**. The long riser and overlapping Tape Stop
dip into the next impact. All thirteen footage cuts, sixteen graphics, the song
and seventeen existing cues remain ordinary editable Studio state. No footage,
music, effect purchase, model job or separate marketing engine was added.

New projectID: `viral-project-2f390d36-e219-4dfc-b697-b5f0e4bacafc`.
CanonicalSHA256: `4b3915b947758d5f4d3a4031813c3839e3b32c29911d2aa488af5392066348be`.
Template remains `cycling_rhythm_v1@1.0.2`, definitionSHA256
`efcdf13fa2055544297a1253e390e5f55c4b6c03e8d916ad7867c0661fb6772a`.

## Native sound and real output

[Actual post-fader readings](proof/launch-template/cycling-recovery-20261011/sfx-envelope/native-sfx-gain-comparison.json)
observe49 samples of the unique one-second riser: gain varies from0.1600 down
to0.03377 and back up. Largest difference from the canonical curve at the
observed source clock is0.02356; decoded-frame updates/capture sampling can lag.
This verifies active gain control, not sample/phase equality or listening approval.

One explicit native export used the existing authenticated backend, local CPU
worker, owned Storage persistence and native browser download. End-to-end
render/download took169.336s. The exact movie is720×1280,24fps,480frames,20s,
with48kHz stereo AAC; independent complete picture/audio decode passes. Output
SHA256: `8593e703d2af0e5eaf3af212b3e4d9ed68b5875fb92aa7e6ae6f60973a7a1a53`.
The downloaded bytes match the owned completed job
`viral_f4f87c85da034d4291b48567dcb567883c595d2c03eb4fd7fb4b2183aa7ffadf`.

[All480 decoded picture frames are byte-identical to the original export](proof/launch-template/cycling-recovery-20261011/sfx-envelope/picture-stream-comparison.json).
[Decoded old/new sound](proof/launch-template/cycling-recovery-20261011/sfx-envelope/export-sound-comparison.json)
is identical before13.45s and changes through the new13.5–14.5s envelope.
Later AAC residuals remain measured; this is not full predictive mix parity.

[Finished-film transport](proof/launch-template/cycling-recovery-20261011/sfx-envelope/cycling/studio-transport-observation.json)
reaches the real20-second end in20.067s from native playing, with zero waiting
events, source changes or dropped frames during play. The screen recording
shows actual Studio/timeline progression; its sound is muxed from the exact
export at the observed playback-start offset. It is not a live preview recording.
The actual movie's decoded contact sheet, native source/timeline and timeline
stills were visually inspected. Full moving-film/sound creative review remains
pending; a contact sheet does not grant it.

The local CPU worker was terminated after this job; its normal shutdown is
recorded. **One CPU render; zero GPU/model jobs; no deployment/main merge/public
release.** Existing local charging bypass remains a qualification limit.

## Failures kept and next shared work

[Separate real predictive mix](proof/launch-template/cycling-recovery-20261011/sfx-envelope/live-audio/native-preview-mix.wav)
captures25.536s to the native final source trim with zero capture errors.
A first-shot pause produces an extra music start at0.5458s after5.252s wall time.
[The unchanged bounded signal comparison](proof/launch-template/cycling-recovery-20261011/sfx-envelope/live-audio/audio-comparison.json)
fails early: original wall-clock minimum correlation0; observed-song-clock
minimum0.294, versus0.890–1.000 for the six later windows. These failures remain
visible. The earlier original-project R11 evidence is preserved separately;
it does not qualify this new run. No threshold/search window was widened.

A separate [native source run without recording](proof/launch-template/cycling-recovery-20261011/sfx-envelope/source-performance-r2/source-performance.json)
takes21.044s to the actual final trim, with1.066s preparation and481 decoded-frame
callbacks. Its two active waits recover in329ms and53ms; the first five-second
pause is not reproduced in this run. The initial harness times out while requiring
a paused decoder before clearing post-seek playback intent; that failed run is
retained and cannot diagnose a product defect. The corrected observer uses the
visible Pause control after native readiness. Buffer/clock differences remain
measured; no speculative playback patch or general smoothness claim is added.

The next S02 title slice has started using the existing real paused/export
images. [Fourteen canonical time/colour-bound green-title masks](proof/launch-template/cycling-recovery-20261011/accurate-paused-full-r2/title-colour-diagnostic.json)
give unregistered overlap0.532–0.858 and raw maximum box-edge difference9px.
This is a diagnostic, not a parity pass: colour segmentation can include source
pixels, small-font antialiasing differs, white copy/entrance alpha/live motion are
unmeasured. The first unbound diagnostic is retained and is not qualifying evidence.

Continue S02 with the initial source wait/early music mismatch, then actual
white/colour title raster, entrance/staging and mapped speed/ducking/trim pairs.
Follow with S03 global composition. Full mix/picture, creative acceptance,
normal-account model lifecycle and public showroom qualification remain open.

## Verification and files

Three focused component checks pass, including the new native-control test
for neutral key creation and gain changes on the same playing cue, plus existing
Pause-cancellation and cue-editing guards.104 component cases are skipped.
The optimized normal App build passes. Script syntax, whitespace and required
continuity validation pass, and the actual Studio screen movie fully decodes.
No whole-suite claim is made.

This block changes `frontend/src/components/ViralClipStudio.js` and its component
test; adds `cycling-sfx-envelope-proof.js` and `compare-cycling-title-parity.py`;
adds `cycling-source-performance.js` for unrecorded native source/buffer observation;
extends `cycling-audio-proof.js` with selected project/session and actual cue-gain
observations; updates this report and required continuity records. Earlier dirty
branch work remains intact. Saved authentication is retained privately with the
new faithful source and finished-project snapshots; another sign-in is unnecessary.
