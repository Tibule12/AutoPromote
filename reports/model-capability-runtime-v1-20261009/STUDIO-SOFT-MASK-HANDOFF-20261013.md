# Soft-mask work handed to the editor engineering track

13 October: the founder explicitly assigns this conversation to creative
templates. Further S02/S03/S04 editor qualification belongs to the separate
engineering track. Preserve these completed changes and their known limits.

Ordinary image/title rectangle, ellipse and percentage-polygon masks now
process Gaussian feather and alpha inversion in native preview and the existing
CPU renderer. Inversion complements alpha rather than luminance. Image corner
rounding matches the existing layer treatment. Unsupported main/video geometric
masks stop before source ingestion rather than silently discarding decisions.
These are deterministic authored masks, not neural segmentation.

Two native signed-in projects exercise controls, history, exact save/cold
reopen, owned export/download and full final playback beside editable timelines:

- [Image final](proof/launch-template/mask-feather-invert-20261013/soft-masks/final.mp4)
  and [Studio recording](proof/launch-template/mask-feather-invert-20261013/soft-masks/edited-in-studio.mp4).
- [Title final](proof/launch-template/title-feather-invert-20261013/soft-masks/final.mp4)
  and [Studio recording](proof/launch-template/title-feather-invert-20261013/soft-masks/edited-in-studio.mp4).

Both outputs are two seconds, 960×720, 30fps/60 frames and stereo AAC. Exact
request/project/output receipts remain beside them. Image SHA:
`b1894a599c77adcb31381ca7e3f42ef0e39d3547bbaa8feea99536c64add2d2d`.
Title SHA: `02b6fcba99939969725f4f55d8f6afa77c433e2e25456c0eac07b5a4ffc77a4a`.

48 focused cases plus two worker subtests and the strict local App build pass.
Nine image geometry/interior comparisons pass: outer bounds and contour p95
within the existing 2px allowance; alpha-interior RMSE at most 0.0281 against
the unchanged 0.04 threshold. **The original whole-box 0.04 alpha test fails**
at outer coverage boundaries (native/final maximum 0.0655). It stays retained
as `paired-soft-alpha.json`, separate from `paired-soft-boundary-checks.json`.
This is not exact whole-alpha qualification. All three title coverage-bound
pairs differ by at most 1px; glyph/shadow/alpha fidelity is unqualified.
Recordings sample below movie fps and do not establish smoothness or trusted
human moving-film/sound creative approval.

Production files: `StudioLayerMask.js`, `studioMaskGeometry.js`,
`ViralClipStudio.js`/CSS, `StudioAdvancedInspectors.js`, `studioRenderCompiler.js`,
`studio_layer_motion.py`, `main_media_server.py`. An existing publishing utility
import was repaired to permit the ordinary App build; concurrent publishing
changes were preserved. Native capture/comparison helpers and focused tests
retain actual evidence. No GPU/model execution, production deployment, main
merge, public release or overall readiness promotion occurred.

Remaining editor work: exact outer-edge alpha, full glyph/effect ordering,
continuous/cold/broader media and sound/listening qualification, then S03/S04.
Keep source assets, movies, canonical projects, authentication and model caches.
The creative track now resumes the reusable launch template and actual films.
