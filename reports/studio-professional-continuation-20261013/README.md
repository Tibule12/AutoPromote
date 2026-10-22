# Professional image compositing — 13 October 2026

Transparent image blur now preserves the artwork's colour at partially covered
edges. The old renderer blurred straight RGBA, mixing transparent black into
RGB and producing a dark fringe when composited. Filtering associated colour
and alpha removes that fringe. Image blur uses the same 720px programme
coordinates as geometric masks and scales with preview size, delivery resolution
and the authored layer transform.

The real signed-in Studio imports a private three-second grid and original
transparent magenta graphic, edits blur, undoes/redoes, adds individual X keys,
saves and cold reopens. Its owned CPU export downloads and fully decodes as
720×1280 H.264/AAC, 72 frames at24fps. Four actual live-preview/final pairs at
0.5,1,1.5 and2.5s pass the predeclared0.04 soft-edge alpha RMSE and4-code-value
colour residual limits. Native/final alpha RMSE is0.01328–0.01476. This is
bounded image evidence, not whole-picture/sound or broader effects qualification.

- [Actual blur film](proof/blur-animation/final.mp4)
- [Complete Studio playback with editable timeline and keys](proof/blur-animation/edited-in-studio.mp4)
- [Four measured native/final pairs](proof/paired-blur.json)
- [Paired actual pictures](proof/paired-blur.jpg)
- [Renderer-only before/after alpha diagnostic](proof/alpha-filter-before-after.png)

The isolated branch is `agent/studio-professional-continuation-v2`, based on
current main858d538b. It preserves the original editing branch, its project/film,
the separate template work and existing app/API/worker. QA stays headless and
muted, uses normal authentication/ownership and performs no route/render
substitution. A process-local3s proof budget reserves1GiB and caps capture scratch
at64MiB; the normal longer-film safety guard is unchanged. GPU/model jobs, paid
GPU runtime/cost, external publishing and production deployment are zero.

The second bounded slice corrects shadow→glow→blur ordering and shared image
effect units. Glow derives from the preceding shadow/artwork group, and blur
filters the complete group. An ordinary native duplicate adds gold shadow and
cyan glow, then passes the same history/save/cold-reopen/owned export/download
and complete timeline playback flow. All four paired whole soft-edge RGB checks
pass the predeclared4-code-value limit: native/final RMSE2.61790–2.81076.

- [Actual combined-effects film](proof/combined/blur-animation/final.mp4)
- [Combined effects — full editable Studio playback](proof/combined/blur-animation/edited-in-studio.mp4)
- [Combined effects — four measured pairs](proof/combined/paired-blur.json)
- [Checkpoint, graph/output/input hashes and remaining scope](checkpoint.json)

19 focused worker cases, one native preview component case and the strict App
build pass;122 component cases are skipped. The complete Studio component suite
remains unqualified; the earlier full emulator run reported existing Studio
failures. Two real CPU export/download windows take46.909s and50.900s. Both films
and recordings are private diagnostic evidence. This does not qualify full sound,
all image properties/easings, masked effect stacks or video/3D consumers.

QA corrections are retained: the first runner chose the motion-design tab
instead of the ordinary layer inspector; an image was initially inserted at the
current1.5s playhead and then moved to0s through its normal timing control; cold
completed-job recovery could arrive after the first Live Edit check. The current
runner waits for that owned recovery before selecting Live Edit and confirms
the actual source canvas. Its first combined-filter assertion incorrectly
required blur to be the first filter; the corrected observer requires both
drop-shadows followed by blur. No extra export or route substitution was used
to repair these observers.

Remaining defects include the retained strict feather/inverted-mask outer-edge
failures, full text/matte/grade and moving/cold/broad media parity, video effects,
global order/nesting, further professional controls, ordinary-account runtime
lifecycle and human sound/creative review. Continue S02 shared effect/mask
conformance, then S03 composition/nesting and S04 controls. Readiness remains
unchanged; no PRO/production or creative/showroom qualification is granted.
