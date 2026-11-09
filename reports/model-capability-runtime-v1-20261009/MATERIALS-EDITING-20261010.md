# Three-film materials and native Studio delivery — 10 October 2026

**EMBER, VELO and ONDA now each have an upgraded 20-second movie, an editable native Studio project, a complete timeline capture and an actual Studio playback recording with sound.** All three were downloaded through the normal authenticated Studio path. This is private delivery for review; professional creative acceptance, public permission and whole predictive preview/final parity remain pending.

## Watch the actual edits

| Film | Finished movie | Actual Studio playback + timeline | Editable project backup | Timeline detail |
|---|---|---|---|---|
| EMBER | [Movie](proof/launch-template/materials-editing-20261010/ember/final.mp4) | [Studio recording](proof/launch-template/materials-editing-20261010/ember/edited-in-studio.mp4) | [Native backup](proof/launch-template/materials-editing-20261010/ember-project.private.json) | [Timeline](proof/launch-template/materials-editing-20261010/ember-timeline.png) |
| VELO | [Movie](proof/launch-template/materials-editing-20261010/velo/final.mp4) | [Studio recording](proof/launch-template/materials-editing-20261010/velo/edited-in-studio.mp4) | [Native backup](proof/launch-template/materials-editing-20261010/velo-project.private.json) | [Timeline](proof/launch-template/materials-editing-20261010/velo-timeline.png) |
| ONDA | [Movie](proof/launch-template/materials-editing-20261010/onda/final.mp4) | [Studio recording](proof/launch-template/materials-editing-20261010/onda/edited-in-studio.mp4) | [Native backup](proof/launch-template/materials-editing-20261010/onda-project.private.json) | [Timeline](proof/launch-template/materials-editing-20261010/onda-timeline.png) |

The recordings show the real editor playing its actual finished output, with the full native footage, graphics, original-audio, music and sound-effect tracks. They are captured browser frames, not a recreated timeline. The QA browser stayed headless and muted; each recording's soundtrack is muxed from that exact downloaded movie at its observed playback-start offset. These recordings demonstrate finished-file playback and editable state, not browser predictive audio parity. Painted screen frames are less frequent than the movie's 24 fps; use the separate finished movie to assess uninterrupted picture quality. An earlier buffered VELO recording is preserved separately.

The shared template authored the shot order, source windows, twelve occurrence cuts, typography motion, brand/CTA layers and timed cues. Those decisions were edited through Studio. The inputs are Mixkit stock camera recordings, not AI-generated performances. The coffee-maker input also contains internal cuts already. Original 9 October movies remain preserved.

## Materials ready for this batch

| Material | Verified quantity |
|---|---:|
| Moving source clips | 12: nine used, three spares |
| Distinct music choices | 4 |
| Native synthesized sound presets | 15 |
| Newly acquired sampled effects | 6 |
| Total sound-effect choices | 21 |

Music choices: **Midnight Funk** (Michael Ramir C.), **Need for speed** (Arulo), **Gimme that Groove!** (Michael Ramir C.), and the original CPU-authored launch score. New sampled effects: fast cinematic whoosh, deep-impact whoosh, big cinematic impact, trailer whoosh/impact, glitch rewind and magic glitter. All twelve source hashes were checked. [Inventory](proof/launch-template/materials-editing-20261010/material-inventory.json) and [audio provenance/license receipts](proof/launch-template/materials-editing-20261010/materials/receipts.json) retain exact sources and bytes. Byte-identical legacy backend tracks and two frontend tracks without retained provenance are excluded from the distinct count.

Mixkit [music](https://mixkit.co/license/modal/musicFree/), [SFX](https://mixkit.co/license/modal/sfxFree/) and [terms](https://mixkit.co/terms/) were retained with these private inputs. Incorporate them in finished movies; do not redistribute raw recordings as an AutoPromote stock library, downloadable template pack or customer source bundle. No purchase occurred.

## Native edit and export evidence

All three use the same unchanged draft `product_launch_cinematic_v1@1.0.0`, definition hash `7dd1e31dbcb1fdf83b84baaa76b2e7902ada116646e1c3dab1946d9ed8e1d080`. Each has twelve footage occurrences and thirteen graphic layers. These are ordinary instance edits, not a second renderer or silent definition change.

| Film | Music | Placed sound cues | New sampled accents |
|---|---|---:|---|
| EMBER | Midnight Funk | 16 | Whoosh at 5.30s; deep impact at 15.25s |
| VELO | Need for speed | 14 | Trailer whoosh at 1.82s; big impact at 15.25s |
| ONDA | Gimme that Groove! | 14 | Glitch rewind at 13.22s; glitter at 17.00s |

Music gain is 34%, with 0.1s/0.9s fades and speech ducking off. Cue timing, duration, gain and fades remain editable in Sound. A complete listening/creative decision is pending. Supplemental loudness measurements found VELO -25.2 LUFS/-8.7 dBTP and ONDA -23.9 LUFS/-7.6 dBTP; these mixes may need stronger mastering after listening. They are not declared professionally approved.

Every final fully decodes to **20s, 1280×720, 24fps, 480 frames, AAC 48kHz stereo**. Each native download SHA matches its completed owned job. Export materializes imported audio into owned Storage paths; receipts preserve hashes before upload and of the materialized saved project. Native playback reaches the actual movie endpoint and leaves the same canonical project hash. Exact receipts are under each film folder: `render-receipt.json`, `studio-playback.json`, and `studio-recording-technical.json`.

| Movie | SHA-256 |
|---|---|
| EMBER | `6232995e6640f2f77832c5b38c797c087f944370974524faa055f597ff7f4eea` |
| VELO | `f2635326113b932203f6e00c8477370165a3a1b6a9a05f5591f1579edcb6fc4d` |
| ONDA | `6abb780af1dddab25348a3e7aef563ed422a0853ca22ce49036fd5ca77bf5231` |

## Blockers repaired and checks

- Earlier follow-up repairs preserve authored hook settings during navigation, exclude layout resizing from edit shortcuts, and establish correct SFX duplicate/Undo/Redo history. Native 14 → 15 → 14 → 15 → 14 history, five-position unchanged-hash navigation and EMBER cold reopen passed.
- Finished-preview errors and transient sign-out preserve owner-scoped render recovery receipts; canonical-equivalent transport hydration no longer invalidates the finished movie. VELO and ONDA now also pass cold reopen after final media materialization, recover their completed movies through the existing server-owned path, and play them with the editable timeline.
- Added **Restore project backup** to the existing native Studio entry. It validates the canonical document, refuses overwrites, and authorizes every saved source path through the existing server before persisting the unchanged project. Inaccessible/foreign media cannot be restored. No auth identity, project state or render response was injected in QA.
- A retained legitimate QA profile signed in normally; all three backups were restored through that control. JSON cannot carry an unuploaded File: pending sampled music/cues were explicitly re-imported through normal Sound inputs, then materialized by export. Current backed projects recover; old unuploaded-media history and general portable/cloud durability remain unqualified.
- The first resumed browser lost both its Firebase session and project IndexedDB under low disk space. Storage eviction is the likely cause, not proven attribution. Firebase refresh checks succeeded in another complete retained QA profile. Cleared about 2 GiB of disposable build caches and 643 MiB of completed-job downloaded segment copies, preserving sources/proofs. Saving now requests browser persistence as best effort; denial still permits the save. It is not a cloud durability guarantee. Local QA builds disable persistent compiler caches and stage the new build before swapping it into the local server.
- Nine backup/store checks passed, including inaccessible-media rejection, overwrite refusal and a denied persistence request. Eleven earlier navigation/history/recovery checks remain valid. The final optimized local build passed. Record validation and replay-kernel consistency are checked at session close.

## Cost, limits and next work

**New GPU jobs: 0. Models executed in this batch: none.** This resumed session completed four CPU jobs: EMBER, VELO, a VELO repeat after browser storage loss, and ONDA. Together with the two earlier materials-batch EMBER attempts, this materials follow-up has six completed CPU renders. The VELO repeat produced the identical SHA. ONDA's simultaneous submission was refused as worker-busy with no credits charged; its sequential retry completed. [Supplemental durable job accounting](proof/launch-template/materials-editing-20261010/native-job-metrics.json) is read-only accounting, not native qualification evidence. The three delivered render-to-download windows were approximately 186s, 207s and 165s; these include upload, polling and delivery, not GPU time.

Local credits remained bypassed by existing development configuration. Production charging and broad normal-account readiness are not qualified. No frontend redesign, Cam Combiner replacement, production deployment, main merge, public release or showcase entry occurred. The public catalogue and hero remain empty.

Remaining: founder review of each full movie and soundtrack, creative revisions/mastering where needed, paired predictive preview/final picture and sound (shared **S02**), cloud/project durability, and the previously documented runtime normal-account lifecycle. Publication is a separate later decision after concrete creative acceptance and release permission. No more materials are needed to review this three-film batch.
