# IN THE POCKET

A one-minute boxing film authored in ordinary signed-in AutoPromote Studio. The picture moves between live action, held photographic instants, a diagonal split, two moving views and a closing title. The owner rejected the preceding CRAFT montage's reliance on captions; that film and its technical evidence are preserved as rejected.

## Watch and edit

- [One-minute film, with MP3 audio for IDE playback](proof/film/IN-THE-POCKET-review.mp4)
- [Native AAC master](proof/film/final.mp4)
- [Complete matching Studio playback and timeline, with MP3 audio for IDE playback](proof/film/IN-THE-POCKET-studio-review.mp4)
- [Native Studio recording](proof/film/edited-in-studio.mp4)
- [Editable Studio backup](proof/IN-THE-POCKET.autopromote.json)
- [Final contact sheet](final-contact-sheet.jpg)

The selected project is **IN THE POCKET · boxing picture edit · 20261019**. Restore the backup with the normal **Viral Clip Studio → Restore project backup** control while signed into the same account. The final receipts below determine export and restore status; draft filenames alone do not qualify delivery.

## Picture and sound decisions

The opening goes straight into an exchange. Three actual source frames fold into a photographic triptych, then return to motion. The overhead source keeps its portrait frame, with two small wide stills beside it. A diagonal split separates two instants of one exchange. Later, three action stills assemble and the centre frame expands back into the picture. Two ordinary moving video layers sit side by side, then one expands to fill the frame. The last sequence shortens the shot lengths before resolving into one title card.

The selected edit has 21 native source cuts, eleven unaltered frame-image layers, two native video overlays, 29 total overlays, 660 motion keys and four speed keys. These counts describe the editable project, not its creative quality. There are four text layers, all on the closing card. A rough manually masked still cutout was removed because of its edges and duplicate contours; its preceding project and review image remain in private proof.

Music is **Deep Urban — Eugenio Mininni**, reused from the licensed source and metadata at [music-source.json](../studio-real-footage-edit-20261018/music-source.json). Four original sample-free WAVs supply 34 separate native Sound cues. Native gain keys lower the music during frame holds. The source footage is silent: impacts and shutters are designed sound, not recorded boxing audio.

All cutting, source assignment, speed, transforms, masks, levels, grading, save/reopen, export, playback and backup use the normal Studio controls. The public Graphics interchange supplies ordinary editable layers and keys. Exact decoded source stills and original sound files are source assets; no separately composited movie is imported. Source/programme/output timing follows the saved native speed map.

## Scope and provenance

The three original filmed sources and byte hashes are preserved in [the footage acquisition](../studio-real-footage-20261018/README.md): Mixkit 40967 (ringside action), 40954 (another exchange) and 40972 (portrait overhead). This is a disclosed stock boxing film study. It does not claim one continuous documented bout or synchronized multicamera coverage. The original filmed sources remain unchanged.

The Motion inspector now shows the evaluated X, Y, Scale, Rotate, Opacity and Crop X/Y at the playhead, including zero opacity. Previously those seven fields showed base values even while keyed motion was visible. This display repair uses the existing evaluator and preserves project semantics. [Focused repair evidence](control-repair.json) and [actual native field observations](proof/native-control-review.json) retain this bounded fix.

The first native export failed at final assembly: seventeen music gain keys became 157 samples after easing and speed mapping, and the deeply nested FFmpeg expression exceeded its parser limit. Its request, project, screenshot and error remain in `proof/first-failed-export/`. The audio renderer now selects the same gain segments with a balanced expression tree. The exact old envelope fails in real FFmpeg; the repaired envelope decodes all 2,880,000 samples, with maximum tested gain error 0.003758 on a constant half-scale input. Thirteen dense/existing audio cases and 39 existing image/spatial/vector cases pass.

A bounded image-render optimization avoids allocating a large transparent rotation surface for unrotated local boxes without surrounding paint. Masks, crops and the original integer inset/anchor rounding are retained. Fifty comparisons against the preceding renderer are byte-identical RGBA; the sampled total changes from 17.908s to 15.723s. This small fixture measurement does not qualify whole export speed, whole predictive paint or smoothness. [Actual repair replay](render-repair-verification.json) retains the failed envelope and raster comparisons. The corrected export uses the same native UI/project/compiler/worker path.

The second export completed its technical decode but was visually rejected before delivery. The original intake was portrait, so the sequence had padded every wide shot into that portrait shape before fitting it wide again. A selected **16:9 / Preserve frame** sequence now uses that wide canvas during source normalization. The overhead source still keeps its portrait proportions. Twenty-one mixed-canvas/reframe/motion cases and ten motion subtests pass. The rejected movie, full matching recording, contact sheet and backup remain under `proof/second-export-rejected-framing/`. Technical decode alone did not qualify its framing. Long unbroken recovery messages also wrap within their panel so its Dismiss control remains reachable.

## Evidence and limits

[Checkpoint](checkpoint.json), [delivery verification](delivery-verification.json), [durable proof manifest](proof-manifest.json), `proof/film/render-receipt.json`, `proof/film/studio-playback.json`, `proof/source-review.json` and `proof/fresh-restore.json` bind the selected project, movie, full playback and backup. The IDE review copy only replaces the audio codec; every encoded video packet must match the native master.

Technical export/decode, paused source observations and correct field values do not imply owner creative approval, human listening approval, smooth capture or whole predictive colour/edge/alpha/audio parity. Earlier strict typography failures remain. Formal readiness stays 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY. Continue shared S02 picture/audio/colour/edge/low-alpha and export latency alongside S04 motion/vector depth, then S03 ownership.

This private edit adds no schedule, publication, model generation, paid GPU job, deployment, main merge or showroom/hero qualification. Existing chosen identity, source projects, films, schedule receipts and daily/retention timers are preserved.

## Selected delivery and closure

The selected native master is 60 seconds, 1,440 frames, 1280×720 at 24 fps, with SHA-256 `197391cdd3dcba3d2bb28e121283739d4e8e39df02aecae6fa299fedca0f5cae`. Its full matching native Studio recording has SHA-256 `998d9e4ed223bf8f0230e336dc78ea53638eecf8798d41d1162222af2c1f2ff8`; the editable backup has SHA-256 `22f8a96e84a4d730bbe9c689b1d022a15e6d45c16cd7fbd8b2cc503d9c5d1484`. The independent normal UI restore preserves canonical project SHA-256 `ba7971ea5c577438a47d85beb29d1615d0707dc82bcb3b7a3ccbf99880e2bdb7` with no render job.

The native export flow took 1,329.148 seconds. The complete Studio capture observes 16.10 unique frames/s and is encoded at 24 fps; it is evidence of the matching edit and playback, not smoothness qualification. The actual five sampled wide action shots fill the delivery frame. Full movie and recording decode pass, and both MP3-audio IDE copies preserve every encoded video packet.

All 399 retained proof files are physical repository files, hash-verified against [the manifest](proof-manifest.json); proof is no longer a RAM symlink. Larger intermediate JSON snapshots are losslessly archived as `.json.gz`, with original and stored hashes retained. The native backup remains directly importable JSON. Documentation review/build/check, all 17 knowledge cases, Studio authority validation and scoped whitespace checks pass. The ten deferred documentation-surface warnings remain explicit. [Closure verification](closure-verification.json) records those checks and cleanup. Only the three owned local boxing services were stopped; daily production and published-retention timers remain active.
