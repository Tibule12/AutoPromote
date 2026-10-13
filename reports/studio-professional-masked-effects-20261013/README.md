# Canonical image animation with masked effects —13 October2026

An actual native mixed edit reproduced a preview defect: the legacy CSS entrance
animation's persistent opacity1 overrode the saved opacity keys. The timeline
and worker evaluated the curve, but the programme showed full opacity. Legacy
zoom/slide fill and transform transitions could similarly replace or lag the
authored transform.

Keyed ordinary images now use the canonical curve directly, with legacy entrance
classes/animation and transform transitions suppressed. Unkeyed image fades use
the saved image opacity instead of finishing at1. The existing project document,
commands, history, interpolation, masks and renderer remain the editing path.
No extra animation graph or render-only state is introduced.

## Actual native results

Two real signed-in Studio duplicates combine one transparent image with gold
shadow, cyan glow, blur, a feathered mask and eight ordinary X/scale/rotation/
opacity keys. One uses an ellipse; the other a custom inverted percentage
polygon. Both complete native edit/history/save/cold-reopen/owned CPU export/
download/full decode and final playback beside the editable keyframe timeline.
Each movie is3s,720×1280 H.264/AAC with72 frames at24fps.

- [Ellipse — actual final](proof/masked-effects/final.mp4)
- [Ellipse — complete Studio playback and editable keys](proof/masked-effects/edited-in-studio.mp4)
- [Inverted polygon — actual final](proof/inverted/masked-effects/final.mp4)
- [Inverted polygon — complete Studio playback and editable keys](proof/inverted/masked-effects/edited-in-studio.mp4)
- [Exact inputs/graphs/outputs, current and failed measurements](checkpoint.json)

The same already-completed ellipse export was reused after repairing preview.
Observed preview opacity changes from1 at all four clocks to0.671562,0.8225,
0.973437 and0.995, matching its actual canonical keys. No new render was needed
for that repair. The second edit uses its independently retained actual keys.

All four inverted-polygon colour pairs pass the existing4-code-value soft-region
RGB RMSE limit; native/final RMSE is2.65218–3.73146. The ellipse currently passes
three of four. Its1.5s pair fails at4.36428 on an actual720×1280 native stage.
An earlier512×910 display also failed the2.5s pair at4.48865; all failures are
retained. The native window was resized through normal browser layout to
1600×1770, yielding exact720×1280 stage dimensions; there was no fitted shift,
retiming, tolerance change or another export. This does not qualify whole mask/
effect raster agreement, continuous picture, broad media or sound.

The pictures were inspected and both complete movies played in the headless,
muted Studio. Recordings contain the exact export soundtrack. This is private
diagnostic evidence, not human sound/creative review or a public showcase.

## Verification and limits

42 focused checks pass:21 automation/mask/compiler,20 layer/text renderer and
one native preview component regression.123 other main-component cases are
skipped; the whole Studio suite remains unqualified. The strict ordinary App
build passes. Continuity, reviewed knowledge/generated-document consistency and the secret scan pass.
Knowledge1.0.8 records the bounded image-key precedence and remaining failures
without changing feature readiness.

The first observer compared revision/journal hashes across undo/redo instead of
canonical decisions. A resumed attempt also clicked Undo after replaying values
that were already present. Current history checks make a concrete reversible
edit and compare decisions; saved/cold-reopened documents still match exactly.
Normalized decimal input is used for new authoring; the first export's actual
0.995 opacity endpoint is retained and measured rather than silently replaced.

Two bounded local CPU exports were used. GPU/model jobs, paid GPU runtime/cost,
publishing and production deployment are zero. Existing projects, films,
template work and unrelated services are preserved. QA is headless/muted; this
3s proof reserves1GiB and caps capture scratch at64MiB. Capture frames are removed
after encoding. Its own local API/App/worker stop after verification. Generated
media and private authentication remain outside Git.

Remaining defects: the failed ellipse raster samples, historical landscape
soft-mask edges, source/graphic raster separation, complete moving/cold/broad
picture and sound, unkeyed entrance clocks, animated mask paths, video masking/
effects, global composition/nesting and ordinary-account runtime qualification.
Next: continue S02 source/graphic raster and mask/effect-pair conformance; then
S03 global composition/nesting and S04 professional controls. No PRO/production,
creative or full-parity promotion is granted.
