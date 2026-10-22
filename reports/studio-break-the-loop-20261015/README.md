# BREAK THE LOOP — editable motion composition

Both earlier samples were rejected by the user for generic motion design. They remain historical technical evidence and have no creative approval.

This continuation uses a linked visual idea: repeating circular type accelerates into an impact, the ring breaks into arcs behind individually animated letters, a slash carries into a modular phrase, and its final word becomes a travelling type/equalizer wave. A moving circle becomes the closing punctuation. Copy and art direction are delegated by the user.

The composition is authored in [the graphics file](assets/break-the-loop.graphics.json) and imported through the normal signed-in Graphics inspector. Import produces ordinary title/image layers, graphic groups and motion keys. The existing canonical graph, history, evaluator and compiler own all subsequent editing and rendering. The file is an authoring interchange, with no separate runtime, renderer or injected graph. Artwork is safely rasterized static SVG; its motion is editable, its vector paths are not.

The ordinary import is reusable for other authored compositions. Validation rejects invalid aspect/timing/property/group/curve/media budgets before a state change; failed decodes release allocated URLs; edits made while loading invalidate the import. The current footage and sound remain available. The import is a single undo step. A source example and exact format are documented in [the interchange guide](GRAPHICS-INTERCHANGE.md).

[Original score generator](../../scripts/studio-professional/score-break-loop.py) uses local deterministic synthesis with no third-party samples. Its events follow the visual actions. The score is imported through normal Sound controls; prior unrelated cues are removed and source audio stays muted.

Native lifecycle and final movie receipts are recorded in the private proof directory. The complete native edit, exact cold reopen, final export/download/full decode, complete Studio playback and editable backup pass. There are no GPU/model jobs, paid cost, production deployment or main merge. Creative approval remains the user's review; technical completion does not establish audience reaction.

## Delivered artifacts and validation

- [Final movie](proof/break-the-loop/final.mp4): 20s, 1280×720, 24fps, 480 decoded H.264 frames, stereo 48kHz AAC. SHA-256 `8fd2c9fc3e97d377f19e8dd0228a3ce51e2e5cd75a374731daf4f8c876d00e7a`.
- [Complete native Studio playback](proof/break-the-loop/edited-in-studio.mp4), [native editing capture](proof/editing-in-studio.mp4), and [editable project backup](proof/BREAK-THE-LOOP.autopromote.json). The backup is downloaded through Studio's normal control and matches the movie's canonical document. It contains the ordinary project, with no authentication export.
- Project `viral-project-9e760ade-7bf6-40c5-970c-3074853e84ef`, canonical hash `74342256ad1eb1f82baa68482772cb7b1ee8ff72efc163cfddca52b42d867817`. All 897 authored key tuples agree with both native saved state and the actual composition request.
- Six scoped frontend cases pass (four import helper cases and two complete production-editor cases); 124 other component cases excluded. Strict normal App build and 17 knowledge checks pass. Worker code is unchanged. Readiness counts remain unchanged.
- Five decoded soundtrack windows correlate with the source at ≥0.9971 and fit the native 0.6 gain. Measured output is −24.5 LUFS with −4.9dBFS true peak. This is source/timing/gain evidence, not human listening or live-mix qualification.
- One accepted CPU job; the twelve-minute observer expires, then normal same-job recovery/download succeeds with zero resubmissions. Verified download occurs 962.967s after the native request was recorded; exact worker CPU time was not returned by the recovery endpoint.
- Full native movie playback ends at20s. Screen cadence is recorded separately and does not qualify smooth playback. The recording soundtrack is muxed from the exact export at the observed native start; the browser is headless and muted.
- Eight live poses, 80 sampled export frames and a separate 20-frame transition strip were inspected. The brief overlap at the RHYTHM handoff is a crossfade between whole-word and individual-letter layers. No whole-raster parity or audience-reaction claim is made.
- Original deadline/dense-key/empty-SFX capture failures and preflight rejection are retained. Owned QA cache cleanup and losslessly compressed historical private receipt paths/raw hashes are recorded in `proof/cache-cleanup.json`; recover a receipt with gzip without altering its bytes. Sources, projects, IndexedDB, authentication and all movies remain preserved.
- The two rejected earlier films remain historical technical evidence. This new moving sequence has no user creative approval. S02 full raster/live sound, S03 occurrence ownership and S04 spatial tangent/range-selector depth remain open. No public scheduling, deployment/main merge or paid GPU/model action was performed.
