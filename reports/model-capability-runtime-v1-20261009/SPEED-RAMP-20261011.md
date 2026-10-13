# Native speed-ramp edit and music-clock repair

**VELO — speed ramp · 20261011** is a separate editable Studio revision of the
cycling film. The original and SFX-envelope projects are preserved.

- [Watch the complete film inside Studio with its full timeline](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling/edited-in-studio.mp4).
- [Exact finished film](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling/final.mp4), [Studio and timeline](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling-studio.png), [full timeline](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling-timeline.png).
- [Native editing/cold-reopen record](proof/launch-template/cycling-recovery-20261011/retime-r4/native-retime-edit.json), [canonical editable document](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling-document.json), [owned export/download receipt](proof/launch-template/cycling-recovery-20261011/retime-r4/cycling/render-receipt.json).

## Actual editing and product repairs

The normal authenticated App duplicated the SFX-envelope edit. Native Pacing
controls added linear speed points **7s:1×; 8s:2×; 9s:1×**. Save/reload/reopen
preserved the exact canonical document. Thirteen footage cuts, sixteen graphics,
one music bed and seventeen cues remain editable; source trims are unchanged.
This is a new pacing revision, not a new footage/style catalogue entry.

Five shared production defects are repaired:

1. Duplicating during a pending source refresh could leave Play disabled. The
   duplicate now starts its own guarded refresh; Pause remains usable while
   media links load. An older refresh cannot overwrite the new project.
2. Completed movie playback could reapply authored speed points. Finished media
   stays at 1×. Its slider, duration and native timeline seeks reuse the existing
   canonical programme/output map.
3. Source speed updated at roughly four timeupdate events per second. Decoded
   frame callbacks now apply the same sampled speed intervals as export.
4. Music incorrectly followed picture speed and programme time. The existing
   renderer places this bed at **1× over finished-output time**. Preview now uses
   that same clock for music offset/fades, retains ordinary decoded playback and
   keeps both decoded and fallback music at 1×. Bus keys remain programme edits.
5. Picture rate changes stopped/recreated an already-playing synthesized cue.
   Its existing buffer now changes rate continuously; its gain is released on
   actual ending, rather than a timer calculated before the ramp. Imported SFX
   retain the renderer's resampling pitch behavior; voiceover retains its
   separate pitch-preserving intent, whose full real flow remains unqualified.

Project: `viral-project-1e5e9c20-64d3-4935-be19-9c1607e75c67`.
Canonical SHA256: `f81122e0ba2dc635bd174f17637a4236fa533a1be24bfbd6d31ab848dd574f2d`.
Shared template: `cycling_rhythm_v1@1.0.2`; definition SHA256
`efcdf13fa2055544297a1253e390e5f55c4b6c03e8d916ad7867c0661fb6772a`.

## Delivered picture and actual soundtrack observations

The existing authenticated render path completed two local **CPU/libx264** jobs.
Both produce the same exact output SHA256:
`08c850fc2475f2fad11b7f5bd0da0a31485975615ad12707385f7be8400e1c36`.
The movie has **465 frames at 24fps, 720×1280**, picture duration19.375s and
stereo48kHz AAC/container duration19.385s. The canonical output map ends at
19.385322s. Independent complete picture/audio decode and server/download
hash equality pass. First job reaches completion in218.583s; second in222.953s
(228.834s through verified download). The local CPU worker is
[confirmed shut down](proof/launch-template/cycling-recovery-20261011/retime-r4/cpu-worker-shutdown.json).
Zero GPU/model jobs or new material purchases.

The full native movie reaches its real end in19.495s from playing, at1× with
zero waiting events, source changes or dropped frames during that run. The
timeline movie also fully decodes. Its soundtrack is muxed from the exact export
at the observed native start; it is not a predictive live-mix recording.
Export contact-sheet and native Studio/timeline images were visually inspected;
full moving-film/sound human creative approval remains pending.

Separate actual [before](proof/launch-template/cycling-recovery-20261011/retime-r4/live-audio-before/native-preview-mix.wav)
and [after](proof/launch-template/cycling-recovery-20261011/retime-r4/live-audio-after/native-preview-mix.wav)
predictive mixes preserve the same canonical hash and submit no render.
[Music-clock evidence](proof/launch-template/cycling-recovery-20261011/retime-r4/native-music-clock-comparison.json)
shows30→14 music starts and variable1–1.9375×→constant1× rates. At the8-second
export window, observed-clock stereo-bed correlation improves0.07835→0.99989
and relative level0.451→1.002. After-capture duration20.459s; all eight measured
bed windows correlate0.878–1.000. The unchanged bounded residual search and
original failures remain recorded. This is scoped music signal evidence,
not full SFX/VO/ducking/phase or human listening qualification.

The subsequent [actual SFX-rate capture](proof/launch-template/cycling-recovery-20261011/retime-r4/live-audio-sfx-rate/native-preview-mix.wav)
takes20.331s, observes all17 enabled cues with no unmatched callbacks or capture
errors, and submits no new render. [Source-clock cue pairing](proof/launch-template/cycling-recovery-20261011/retime-r4/native-sfx-rate-comparison.json)
shows21→18 built-in starts/resumes; the sweep crossing7s changes5→2 callbacks,
retaining its initial start and shot-boundary resume. Imported SFX decoder pitch
configuration matches the resampling intent. Maximum observed callback/offset
position difference is26.4ms. One riser first callback remains45.8ms late,
beyond one24fps frame; exact audible onset and waveform parity are still open.
Music coherence remains0.879–1.000 in this fresh capture. Voiceover is absent
from this fixture and is not qualified by these measurements.

## Remaining defects and retained failed checks

Raw-source loading remains variable. After the decoded-frame rate repair,
the unrecorded native source run takes22.312s, with11.289s preparation, one
active wait and487 callbacks. Of38 ramp observations,24 exactly match their
canonical sampled interval; the largest remaining observed difference is0.125×.
Frame/observer ordering can lag. This does not establish exact live frame timing
or general performance. The later actual mix run is20.459s; these different
observations do not establish a device/network performance guarantee.

Nine additional paused native title/export pairs of the earlier SFX-envelope
project pass source geometry at the unchanged2px tolerance. Four green-title
diagnostics have at most1px box-edge drift; white title/logo pairs were inspected.
Those pairs do not qualify ramped live staging, whole raster or entrance alpha.
[Paired evidence](proof/launch-template/cycling-recovery-20261011/title-native-r1/paired-geometry.json).

The first CPU film was complete, but a proof erroneously expected466 frames
using ceiling rather than FFmpeg's nearest-frame stop. An independent actual
FFmpeg reproduction confirms465; the existing one-frame clock tolerance is
unchanged. That failed check closed the browser before retaining its completed
cache, requiring a second native export. The proof now saves the actual completed
browser state even if post-download verification fails. A subsequent recording
check wrongly compared native container duration19.385s with picture-only19.375s;
it now checks exact probed container duration and retains the one-picture-frame
container/picture gate. Both failed records and the first capture are preserved.
Earlier native Pause, interrupted-service and incorrect harness seek trials also
remain historical evidence, not successful runs.

Continue **S02** with predictive source buffering/cut timing, active SFX/VO and
ducking/trim pairs, and remaining live text/matte/colour/staging. Then **S03**
global composition. Whole parity, creative acceptance, ordinary-account billing
and model-runtime lifecycle/public-showroom qualification remain incomplete.
No readiness promotion, public release, deployment or main merge.

## Verification and changed files

**43 distinct focused checks pass:** five transport/ramp component cases,
two music and two SFX component cases, and34 shared source/music/recipe tests. A repeated
music check is not counted twice. Unselected component cases are skipped;
this is not a whole-suite claim. The normal optimized App build, script syntax,
whitespace and Studio continuity validation pass.

This block changes `ViralClipStudio.js` and its component tests; adds
`cycling-retime-proof.js`; extends `cycling-audio-proof.js`,
`cycling-parity-proof.js`, `studio-proof.js` and `materials-editing-proof.js`;
adds `compare-native-cue-clock.js` for actual callback/offset diagnostics;
records proof media and updates the required continuity files. Existing dirty
branch work and private faithful authentication/source/finished snapshots remain
intact. No further sign-in was needed.
