# Studio

Development documentation • product 1.2.0 • knowledge 1.0.17 • 2026-10-26

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Timeline

ID: `studio.timeline` • **PARTIAL** • DETERMINISTIC

Displays clip occurrences, layers, audio cues and property keys on the shared programme clock.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video occurrences, image/video/text layers, audio cues

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Import your owned footage in Media or open a saved project. Select a clip, text/image layer or audio cue on the timeline.
2. Use Cut and Reframe for the picture, Graphics and Motion for layers, Color for the finish, and Sound for the mix. Templates and reviewed Director edits remain editable in these same controls.
3. Save the project, reopen it and render the current revision. Watch the complete exported movie with sound before using it.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified. Timeline markers, the output-position control and playback time follow the programme decoder and the existing output time map. Split and source trim commands sample the decoder when clicked, including between ordinary UI updates. Finished-file source edits resolve the correct source occurrence and return to Live Edit. An edge cursor is rejected instead of reusing an earlier UI position.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Some timeline operations and mixed retiming/layer/audio combinations remain partial. Review the actual export; live picture and sound can differ.
- Each editing tool retains its documented limits. An available control does not certify every effect combination or clean automatic background replacement.
- Detailed inspector values, active-layer filtering, key navigation and broader retimed/nested combinations still require separate qualification. A more responsive playhead does not establish full picture/sound synchronization or playback smoothness.
- Playback latency during heavy work remains under review. Check the paused frame before detailed effect edits; a responsive cursor does not certify full live picture/sound accuracy.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Split a clip

ID: `studio.cut` • **PARTIAL** • DETERMINISTIC

Splits a canonical clip occurrence at the mapped output playhead; source ranges and linked material follow the shared edit transaction.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.timeline (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Trim a clip

ID: `studio.trim` • **PARTIAL** • DETERMINISTIC

Changes the retained source range of an occurrence and rebases linked timing. This is a source edit rather than merely hiding a browser element.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.timeline (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Add B-roll](../task-guides/task-add_broll.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Ripple edits

ID: `studio.ripple` • **PARTIAL** • DETERMINISTIC

Removes a programme gap and retimes linked layers, cues and speed keys. Review mixed clocks and locked tracks.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.timeline (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Editable layers

ID: `studio.layers` • **FUNCTIONAL** • DETERMINISTIC

Stores ordinary text, image and video overlays as editable canonical layers. Arbitrary nested global composition is still outside the qualified subset.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Layer start](../control-reference/index.md#studio-layer-start), [Layer duration](../control-reference/index.md#studio-layer-duration), [Layer width](../control-reference/index.md#studio-layer-width), [Layer height](../control-reference/index.md#studio-layer-height)

**Guides:** [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## 2D layer transforms

ID: `studio.transforms` • **FUNCTIONAL** • DETERMINISTIC

Edits position, scale, rotation, anchor, crop and opacity of ordinary layers. Native transform animation is preserved after save and reopen.

**Purpose:** Place an ordinary graphic, logo, image or video layer precisely within a shot.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** studio.layers (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Select ordinary clips/layers/audio and modify supported native controls; undo/redo stays available.

**Preview:** Evaluates native x/y/scale/rotation/opacity/crop keys on the programme clock. Anchor is static geometry; image/video dimensions are static layer fields.

**Final render:** The shared compiler/worker consumes the saved layer geometry and supported motion keys. Current retained native scope is functional; global staging and whole-programme agreement remain partial.

**Limits**

- Ordinary layers are supported; arbitrary nested/global composition remains unqualified.
- Title-size and ordinary-motion widgets have different scale ranges. Crop applies to image/video overlays, not text.
- Anchor and width/height are static geometry, not supported native animated properties.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Position X](../control-reference/index.md#studio-transform-x), [Position Y](../control-reference/index.md#studio-transform-y), [Scale](../control-reference/index.md#studio-transform-scale), [Rotation](../control-reference/index.md#studio-transform-rotation), [Opacity](../control-reference/index.md#studio-transform-opacity), [Anchor X](../control-reference/index.md#studio-transform-anchorx), [Anchor Y](../control-reference/index.md#studio-transform-anchory), [Horizontal crop](../control-reference/index.md#studio-transform-cropx), [Vertical crop](../control-reference/index.md#studio-transform-cropy)

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Motion / Transform Keyframes

ID: `studio.keyframes` • **FUNCTIONAL** • DETERMINISTIC

Adds property keys to a selected ordinary layer, moves them in the timeline and interpolates poses. Retained evidence covers native controls, undo/redo, reopen and export; whole-stage agreement is still partial.

**Purpose:** Create deliberate editable movement and retain the same keys across manual editing, Director proposals, saving and final compilation.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** studio.transforms (FUNCTIONAL), studio.timeline (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Select an ordinary editable layer and open Motion; set its initial pose.
2. Move the playhead and choose Add transform keyframe; change the next pose.
3. Expand native property lanes, move/nudge keys, adjust easing/curve and play the actual motion.
4. Undo/redo, save/reopen, render and inspect the current output. Static anchor geometry is not an animated property.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified. Main-video motion, crop, finish/adjustment and join effects follow the native decoded picture timestamp while playing. Paused scrubbing retains its existing exact-frame/native route. This bounded frame-clock repair does not establish whole audiovisual or pixel parity.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- No selected editable layer: Select an ordinary layer before adding transform keys.
- Keyframe edits are locked: Unlock the applicable property/layer in the normal controls before editing.
- Motion differs after export: Check current keys/source binding and the documented preview/final limitations; inspect mapped frames in the actual movie.

**Controls:** [Position X](../control-reference/index.md#studio-transform-x), [Position Y](../control-reference/index.md#studio-transform-y), [Scale](../control-reference/index.md#studio-transform-scale), [Rotation](../control-reference/index.md#studio-transform-rotation), [Opacity](../control-reference/index.md#studio-transform-opacity), [Anchor X](../control-reference/index.md#studio-transform-anchorx), [Anchor Y](../control-reference/index.md#studio-transform-anchory), [Horizontal crop](../control-reference/index.md#studio-transform-cropx), [Vertical crop](../control-reference/index.md#studio-transform-cropy), [Keyframe time](../control-reference/index.md#studio-keyframe-time), [Keyframe easing](../control-reference/index.md#studio-keyframe-easing)

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Modify Director edits manually](../task-guides/task-director_manual.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Motion easing

ID: `studio.easing` • **FUNCTIONAL** • DETERMINISTIC

Controls interpolation using linear, ease-in, ease-out, ease-in-out, hold and bounded cubic curves. Curve handles change how motion accelerates between keys.

**Purpose:** Shape the acceleration or hold between native property poses.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** studio.keyframes (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Select an existing key or pose group for the intended ordinary layer.
2. Choose linear, ease-in, ease-out, ease-in-out, hold or custom curve; inspect the transition into that key.
3. For a custom curve, use bounded handles and play the movement; save/reopen and inspect final output.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- The shared curve contract allows Y overshoot -2–2, while some numeric inspector widgets restrict Y to 0–1.
- The right-hand key supplies easing for the interval between keys.
- This is native 2D property interpolation, distinct from legacy scene-level 3D easing.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Keyframe easing](../control-reference/index.md#studio-keyframe-easing), [Cubic curve handles](../control-reference/index.md#studio-keyframe-curve)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Crop and reframe

ID: `studio.crop_reframe` • **FUNCTIONAL** • DETERMINISTIC

Reframes a source or crops an overlay using the shared time map and existing renderer. Preserve subject framing and inspect source geometry at cuts.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md)

**Templates:** No pinned shared-template binding recorded.

## Captions and transcription

ID: `studio.captions` • **BROKEN** • DETERMINISTIC

Creates editable timed speech captions with a source-language choice. The empty-hint repetition defect is repaired on the retained mixed-speech clip; mixed-language wording and broad automatic-caption quality remain unqualified.

**Purpose:** Generate timed speech drafts, correct wording and speaker/language labels, and retain editable caption styles in the shared Studio project.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video with speech, reviewed transcript phrases

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open Studio → Captions and choose Speech language. Automatic detection uses the general speech recognizer. Choose English or Afrikaans for that language; choose a listed South African language or mixed English for the specialised recognizer.
2. Choose Generate speech captions. Changing the language keeps the existing track until you explicitly regenerate.
3. Correct uncertain wording, speaker/language labels and timing in the editable lines. Preview the current phrases and inspect the final export.
4. Check Speech source beside Generate before requesting captions. It identifies the video currently selected on the timeline; each source keeps its own editable caption lines.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- Speech language is a source preference, not detected-language evidence. Code-switched wording still needs review; the prior broad automatic-caption qualification remains open.
- Automatic English translation is unavailable for the explicit South African language choices. Import reviewed English subtitles when needed.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- Generate and review captions before rendering.: There are no editable caption phrases for the requested burn-in. Automatic wording still needs review. Use the caption guide to prepare and manually review editable phrases before relying on a captioned export.
- Review every flagged caption line before rendering.: Approve or correct each flagged phrase and timestamp in Captions. Correct all flagged wording and timing; the repaired repetition trigger does not establish accuracy across all speech.

**Controls:** [Speech language](../control-reference/index.md#studio-captions-source_language)

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Create captions and correct transcription](../task-guides/task-captions_correct.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Titles

ID: `studio.titles` • **FUNCTIONAL** • DETERMINISTIC

Places editable title text in ordinary layers with deterministic style, layout and timing. It is distinct from automatic speech transcription.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layer

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Title text](../control-reference/index.md#studio-title-text), [Title size](../control-reference/index.md#studio-title-scale), [Title text color](../control-reference/index.md#studio-title-color)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Motion graphics

ID: `studio.motion` • **FUNCTIONAL** • DETERMINISTIC

Animates authored ordinary layers through the canonical project and renderer. Native keys do not imply neural generation or professional art direction.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## VFX and layer effects

ID: `studio.effects` • **FUNCTIONAL** • DETERMINISTIC

Applies the supported deterministic visual effects and source-bound subject scenes. Availability and final support depend on the specific effect.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Layer blur](../control-reference/index.md#studio-effect-blur), [Glow radius](../control-reference/index.md#studio-effect-glow_radius), [Glow intensity](../control-reference/index.md#studio-effect-glow_intensity), [Shadow blur](../control-reference/index.md#studio-effect-layershadow_blur), [Shadow opacity](../control-reference/index.md#studio-effect-layershadow_opacity), [Motion blur samples](../control-reference/index.md#studio-effect-motionblur_samples), [Motion blur shutter](../control-reference/index.md#studio-effect-motionblur_shutter)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Compositing

ID: `studio.compositing` • **PARTIAL** • DETERMINISTIC

Combines editable layers and masks, including opt-in background image replacement in Composite. New footage needs its own reviewed subject mask; clean automatic replacement across arbitrary videos remains unqualified.

**Purpose:** Combines ordinary layers with supported blend modes and masks. Global stage order, arbitrary nesting and full preview/export agreement remain incomplete.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** studio.layers (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open Studio → Composite and add effects to the selected owned video clip.
2. Leave Background choice on Keep original background, or upload a PNG, JPEG or WebP image and choose it for replacement.
3. Select the person using Subject point on the paused source. Select optional furniture, microphones or other objects separately. Extra objects are empty by default; people selection is not automatic detection of everyone.
4. Create and review this source’s subject mask through the available model workflow, or explicitly reuse a valid mask belonging to the same source and range.
5. Tune foreground/background colour, matte refinement and optional holdouts, render the processed preview and inspect moving edges throughout the shot. Save and export the current reviewed revision.
6. After refining a saved mask, set Edge detail width to 0 to retain its refined edges. Use Remove old background colour for pale residue, render the preview and inspect the whole moving shot.
7. If removing an overlapping object exposes damaged rigid equipment, use Foreground holdout → Repair opaque detail from source. Set convex source/target quads, feather/end blend, optional clear_box and protect_paths. Default cleaned colour; source_color original and saturation 0–2 retain photographed opaque texture. Coordinates stay fixed in the source frame. Review the full moving shot and export.
8. For one coarse clothing edge, set Edge detail width above zero and use Edge refinement region points to limit the CPU edge solve to that source-frame region. Colour cleanup is a soft boundary guide there; explicit removal paths stay excluded and unrelated equipment alpha is retained. Render and inspect the whole moving shot.
9. For a translucent clothing fringe, adjust Transparent edge level and Opaque edge level before colour recovery, and use Edge opacity region points to limit the change. Defaults 0/1 retain the current soft matte; the opaque level must remain at least 0.05 higher. Render a new preview and inspect the full moving subject and selected objects.

**Preview:** Composite renders a processed subject-scene preview from the selected source and reviewed mask. Creator FX background placement remains a separate browser study. Changing a scene invalidates its previous preview; inspect the current processed movie.

**Final render:** Export uses the saved layers, supported masks and reviewed processed subject scenes. Graphics are drawn at the chosen export resolution. Review the actual final movie; whole live-preview and final-output agreement remains unqualified.

**Limits**

- Image and title geometric masks support feather and inversion. Inspect their boundaries in the exported movie, especially with soft edges.
- Geometric masks on the main video or video layers currently stop export. Real person/background separation uses Composite’s separately processed subject mask. Arbitrary nesting and global layer/effect order remain incomplete.
- This dated development snapshot does not establish professional or production readiness.
- Background replacement is optional. Uploads accept PNG, JPEG or WebP up to 32 MB; a scene supports at most twelve effect layers.
- A new video requires its own source-bound mask and available authorized model execution. A saved mask from another video cannot be transferred. An unavailable model service prevents creating a new mask.
- Previous private podcast examples were rejected for appearance. Inspect the saved foreground mask and replacement image separately. Furniture contained in a replacement image remains behind the subject even when the old room is correctly removed; use replacement framing or choose an empty-room image to avoid extra chairs. Refine foreground selection is appropriate when the mask itself retains old-room pixels. Source-specific manual paths and support samples do not prove clean automatic replacement for other footage; inspect the complete moving preview and final movie.
- Optional object holdouts and removal paths are advanced manual normalized source-frame geometry. They do not automatically identify furniture or microphones or track a hand-drawn shape through motion.
- Opaque source-detail repair copies existing cleaned pixels from the same frame. It does not infer the hidden original object, automatically track geometry or repair an unselected object. A clean photographed sample is required; moving or articulated objects need separate timed corrections.
- Local edge regions use manual fixed source-frame coordinates. They do not track or reconstruct objects; hard authored removal paths still take priority. Previous podcast movies remain owner-rejected while this correction is reviewed.
- Foreground contrast uses the final visible foreground, including soft edge coverage. Removed background pixels do not set its brightness pivot. Use foreground exposure, saturation and contrast to match your chosen room, then inspect the moving preview and final movie.
- Colour treatment paths apply the selected object saturation to additional fixed source-frame regions without retaining extra pixels. They do not change the cutout, restore missing objects or track motion. To keep or remove an object, edit its foreground selection; review the moving preview and final movie.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Layer blend mode](../control-reference/index.md#studio-composite-blend), [Edge detail width](../control-reference/index.md#studio-composite-background_edge_radius), [Remove old background colour](../control-reference/index.md#studio-composite-background_decontaminate), [Repair opaque detail from source](../control-reference/index.md#studio-composite-source_detail_repair), [Edge refinement region points](../control-reference/index.md#studio-composite-edge_refinement_region), [Colour treatment paths](../control-reference/index.md#studio-composite-colour_treatment_paths), [Transparent edge level](../control-reference/index.md#studio-composite-alpha_transparent), [Opaque edge level](../control-reference/index.md#studio-composite-alpha_opaque), [Edge opacity region points](../control-reference/index.md#studio-composite-alpha_region)

**Guides:** [Replace a background](../task-guides/task-background_replace.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Mask-backed compositing

ID: `studio.masks` • **FUNCTIONAL** • DETERMINISTIC

Uses reviewed owned subject-mask results in a bounded scene and deterministic final composite. This is separate from a browser matte demonstration.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.subject_cutout (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- MODEL_SUBJECT_MASK_REQUIRED: The attached subject result must be a real segmentation mask artifact, not a placement study.

**Controls:** [Mask feather](../control-reference/index.md#studio-subject-mask_feather), [Mask expansion](../control-reference/index.md#studio-subject-mask_expansion)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** No pinned shared-template binding recorded.

## Object tracking

ID: `studio.tracking` • **FUNCTIONAL** • DETERMINISTIC

Consumes real owned tracking artifacts for the supported tracked scene subset. Obtaining a new track depends on the configured capability worker and reviewed source range.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.model_runtime (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- MODEL_TRACK_MASK_REQUIRED: The selected tracking path requires a mask artifact. Check the owned source and reviewed mask in the existing workflow.

**Controls:** [Subject source range](../control-reference/index.md#studio-subject-range), [Subject seed points](../control-reference/index.md#studio-subject-seed_points), [Subject point labels](../control-reference/index.md#studio-subject-seed_labels)

**Guides:** [Track text to a moving object](../task-guides/task-tracked_text.md)

**Templates:** No pinned shared-template binding recorded.

## Subject segmentation

ID: `studio.subject_cutout` • **FUNCTIONAL** • DETERMINISTIC

Uses a real source-bound segmentation result to separate the selected subject across the supported scene range. Seed points and artifact review identify the subject.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.model_runtime (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open Studio → Composite, add the owned source clip and select the person with Subject point in the paused picture.
2. Add Background point marks to exclude unwanted areas; use later prompt frames/shot resets when the selected subject changes.
3. Optionally select additional objects in Subject mask. Leave those selections empty for people only.
4. Check current execution availability and authorization before creating the mask. Review the resulting moving mask before using it in an effect.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- People are selected with prompt points; this is not automatic detection of every person. Optional object selections do not guarantee clean thin equipment or hair.
- Masks belong to their exact source and scene range. Creating a mask for new footage requires available authorized model execution. Manual example masks and contours cannot qualify another video.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Subject source range](../control-reference/index.md#studio-subject-range), [Subject seed points](../control-reference/index.md#studio-subject-seed_points), [Subject point labels](../control-reference/index.md#studio-subject-seed_labels)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md), [Replace a background](../task-guides/task-background_replace.md)

**Templates:** No pinned shared-template binding recorded.

## Transitions

ID: `studio.transitions` • **PARTIAL** • DETERMINISTIC

Compiles transitions attached to clip occurrences into the existing sequence. Not every displayed transition or stacked edit combination has matched preview/final evidence.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Join transition duration](../control-reference/index.md#studio-transition-duration)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Speed and retiming

ID: `studio.speed` • **PARTIAL** • DETERMINISTIC

Builds a bounded piecewise speed plan and maps programme clocks, audio and captions through it. Retained repairs cover selected source-geometry and audio cases, not all retime combinations.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Clip/programme speed](../control-reference/index.md#studio-speed-rate)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Audio lanes and mixing

ID: `studio.audio` • **FUNCTIONAL** • DETERMINISTIC

Mixes owned original audio, master podcast, voiceover, music, B-roll and SFX buses. Cues and gain keys remain editable in the project.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Add B-roll](../task-guides/task-add_broll.md), [Modify Director edits manually](../task-guides/task-director_manual.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Voiceover takes

ID: `studio.voiceover` • **PARTIAL** • DETERMINISTIC

Records or imports owned voice takes, places them on the timeline and edits cue timing. A microphone permission and durable owned source are needed for a reliable export.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** studio.audio (FUNCTIONAL), system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Voice take volume](../control-reference/index.md#studio-voiceover-volume), [Voice take duration](../control-reference/index.md#studio-voiceover-duration)

**Guides:** No task guide in V1.

**Templates:** podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1

## Music lane

ID: `studio.music` • **FUNCTIONAL** • DETERMINISTIC

Adds owned music and adjusts cue placement and volume automation in the same programme. A library selection does not confer rights for arbitrary outside music.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified. Music automation and overlapping fades follow the output audio clock. Ready imported cues use the final mixer’s linear sample mapping in the decoded preview route; their source controls remain editable. Prepared speech ducking retains its bounded CPU-verified gain samples. An explicit prepared Play/Resume retains the paused start position. The verified native music/speech/cue mix includes its opening samples and stays continuous through a prepared cut. Eligible silent pictures adjust their preview rate toward that sound clock; Pause and real seeks retain their stop/reanchor behavior. Held pictures under UI load, exact terminal delivery, other audio routes and broad processed picture/sound/listening still need qualification.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Music volume](../control-reference/index.md#studio-music-volume), [Music fadeIn](../control-reference/index.md#studio-music-fadein), [Music fadeOut](../control-reference/index.md#studio-music-fadeout)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Sound effects

ID: `studio.sfx` • **PARTIAL** • DETERMINISTIC

Places sound cues on the native timeline. Included sound-design presets synthesize deterministic PCM; owned external sound files can be used in the supported audio path.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Effect volume](../control-reference/index.md#studio-sfx-volume), [Sound cue duration](../control-reference/index.md#studio-sfx-duration), [Sound source trim start](../control-reference/index.md#studio-sfx-trim)

**Guides:** [Create a cinematic logo reveal](../task-guides/task-cinematic_logo.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Voice repair

ID: `studio.audio_restoration` • **FUNCTIONAL** • DETERMINISTIC

Uses deterministic repair settings for denoise, de-essing, EQ, hum filtering, compression, limiting and loudness. Voice isolation here does not claim neural source separation.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Denoise](../control-reference/index.md#studio-audio-denoise), [De-esser](../control-reference/index.md#studio-audio-deesser), [Compressor](../control-reference/index.md#studio-audio-compressor), [Limiter ceiling](../control-reference/index.md#studio-audio-limiter), [Loudness target](../control-reference/index.md#studio-audio-loudness), [EQ low](../control-reference/index.md#studio-audio-eq_low), [EQ mid](../control-reference/index.md#studio-audio-eq_mid), [EQ high](../control-reference/index.md#studio-audio-eq_high), [Hum removal](../control-reference/index.md#studio-audio-hum)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Audio gain keyframes

ID: `studio.audio_automation` • **FUNCTIONAL** • DETERMINISTIC

Edits source-bus volume keys and interpolation alongside native cue gain. Retained timing and export receipts cover selected ducking and retimed sound cases.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** studio.audio (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified. Original/master source gain and J/L-cut dialogue update from decoded frames without rendering the editor per frame. Source/occurrence checks reject stale clocks; buffering/seeking suspend dialogue and resume reanchors it. Frame-clock timing is separate from sample-exact whole-mix qualification. Short source-gain lookahead on the existing browser audio graph keeps a fade moving during a bounded editor stall; seeking, buffering and pause cancel/reanchor it. Music automation and overlapping fades follow the output audio clock. Ready imported cues use the final mixer’s linear sample mapping in the decoded preview route; their source controls remain editable. Prepared speech ducking retains its bounded CPU-verified gain samples. Native whole-mix startup/handoff and broad processed sound accuracy still need qualification. Equal envelope data no longer restarts running music ramps. Linked recorded-voice cuts retain their original fades through save, reopen and export; prepared speech shares the current decoder’s planned music handoff. Bounded mixed-bus samples pass, while continuous picture/sound transport and broad listening remain under review. Prepared-cut playback retains authored pacing and starts the decoded programme audio from an advancing video frame. Bounded native mixed audio remains continuous across the verified cut without per-cut reanchoring; picture startup and full audiovisual alignment remain unqualified. Decoded programme sound keeps its existing clock when video starts late. The preview catches the picture up; creator Pause and seek still override that recovery. Broader audiovisual timing remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- The verified continuous mixed-audio path uses muted source sound, prepared speech and decoded cues. Original sound, extracted/B-roll audio and decoder fallbacks still need broader parity checks.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Bus volume key](../control-reference/index.md#studio-audio-gain_key), [Automation source](../control-reference/index.md#studio-audio-automation_source)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Music ducking around speech

ID: `studio.ducking` • **PARTIAL** • DETERMINISTIC

Keeps music lower during placed dialogue using the available automation and speech-aware mix workflow. Review the actual sound at voice boundaries and after retiming.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** audio cues, video with audio

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Speech-aware ducking](../control-reference/index.md#studio-audio-ducking), [Duck strength](../control-reference/index.md#studio-audio-ducking_strength), [Ducking mode](../control-reference/index.md#studio-audio-ducking_mode)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Color and finishing

ID: `studio.color` • **FUNCTIONAL** • DETERMINISTIC

Edits deterministic grade parameters and finish keys. Grade controls affect the selected supported stage; they do not establish arbitrary film-grade workflow parity.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Exposure stops](../control-reference/index.md#studio-grade-exposurestops), [Lift](../control-reference/index.md#studio-grade-lift), [Gamma](../control-reference/index.md#studio-grade-gamma), [Grade gain](../control-reference/index.md#studio-grade-gain), [Tint](../control-reference/index.md#studio-grade-tint)

**Guides:** [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## 3D title/logo scene

ID: `studio.three_d` • **PARTIAL** • DETERMINISTIC

Authors bounded 3D scenes and renders them through the existing 3D worker path. Supported transforms are approximate across browser and final render, and several displayed fields are disabled for final output.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D title/logo scene

**Requires:** studio.layers (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [X](../control-reference/index.md#studio-three_d-x), [Y](../control-reference/index.md#studio-three_d-y), [Z](../control-reference/index.md#studio-three_d-z), [Scale](../control-reference/index.md#studio-three_d-scale), [Rotation X](../control-reference/index.md#studio-three_d-rotationx), [Rotation Y](../control-reference/index.md#studio-three_d-rotationy), [Rotation Z](../control-reference/index.md#studio-three_d-rotationz), [Extrusion Depth](../control-reference/index.md#studio-three_d-extrusiondepth), [Bevel](../control-reference/index.md#studio-three_d-bevel), [Focal Length](../control-reference/index.md#studio-three_d-focallength), [Light Intensity](../control-reference/index.md#studio-three_d-lightintensity), [Camera Motion](../control-reference/index.md#studio-three_d-cameramotion), [Bloom](../control-reference/index.md#studio-three_d-bloom), [3D material](../control-reference/index.md#studio-three_d-material), [3D font family](../control-reference/index.md#studio-three_d-fontfamily), [3D font weight](../control-reference/index.md#studio-three_d-fontweight), [3D scene easing](../control-reference/index.md#studio-three_d-easing), [Audio-reactive intensity](../control-reference/index.md#studio-three_d-audioreactiveintensity), [3D light direction](../control-reference/index.md#studio-three_d-lightdirection), [3D shadows](../control-reference/index.md#studio-three_d-shadows), [3D reflections](../control-reference/index.md#studio-three_d-reflections), [3D background](../control-reference/index.md#studio-three_d-background), [3D quality](../control-reference/index.md#studio-three_d-quality)

**Guides:** [Create a cinematic logo reveal](../task-guides/task-cinematic_logo.md), [Create a 3D title/logo scene](../task-guides/task-three_d_title.md)

**Templates:** No pinned shared-template binding recorded.

## Final 3D rendering

ID: `studio.blender` • **PARTIAL** • DETERMINISTIC

Renders supported authored scenes to owned output for the canonical composition. A browser WebGL preview alone is insufficient to qualify the final scene.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D title/logo scene

**Requires:** studio.three_d (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- Generate an HQ 3D preview for every active 3D scene before exporting.: An active scene needs current owned HQ frames matching its settings, source and aspect. Open Motion → 3D Motion and review the matching preview. A browser WebGL scene is insufficient; existing availability and cost checks still apply.
- 3D preview is missing: The referenced HQ job cannot be found. Check the current scene and owned preview in 3D Motion before export.
- 3D preview is stale or not owned by this project: Check the current scene, completed job, ownership and covered duration. Use the normal owned preview path; never reuse another project’s output.
- 3D preview aspect ratio changed; generate a new preview: The output aspect no longer matches the owned preview. Review the requested aspect and obtain a matching current preview through the normal authorized workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a 3D title/logo scene](../task-guides/task-three_d_title.md)

**Templates:** No pinned shared-template binding recorded.

## Audio-reactive 3D

ID: `studio.three_d_audio` • **PARTIAL** • DETERMINISTIC

The browser can react to audio, but final scene rendering does not receive the equivalent audio envelope. Do not promise matching reactive motion in the exported movie.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** authored 3D title/logo scene

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Generated B-roll workflow

ID: `studio.generated_video` • **PARTIAL** • DETERMINISTIC

Requests a bounded generated shot, reviews it and imports an accepted owned video into the canonical project. Provider availability, account entitlement and normal-account lifecycle remain partial.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.model_runtime (PARTIAL), system.costs (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Maximum generated cutaways](../control-reference/index.md#generation-max_cutaways)

**Guides:** [Add B-roll](../task-guides/task-add_broll.md)

**Templates:** No pinned shared-template binding recorded.

## Generated image in Studio

ID: `studio.generated_image` • **UNIMPLEMENTED** • DETERMINISTIC

The normal Studio generated-image lifecycle is not qualified or implemented as a complete customer workflow. Separate private generation providers do not establish this feature.

**Available to:** unavailable as a qualified completed workflow

**Media:** image

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Raw generation in Studio

ID: `studio.generated_raw` • **UNIMPLEMENTED** • DETERMINISTIC

The ordinary Studio raw-generation workflow remains unimplemented. A standalone generated file is not an editable, qualified Studio workflow.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Apply a creative template

ID: `studio.templates` • **PARTIAL** • DETERMINISTIC

Instantiates a pinned draft template into ordinary editable clips, layers, keyframes and audio. Retained signed-in local lifecycle evidence exists; public qualification and the showroom handoff remain incomplete.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.layers (FUNCTIONAL), studio.audio (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Bind owned source footage, logo, copy and music in the existing template panel.
2. Bind optional sampled effects where the draft supports them. The podcast story draft takes owned real speech and keeps its voice track and music ducking editable.
3. Review the Director proposal or apply the exact selected version, then continue editing its native layers, keys, cuts and sound.
4. Save/reopen and inspect the finished export with its actual Studio timeline before release.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** The same pinned template instantiates ordinary native clips, title/source keyframes, finish settings and owned sound slots for manual or Director use. Inspect the actual movie produced by the existing AutoPromote renderer. Draft creative quality and broader product qualification remain separate.

**Limits**

- Draft versions are private creative iterations; public/showroom and professional qualification require actual finished-film review.
- Stock inputs remain private slot bindings and are not distributed as a reusable stock library.
- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- TEMPLATE_IDENTITY_MISMATCH: The selected exact template definition is unavailable. Select an available pinned version; do not silently substitute a similar version.
- TEMPLATE_OWNED_MEDIA_REQUIRED: Save an owned asset of the required slot type before binding the template.
- TEMPLATE_FOOTAGE_TOO_SHORT: Choose footage with enough duration after its in-point for the template slot.
- CREATIVE_TEMPLATE_VERSION_UNAVAILABLE: The exact requested shared template version cannot be resolved.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Use a creative template](../task-guides/task-use_template.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Studio playback preview

ID: `studio.preview` • **PARTIAL** • DETERMINISTIC

Shows the existing project programme with mapped source frames and sound. Retained fixes improve selected cases; whole-stage live playback, stalls and picture/sound agreement remain open.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Export a final film](../task-guides/task-final_export.md)

**Templates:** No pinned shared-template binding recorded.

## Final deterministic render

ID: `studio.render` • **FUNCTIONAL** • DETERMINISTIC

Compiles the canonical project into the existing deterministic final path. Output must match the current project revision and owned source evidence.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.revision (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn an image into a cinematic scene](../task-guides/task-image_cinematic.md), [Export a final film](../task-guides/task-final_export.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## Export and download

ID: `studio.export` • **PARTIAL** • DETERMINISTIC

Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.render (FUNCTIONAL), studio.revision (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Replace a background](../task-guides/task-background_replace.md), [Create a cinematic logo reveal](../task-guides/task-cinematic_logo.md), [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Use a creative template](../task-guides/task-use_template.md), [Export a final film](../task-guides/task-final_export.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** No pinned shared-template binding recorded.

## Save and reopen

ID: `studio.persistence` • **FUNCTIONAL** • DETERMINISTIC

Saves canonical project assets, occurrences, layers, keys and audio; reopening restores editable state. Temporary or expired sources require owned source repair.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- Opening an unchanged source occurrence preserves its legacy duration metadata and matching completed-export identity; source-range edits create a new revision.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Use a creative template](../task-guides/task-use_template.md)

**Templates:** No pinned shared-template binding recorded.

## Undo and redo

ID: `studio.undo_redo` • **FUNCTIONAL** • DETERMINISTIC

Uses the shared command history to restore edits and redo them with revision-aware state. It is not permission to mutate a different revision silently.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** No pinned shared-template binding recorded.

## Project revisions

ID: `studio.revision` • **FUNCTIONAL** • DETERMINISTIC

Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- RENDER_TIMELINE_MISMATCH: The render clip count differs from the current canonical edit. Check the current revision and timeline before requesting a new export.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Replace a background](../task-guides/task-background_replace.md), [Modify Director edits manually](../task-guides/task-director_manual.md), [Export a final film](../task-guides/task-final_export.md), [Edit a video in your own style](../task-guides/task-own_style.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, brand_trailer_momentum_v1@1.0.0, brand_trailer_momentum_v1@1.0.1, podcast_story_hook_v1@1.0.0, podcast_story_hook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.1, podcast_clip_proof_youtube_v1@1.0.1, podcast_clip_proof_instagram_v1@1.0.1, podcast_clip_proof_linkedin_v1@1.0.1, podcast_clip_proof_reddit_v1@1.0.1, podcast_clip_proof_facebook_v1@1.0.1, podcast_clip_proof_tiktok_v1@1.0.2, podcast_clip_proof_youtube_v1@1.0.2, podcast_clip_proof_instagram_v1@1.0.2, podcast_clip_proof_linkedin_v1@1.0.2, podcast_clip_proof_reddit_v1@1.0.2, podcast_clip_proof_facebook_v1@1.0.2

## B-roll placement

ID: `studio.b_roll` • **FUNCTIONAL** • DETERMINISTIC

Places owned B-roll as ordinary editable video occurrences or layers and mixes its sound where selected. Source cuts already inside a supplied clip are not newly authored timeline cuts.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Add B-roll](../task-guides/task-add_broll.md)

**Templates:** No pinned shared-template binding recorded.

## Media import

ID: `studio.media_ingest` • **FUNCTIONAL** • DETERMINISTIC

Imports supported owned video, image and audio into canonical assets. Decoding, source validation and ownership checks still apply.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn an image into a cinematic scene](../task-guides/task-image_cinematic.md), [Create a product-launch promo](../task-guides/task-product_launch.md), [Animate a person from an image](../task-guides/task-animate_person.md)

**Templates:** No pinned shared-template binding recorded.

## Stabilization

ID: `studio.stabilization` • **UNIMPLEMENTED** • UNIMPLEMENTED

No qualified normal Studio stabilization contract was found. Do not describe crop or camera movement presets as genuine stabilization.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- No documented supported control range or final stabilization workflow exists.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Text Behind Subject

ID: `studio.compositing.text_behind_subject` • **PARTIAL** • AI_PIPELINE

Renders editable text behind a real segmented subject in a bounded source-bound effect scene. The real mask path is distinct from the Creator browser proxy.

**Purpose:** Make a subject occlude designed typography using real reviewed masks instead of a flat browser placement.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.subject_cutout (FUNCTIONAL), studio.masks (FUNCTIONAL)

**Optional:** studio.compositing.depth_estimation (UNIMPLEMENTED), studio.tracking (FUNCTIONAL)

**Workflow**

1. Choose a short source range and identify the visible subject with positive/negative seed points.
2. Render the subject scene and review the actual mask and text occlusion.
3. Split source occurrences at effect range edges, then save and export the current reviewed scene.

**Preview:** Shows the reviewed source-bound composite when its revision is current. CSS cutout studies do not qualify as this output.

**Final render:** A reviewed current owned subject scene is composited through the deterministic Studio path; stale scenes are rejected.

**Limits**

- Supported scene ranges are 0.25–10 seconds, not arbitrary full-length footage.
- Render and review each active scene; split occurrences at scene range edges before export.
- New mask execution depends on configured capability availability and applicable authorization.
- Effect parameters are not arbitrary native per-property keyframes.

**Common errors**

- No mask result or model capability unavailable: Choose a valid owned source range and points; check the current configured worker and approvals. A browser matte is not a fallback mask.
- Scene preview is stale or expired: Regenerate/review the same current scene; if dispatch is uncertain, reconcile the same job identity.
- Export rejects an active subject scene: Render/review the current scene revision and split occurrences at the source-range edges.

**Controls:** [Subject text X](../control-reference/index.md#studio-subject-x), [Subject text Y](../control-reference/index.md#studio-subject-y), [Subject text size](../control-reference/index.md#studio-subject-font_size), [Subject letter spacing](../control-reference/index.md#studio-subject-tracking), [Subject source range](../control-reference/index.md#studio-subject-range)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** No pinned shared-template binding recorded.

## Tracked graphics

ID: `studio.compositing.tracked_callout` • **PARTIAL** • AI_PIPELINE

Attaches a supported callout to a real owned subject/track result and edits its offsets. This is not arbitrary tracking of every object over long footage.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.tracking (FUNCTIONAL), studio.masks (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Bounded source scene and reviewed result are required.
- Occlusion, missed subjects and fast motion need actual mask/track inspection.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Tracked callout X offset](../control-reference/index.md#studio-subject-offset_x), [Tracked callout Y offset](../control-reference/index.md#studio-subject-offset_y)

**Guides:** [Track text to a moving object](../task-guides/task-tracked_text.md)

**Templates:** No pinned shared-template binding recorded.

## Subject-separated background grade

ID: `studio.compositing.background_grade` • **FUNCTIONAL** • DETERMINISTIC

Grades the background around an owned subject mask. This changes the existing background appearance; it does not replace it with a new scene.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.masks (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Background exposure](../control-reference/index.md#studio-subject-exposure), [Background saturation](../control-reference/index.md#studio-subject-saturation), [Background contrast](../control-reference/index.md#studio-subject-contrast)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Mask-based depth effect

ID: `studio.compositing.mask_depth` • **FUNCTIONAL** • DETERMINISTIC

Creates a restrained 2.5D parallax treatment from subject/background separation. No metric scene depth is inferred.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** studio.masks (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Mask parallax amount](../control-reference/index.md#studio-subject-depth_amount)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Metric depth estimation

ID: `studio.compositing.depth_estimation` • **UNIMPLEMENTED** • UNIMPLEMENTED

A qualified general depth-estimation capability is absent from the current runtime contract. Mask-based parallax is a different implemented effect.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Text behind subject placement proxy

ID: `studio.creator.text_behind_subject` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel places text and a browser subject matte to study layout; it does not itself create a real segmentation artifact.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Background replacement

ID: `studio.creator.background_replacement` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel offers a cutout/background placement proxy. No qualified full replacement workflow is established by those controls.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Screen replacement

ID: `studio.creator.screen_replacement` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel offers a four-corner preview placement study. A tracked real screen replacement and finished export are not qualified.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Replace a laptop/phone screen](../task-guides/task-screen_replace.md)

**Templates:** No pinned shared-template binding recorded.

## Object cleanup / replacement

ID: `studio.creator.object_cleanup` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel shows a patch placement study and explicitly removes no object. It is not generative cleanup.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Remove an object](../task-guides/task-remove_object.md)

**Templates:** No pinned shared-template binding recorded.

## Creator tracking placement proxy

ID: `studio.creator.tracking` • **PROXY_ONLY** • BROWSER_PROXY

The Creator panel can illustrate an intended attachment; that browser study does not establish an owned model track.

**Available to:** unavailable as a qualified completed workflow

**Media:** video

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Browser placement study only; it does not establish a finished model result.

**Final render:** No qualified final workflow exists for this feature.

**Limits**

- Use only as a placement study. Do not claim this browser display is a real model output or finished supported workflow.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
