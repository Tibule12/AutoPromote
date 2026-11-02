# Edit a video in your own style

Development documentation • product 1.2.0 • knowledge 1.0.17 • 2026-10-26

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.own_style` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Change ordinary clips, titles, framing, captions, motion, colour and sound manually in the same editable project used by templates and reviewed Director edits.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Import your owned footage or apply an available shared template from Media. Templates author normal editable clips, layers, keys and audio; they do not lock your style.
   Feature: `studio.templates`.

2. Use Cut for splits/trims and select the occurrence you want to change. Reframe changes aspect, position and zoom; review faces throughout the crop.
   Feature: `studio.cut`.

3. Use Graphics for your own text, fonts, colours, images, position, size, opacity and timing. Edit caption words/timing and style in Captions.
   Feature: `studio.layers`.

4. Use Motion for supported transform keys, easing and movement. Select the actual layer and inspect its entrance and exit. Some advanced 3D/Creator FX controls are placement studies; read their limits.
   Feature: `studio.keyframes`.

5. Use Color to adjust the image finish. Composite provides optional subject/background treatment; keep the original background when replacement is unnecessary.
   Feature: `studio.color`.

6. Use Sound for speech, music, voiceover, sound effects, levels and fades. Review the rendered mix; whole live-preview/final sound agreement remains unqualified.
   Feature: `studio.audio`.

7. Save and reopen the project to retain your choices. Undo/Redo operates on the shared project. Keep an editable backup before major changes. Changing a processed scene requires a new reviewed preview.
   Feature: `studio.revision`.

8. Render the current revision, then watch the full actual movie with sound. Check cuts, typography, moving boundaries and audio before using the result.
   Feature: `studio.export`.

## Feature readiness

- studio.timeline — **PARTIAL**: Displays clip occurrences, layers, audio cues and property keys on the shared programme clock.
- studio.cut — **PARTIAL**: Splits a canonical clip occurrence at the mapped output playhead; source ranges and linked material follow the shared edit transaction.
- studio.trim — **PARTIAL**: Changes the retained source range of an occurrence and rebases linked timing. This is a source edit rather than merely hiding a browser element.
- studio.layers — **FUNCTIONAL**: Stores ordinary text, image and video overlays as editable canonical layers. Arbitrary nested global composition is still outside the qualified subset.
- studio.transforms — **FUNCTIONAL**: Edits position, scale, rotation, anchor, crop and opacity of ordinary layers. Native transform animation is preserved after save and reopen.
- studio.keyframes — **FUNCTIONAL**: Adds property keys to a selected ordinary layer, moves them in the timeline and interpolates poses. Retained evidence covers native controls, undo/redo, reopen and export; whole-stage agreement is still partial.
- studio.color — **FUNCTIONAL**: Edits deterministic grade parameters and finish keys. Grade controls affect the selected supported stage; they do not establish arbitrary film-grade workflow parity.
- studio.captions — **BROKEN**: Creates editable timed speech captions with a source-language choice. The empty-hint repetition defect is repaired on the retained mixed-speech clip; mixed-language wording and broad automatic-caption quality remain unqualified.
- studio.audio — **FUNCTIONAL**: Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.
- studio.compositing — **PARTIAL**: Combines editable layers and masks, including opt-in background image replacement in Composite. New footage needs its own reviewed subject mask; clean automatic replacement across arbitrary videos remains unqualified.
- studio.templates — **PARTIAL**: Instantiates a pinned draft template into ordinary editable clips, layers, keyframes and audio. Retained signed-in local lifecycle evidence exists; public qualification and the showroom handoff remain incomplete.
- studio.revision — **FUNCTIONAL**: Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.
- studio.export — **PARTIAL**: Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.

## Result and limitations

Your own editable style and timing in the normal Studio project, with a reviewed export. No mandatory template or background replacement.

- Supported controls remain subject to their feature limits, account access and media ownership. This does not certify every tool or effect combination.
- Whole predictive picture/sound parity, arbitrary nesting and broad ordinary-account model execution remain incomplete. Source-specific manual mask corrections do not generalize to new videos.
- Technical records document private development work. They are not evidence that every feature is deployed or available in production.
- Caption wording, timing and style can be edited manually. Automatic caption generation has its separate documented blocking defect; manual editing does not qualify automatic transcription.

Troubleshooting references: system.unsupported_media, studio.revision.
