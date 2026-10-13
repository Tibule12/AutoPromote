# Native mask authoring — 13 October2026

Studio's ordinary geometric masks now expose an editable percentage-polygon
path and a0–50% rectangle corner radius. Polygon typing stays local until a
valid Enter/blur commit; invalid drafts show an error without modifying the
canonical graph, and Escape cancels. Changes use the existing layer command,
history, save/reopen, preview and composition compiler. Invalid saved polygon
paths fail export compilation before a worker submission. Explicit radius0 now
survives both hard/soft preview and final rasterization instead of becoming6.
Artwork frame rounding remains a separate field; setting a mask radius to0
does not change the image's frame style.

The signed-in native App imports a private3s grid and two original opaque
magenta images. Ordinary controls author a square-corner rectangle and a custom
five-point inverted polygon with12/16px feathering. Invalid typing, Escape,
path change, undo/redo, save and cold reopen pass. An owned CPU export/native
download fully decodes as720×1280 H.264/AAC,72 picture frames at24fps. The final
movie plays completely in Studio beside its editable timeline. Browser QA is
headless/muted; its recording contains the exact exported soundtrack.

- [Actual final movie](proof/authored-masks/final.mp4)
- [Complete native playback with editable Studio timeline](proof/authored-masks/edited-in-studio.mp4)
- [Native polygon controls](proof/native-mask-controls.png)
- [Native zero-radius control](proof/native-zero-radius.png)
- [Eight actual preview/final comparisons](proof/paired-masks.json)
- [Exact input/project/output/recording hashes and limits](checkpoint.json)

At0.5,1,1.5 and2.5s, both masked layers pass the existing0.04 whole-authored-box
alpha RMSE and2px p95 boundary limits, without fitted shifts or retiming.
Maximum native/final alpha RMSE is0.0323433; maximum reference RMSE is0.0342600;
maximum p95 boundary distance is2px. These are scoped portrait image checks.
The historical landscape feather/inversion outer-edge failures are preserved
and remain unqualified; the new derivative does not retroactively pass them.
Full moving-film/sound and creative review are also unqualified.

Validation:12 mask/editor/compiler checks and18 worker layer checks pass. The
strict ordinary App build passes. No full Studio suite result is claimed.
The new tests cover invalid draft isolation, one valid history commit, compiler
preflight rejection and real zero-radius raster behavior. The rounded-corner
diagnostic allows its observed single alpha-code antialiasing residual; it does
not alter either native picture comparison limit.

The work remains on `agent/studio-professional-continuation-v2`, which includes
current main858d538b and the prior image-effect repair. Existing projects,
films, template work and unrelated app/API are preserved. One private CPU
export completed; GPU/model jobs, paid GPU runtime/cost, external publishing and
production deployment are zero. This exact3s proof reserves1GiB and caps capture
scratch at64MiB; normal longer-film storage checks remain unchanged. Its own
local QA services stop after final verification. Generated/private media and
authentication are excluded from Git; portable checkpoint metadata is retained.

Knowledge1.0.7 documents two geometric mask controls without changing feature
readiness. Neural subject-mask feathering remains separately unavailable.
Animated paths, mask expansion, video masking, combined mask/effect order,
whole live/broad/cold media/sound, global order/nesting and ordinary-account
runtime lifecycle remain unfinished. Next: S02 mask/effect-stack and whole
picture/sound conformance, then S03 composition/nesting and S04 controls.
