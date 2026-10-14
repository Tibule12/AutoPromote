# Source-qualified controls

Development documentation • product 1.2.0 • knowledge 1.0.13 • 2026-10-14T16:13:51.506436Z

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

A value is scoped to its listed inspector/media type. Unknown defaults/ranges are explicitly retained as unknown. Keyframe support, preview, final render and Director editability are separate facts.

| ID | Label | Type | Range/values | Unit | Default | Keys | Preview | Render | Director |
|---|---|---|---|---|---|---|---|---|---|
| studio.transform.x | Position X | number | 0 … 100 | percent of stage | 50 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.y | Position Y | number | 0 … 100 | percent of stage | 50 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.scale | Scale | number | 0.1 … 5 | multiplier | 1 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.rotation | Rotation | number | -360 … 360 | degrees | 0 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.opacity | Opacity | number | 0 … 1 | fraction | 1 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.anchorx | Anchor X | number | 0 … 100 | percent of layer | 50 | UNSUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.anchory | Anchor Y | number | 0 … 100 | percent of layer | 50 | UNSUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.cropx | Horizontal crop | number | 0 … 45 | percent | 0 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.transform.cropy | Vertical crop | number | 0 … 45 | percent | 0 | SUPPORTED | PARTIAL | SUPPORTED | PARTIAL |
| studio.layer.start | Layer start | number | 0 … source-dependent | seconds | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.layer.duration | Layer duration | number | 0.1 … 60 | seconds | 3 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.layer.width | Layer width | number | 1 … 100 | percent | 35 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.layer.height | Layer height | number | 1 … 100 | percent | 35 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.time | Keyframe time | number | 0 … source-dependent | seconds | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.easing | Keyframe easing | enum | linear, ease_in, ease_out, ease_in_out, hold, bezier | none | "ease_in_out" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.curve | Cubic curve handles | array | source-dependent … source-dependent | none | [0.33,0,0.67,1] | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.composite.blend | Layer blend mode | enum | normal, multiply, screen, difference, overlay, soft-light, hard-light, color-dodge, luminosity | none | "normal" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.blur | Layer blur | number | 0 … 30 | pixels | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.glow_radius | Glow radius | number | 0 … 60 | pixels | 16 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.glow_intensity | Glow intensity | number | 0 … 1 | none | 0.5 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.layershadow_blur | Shadow blur | number | 0 … 80 | pixels | 18 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.layershadow_opacity | Shadow opacity | number | 0 … 1 | none | 0.55 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.motionblur_samples | Motion blur samples | integer | 2 … 8 | none | 4 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.effect.motionblur_shutter | Motion blur shutter | number | 0.1 … 1 | none | 0.5 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.x | Subject text X | number | 0 … 100 | percent | 50 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.y | Subject text Y | number | 0 … 100 | percent | 43 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.font_size | Subject text size | number | 12 … 320 | pixels | 100 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.tracking | Subject letter spacing | number | 0 … 40 | pixels | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.offset_x | Tracked callout X offset | number | -500 … 500 | pixels | -150 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.offset_y | Tracked callout Y offset | number | -500 … 500 | pixels | -130 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.range | Subject source range | array | source-dependent … source-dependent | seconds | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.seed_points | Subject seed points | array | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.seed_labels | Subject point labels | array | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.depth_amount | Mask parallax amount | number | 0 … 0.06 | fraction | 0.015 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.mask_feather | Mask feather | number | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| studio.subject.mask_expansion | Mask expansion | number | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| cam_combiner.source_count | Camera count | integer | 2 … 3 | cameras | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.sync_offset | Camera sync offset | number | source-dependent … source-dependent | seconds | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.sync_rate | Camera clock rate | number | 0.95 … 1.05 | multiplier | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.switch_interval | Switch interval | number | 1 … 10 | seconds | 3 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.zoom | Camera framing zoom | number | 1 … 2.4 | multiplier | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.swap_channels | Swap left/right clean-audio channels | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.verify_channels | I verified which speaker belongs to each channel | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| cam_combiner.clean_audio_mode | Clean audio mode | enum | external_only, low_camera, mute_camera | none | "external_only" | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.audio.denoise | Denoise | number | 0 … 100 | percent | 22 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.deesser | De-esser | number | 0 … 100 | percent | 18 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.compressor | Compressor | number | 0 … 100 | percent | 35 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.limiter | Limiter ceiling | number | -6 … -0.1 | dB | -1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.loudness | Loudness target | number | -24 … -9 | LUFS | -14 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.eq_low | EQ low | number | -12 … 12 | dB | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.eq_mid | EQ mid | number | -12 … 12 | dB | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.eq_high | EQ high | number | -12 … 12 | dB | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.hum | Hum removal | enum | 50, 60 | Hz | 50 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.gain_key | Bus volume key | number | 0 … 200 | percent | 100 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.automation_source | Automation source | enum | originalAudio, masterPodcast, voiceover, music, broll, sfx | none | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.ducking | Speech-aware ducking | boolean | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.grade.exposurestops | Exposure stops | number | -2 … 2 | none | 0 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.grade.lift | Lift | number | -0.15 … 0.15 | none | 0 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.grade.gamma | Gamma | number | 0.6 … 1.6 | none | 1 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.grade.gain | Grade gain | number | 0.6 … 1.4 | none | 1 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.grade.tint | Tint | number | -1 … 1 | none | 0 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.three_d.x | X | number | 5 … 95 | percent | 50 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.y | Y | number | 5 … 95 | percent | 50 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.z | Z | number | -4 … 4 | scene units | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.scale | Scale | number | 0.2 … 3 | multiplier | 1 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.rotationx | Rotation X | number | -180 … 180 | degrees | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.rotationy | Rotation Y | number | -180 … 180 | degrees | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.rotationz | Rotation Z | number | -180 … 180 | degrees | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.extrusiondepth | Extrusion Depth | number | 0.01 … 1.5 | scene units | 0.28 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.bevel | Bevel | number | 0 … 0.2 | scene units | 0.04 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.focallength | Focal Length | number | 24 … 85 | mm | 50 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.lightintensity | Light Intensity | number | 0 … 5 | multiplier | 2.2 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.cameramotion | Camera Motion | number | 0 … 1 | fraction | 0.28 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.bloom | Bloom | number | 0 … 1 | fraction | 0.32 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.material | 3D material | enum | chrome, glass, neon, gold, matte, holographic | none | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.three_d.fontfamily | 3D font family | enum | studio, sans, serif | none | "studio" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.fontweight | 3D font weight | enum | regular, bold, black | none | "bold" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.easing | 3D scene easing | enum | ease_out, ease_in_out, spring, linear | none | "ease_out" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.audioreactiveintensity | Audio-reactive intensity | number | 0 … 1 | none | 0 | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.lightdirection | 3D light direction | number | -180 … 180 | none | 35 | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.shadows | 3D shadows | boolean | source-dependent … source-dependent | none | true | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.reflections | 3D reflections | boolean | source-dependent … source-dependent | none | true | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.background | 3D background | enum | transparent, dark, light | none | "transparent" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.three_d.quality | 3D quality | enum | draft, preview, high | none | "preview" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.music.volume | Music volume | number | 0 … 0.6 | multiplier | 0.15 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.music.fadein | Music fadeIn | number | 0 … 3 | seconds | 0.5 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.music.fadeout | Music fadeOut | number | 0 … 3 | seconds | 0.5 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.ducking_strength | Duck strength | number | 0.1 … 0.9 | fraction | 0.4 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.audio.ducking_mode | Ducking mode | enum | speech, constant | none | "speech" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.sfx.volume | Effect volume | number | 0 … 1 | multiplier | 0.8 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.sfx.duration | Sound cue duration | number | 0.05 … 15 | seconds | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.sfx.trim | Sound source trim start | number | 0 … source-dependent | seconds | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.voiceover.volume | Voice take volume | number | 0 … 1 | multiplier | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.voiceover.duration | Voice take duration | number | 0.05 … 7200 | seconds | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.speed.rate | Clip/programme speed | number | 0.5 … 2 | multiplier | 1 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.transition.duration | Join transition duration | number | 0.04 … 2 | seconds | 0.18 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.title.text | Title text | string | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.title.scale | Title size | number | 0.5 … 2 | multiplier | 1 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.title.color | Title text color | string | source-dependent … source-dependent | none | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.exposure | Background exposure | number | -3 … 1 | none | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.saturation | Background saturation | number | 0 … 2 | none | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.subject.contrast | Background contrast | number | 0.5 … 2 | none | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| generation.max_cutaways | Maximum generated cutaways | enum | 1, 2, 3 | none | 2 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| publishing.queue.period | Queue period | enum | week, all | none | "week" | UNSUPPORTED | SUPPORTED | UNSUPPORTED | UNSUPPORTED |
| publishing.queue.load_more | Load more schedules | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | SUPPORTED | UNSUPPORTED | UNSUPPORTED |
| studio.geometric_mask.path | Mask polygon path | string | source-dependent … source-dependent | percent | "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.geometric_mask.radius | Mask corner radius | number | 0 … 50 | percent | 6 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.composite.layer_order | Layer order | array | 0 … 2000 | none | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_x | Group X position | number | -100 … 100 | percent of stage | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_y | Group Y position | number | -100 … 100 | percent of stage | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_scale | Group scale | number | 0.1 … 2 | multiplier | 1 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_rotation | Group rotation | number | -180 … 180 | degrees | 0 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_opacity | Group opacity | number | 0 … 1 | fraction | 1 | SUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_mask_enabled | Enable group mask | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_mask_shape | Group mask shape | enum | rectangle, ellipse, polygon | none | "rectangle" | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_mask_feather | Group mask feather | number | 0 … 100 | pixels at 720px programme height | 0 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.group_mask_inverted | Invert group mask | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |

<a id="studio-transform-x"></a>

## Position X

ID: `studio.transform.x` • **FUNCTIONAL**

Adjusts position x on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-y"></a>

## Position Y

ID: `studio.transform.y` • **FUNCTIONAL**

Adjusts position y on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-scale"></a>

## Scale

ID: `studio.transform.scale` • **FUNCTIONAL**

Adjusts scale on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-rotation"></a>

## Rotation

ID: `studio.transform.rotation` • **FUNCTIONAL**

Adjusts rotation on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-opacity"></a>

## Opacity

ID: `studio.transform.opacity` • **FUNCTIONAL**

Adjusts opacity on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-anchorx"></a>

## Anchor X

ID: `studio.transform.anchorx` • **FUNCTIONAL**

Adjusts anchor x on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Anchor is editable static geometry; the current motion-key builder animates x/y/scale/rotation/opacity/crop, not anchor.

<a id="studio-transform-anchory"></a>

## Anchor Y

ID: `studio.transform.anchory` • **FUNCTIONAL**

Adjusts anchor y on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Anchor is editable static geometry; the current motion-key builder animates x/y/scale/rotation/opacity/crop, not anchor.

<a id="studio-transform-cropx"></a>

## Horizontal crop

ID: `studio.transform.cropx` • **FUNCTIONAL**

Adjusts horizontal crop on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: image overlays, video overlays. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-transform-cropy"></a>

## Vertical crop

ID: `studio.transform.cropy` • **FUNCTIONAL**

Adjusts vertical crop on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: image overlays, video overlays. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-layer-start"></a>

## Layer start

ID: `studio.layer.start` • **PARTIAL**

Adjusts layer start of an image/video overlay; timing remains linked to its owned occurrence.

Applies to: image/video overlays. Requires: studio.layers.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-layer-duration"></a>

## Layer duration

ID: `studio.layer.duration` • **PARTIAL**

Adjusts layer duration of an image/video overlay; timing remains linked to its owned occurrence.

Applies to: image/video overlays. Requires: studio.layers.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-layer-width"></a>

## Layer width

ID: `studio.layer.width` • **PARTIAL**

Adjusts layer width of an image/video overlay; timing remains linked to its owned occurrence.

Applies to: image/video overlays. Requires: studio.layers.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-layer-height"></a>

## Layer height

ID: `studio.layer.height` • **PARTIAL**

Adjusts layer height of an image/video overlay; timing remains linked to its owned occurrence.

Applies to: image/video overlays. Requires: studio.layers.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-keyframe-time"></a>

## Keyframe time

ID: `studio.keyframe.time` • **FUNCTIONAL**

Places a property key on the programme clock; timeline nudges use the output frame grid.

Applies to: ordinary layers, graphic groups. Requires: studio.keyframes.

- The current programme/layer range supplies the upper bound; no universal fixed duration is claimed.

<a id="studio-keyframe-easing"></a>

## Keyframe easing

ID: `studio.keyframe.easing` • **FUNCTIONAL**

Selects the interpolation between property poses. Hold retains the prior value until the next key.

Applies to: ordinary layers, graphic groups. Requires: studio.easing, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Group evaluation clamps values to each group property’s bounds. Worker Bézier expressions use the existing 32-sample approximation; broad curve/raster equivalence is unqualified.

<a id="studio-keyframe-curve"></a>

## Cubic curve handles

ID: `studio.keyframe.curve` • **FUNCTIONAL**

Sets the bounded cubic interpolation curve; X handles stay 0–1 and Y handles may overshoot -2–2 in the shared contract.

Applies to: ordinary layers. Requires: studio.easing.

- Array contains exactly four handles. Shared contract permits Y overshoot; some inspector widgets show narrower Y bounds.

<a id="studio-composite-blend"></a>

## Layer blend mode

ID: `studio.composite.blend` • **PARTIAL**

Blends an ordinary layer or assembled group with its sibling backdrop while preserving source-over alpha. Children blend inside their isolated parent.

Applies to: ordinary layers, graphic groups. Requires: studio.compositing.

- Main programme video currently supports normal only; unsupported main-video modes are rejected at export.
- Group masks/blend modes are static. One nested Multiply/Screen native edit and bounded image geometry/interior-color checks pass; wider native modes/media, full alpha/raster and continuous picture/sound remain unqualified.

<a id="studio-effect-blur"></a>

## Layer blur

ID: `studio.effect.blur` • **PARTIAL**

Adjusts the supported ordinary-layer layer blur. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Image-layer pixel values use a 720px programme reference and scale with the layer, preview and delivery size. Broader effects remain unqualified.

<a id="studio-effect-glow_radius"></a>

## Glow radius

ID: `studio.effect.glow_radius` • **PARTIAL**

Adjusts the supported ordinary-layer glow radius. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Image-layer pixel values use a 720px programme reference and scale with the layer, preview and delivery size. Broader effects remain unqualified.

<a id="studio-effect-glow_intensity"></a>

## Glow intensity

ID: `studio.effect.glow_intensity` • **PARTIAL**

Adjusts the supported ordinary-layer glow intensity. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-effect-layershadow_blur"></a>

## Shadow blur

ID: `studio.effect.layershadow_blur` • **PARTIAL**

Adjusts the supported ordinary-layer shadow blur. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Image-layer pixel values use a 720px programme reference and scale with the layer, preview and delivery size. Broader effects remain unqualified.

<a id="studio-effect-layershadow_opacity"></a>

## Shadow opacity

ID: `studio.effect.layershadow_opacity` • **PARTIAL**

Adjusts the supported ordinary-layer shadow opacity. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-effect-motionblur_samples"></a>

## Motion blur samples

ID: `studio.effect.motionblur_samples` • **PARTIAL**

Adjusts the supported ordinary-layer motion blur samples. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-effect-motionblur_shutter"></a>

## Motion blur shutter

ID: `studio.effect.motionblur_shutter` • **PARTIAL**

Adjusts the supported ordinary-layer motion blur shutter. These controls are distinct from mask-scene glow.

Applies to: ordinary layers. Requires: studio.effects.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-subject-x"></a>

## Subject text X

ID: `studio.subject.x` • **PARTIAL**

Places or styles editable text inside the reviewed mask-backed scene.

Applies to: owned reviewed subject scene. Requires: studio.compositing.text_behind_subject.

- Scene parameter; arbitrary native per-property keyframe support is not implemented.

<a id="studio-subject-y"></a>

## Subject text Y

ID: `studio.subject.y` • **PARTIAL**

Places or styles editable text inside the reviewed mask-backed scene.

Applies to: owned reviewed subject scene. Requires: studio.compositing.text_behind_subject.

- Scene parameter; arbitrary native per-property keyframe support is not implemented.

<a id="studio-subject-font_size"></a>

## Subject text size

ID: `studio.subject.font_size` • **PARTIAL**

Places or styles editable text inside the reviewed mask-backed scene.

Applies to: owned reviewed subject scene. Requires: studio.compositing.text_behind_subject.

- Scene parameter; arbitrary native per-property keyframe support is not implemented.

<a id="studio-subject-tracking"></a>

## Subject letter spacing

ID: `studio.subject.tracking` • **PARTIAL**

Places or styles editable text inside the reviewed mask-backed scene.

Applies to: owned reviewed subject scene. Requires: studio.compositing.text_behind_subject.

- Scene parameter; arbitrary native per-property keyframe support is not implemented.

<a id="studio-subject-offset_x"></a>

## Tracked callout X offset

ID: `studio.subject.offset_x` • **PARTIAL**

Offsets the supported callout relative to its real tracked subject.

Applies to: owned reviewed tracking scene. Requires: studio.compositing.tracked_callout.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-subject-offset_y"></a>

## Tracked callout Y offset

ID: `studio.subject.offset_y` • **PARTIAL**

Offsets the supported callout relative to its real tracked subject.

Applies to: owned reviewed tracking scene. Requires: studio.compositing.tracked_callout.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-subject-range"></a>

## Subject source range

ID: `studio.subject.range` • **PARTIAL**

Selects one owned source-bound span to segment and composite.

Applies to: ordinary layers. Requires: studio.subject_cutout, studio.compositing.text_behind_subject, studio.tracking.

- Two source times; duration must be 0.25–10 seconds. Source bounds and frame count are validated.

<a id="studio-subject-seed_points"></a>

## Subject seed points

ID: `studio.subject.seed_points` • **PARTIAL**

Selects the visible subject with positive and optional negative points.

Applies to: ordinary layers. Requires: studio.subject_cutout, studio.tracking.

- 1–16 coordinate pairs; normalized coordinates 0–0.999999. At least one positive label is required.

<a id="studio-subject-seed_labels"></a>

## Subject point labels

ID: `studio.subject.seed_labels` • **PARTIAL**

Labels each seed as positive foreground or negative background.

Applies to: ordinary layers. Requires: studio.subject_cutout, studio.tracking.

- One 0 or 1 label per seed point; at least one 1.

<a id="studio-subject-depth_amount"></a>

## Mask parallax amount

ID: `studio.subject.depth_amount` • **PARTIAL**

Changes the restrained 2.5D subject/background parallax amount.

Applies to: ordinary layers. Requires: studio.compositing.mask_depth.

- Mask-based effect; does not estimate metric depth.

<a id="studio-subject-mask_feather"></a>

## Mask feather

ID: `studio.subject.mask_feather` • **UNIMPLEMENTED**

No exposed supported subject-scene mask feather field is established in the current scene contract.

Applies to: ordinary layers. Requires: studio.masks.

- No valid range or default is documented because this field is not implemented.

<a id="studio-subject-mask_expansion"></a>

## Mask expansion

ID: `studio.subject.mask_expansion` • **UNIMPLEMENTED**

No exposed supported subject-scene mask expansion field is established in the current scene contract.

Applies to: ordinary layers. Requires: studio.masks.

- No valid range or default is documented because this field is not implemented.

<a id="cam_combiner-source_count"></a>

## Camera count

ID: `cam_combiner.source_count` • **PARTIAL**

Two or three source cameras are accepted by the combiner.

Applies to: camera video, master audio. Requires: cam_combiner.upload.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-sync_offset"></a>

## Camera sync offset

ID: `cam_combiner.sync_offset` • **PARTIAL**

Maps programme time to the selected source using the reviewed offset.

Applies to: camera video, master audio. Requires: cam_combiner.synchronization.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-sync_rate"></a>

## Camera clock rate

ID: `cam_combiner.sync_rate` • **PARTIAL**

Multiplies mapped source time to compensate for drift. Normal automatic estimation is narrower than the mapping clamp.

Applies to: camera video, master audio. Requires: cam_combiner.drift.

- Automatic drift estimation is normally clamped to 0.99–1.01; source time mapping clamps to 0.95–1.05.

<a id="cam_combiner-switch_interval"></a>

## Switch interval

ID: `cam_combiner.switch_interval` • **PARTIAL**

Sets the baseline hold interval used by the heuristic planner.

Applies to: camera video, master audio. Requires: cam_combiner.switching.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-zoom"></a>

## Camera framing zoom

ID: `cam_combiner.zoom` • **PARTIAL**

Crops the selected source within the normalized segment framing.

Applies to: camera video, master audio. Requires: cam_combiner.split_views.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-swap_channels"></a>

## Swap left/right clean-audio channels

ID: `cam_combiner.swap_channels` • **PARTIAL**

Reverses speaker/camera channel association; listen to the master and verify the intended camera.

Applies to: camera video, master audio. Requires: cam_combiner.channel_mapping.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-verify_channels"></a>

## I verified which speaker belongs to each channel

ID: `cam_combiner.verify_channels` • **PARTIAL**

Confirms the current mapping after listening. Changing mapping requires confirming it again.

Applies to: camera video, master audio. Requires: cam_combiner.channel_mapping.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="cam_combiner-clean_audio_mode"></a>

## Clean audio mode

ID: `cam_combiner.clean_audio_mode` • **PARTIAL**

Selects external-only, low-camera-bed or muted-camera mix policy.

Applies to: camera video, master audio. Requires: cam_combiner.master_audio.

- Applies only to the camera session. Speaker mapping must be reviewed before relying on suggested cuts.

<a id="studio-audio-denoise"></a>

## Denoise

ID: `studio.audio.denoise` • **PARTIAL**

Adjusts deterministic denoise in the voice-repair bus. The documented default is the natural repair preset.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Preset default; the selected project may retain different values. Preview and final repaired-bus agreement is qualified only for retained subsets.

<a id="studio-audio-deesser"></a>

## De-esser

ID: `studio.audio.deesser` • **PARTIAL**

Adjusts deterministic de-esser in the voice-repair bus. The documented default is the natural repair preset.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Preset default; the selected project may retain different values. Preview and final repaired-bus agreement is qualified only for retained subsets.

<a id="studio-audio-compressor"></a>

## Compressor

ID: `studio.audio.compressor` • **PARTIAL**

Adjusts deterministic compressor in the voice-repair bus. The documented default is the natural repair preset.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Preset default; the selected project may retain different values. Preview and final repaired-bus agreement is qualified only for retained subsets.

<a id="studio-audio-limiter"></a>

## Limiter ceiling

ID: `studio.audio.limiter` • **PARTIAL**

Adjusts deterministic limiter ceiling in the voice-repair bus. The documented default is the natural repair preset.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Preset default; the selected project may retain different values. Preview and final repaired-bus agreement is qualified only for retained subsets.

<a id="studio-audio-loudness"></a>

## Loudness target

ID: `studio.audio.loudness` • **PARTIAL**

Adjusts deterministic loudness target in the voice-repair bus. The documented default is the natural repair preset.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Preset default; the selected project may retain different values. Preview and final repaired-bus agreement is qualified only for retained subsets.

<a id="studio-audio-eq_low"></a>

## EQ low

ID: `studio.audio.eq_low` • **PARTIAL**

Adjusts the low band of the deterministic voice repair EQ.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-eq_mid"></a>

## EQ mid

ID: `studio.audio.eq_mid` • **PARTIAL**

Adjusts the mid band of the deterministic voice repair EQ.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-eq_high"></a>

## EQ high

ID: `studio.audio.eq_high` • **PARTIAL**

Adjusts the high band of the deterministic voice repair EQ.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-hum"></a>

## Hum removal

ID: `studio.audio.hum` • **PARTIAL**

Selects the power-line hum frequency for the deterministic audio filter.

Applies to: ordinary layers. Requires: studio.audio_restoration.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-gain_key"></a>

## Bus volume key

ID: `studio.audio.gain_key` • **FUNCTIONAL**

Changes the selected audio bus gain over programme time; 100% means unity.

Applies to: ordinary layers. Requires: studio.audio_automation.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-automation_source"></a>

## Automation source

ID: `studio.audio.automation_source` • **PARTIAL**

Selects which programme audio bus the volume keys affect.

Applies to: ordinary layers. Requires: studio.audio_automation.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-audio-ducking"></a>

## Speech-aware ducking

ID: `studio.audio.ducking` • **PARTIAL**

Use the existing music automation/ducking workflow and review its audible result; no universal ducking threshold range is asserted here.

Applies to: ordinary layers. Requires: studio.ducking.

- Music also exposes strength and mode. This is not neural speech separation.

<a id="studio-grade-exposurestops"></a>

## Exposure stops

ID: `studio.grade.exposurestops` • **FUNCTIONAL**

Adjusts the selected deterministic finish grade parameter.

Applies to: ordinary layers. Requires: studio.color.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-grade-lift"></a>

## Lift

ID: `studio.grade.lift` • **FUNCTIONAL**

Adjusts the selected deterministic finish grade parameter.

Applies to: ordinary layers. Requires: studio.color.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-grade-gamma"></a>

## Gamma

ID: `studio.grade.gamma` • **FUNCTIONAL**

Adjusts the selected deterministic finish grade parameter.

Applies to: ordinary layers. Requires: studio.color.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-grade-gain"></a>

## Grade gain

ID: `studio.grade.gain` • **FUNCTIONAL**

Adjusts the selected deterministic finish grade parameter.

Applies to: ordinary layers. Requires: studio.color.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-grade-tint"></a>

## Tint

ID: `studio.grade.tint` • **FUNCTIONAL**

Adjusts the selected deterministic finish grade parameter.

Applies to: ordinary layers. Requires: studio.color.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.

<a id="studio-three_d-x"></a>

## X

ID: `studio.three_d.x` • **PARTIAL**

Adjusts the bounded authored 3D scene x.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-y"></a>

## Y

ID: `studio.three_d.y` • **PARTIAL**

Adjusts the bounded authored 3D scene y.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-z"></a>

## Z

ID: `studio.three_d.z` • **PARTIAL**

Adjusts the bounded authored 3D scene z.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-scale"></a>

## Scale

ID: `studio.three_d.scale` • **PARTIAL**

Adjusts the bounded authored 3D scene scale.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-rotationx"></a>

## Rotation X

ID: `studio.three_d.rotationx` • **PARTIAL**

Adjusts the bounded authored 3D scene rotationX.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-rotationy"></a>

## Rotation Y

ID: `studio.three_d.rotationy` • **PARTIAL**

Adjusts the bounded authored 3D scene rotationY.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-rotationz"></a>

## Rotation Z

ID: `studio.three_d.rotationz` • **PARTIAL**

Adjusts the bounded authored 3D scene rotationZ.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-extrusiondepth"></a>

## Extrusion Depth

ID: `studio.three_d.extrusiondepth` • **PARTIAL**

Adjusts the bounded authored 3D scene extrusionDepth.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-bevel"></a>

## Bevel

ID: `studio.three_d.bevel` • **PARTIAL**

Adjusts the bounded authored 3D scene bevel.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-focallength"></a>

## Focal Length

ID: `studio.three_d.focallength` • **PARTIAL**

Adjusts the bounded authored 3D scene focalLength.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-lightintensity"></a>

## Light Intensity

ID: `studio.three_d.lightintensity` • **PARTIAL**

Adjusts the bounded authored 3D scene lightIntensity.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-cameramotion"></a>

## Camera Motion

ID: `studio.three_d.cameramotion` • **PARTIAL**

Adjusts the bounded authored 3D scene cameraMotion.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser/final parity is approximate. This field does not grant arbitrary imported-model control.

<a id="studio-three_d-bloom"></a>

## Bloom

ID: `studio.three_d.bloom` • **PARTIAL**

Adjusts the bounded authored 3D scene bloom.

Applies to: authored 3D scene. Requires: studio.three_d.

- Browser and final 3D scene behavior is approximate; inspect the current owned final scene.
- Bloom default is 0.7 for neon logo, 0.32 for other presets.

<a id="studio-three_d-material"></a>

## 3D material

ID: `studio.three_d.material` • **PARTIAL**

Selects a supported preset material for the authored scene.

Applies to: authored 3D scene. Requires: studio.three_d.

- Default depends on the chosen scene preset. Metalness/roughness are not documented as exposed editable controls.

<a id="studio-three_d-fontfamily"></a>

## 3D font family

ID: `studio.three_d.fontfamily` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-fontweight"></a>

## 3D font weight

ID: `studio.three_d.fontweight` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-easing"></a>

## 3D scene easing

ID: `studio.three_d.easing` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Disabled in the final-capable inspector; do not promise exported support.
- Scene-level easing is distinct from supported per-key interpolation.

<a id="studio-three_d-audioreactiveintensity"></a>

## Audio-reactive intensity

ID: `studio.three_d.audioreactiveintensity` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-lightdirection"></a>

## 3D light direction

ID: `studio.three_d.lightdirection` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-shadows"></a>

## 3D shadows

ID: `studio.three_d.shadows` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-reflections"></a>

## 3D reflections

ID: `studio.three_d.reflections` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-background"></a>

## 3D background

ID: `studio.three_d.background` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-three_d-quality"></a>

## 3D quality

ID: `studio.three_d.quality` • **PARTIAL**

Legacy/browser scene field; the final 3D contract does not support this control.

Applies to: authored 3D scene. Requires: studio.three_d.

- Displayed legacy field is disabled for final rendering; the authored-scene default is not a supported export setting.

<a id="studio-music-volume"></a>

## Music volume

ID: `studio.music.volume` • **PARTIAL**

Sets the music base gain independently of bus automation.

Applies to: video. Requires: studio.music.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-music-fadein"></a>

## Music fadeIn

ID: `studio.music.fadein` • **PARTIAL**

Fades the music cue at its boundaries.

Applies to: video. Requires: studio.music.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-music-fadeout"></a>

## Music fadeOut

ID: `studio.music.fadeout` • **PARTIAL**

Fades the music cue at its boundaries.

Applies to: video. Requires: studio.music.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-audio-ducking_strength"></a>

## Duck strength

ID: `studio.audio.ducking_strength` • **PARTIAL**

Sets how strongly music is reduced in the selected ducking mode.

Applies to: video. Requires: studio.ducking.

- UI slider is 10–90%; other internal prepared-mix paths use their own bounded contract.
- Default shown in this music inspector is 0.4, not a universal render/provider default.

<a id="studio-audio-ducking_mode"></a>

## Ducking mode

ID: `studio.audio.ducking_mode` • **PARTIAL**

Chooses speech-aware music reduction or a constant reduction.

Applies to: video. Requires: studio.ducking.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-sfx-volume"></a>

## Effect volume

ID: `studio.sfx.volume` • **PARTIAL**

Sets the individual sound cue gain before the SFX bus envelope.

Applies to: video. Requires: studio.sfx.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-sfx-duration"></a>

## Sound cue duration

ID: `studio.sfx.duration` • **PARTIAL**

Sets the duration of the selected cue.

Applies to: video. Requires: studio.sfx.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-sfx-trim"></a>

## Sound source trim start

ID: `studio.sfx.trim` • **PARTIAL**

Moves the starting sample of an owned external sound cue.

Applies to: video. Requires: studio.sfx.

- Disabled for built-in synthesized cues; external sources remain bounded by their actual duration.

<a id="studio-voiceover-volume"></a>

## Voice take volume

ID: `studio.voiceover.volume` • **PARTIAL**

Sets an owned voice take gain; unity is 1.

Applies to: video. Requires: studio.voiceover.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-voiceover-duration"></a>

## Voice take duration

ID: `studio.voiceover.duration` • **PARTIAL**

Bounds the placed voice take and decoded source checks.

Applies to: video. Requires: studio.voiceover.

- Import also enforces a 128 MB size limit. Supported PCM preview uses a narrower short-take subset; longer/retimed speech uses the media path.

<a id="studio-speed-rate"></a>

## Clip/programme speed

ID: `studio.speed.rate` • **PARTIAL**

Sets the native speed rate; keys and linked content use the shared time map.

Applies to: video. Requires: studio.speed.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-transition-duration"></a>

## Join transition duration

ID: `studio.transition.duration` • **PARTIAL**

Sets a supported join duration after a removed source range.

Applies to: video. Requires: studio.transitions.

- Clean cut uses 0.02 seconds; the 0.04–2 range describes non-clean joins in this operation.
- Other occurrence transitions retain their own contract.

<a id="studio-title-text"></a>

## Title text

ID: `studio.title.text` • **PARTIAL**

Edits the ordinary title copy.

Applies to: video. Requires: studio.titles.

- Current title editor maxLength is 180 characters. Long copy still needs layout review.

<a id="studio-title-scale"></a>

## Title size

ID: `studio.title.scale` • **PARTIAL**

Sets title size in the title typography inspector.

Applies to: video. Requires: studio.titles.

- Title size widget is 0.5–2; ordinary motion inspector scale is a different 0.1–5 range.

<a id="studio-title-color"></a>

## Title text color

ID: `studio.title.color` • **PARTIAL**

Sets a supported title color.

Applies to: video. Requires: studio.titles.

- Use a valid color from the existing picker; contrast must be reviewed over the actual footage.

<a id="studio-subject-exposure"></a>

## Background exposure

ID: `studio.subject.exposure` • **PARTIAL**

Grades the original background around the mask.

Applies to: video. Requires: studio.compositing.background_grade.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-subject-saturation"></a>

## Background saturation

ID: `studio.subject.saturation` • **PARTIAL**

Grades the original background around the mask.

Applies to: video. Requires: studio.compositing.background_grade.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="studio-subject-contrast"></a>

## Background contrast

ID: `studio.subject.contrast` • **PARTIAL**

Grades the original background around the mask.

Applies to: video. Requires: studio.compositing.background_grade.

- This is the exposed control range; other inspector or worker bounds may be narrower for a specific operation.

<a id="generation-max_cutaways"></a>

## Maximum generated cutaways

ID: `generation.max_cutaways` • **PARTIAL**

Bounds the requested B-roll planning batch.

Applies to: video. Requires: studio.generated_video.

- UI batch choice; server allowance and provider availability remain authoritative.

<a id="publishing-queue-period"></a>

## Queue period

ID: `publishing.queue.period` • **PARTIAL**

Shows schedules in the next seven days or the full stored queue.

Applies to: video. Requires: publishing.schedule.

- Loading account-owned schedules does not confirm external delivery.
- Queue navigation does not control movie rendering.

<a id="publishing-queue-load_more"></a>

## Load more schedules

ID: `publishing.queue.load_more` • **PARTIAL**

Loads another owned queue page when more entries are available.

Applies to: video. Requires: publishing.schedule.

- Results remain limited to the selected period.
- Queue navigation does not control movie rendering.

<a id="studio-geometric_mask-path"></a>

## Mask polygon path

ID: `studio.geometric_mask.path` • **PARTIAL**

Authors the local polygon of an ordinary geometric layer mask. Incomplete or invalid text stays outside the saved graph until a valid Enter/blur commit.

Applies to: image overlays, ordinary title layers, graphic groups. Requires: studio.compositing.

- Percentage polygon with3–64 points and at most2048 characters inside its parentheses. Each point contains finite X/Y percentages.
- Path animation, arbitrary SVG paths and neural subject masks are unsupported.
- Group masks/blend modes are static. One nested Multiply/Screen native edit and bounded image geometry/interior-color checks pass; wider native modes/media, full alpha/raster and continuous picture/sound remain unqualified.

<a id="studio-geometric_mask-radius"></a>

## Mask corner radius

ID: `studio.geometric_mask.radius` • **PARTIAL**

Sets the local rectangle mask corner radius, independently of the artwork frame. An explicit zero preserves square mask corners.

Applies to: image overlays, ordinary title layers, graphic groups. Requires: studio.compositing.

- Rectangle masks only; artwork frame rounding and feathering are separate.
- Radius animation is unsupported.
- Group masks/blend modes are static. One nested Multiply/Screen native edit and bounded image geometry/interior-color checks pass; wider native modes/media, full alpha/raster and continuous picture/sound remain unqualified.

<a id="studio-composite-layer_order"></a>

## Layer order

ID: `studio.composite.layer_order` • **PARTIAL**

Moves an ordinary graphic, motion scene, owned3D scene or group backward/forward among its siblings. The top row appears in front.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Static graphic/group sibling order only; source footage/source VFX and generated captions keep their separate stages.
- 3D still requires an existing current owned export asset. No generation is triggered by reordering.
- Native image/title/two-motion edits are qualified for their recorded lifecycle and image occlusion checks; real 3D, large stacks, whole raster and broader nesting remain unqualified.
- Groups preserve contiguous canonical leaf order and isolate masks/blends among siblings. Reorder grouped timeline layers in Composite; group clip/occurrence ownership and broader animated combinations remain open.

<a id="studio-composite-group_x"></a>

## Group X position

ID: `studio.composite.group_x` • **PARTIAL**

Translates the composed group horizontally relative to the programme canvas.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and clip/occurrence ownership are unsupported. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_y"></a>

## Group Y position

ID: `studio.composite.group_y` • **PARTIAL**

Translates the composed group vertically relative to the programme canvas.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and clip/occurrence ownership are unsupported. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_scale"></a>

## Group scale

ID: `studio.composite.group_scale` • **PARTIAL**

Scales the composed group uniformly about the canvas centre, preserving child-local edits.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and clip/occurrence ownership are unsupported. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_rotation"></a>

## Group rotation

ID: `studio.composite.group_rotation` • **PARTIAL**

Rotates the composed group about the canvas centre, before the parent translation.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and clip/occurrence ownership are unsupported. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_opacity"></a>

## Group opacity

ID: `studio.composite.group_opacity` • **PARTIAL**

Fades the composed group once after its children overlap, before parent composition.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and clip/occurrence ownership are unsupported. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_mask_enabled"></a>

## Enable group mask

ID: `studio.composite.group_mask_enabled` • **PARTIAL**

Clips assembled children with the authored local-canvas mask.

Applies to: graphic groups. Requires: studio.compositing.

- Static geometric group mask only; assembled child alpha is clipped before group transform/opacity/blending. No neural segmentation or mask animation.
- Graphics locks, valid-only polygon drafts, reset/undo and cold persistence apply. One native feathered-polygon/rectangle nested edit and four scoped geometry/interior-color pairs are bounded; broader masks/media/full alpha/raster/live sound remain unqualified.

<a id="studio-composite-group_mask_shape"></a>

## Group mask shape

ID: `studio.composite.group_mask_shape` • **PARTIAL**

Chooses rectangle, ellipse or percentage polygon in the group’s local programme canvas.

Applies to: graphic groups. Requires: studio.compositing.

- Static geometric group mask only; assembled child alpha is clipped before group transform/opacity/blending. No neural segmentation or mask animation.
- Graphics locks, valid-only polygon drafts, reset/undo and cold persistence apply. One native feathered-polygon/rectangle nested edit and four scoped geometry/interior-color pairs are bounded; broader masks/media/full alpha/raster/live sound remain unqualified.

<a id="studio-composite-group_mask_feather"></a>

## Group mask feather

ID: `studio.composite.group_mask_feather` • **PARTIAL**

Softens the group matte with Gaussian sigma in 720px programme units before the group transform.

Applies to: graphic groups. Requires: studio.compositing.

- Static geometric group mask only; assembled child alpha is clipped before group transform/opacity/blending. No neural segmentation or mask animation.
- Graphics locks, valid-only polygon drafts, reset/undo and cold persistence apply. One native feathered-polygon/rectangle nested edit and four scoped geometry/interior-color pairs are bounded; broader masks/media/full alpha/raster/live sound remain unqualified.

<a id="studio-composite-group_mask_inverted"></a>

## Invert group mask

ID: `studio.composite.group_mask_inverted` • **PARTIAL**

Inverts the authored matte after feathering within the local programme canvas.

Applies to: graphic groups. Requires: studio.compositing.

- Static geometric group mask only; assembled child alpha is clipped before group transform/opacity/blending. No neural segmentation or mask animation.
- Graphics locks, valid-only polygon drafts, reset/undo and cold persistence apply. One native feathered-polygon/rectangle nested edit and four scoped geometry/interior-color pairs are bounded; broader masks/media/full alpha/raster/live sound remain unqualified.
