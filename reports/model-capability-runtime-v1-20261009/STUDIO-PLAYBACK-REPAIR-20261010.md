# Studio playback repair — 10 October 2026

The full-screen Studio backdrop was consuming the software compositor's frame budget. The normal signed-in VELO finished-film playback now reports **1 dropped frame instead of 286**, 474 delivered frame callbacks over 20.2785 seconds (23.37 callbacks/second), with no waiting/stalled events. The existing 20-second, 24 fps movie and canonical project hashes are unchanged. This is a qualified local finished-file playback slice, not whole predictive preview, broad device qualification or creative approval.

## Implementation and evidence

`frontend/src/components/ViralClipStudio.css` disables the full-viewport dashboard blur in both base and later overriding rules. `frontend/src/DashboardRedesign.css` gives the overlay's undefined legacy background variable an opaque fallback. The background optimization retains the timeline layout, controls, edit graph, movie pixels and render path. Model/video effects were not replaced with browser simulations.

The trace places about 20.35 seconds of work on the software compositor across a 20.48-second playback. A temporary backdrop-isolation diagnostic reduced drops from 280 to 9; that diagnostic was not product qualification. An initial source attempt was overridden by a later CSS rule. The next run correctly rejected a transparent overlay caused by an undefined legacy variable. The final ordinary build verifies an opaque `rgb(2, 7, 14)` overlay and `backdrop-filter: none`, with neither tracing nor diagnostic styles enabled.

The normal authenticated App reopened the existing project/output. It played the complete movie, then separately recorded the actual Studio with all video, graphics, original audio, music and sound-effect tracks visible. Native save before/after the recording preserved the exact canonical hash. No identity, state, network route or renderer response was injected.

- [Native timing and effective-style receipt](proof/launch-template/materials-editing-20261010/velo/playback-backdrop-qualified.json)
- [Updated complete Studio recording with timeline](proof/launch-template/materials-editing-20261010/velo/edited-in-studio.mp4)
- [Full timeline screenshot](proof/launch-template/materials-editing-20261010/velo-studio.png)
- [Recording full-decode/hash receipt](proof/launch-template/materials-editing-20261010/velo/playback-repair-recording-technical.json)

The recording is H.264/AAC, 24 fps, 502 decoded screen frames / 20.916667 seconds, including paused/start/end screen padding. Screen capture measured about 45.5 captures/second; this includes interface repainting and is not the movie frame rate. Its SHA-256 is `f504b2eec1882f970e11c4c1f67f340b646482c42c4d144cbdeaf586cba9a4b6`. The original sparse recording was archived. The exact movie soundtrack was muxed at the observed native start offset of 0.10083 seconds; the QA browser was muted. This is not live Studio audio capture or soundtrack listening qualification. Actual screenshots and recording samples were inspected; no new cinematic film was authored.

The recording helper now waits for an initial paused capture, uses an explicit native pause before rewinding, encodes at the actual movie FPS, and reports sparse captures. The performance probe retains trace/metrics/geometry and checks the effective cascade. CPU-only local builds, script syntax, native playback/hash/save checks and full recording decode pass. Studio record validation, shared Director replay-kernel check and whitespace validation pass. All local App/API/CPU worker services started for this repair are stopped; their ports and the QA browser debug port are closed. No new AutoPromote render, model inference, GPU job, production deployment, main merge or public release occurred.

## Studio controls and next slice

Delivered edits use the real Studio controls, with automation operating them. Applying the shared template instantiates ordinary editable clip occurrences, graphics, keys and audio; it does not require clicking each generated key by hand. Music/SFX edits, saving and export used native controls. Some input footage already contains cuts; those are not credited as newly authored Studio edits.

Next: build the vertical cycling edit from retained continuous-shot candidates, with our own cuts, typography and individually editable music/SFX, and show the raw footage, finished film and actual project/timeline. Check predictive editing playback and relevant preview/final picture/sound in that project. Shared S02, full creative/sound acceptance, mastering, normal-account model lifecycle, broader hardware/media performance and showroom release qualification remain open. No new template or creative approval is claimed by this repair.
