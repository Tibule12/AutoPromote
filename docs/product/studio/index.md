# Studio

Development documentation • product 1.2.0 • knowledge 1.0.27 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Timeline

ID: `studio.timeline` • **PARTIAL** • DETERMINISTIC

Shows the real composition as separate front-to-back layer and group rows, with exact clip timing and expandable transform properties. Sequence tracks remain available for source editing and sound. Both views use the same project and programme clock.

**Purpose:** Displays clip occurrences, layers, audio cues and property keys on the shared programme clock.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video occurrences, image/video/text layers, audio cues

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Use Composition layers to inspect each title, artwork or scene on its own row. Expand a layer’s keyframes to edit its existing transform properties. Bars show clip timing; opacity, occlusion and parent group gates determine the picture.
2. Use At playhead to filter by current clip timing and all parent group gates. This display filter changes no project decisions. Use Sequence tracks for source footage and track mix controls.
3. Move an ordinary animated layer using its bar or arrow keys. Its canonical transform keys move by the same bounded delta. Undo restores layer timing and keys together.
4. Select a source, layer or group on its timeline row. Group bars remain available when property rows are collapsed.
5. Move a group with a pointer gesture or frame nudge; its descendant starts and keys move in one history transaction. Drag or nudge its In/Out edges to limit visibility while keeping child source edits and hidden keys.
6. Selecting a group focuses its property rows; select an ordinary child clip to edit that child’s keys. Graphics and child-track locks block group timing changes.
7. Use the normal source editing controls, undo/redo, save/reopen and export. Inspect the exact movie beside the editable timeline. Group splitting/duplication and source-occurrence attachment remain unsupported.
8. Download project backup saves the current editable project and available media. Select Include saved versions in backup when the saved-version history is also needed; this choice does not delete local versions. Owned media access is re-authorized when restoring.

**Preview:** Group In/Out uses a half-open programme-time visibility range around assembled child graphics. Group move shifts canonical child timing and keys, retaining source phase. The same derived group range clips linked motion cues for preview and export. Property focus and clip selection do not change the edit.

**Final render:** The shared composition plan carries group timing into the CPU compositor. The existing inverse programme clock gates the group’s assembled output at the same In/Out range. Source clips, child animation and audio use their existing compilation paths.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- One real 20-second footage/title/music/SFX project exercises group pointer move, trim, opacity keys, locks, group deletion/undo, source split/history and exact cold reopen. Broader source-occurrence attachment/reordering, group split/duplicate, nested audio/video/owned 3D timing and continuous/full picture/sound remain unqualified. Group trim preserves hidden keys and source phase; it does not retime/stretch child content.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Move group clip](../control-reference/index.md#studio-group_clip-move), [Group clip In](../control-reference/index.md#studio-group_clip-in), [Group clip Out](../control-reference/index.md#studio-group_clip-out), [Composition layers / Sequence tracks](../control-reference/index.md#studio-timeline-view), [At playhead](../control-reference/index.md#studio-timeline-at_playhead)

**Guides:** No task guide in V1.

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

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Guides:** [Add B-roll](../task-guides/task-add_broll.md)

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

**Guides:** No task guide in V1.

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** No pinned shared-template binding recorded.

## Motion / Transform Keyframes

ID: `studio.keyframes` • **FUNCTIONAL** • DETERMINISTIC

Edit property keys and sampled motion paths directly over the picture, or shape value/velocity curves in the timeline. Manual edits, Director/template keys, saving and export use the same canonical animation data.

**Purpose:** Create deliberate editable movement and retain the same keys across manual editing, Director proposals, saving and final compilation.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays, nested graphic groups

**Requires:** studio.transforms (FUNCTIONAL), studio.timeline (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Show motion keyframes in the timeline and expand an ordinary visual layer or graphic group, including targets without animation keys.
2. Edit an unanimated property value and commit with Enter or blur; Escape cancels. Add the individual property key at the playhead to start animation.
3. Move the playhead and edit that animated property to write its next key. Inspect evaluated values and use previous/next keys, timeline nudges and the existing easing/curve inspector.
4. Drag empty property-lane space to box-select across expanded rows. Shift/Ctrl/Command adds; Alt subtracts; Escape or pointer cancellation restores the prior selection. Shift/Ctrl/Command-click also selects individual keys. Drag, frame-nudge, scale spacing, apply interpolation or delete with the batch toolbar.
5. Copy with the toolbar or Ctrl/Command+C. Choose Original layers or an existing visual layer in Paste to, then paste at the playhead with the toolbar or Ctrl/Command+V. A single-source-layer clipboard can target another layer; supported property values, spacing, easing and curves are retained with fresh key identities.
6. Owning-track locks prevent changes. Group values use their own five-property bounds; group key selection opens Composite with the shared curve editor. Undo/redo, save/reopen, render and inspect the current output. Static anchor geometry is not an animated property.
7. In Motion, Add position key writes an X/Y pair at the playhead. Drag a path point over the picture or nudge with Arrow keys (Shift increases the step). The picture follows the temporary drag; release commits the pair once, while Escape/cancellation restores the prior edit. Paths sample actual X/Y interpolation and map animated parent coordinates.
8. Select a timeline key, open Graph editor and choose Value graph or Velocity graph. Edit the interval arriving at that key. Signed velocity uses property units per programme second; endpoint influence preserves endpoint velocity. Numeric edits commit on Enter/blur and write the existing four cubic handles.
9. Once a transform is animated, Motion inspector value edits write a key at the playhead. The static fallback is retained for the base transform; it no longer overrides visible key-driven values.
10. Editing motion keys while viewing a completed movie switches After to Live Edit. The prior download remains available through Export; it is not presented as an updated movie.

**Preview:** Evaluates canonical layer/group property keys on the existing preview clock. Keyed images take precedence over legacy CSS entrance animations and transitions. Nested groups apply evaluated parent transforms after child composition and clamp curve overshoot to the group control bounds. Broad raster, media, curves and continuous playback agreement remains unqualified.

**Final render:** Uses the existing shared compiler/compositor and interpolation expressions where supported. Group keys retain canonical target ownership and are projected into the group composition plan; output time maps back to the programme clock. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- Two bounded masked image-effect edits preserve eight position/scale/rotation/opacity keys through native save/reopen/export. Inverted-polygon sampled picture passes; one ellipse raster pair still exceeds the strict colour bound. This does not qualify every mask/easing/media or legacy entrance clock.
- One native nested image/two-motion project preserves 16 group keys across eight channels, including one custom X Bézier curve. Midpoint, property rows, nudge/lock, reset/remove/undo, save/cold reopen, CPU export and full timeline playback pass; four image geometry pairs pass and decoded source-tone audio is unchanged. Native retiming, broader curves, broader mask/blend combinations, video/owned 3D/deeper groups, full raster and live sound remain unqualified. Existing worker Bézier expressions approximate 32 samples; browser interpolation solves the curve.
- Cross-layer paste requires a single source layer and a current-project destination supporting every copied property and value range. Missing targets, unsupported crop/group bounds, destination locks, half-frame timing collisions and programme overflow reject the whole paste. Original-layers mode supports mixed owners. Clipboard is local to this timeline component; it is not an OS/project interchange format. Freehand lasso, dedicated spatial tangent handles and cross-project interchange are not qualified. Broad media/retiming/full picture and sound qualification remains open.
- Direct path editing changes paired X/Y keys; it does not add a separate spatial-spline representation. Independent X/Y timing curves may create a curved trajectory. Native evidence is an ordinary image over real footage; nested animated-parent coordinate conversion has helper coverage. Broader masks/3D/retiming/full picture and sound remain unqualified.
- Velocity/influence edits write a custom cubic curve, including when converting an easing preset. Flat intervals cannot acquire movement through velocity alone. Influence is1–99%; speeds that exceed the supported handle range reject. Hold has a discontinuous step and no finite editable endpoint velocity. Worker custom curves retain the existing32-sample approximation.

**Common errors**

- No selected editable layer: Select an ordinary layer or a graphic group before adding its supported transform keys.
- Keyframe edits are locked: Unlock the applicable property/layer in the normal controls before editing.
- Motion differs after export: Check current keys/source binding and the documented preview/final limitations; inspect mapped frames in the actual movie.

**Controls:** [Position X](../control-reference/index.md#studio-transform-x), [Position Y](../control-reference/index.md#studio-transform-y), [Scale](../control-reference/index.md#studio-transform-scale), [Rotation](../control-reference/index.md#studio-transform-rotation), [Opacity](../control-reference/index.md#studio-transform-opacity), [Anchor X](../control-reference/index.md#studio-transform-anchorx), [Anchor Y](../control-reference/index.md#studio-transform-anchory), [Horizontal crop](../control-reference/index.md#studio-transform-cropx), [Vertical crop](../control-reference/index.md#studio-transform-cropy), [Keyframe time](../control-reference/index.md#studio-keyframe-time), [Keyframe easing](../control-reference/index.md#studio-keyframe-easing), [Group X position](../control-reference/index.md#studio-composite-group_x), [Group Y position](../control-reference/index.md#studio-composite-group_y), [Group scale](../control-reference/index.md#studio-composite-group_scale), [Group rotation](../control-reference/index.md#studio-composite-group_rotation), [Group opacity](../control-reference/index.md#studio-composite-group_opacity), [Selected keyframe time scale](../control-reference/index.md#studio-keyframe-selection_scale), [Keyframe paste destination](../control-reference/index.md#studio-keyframe-paste_target), [Start velocity](../control-reference/index.md#studio-keyframe-start_velocity), [End velocity](../control-reference/index.md#studio-keyframe-end_velocity), [Start influence](../control-reference/index.md#studio-keyframe-start_influence), [End influence](../control-reference/index.md#studio-keyframe-end_influence)

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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
4. Select an arriving key in the timeline Graph editor. Switch between Value and Velocity views; set start/end velocity and influence, or drag the existing value-curve handles. Numeric edits commit once on Enter or blur.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- The shared curve contract allows Y overshoot -2–2, while some numeric inspector widgets restrict Y to 0–1.
- The right-hand key supplies easing for the interval between keys.
- This is native 2D property interpolation, distinct from legacy scene-level 3D easing.
- Velocity is signed change in the property per programme second, not screen-path speed. Influence preserves endpoint velocity. Editing a preset converts it to a custom cubic; hold and constant-value intervals have no editable finite motion velocity. Dedicated spatial tangent controls remain unqualified.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Keyframe easing](../control-reference/index.md#studio-keyframe-easing), [Cubic curve handles](../control-reference/index.md#studio-keyframe-curve), [Start velocity](../control-reference/index.md#studio-keyframe-start_velocity), [End velocity](../control-reference/index.md#studio-keyframe-end_velocity), [Start influence](../control-reference/index.md#studio-keyframe-start_influence), [End influence](../control-reference/index.md#studio-keyframe-end_influence)

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

Caption controls and reviewed phrase rendering exist, but the retained automatic-word workflow has a repetition defect. Treat automatic word output as broken until that path is repaired and requalified.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video with speech, reviewed transcript phrases

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
- Generate and review captions before rendering.: There are no editable caption phrases for the requested burn-in. Automatic words remain BROKEN. Use the caption guide to prepare and manually review editable phrases before relying on a captioned export.
- Review every flagged caption line before rendering.: Approve or correct each flagged phrase and timestamp in Captions. Automatic words remain BROKEN; this is a reviewed-phrase workaround, not repaired automatic transcription.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Create captions and correct transcription](../task-guides/task-captions_correct.md)

**Templates:** No pinned shared-template binding recorded.

## Titles

ID: `studio.titles` • **FUNCTIONAL** • DETERMINISTIC

Places editable titles, separates word/letter motion and imports authored graphics. Outline width and color share the saved title state, live preview and CPU title rasterizer.

**Purpose:** Author kinetic typography using the same editable layers, group timing and property graph used by preview and export.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layer

**Requires:** No additional feature requirement recorded.

**Optional:** None recorded.

**Workflow**

1. Add or select an ordinary transparent Inter title in Graphics and set its copy, position, size and duration.
2. Open Kinetic typography, choose words or letters, movement and order, then set stagger, entrance, travel, rotation and exit.
3. Build editable text motion. Each word or grapheme becomes an ordinary title in one Type group with editable property keys.
4. Select individual text layers to change their copy, style or keyframes. Move the Type group to keep child timing together. Undo restores the original title.
5. Combine the generated type with ordinary imported artwork and group scale keys to author a full-frame composition; all text stays independently editable.
6. In Graphics, open Import animated graphics and choose an AutoPromote graphics v1 JSON file matching the programme aspect and duration. It adds ordinary editable layers above the current composition; Undo removes the complete import.
7. Save, reopen and inspect the actual finished movie with its editable timeline.

**Preview:** Generated ordinary layers use existing title layout and canonical motion interpolation on the programme clock; building text motion returns the monitor to Live Edit.

**Final render:** The existing composition compiler and title compositor consume generated ordinary layers and property keys. There is no separate text-animation engine.

**Limits**

- Separating supports transparent ordinary Inter titles with no existing motion keys, active mask, tracking, rainbow text or non-normal blend effect.
- At most 48 units and 128 graphic layers; entrances, stagger, hold and exit must fit the title duration. Position must stay inside the programme.
- Word/letter controls are authoring inputs. After separation edit the resulting layers and keys; Undo restores the source title.
- Broad text shaping, continuous picture/sound agreement and professional or production readiness remain unqualified.
- Successful authoring and export do not establish creative quality or professional readiness.
- Graphics import supports text and static SVG artwork rasterized to ordinary image assets. Artwork geometry is not converted to editable vector paths. Use the generated layers and property keys after import.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Title text](../control-reference/index.md#studio-title-text), [Title size](../control-reference/index.md#studio-title-scale), [Title text color](../control-reference/index.md#studio-title-color), [Kinetic unit](../control-reference/index.md#studio-title-kinetic_unit), [Kinetic movement](../control-reference/index.md#studio-title-kinetic_style), [Kinetic order](../control-reference/index.md#studio-title-kinetic_direction), [Kinetic stagger](../control-reference/index.md#studio-title-kinetic_stagger), [Kinetic entrance](../control-reference/index.md#studio-title-kinetic_entry), [Kinetic travel](../control-reference/index.md#studio-title-kinetic_travel), [Kinetic rotation](../control-reference/index.md#studio-title-kinetic_tilt), [Kinetic exit](../control-reference/index.md#studio-title-kinetic_exit), [Import animated graphics](../control-reference/index.md#studio-graphics-import), [Outline color](../control-reference/index.md#studio-title-outline_color)

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

**Final render:** Ordinary image effects preserve colour at transparent blur edges and share programme/layer scaling with preview. Shadow, glow and blur follow the same ordered filter chain. Inspect the exact final film; broad effect, media and combination agreement remains unqualified.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- The image-effect repairs do not qualify video effects, every masked stack, full picture/sound or arbitrary composition nesting.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Layer blur](../control-reference/index.md#studio-effect-blur), [Glow radius](../control-reference/index.md#studio-effect-glow_radius), [Glow intensity](../control-reference/index.md#studio-effect-glow_intensity), [Shadow blur](../control-reference/index.md#studio-effect-layershadow_blur), [Shadow opacity](../control-reference/index.md#studio-effect-layershadow_opacity), [Motion blur samples](../control-reference/index.md#studio-effect-motionblur_samples), [Motion blur shutter](../control-reference/index.md#studio-effect-motionblur_shutter)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Compositing

ID: `studio.compositing` • **PARTIAL** • DETERMINISTIC

Combines ordinary layers and animated graphic groups with shared order, static masks, alpha-aware blending and editable group clip timing. Broad preview/export picture and sound agreement remains incomplete.

**Purpose:** Compose editable graphic hierarchies while preserving child-local edits, timing and property animation through the shared preview and render path.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** ordinary text layers, image overlays, video overlays

**Requires:** studio.layers (FUNCTIONAL)

**Optional:** studio.keyframes (FUNCTIONAL)

**Workflow**

1. Select an owned image or ordinary title in Studio Composite.
2. Enable its geometric mask and choose rectangle, ellipse or polygon.
3. For polygons, enter3–64 percentage points and commit with Enter/blur; invalid drafts are not applied and Escape cancels.
4. For rectangles, set Mask corner radius from0–50%;0 retains square mask corners.
5. Review feather/inversion and the actual export; whole alpha and broader stacks remain unqualified.
6. To transform graphics together, choose root layers/groups in Composite and use Group selected layers. Choose an existing root group with other roots to nest them.
7. Set group X/Y, scale, rotation and opacity; child edits and keys stay local. Use Composite arrows to reorder group roots or their children.
8. Add an individual group property key at the playhead, seek and edit its next value. Expand the group in the shared timeline for property values, key navigation and frame nudges; choose easing or a custom Bézier curve in Composite.
9. Enable the group mask and choose rectangle, ellipse or percentage polygon. Set rectangle corner radius, programme-unit feather and inversion. Polygon Enter/blur commits valid paths; Escape cancels invalid drafts. The group mask clips assembled children before its transform.
10. Choose a supported group blend mode to combine the assembled result with its sibling backdrop. Ordinary child blends stay inside the isolated parent group. Reset group mask clears only its mask; graphics locks prevent changes.
11. Reset transform removes that group’s keys and restores its neutral base. Remove group transform removes its keys and promotes children without baking. Undo/redo and save/reopen apply; inspect the exact final export.
12. Select the group clip bar to move all child clips and keys, or trim its In/Out visibility. Composite provides exact timing values, Fit to children and reversible Delete group and layers. Source and child-track locks protect the same operation.

**Preview:** Full-canvas nested wrappers evaluate existing canonical motion keys on the shared preview clock, preserve child edits and apply a shared SVG geometric mask before the group transform/opacity. CSS group isolation retains the sibling backdrop for group and child blending. One native Multiply/Screen nested image/two-motion edit with 16 group keys has four scoped geometry and image-interior color pairs; whole glyph/alpha/raster/picture/sound and broad modes/media remain unqualified.

**Final render:** The shared compiler carries group mask/blend decisions and transform keys into the existing CPU compositor. The ordinary geometric matte rasterizer clips assembled local child alpha before transform/opacity; registered request-owned matte scratch is cleaned after the render. RGB blend color weights the blend result by backdrop alpha, preserving foreground color over transparent isolated parents. Group and child blending share the existing leaf compositor and inverse programme clock. Static/Normal paths retain previous pixels. Source/source-VFX/generated-caption stages remain separate; inspect the exact final movie.

**Limits**

- Rectangle, ellipse and percentage-polygon image masks and crop animation have scoped native/export boundary evidence. This is deterministic geometry, not AI subject segmentation.
- Group masks and blending are implemented as static decisions; path/radius/feather/inversion/blend animation, broader feather/inversion/modes/media, animated video-layer masks and full alpha/text/effect-order parity remain incomplete.
- This dated development snapshot does not establish professional or production readiness.
- Editable percentage-polygon paths and rectangle radius use the canonical mask object. This adds no animated path, neural segmentation, mask expansion or video-mask support.
- The bounded inverted-polygon/shadow/glow/blur image stack passes four sampled colour pairs with transform/opacity keys. The ellipse stack retains a strict raster failure, and historical landscape edge failures remain open.
- The layer stack has native image/title/two-motion history, cold reopen, exports and scoped visible-image occlusion evidence. Actual owned 3D cross-family export, whole motion/title raster, large/deeper stacks and full raster remain unqualified. Source footage/source VFX and generated captions retain their separate programme stages.
- One native nested image/two-motion edit uses a feathered inner polygon/Multiply and outer rounded-rectangle/Screen while preserving all 16 group keys and child poses/keys. Controls/history/reset/lock/cold/export/full timeline playback and four geometry/image-interior RGB pairs pass; decoded source-tone audio is unchanged. All eight non-Normal modes pass actual FFmpeg transparent/partial/opaque-backdrop fixtures, not every native mode/media/stack. Graphic-group clip bars own descendant starts/keys and visibility; source-occurrence attachment/remapping, group split/duplicate and editable group anchor remain unsupported. Grouped timeline drag order uses Composite. Actual owned 3D/video/deeper groups, native retiming, broader curves/grouped drag/deletion and continuous/full picture/sound remain unqualified. Worker Bézier expressions approximate 32 samples; the browser solves the curve.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Layer blend mode](../control-reference/index.md#studio-composite-blend), [Mask polygon path](../control-reference/index.md#studio-geometric_mask-path), [Mask corner radius](../control-reference/index.md#studio-geometric_mask-radius), [Layer order](../control-reference/index.md#studio-composite-layer_order), [Group X position](../control-reference/index.md#studio-composite-group_x), [Group Y position](../control-reference/index.md#studio-composite-group_y), [Group scale](../control-reference/index.md#studio-composite-group_scale), [Group rotation](../control-reference/index.md#studio-composite-group_rotation), [Group opacity](../control-reference/index.md#studio-composite-group_opacity), [Enable group mask](../control-reference/index.md#studio-composite-group_mask_enabled), [Group mask shape](../control-reference/index.md#studio-composite-group_mask_shape), [Group mask feather](../control-reference/index.md#studio-composite-group_mask_feather), [Invert group mask](../control-reference/index.md#studio-composite-group_mask_inverted), [Move group clip](../control-reference/index.md#studio-group_clip-move), [Group clip In](../control-reference/index.md#studio-group_clip-in), [Group clip Out](../control-reference/index.md#studio-group_clip-out)

**Guides:** No task guide in V1.

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

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Subject source range](../control-reference/index.md#studio-subject-range), [Subject seed points](../control-reference/index.md#studio-subject-seed_points), [Subject point labels](../control-reference/index.md#studio-subject-seed_labels)

**Guides:** [Put text behind a person](../task-guides/task-text_behind.md)

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

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Add B-roll](../task-guides/task-add_broll.md), [Modify Director edits manually](../task-guides/task-director_manual.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Templates:** No pinned shared-template binding recorded.

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

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

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

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

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

**Guides:** No task guide in V1.

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

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- TEMPLATE_IDENTITY_MISMATCH: The selected exact template definition is unavailable. Select an available pinned version; do not silently substitute a similar version.
- TEMPLATE_OWNED_MEDIA_REQUIRED: Save an owned asset of the required slot type before binding the template.
- TEMPLATE_FOOTAGE_TOO_SHORT: Choose footage with enough duration after its in-point for the template slot.
- CREATIVE_TEMPLATE_VERSION_UNAVAILABLE: The exact requested shared template version cannot be resolved.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Use a creative template](../task-guides/task-use_template.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Preview:** Reopening a saved owned upload can prepare precise paused source frames without changing the edit, including older uploads without a saved digest. Broad continuous picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- Accurate paused source pictures remain bounded to qualified clip clocks,90-second windows and128MiB sources. Strict ellipse mask/effect raster agreement and broad continuous picture/sound remain open.
- The 15 October programme-clock repair removes an erroneous black fade over dim footage. A20s CPU export completes in244.079s with all480 decoded picture frames unchanged; full colour/raster/live sound remains unqualified.

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
- The 15 October programme-clock repair removes an erroneous black fade over dim footage. A20s CPU export completes in244.079s with all480 decoded picture frames unchanged; full colour/raster/live sound remains unqualified.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Turn an image into a cinematic scene](../task-guides/task-image_cinematic.md), [Export a final film](../task-guides/task-final_export.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

**Guides:** [Create a product-launch promo](../task-guides/task-product_launch.md), [Create a cinematic logo reveal](../task-guides/task-cinematic_logo.md), [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Use a creative template](../task-guides/task-use_template.md), [Export a final film](../task-guides/task-final_export.md)

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

**Guides:** [Modify Director edits manually](../task-guides/task-director_manual.md), [Export a final film](../task-guides/task-final_export.md)

**Templates:** product_launch_cinematic_v1@1.0.0, cycling_rhythm_v1@1.0.0, cycling_rhythm_v1@1.0.1, cycling_rhythm_v1@1.0.2, product_launch_cinematic_v1@1.1.0, product_launch_cinematic_v1@1.1.1, product_launch_cinematic_v1@1.1.2

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

Imports owned media into the ordinary project. A ready video can replace the entire source sequence at the same programme length while retaining timed graphics and soundtrack. Unused project media can be removed with Undo; source files remain stored.

**Purpose:** Imports supported owned video, image and audio into canonical assets. Decoding, source validation and ownership checks still apply.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.
3. Select a saved video at least as long as the current programme and choose Replace entire sequence. Graphics and sound keep their programme timing; source captions, cameras and old template bindings are removed. Undo restores the prior sequence.
4. Remove unused media clears unreferenced library entries and transform keys with no remaining target. Active sources, layer/camera/music/sound references and pending uploads are retained. Stored files are not deleted.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- This dated development snapshot does not establish professional or production readiness.
- Sequence replacement requires source speed 1 with no speed keys, opening hook or silence removal. A source clip still provides the programme clock; a plain background video may be used.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Replace entire sequence](../control-reference/index.md#studio-media-replace_sequence), [Remove unused media](../control-reference/index.md#studio-media-remove_unused)

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

**Guides:** [Replace a background](../task-guides/task-background_replace.md)

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

## Logo motion

ID: `studio.logo_motion` • **PARTIAL** • DETERMINISTIC

Builds a logo intro as ordinary editable artwork, masks, groups and motion keys. Image logos preserve their supplied gradient colours and lettering; vector components can move independently.

**Purpose:** Turn a supplied identity into a revisable signal reveal, broadcast pulse and readable brand resolve through the shared Studio controls.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** SVG logos with 1–8 top-level shapes or groups, PNG, JPEG or WebP logos

**Requires:** studio.motion (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open Graphics → Logo motion in an owned programme at least eight seconds long.
2. Select a local image up to 250 KB or an SVG up to 100 KB, with a maximum of 4096 pixels per side. SVG files need a viewBox or numeric dimensions. Image logos use their visible alpha bounds as a viewport; the source file is not rewritten.
3. Choose the brand name, accent, background and an 8–14 second duration that fits the programme. Build editable logo motion at the programme start.
4. For an image with a left-hand symbol and separate lettering, enable Separate left symbol from wordmark. Symbol width places the search boundary; the builder follows transparent space and rejects cuts through opaque artwork. The symbol leads, then the original wordmark joins it.
5. Edit the resulting ordinary layers, masks, groups and keys. Undo removes the authored composition. Add and time sound through the normal Sound controls.
6. Review the actual preview, save/reopen and export through the existing Studio workflow.

**Preview:** The builder writes ordinary graphics into the existing project. SVG shapes become raster artwork. Raster identities can use three reveal bands, or separate symbol and original wordmark along a transparent seam; both finish on one continuous original lockup. Ordinary preview evaluates the existing transforms, masks and opacity keys.

**Final render:** The standard graphics importer, canonical document and composition renderer compile the same authored layers, masks, groups and keys. No separate logo render engine or paid model is started.

**Limits**

- Development feature; no professional, production or showroom qualification.
- The composition uses 2D transforms and masks. It does not create editable vector contours, automatic 3D geometry, shape morphs or particles.
- Image logos retain their existing lettering; they do not become editable text characters. Pixels with alpha above 32 determine the visible viewport; source bytes inside the artwork remain unchanged.
- Programme aspect must be between 1:2 and 2:1. The intro starts at programme time zero and must fit the programme.
- The existing project limit of 128 graphics, 8192 imported keys, 2 MiB aggregate inline artwork and 4 MiB graphics input remains. Each SVG artwork payload may contain up to 512 KiB, allowing bounded embedded local logo pixels.
- Background choice covers underlying footage. Sound is added separately through normal Sound controls. Whole live picture/sound and smoothness remain separate qualification.
- Symbol separation requires visible transparent space between a left-hand symbol and its lettering. Adjust the 10–60% boundary or use the full-logo reveal when the source cannot be separated.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Logo motion brand name](../control-reference/index.md#studio-logo_motion-brand_name), [Logo motion duration](../control-reference/index.md#studio-logo_motion-duration), [Logo motion accent](../control-reference/index.md#studio-logo_motion-accent), [Add background](../control-reference/index.md#studio-logo_motion-background), [Separate left symbol from wordmark](../control-reference/index.md#studio-logo_motion-separate_symbol), [Logo symbol width](../control-reference/index.md#studio-logo_motion-symbol_width)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
