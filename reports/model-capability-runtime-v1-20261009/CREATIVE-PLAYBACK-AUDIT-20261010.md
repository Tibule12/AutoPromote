# Creative footage and Studio playback follow-up — 10 October 2026

The founder likes the clean timeline, but has not accepted the creative films as professionally finished. No new film, template, model inference, GPU job, public release or deployment was made in this follow-up.

## Measured playback

The existing screen recordings contain only approximately 2.6 distinct captures/second for EMBER/ONDA and 7.6 for VELO. Their 15 fps encoding repeats captures; it does not demonstrate smooth playback of the 24 fps finished movie. Future recording receipts now label sparse capture explicitly.

The normal signed-in VELO project was reopened without mocks or identity/project injection. Its exact existing completed output and canonical project hash were retained. With screencasting disabled, the 20-second finished movie ran in 20.79 seconds at playbackRate=1, without waiting/stalled events, but reported 286 dropped frames and 129 frame callbacks. **Studio playback performance remains unresolved.** This is a muted headless Chrome measurement, not a qualification of interactive hardware-accelerated playback or predictive editing preview.

The exact downloaded movie in a separate, lightweight headless player delivered 479 frame callbacks in 20.04 seconds and zero dropped frames. This decoder baseline is not Studio product proof. It narrows the investigation to the Studio/browser workload rather than a slow encoded movie or buffering; it does not isolate the responsible component.

A direct-finished-video trial bypassed the predictive canvas and built successfully. It did not improve measured frame delivery (295 dropped frames; a second run with confirmed visible video/hidden canvas reported 278). The trial was reverted, including restoring the previous private local build. No playback fix is claimed. The initial invalid probe mixed automatic playback with replay; it is explicitly retained as invalid, excluded from conclusions. The corrected probe exercises native Play/Pause and rewinds before measurement.

Private measurements: [Studio baseline](proof/launch-template/materials-editing-20261010/velo/playback-performance.json), [standalone decoder baseline](proof/launch-template/materials-editing-20261010/velo/playback-standalone-baseline.json), [confirmed reverted trial](proof/launch-template/materials-editing-20261010/velo/playback-performance-direct-confirmed.json).

## Next creative material

All twelve retained footage files were scanned across their frames using FFmpeg scene score >0.30. The coffee-machine montage has six candidate cut points; the dancing-headphones clip has three. The unused portrait cycling-start and cyclist-silhouette shots have none. Their sampled images were inspected; automatic detection/sampled review alone is not an exhaustive moving-film creative review. [Exact source hashes and candidate cut times](proof/launch-template/materials-editing-20261010/source-cut-audit.json).

Next content is a vertical cycling edit using these continuous-shot candidates, with AutoPromote-authored cuts, rhythmic typography, punch-ins and individually editable music/SFX. Then exercise actual source-bound subject masks for text behind the subject and actual tracked callouts. Follow with a cinematic product edit, requesting generated raw footage only for a genuinely missing shot. These are next slices, not implemented/qualified new styles. Every new edit must be shown alongside its raw material and actual editable Studio timeline; no flattened final movie masquerades as its editable project.

Twelve footage files, four distinct music choices and twenty-one sound choices remain available. Wan2.2 previously produced actual moving text-to-video footage through the common runtime. A future uncut generated shot must use that runtime and owned artifacts; historical execution does not qualify a new source, image conditioning or normal-account generation. No current paid job was required or requested. Prior execution windows are not current spending authorization.

## Validation and next blocker

The diagnostic scripts pass syntax checks. Three focused existing completed-output/hydration/seek checks pass after correcting the output-actions test to select the existing Export tool before clicking its hidden actions. The temporary direct-playback build passed but was reverted. Studio record validation, the Director replay check and diff whitespace checks pass. Owned local QA services/browser were stopped. No readiness classification, creative approval or preview/final parity is promoted.

First next engineering task: profile Studio frame delivery/compositing and resolve its native playback budget, then demonstrate the new continuous-source edit and pair its predictive/final picture and sound. Shared S02 remains open; model normal-account lifecycle and showroom publication/handoff blockers remain unchanged.
