# Native sound envelopes, recovery and owned audio — 12 October

The real authenticated Studio edit now has a fresh CPU export and a full movie
recording beside all seven editable lanes. This is a bounded S02 continuation;
whole Studio, professional creative quality and public release remain unqualified.
No GPU/model execution, production deployment or main merge occurred.

The unchanged project is `viral-project-bc1f4191-312c-431d-b1c6-ae7080996357`,
canonical SHA256 `9dcaa8adbacf2c42498afac73e69fbd9654cac8a618d5f600112f9e563ef6e63`.
The exact cycling template remains version 1.0.2. It contains thirteen cuts,
seventeen sound cues and the native Bézier SFX envelope with the 7–9s speed ramp.

- [Fresh movie](proof/launch-template/parity-20261012/native-audio-render-r2/audio-curve/final.mp4)
- [Complete finished movie in Studio with all seven lanes](proof/launch-template/parity-20261012/finished-all-lanes/audio-curve/edited-in-studio.mp4)
- [Native timeline](proof/launch-template/parity-20261012/finished-all-lanes/audio-curve/finished-film-and-all-lanes.png)
- [Exact PCM/codec diagnostic](proof/launch-template/parity-20261012/audio-stages-exact-ingest/audio-stage-audit.json)

Both new normal Studio exports complete through authenticated `/api/media/process`,
owned job polling and browser download. The first took 152.388s; the second
168.589s. Both output SHA256
`06c34ccf7b02a078e1e00549fb213f7d0557feb0086783b9f1ecfa59efea3eb7`:
465 frames, 720×1280, 24fps, 19.375s picture and 19.385s stereo 48kHz AAC.
All 465 decoded picture frames equal the prior audio-curve export. The actual
screen recording contains 504 observed frames and completes native playback at
1×. Its exact export soundtrack is muxed at the observed 88.837ms start offset;
the headless QA browser is muted. This is not a live-preview audio recording or
human soundtrack/creative approval. Opening, middle and ending screenshots were
inspected; full human moving-film/sound review remains required.

Audio fixes preserve authored integer 90kHz boundaries but use fractional sample
time for the running cue clock. Actual native replay takes 19.445s, with one
music start, all seventeen cues and no observed waits. Renderer volume curves
now use 64-sample unpadded blocks; the real PCM regression previously failed
with 0.041464 maximum gain error and now meets its 0.003 bound without tail
padding. The mix helper explicitly normalizes buses to 48kHz; a mixed-rate
23kHz fixture fails before that guard and passes afterward.

An early diagnostic bypassed the worker's existing 48kHz stereo/s16 music
ingestion. Its opening 0.982 comparison was a diagnostic-path defect, not an
established defect in this movie. Exact ingestion corrects that attribution.
The explicit mix guard leaves this already-normalized real export byte-identical.
The correct eleven-window native-versus-worker PCM correlations are
0.999873–0.9999998. Actual AAC-versus-PCM correlation drops to 0.981788/0.986213
in bright cue windows; diagnostic AAC measures the encoding loss separately.
Neither codec loss nor short-window alignment establishes full-film sound or
human listening quality. Historical failed logs and captures remain retained.
Both channels are centered for coherence measurement; raw level, DC difference
and relative RMS error remain recorded, so correlation cannot hide wrong gain.

Retained source storage authorization, immutable object generations and actual
bytes were checked read-only through the existing server service. Both imported
cue files match their retained material SHA256s. Their legacy editor records
still lack hashes; this check does not silently backfill or re-author them.

Recovery now exposes retry/dismiss controls when status needs attention even if
a retained URL exists. A failed finished-file decoder releases the ready URL
while retaining the owned job/receipt. A blocked render surfaces an editor error
instead of silently returning null. The first unsuccessful client attempt and
its screenshot remain recorded; no job was accepted by that attempt.

Scoped validation: 52 audio helper checks; four focused native audio cases;
fourteen render-recovery cases; one native retained-URL visibility case; nine
real worker audio cases; four signal-measurement cases. These are targeted
checks, not the full Studio suite. Strict ordinary local App builds pass.

The next block also passes its real native path. Audio uploads now hash actual
bytes in one-MiB chunks without a whole-file allocation. They retain owner,
storage path and SHA256 in the editable snapshot. Account changes during upload
are rejected. Frozen render and committed saved snapshots share the same source
bindings/revision; replacing an input while uploading cannot overwrite the new
source. Stable cue decoding supports the existing `sourceStoragePath` alias.
The existing pinned hash library is declared directly; no new install occurred.

Through the normal App, the original was duplicated into **VELO — owned audio ·
20261012**, music replaced and a new timed cue imported/edited. Meaningful
volume undo/redo passes. The new 177.338s CPU export/download/full decode,
save/cold reopen and complete movie with all seven lanes pass. The exact owner,
path and hashes survive the reopen; request and saved hashes match. Stored
generation-pinned bytes are also checked through existing ownership resolution.
The original project's canonical hash is unchanged. Seventeen source/binding
checks and one focused native upload component check pass; strict App build passes.

- [New owned-audio movie in its actual Studio timeline](proof/launch-template/parity-20261012/native-owned-audio/owned-audio/edited-in-studio.mp4)
- [Editable saved project](proof/launch-template/parity-20261012/native-owned-audio/reopened-project.private.json)
- [Native source lifecycle receipt](proof/launch-template/parity-20261012/native-owned-audio/native-owned-audio-receipt.json)
- [Stored music and three cue byte checks](proof/launch-template/parity-20261012/native-owned-audio/owned-source-and-music-verification.json)

New project `viral-project-c838df2a-c563-479b-9fe4-ba874dadaeb8`, canonical SHA256
`a8d79f20e6f773bae36d72304ec237892b522b3936252f135761dd03fc4418eb`,
movie SHA256 `c08d371bf890ea19f4e3215506da5249af89049f9a1c71a4c6f7055684a9d51f`.
The two older imported cues remain legacy records without hashes; they are not
silently migrated by the new upload path. Existing development credit bypass
still means charging is unqualified. Generated recording-frame scratch is
released after retaining the complete movie and representative inspected images.

The next S02 picture block has started. An initial capture incorrectly demanded
the exact paused source sampler after the speed ramp; the implementation explicitly
restricts it to preceding identity-clock spans. That harness timeout is retained,
not relabelled a renderer defect. New captures enforce the supported clock scope
and preserve partial evidence on failures. Exact retimed paused sampling remains
unimplemented. Continue mapped live picture/raster/staging and remaining VO/ducking/trim,
then S03 global order/nesting and remaining S04/3D controls. No broad
readiness, creative, billing, showroom or public hero promotion is implied.

The supported picture follow-up also passes: five unchanged-project native/export
source-geometry samples, maximum p95 displacement0.632px at the existing2px
bound. The visible green title differs by at most1px at its box edges; mask
IoU0.857671 remains a raster diagnostic, not a full-font/white/alpha qualification.
The requested1.999s seek rounds to the2s output frame, so it does not count as
a before-cut sample. A follow-up now requests actual frame47/48/49 around that
cut. [Actual paired images and clocks](proof/launch-template/parity-20261012/native-picture-identity-scope/paired-source-capture.json).

Next sound-control fix is in progress: both background faders expose0–60%;
preview respects1%/zero rather than flooring to5%. Gain/fade changes preserve
the existing running song while identity, readiness,Pause/seek and80ms drift
guards remain enforced. Three focused native component cases pass, including
low/zero gain and no song restart. The actual signed-in fader/export proof is
pending; this new source change has not been relabelled a passed real lifecycle.

The next fader block now passes the real signed-in lifecycle. In the long final
source, actual output gain is0.0099999998,0,0.0099999998, with one song start
across all changes. Undo/redo, exact save/cold reopen,148.0s CPU export/download
and complete film beside the full timeline pass; original owned-audio project
remains unchanged. The first attempt inherited a playing transport; another
spanned a source cut and observed a restart. Those failed trials are retained
and excluded from fader attribution; source-boundary behavior remains separately
qualified. Generated recording scratch88.07MB is released.

- [Quiet-music native film and timeline](proof/launch-template/parity-20261012/native-music-fader-r3/quiet-music/edited-in-studio.mp4)
- [Actual native gain/history/reopen/export receipt](proof/launch-template/parity-20261012/native-music-fader-r3/native-fader-receipt.json)
- [True before/at/after cut-frame pairs](proof/launch-template/parity-20261012/native-picture-cut-frame-boundaries/paired-geometry.json)

Quiet project`viral-project-ce120416-538c-47a3-b50f-fa5af8557d6d`, canonical
`ab63768002f7f93488fab22311faa7885f983cb40c6a2a8b45862ee74a1acb1e`,
movie`f7c58ce50363bf7ce64d790582acdb2f06dd2631c2871ee21966c3082e1afe87`.
The actual adjacent output frames47/48/49 around2s all pass the same2px source
geometry bound. Total supported geometry pairs in this continuation: eight.

Zero glow radius/shadow blur/offset now survive controls, toggles, undo/redo,
save/cold reopen and actual export in **VELO — zero layer effects · 20261012**.
The native computed CSS and frozen render request both retain zero. Three inspector
cases and one focused production preview case pass; strict App build passes.
Initial native capture failures were absent-layer sampling and Chromium filter
serialization assumptions; both are retained and corrected in the harness.

The first154.480s export revealed a separate worker defect: artwork faded while
its shadow/glow could remain visible. A real alpha-video regression fails before
(first-frame alpha192 instead of0). The shared worker now applies opacity to the
complete filtered group, including motion-blur samples. Five real layer cases
pass. The first after test incorrectly assumed its sampled shadow excluded the
overlapping soft glow; that assertion was corrected, with failed logs retained.
The exact retained logo bytes and compiled keys now have fully transparent start
and end, and the half-fade keeps the whole filtered group under its authored alpha.

The unchanged canonical project was reopened and rerendered through normal Studio,
not imported as a flattened replacement. The new export completes, downloads,
fully decodes and plays from start to end beside its seven editable lanes.
Representative actual Studio pictures were inspected. Full moving-film/listening
and founder creative approval remain unqualified.

- [Corrected complete movie in Studio and its editable timeline](proof/launch-template/parity-20261012/native-layer-opacity-r1/zero-effects/edited-in-studio.mp4)
- [Corrected final movie](proof/launch-template/parity-20261012/native-layer-opacity-r1/zero-effects/final.mp4)
- [Exact native project](proof/launch-template/parity-20261012/native-layer-opacity-r1/reopened-project.private.json)
- [Actual original controls/history/reopen receipt](proof/launch-template/parity-20261012/native-zero-layer-effects-r3/native-zero-effects-receipt.json)
- [Same-project native rerender receipt](proof/launch-template/parity-20261012/native-layer-opacity-r1/native-rerender-receipt.json)
- [Actual retained asset alpha checks](proof/launch-template/parity-20261012/native-layer-opacity-r1/exact-asset-opacity.json)
- [Decoded final-to-final comparison](proof/launch-template/parity-20261012/native-layer-opacity-r1/decoded-render-comparison.json)

Corrected project canonical SHA256
`56e37fb90144ffc18317370f6e545d28a7b97df12423db4340b867ef9b3a08eb`,
movie SHA256`49257758ffd0bb8e2db2a06b6c8450af287db81ee50f6124c032075fa013e743`.
Both465-frame films have identical decoded audio. Picture changes start atframe342
and continue through464, including compressed frames preceding the logo's mapped
onset. An initial stricter pre-onset byte-equality assertion failed and no passing
preservation receipt was issued. This comparison does not establish an early
visible effect or whole preview/final parity. Exact lossless asset/alpha checks
and the full delivered movie remain distinct evidence.

The next real handler check exposed a separate small-source composition defect:
the general dimensions helper floors each axis to320, displacing layers on320×240
footage. Studio composition now probes actual picture dimensions; the general
helper and Cam Combiner remain unchanged. A stale URL-download mock was corrected
to the actual bounded streaming path. All23 real layer/handler tests now pass,
including text/image/video ordering on that small picture. This synthetic CPU
fixture is not normal native small-source qualification or a creative film.

At that checkpoint six actual CPU exports were completed; zero paid GPU/model
jobs. The following block continues below. Recording scratch is released after preserving complete movies and selected
images. Continue S02 mapped picture/raster/staging/VO/ducking/trim and exact paused
sampling after retime, then bounded S03 global order/nesting and S04/3D. Nonzero
filter units/order, whole text/matte/grade/sound parity, normal-account billing/
runtime/durability and creative/public gates remain open.


The next small-source block now passes its square-pixel native path. A fresh
owned two-second derivative of retained cycling footage was imported through
ordinary Studio entry, with an editable title and owned soundtrack. Explicit
selected-title X/Y changes, undo/redo, save/cold reopen, source-size CPU export,
browser download, all48-frame/stereo-audio decode and complete Studio movie with
its editable timeline pass. This is a technical composition sample, not a new
creative showcase or reusable template claim.

An initial native output was320×320 and fails the declared320×240 expectation.
Its completed job/output are retained. The same dimension floor also affected
sequence assembly; Studio now uses actual probed dimensions for assembly and
composition. The general sizing helper/Cam Combiner are untouched.23 CPU worker
cases pass, including exact small-source sequence/title/media ordering.

The preview now also refreshes active source dimensions at loadeddata/canplay,
including warmed decoders, and computes its frame inset from the actual aspect.
One focused component case fails before and passes after; strict local build
passes. A later real320×240 native output passes its lifecycle, but the first
resized test copy retained SAR4:3/DAR16:9. The browser correctly displays that
source wider; it is excluded from square-pixel picture qualification. An
independent square-pixel derivative is recorded with actual source/hash/SAR/DAR.
Earlier scripted position changes targeted the main transform; the final test
explicitly selects the title and verifies its own saved X/Y. All attempts remain
retained, including the failed dimension assertion.

The final normal project is **VELO — square source composition · 20261012**,
canonical SHA256`0eb5421eac5e2f1cf588d12ffd2bf3cf9dcce9e45dbf41bda8d1ad8f1f28c436`, movie SHA256`f33b6d4a1135ded161316d811c51bc6f809e777930b7ddf7f6b47991e1946389`.
Its actual1-second native/export green title bounds differ by[1,0,1,0]px at the
unchanged2px geometry bound. MaskIoU0.798439 remains a raster diagnostic; font,
full picture/motion/VO/ducking/trim/listening and creative/public qualification
are not promoted. Actual representative native and delivered pictures were
inspected. Recording scratch7.95MB is released after preserving the full movie.

- [Complete square-source film with editable Studio timeline](proof/launch-template/parity-20261012/native-small-source-r4/small-source/edited-in-studio.mp4)
- [Exact editable native project](proof/launch-template/parity-20261012/native-small-source-r4/reopened-project.private.json)
- [Native lifecycle receipt](proof/launch-template/parity-20261012/native-small-source-r4/native-small-source-receipt.json)
- [Paired title-box geometry](proof/launch-template/parity-20261012/native-small-source-r4/paired-title-geometry.json)
- [Verified square-pixel source derivation](proof/launch-template/parity-20261012/owned-small-cycling-square-320x240.derivation.json)

This continuation totals nine completed CPU jobs: eight pass their scoped native
export/download checks and one remains a wrong-size rejected technical output.
No paid GPU/model job. The square-source export takes 41.994 seconds.
Next S02: full VO/ducking/trim and mapped picture/raster/staging, exact paused
sampling after retime, nonzero filter units/order and anamorphic handling.
Continue bounded S03 global ordering/nesting and S04/3D. Whole Studio, billing,
normal-account runtime/security/durability and public creative acceptance remain
open. No production deployment or main merge.


Implementation touched the shared Studio preview/editor and controls
(`ViralClipStudio.js`, `StudioAdvancedInspectors.js`, `VideoEditor.js`), cue-clock,
owned audio bindings/decoding/upload/hash helpers, the existing render worker
(`main_media_server.py`, `studio_audio.py`, `studio_layer_motion.py`), their scoped
regressions and native proof/measurement scripts. The direct hash-library pin
uses the already installed version. All five continuity records are synchronized
and their validator passes. These are extensions of the existing canonical
pipeline; no separate final engine, frontend redesign, Cam Combiner change or
public page release was introduced. Existing dirty work and source/failed/
delivered media, projects and retained real sign-in states remain preserved.

Final shared regression after the source-dimension changes:5 focused native
component cases pass (116 skipped), including ready cut/audio continuity, retimed
music, zero effects and source aspect; all9 worker audio cases pass. This is
scoped testing, not a full Studio suite. The verified local CPU worker remains
available for this isolated local App; no paid worker/model was started.
