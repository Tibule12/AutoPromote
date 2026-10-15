# Motion / Transform Keyframes

Development documentation • product 1.2.0 • knowledge 1.0.17 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

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
