# Source-qualified controls

Development documentation • product 1.2.0 • knowledge 1.0.45 • 2026-10-21

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
| studio.group_clip.move | Move group clip | number | 0 … source-dependent | programme seconds | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.group_clip.in | Group clip In | number | 0 … source-dependent | programme seconds | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.group_clip.out | Group clip Out | number | 0 … source-dependent | programme seconds | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.keyframe.selection_scale | Selected keyframe time scale | number | 0 … 100 | multiplier | 2 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.keyframe.paste_target | Keyframe paste destination | string | source-dependent … source-dependent | layer ID; empty means original layers | "" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.start_velocity | Start velocity | number | source-dependent … source-dependent | property units per programme second | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.end_velocity | End velocity | number | source-dependent … source-dependent | property units per programme second | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.start_influence | Start influence | number | 1 … 99 | percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.end_influence | End influence | number | 1 … 99 | percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.title.kinetic_unit | Kinetic unit | string | word, letter | none | "word" | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_style | Kinetic movement | string | rise, pop, spin | none | "rise" | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_direction | Kinetic order | string | forward, reverse, center | none | "forward" | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_stagger | Kinetic stagger | number | 0 … 1 | seconds | 0.12 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_entry | Kinetic entrance | number | 0.1 … 3 | seconds | 0.5 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_travel | Kinetic travel | number | 0 … 30 | percent | 8 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_tilt | Kinetic rotation | number | 0 … 90 | degrees | 12 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.title.kinetic_exit | Kinetic exit | number | 0.1 … 3 | seconds | 0.25 | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.graphics.import | Import animated graphics | string | source-dependent … source-dependent | JSON file | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.timeline.view | Composition layers / Sequence tracks | string | layers, tracks | display choice | "layers" | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.timeline.at_playhead | At playhead | boolean | source-dependent … source-dependent | display choice | false | UNSUPPORTED | PARTIAL | UNSUPPORTED | UNSUPPORTED |
| studio.media.replace_sequence | Replace entire sequence | string | source-dependent … source-dependent | action | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNSUPPORTED |
| studio.media.remove_unused | Remove unused media | string | source-dependent … source-dependent | action | not a fixed default | UNSUPPORTED | PARTIAL | PARTIAL | UNSUPPORTED |
| studio.title.outline_color | Outline color | string | source-dependent … source-dependent | hex color | "#000000" | UNSUPPORTED | PARTIAL | PARTIAL | UNSUPPORTED |
| studio.logo_motion.brand_name | Logo motion brand name | string | source-dependent … source-dependent | none | "AutoPromote" | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.duration | Logo motion duration | number | 8 … 14 | seconds | 10 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.accent | Logo motion accent | string | source-dependent … source-dependent | none | "#a855f7" | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.background | Add background | boolean | source-dependent … source-dependent | none | true | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.separate_symbol | Separate left symbol from wordmark | boolean | source-dependent … source-dependent | none | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.symbol_width | Logo symbol width | number | 10 … 60 | percent of visible logo width | 28 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.piece_construction | Construct words from pieces | boolean | source-dependent … source-dependent | boolean | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.piece_columns | Logo wordmark slices | number | 2 … 16 | slices | 11 | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.logo_motion.piece_style | Logo piece choreography | string | spring, diamond | choreography | "spring" | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.keyframe.spatial_curve | Curve path / Straighten path | boolean | source-dependent … source-dependent | composition percent | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.keyframe.spatial_handle | Spatial path handles | array | -200 … 200 | composition percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.add | Add vector artwork | object | source-dependent … source-dependent | layer | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.point | Vector points | array | 0 … 100 | layer percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.tangent | Vector tangents | array | -200 … 200 | layer percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.split | Split after point | array | 2 … 64 | points | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.point_kind | Corner / Smooth point | array | source-dependent … source-dependent | layer percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.fill | Vector fill and gradient | object | source-dependent … source-dependent | paint | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.stroke | Vector stroke | object | 0 … 20 | layer percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.closed | Close vector path | boolean | source-dependent … source-dependent | boolean | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.stroke_start | Stroke start | number | 0 … 100 | path distance percent | 0 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.stroke_end | Stroke end | number | 0 … 100 | path distance percent | 100 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.vector.stroke_offset | Stroke offset | number | -1000 … 1000 | path distance percent | 0 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.enable | Animate this title | object | source-dependent … source-dependent | local unit | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.unit | Animate text by | enum | character, word | local unit | "character" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.order | Text animation order | enum | forward, reverse, center_out, edges_in | local unit | "forward" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.stagger | Stagger | number | 0 … 95 | percent | 65 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.from_x | Letter travel X (em) | number | -4 … 4 | em | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.from_y | Letter travel Y (em) | number | -4 … 4 | em | 1.4 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.from_scale | Starting scale | number | 0 … 2.5 | local unit | 0.35 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.from_rotation | Starting rotation | number | -360 … 360 | degrees | -35 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.from_opacity | Starting opacity | number | 0 … 1 | local unit | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.spread | Starting spread | number | -1 … 1 | local unit | 0.3 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.range_start | Range start (%) | number | 0 … 100 | percent | 0 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.range_end | Range end (%) | number | 0 … 100 | percent | 100 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.settle | Text settling curve | enum | linear, ease_out, ease_in_out, back_out | local unit | "back_out" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.progress | Text progress | number | 0 … 100 | percent | 100 | SUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.rebuild | Rebuild entrance keys | number | 0 … 100 | percent | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.text_animator.remove | Remove text animator | object | source-dependent … source-dependent | local unit | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.name | Brand name | string | source-dependent … source-dependent | design units | "AutoPromote" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.family | Logo symbol family | enum | flow, orbit, facet | design units | "flow" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.layout | Logo layout | enum | horizontal, stacked, symbol | design units | "horizontal" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.weight | Logo lettering | enum | 600, 900 | design units | 900 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.tracking | Logo letter spacing | number | -2 … 12 | design units | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.symbol_size | Logo symbol size | number | 0.6 … 1.4 | design units | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.colours | Logo colours | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.gradient | Gradient symbol | boolean | source-dependent … source-dependent | design units | true | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.assemble | Assemble logo pieces | boolean | source-dependent … source-dependent | design units | false | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.build | Add logo to timeline | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.variant | Export logo variant | enum | colour, light, dark | design units | "colour" | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.svg | Download logo SVG | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.png | Download logo PNG | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.contour | Vector contour | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.logo_design.canvas | Start a logo design | object | source-dependent … source-dependent | design units | not a fixed default | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| publishing.analytics.sync_latest | Sync latest platform statistics | array | 1 … 6 | none | [] | UNSUPPORTED | SUPPORTED | UNSUPPORTED | UNSUPPORTED |
| publishing.analytics.release | Published release | string | source-dependent … source-dependent | none | "" | UNSUPPORTED | SUPPORTED | UNSUPPORTED | UNSUPPORTED |
| studio.captions.source_language | Speech language | enum | auto, en, af, za-mixed, xh, zu, st, tn, ts, nr, ve | none | "auto" | UNSUPPORTED | PARTIAL | PARTIAL | UNVERIFIED |
| studio.composite.background_edge_radius | Edge detail width | number | 0 … 8 | source pixels | 3 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.composite.background_decontaminate | Remove old background colour | number | 0 … 1 | strength | 1 | UNSUPPORTED | PARTIAL | SUPPORTED | UNVERIFIED |
| studio.composite.source_detail_repair | Repair opaque detail from source | array | 0 … 16 | normalized source-frame corners; feather and end blending in source pixels | [] | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.composite.edge_refinement_region | Edge refinement region points | array | 0 … 64 | normalized source-frame points | [] | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |
| studio.composite.colour_treatment_paths | Colour treatment paths | array | 0 … 32 | normalized source-frame points | [] | UNSUPPORTED | PARTIAL | SUPPORTED | UNSUPPORTED |

<a id="studio-transform-x"></a>

## Position X

ID: `studio.transform.x` • **FUNCTIONAL**

Adjusts position x on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- The on-picture motion-path editor writes an X/Y pair in one history edit. An in-progress pointer drag is preview-only; release commits ordinary canonical keys and Escape discards it.

<a id="studio-transform-y"></a>

## Position Y

ID: `studio.transform.y` • **FUNCTIONAL**

Adjusts position y on the selected ordinary layer. Anchor/crop affect the transform geometry.

Applies to: ordinary layers. Requires: studio.transforms, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- The on-picture motion-path editor writes an X/Y pair in one history edit. An in-progress pointer drag is preview-only; release commits ordinary canonical keys and Escape discards it.

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
- The property timeline also applies this operation to selected ordinary keys in one history edit. Paste can retain original ownership or target one compatible layer with new identities; timing collisions and destination locks reject the entire change.

<a id="studio-keyframe-easing"></a>

## Keyframe easing

ID: `studio.keyframe.easing` • **FUNCTIONAL**

Selects the interpolation between property poses. Hold retains the prior value until the next key.

Applies to: ordinary layers, graphic groups. Requires: studio.easing, studio.keyframes.

- Scope is the listed feature; do not transfer this range or support claim to another inspector.
- Group evaluation clamps values to each group property’s bounds. Worker Bézier expressions use the existing 32-sample approximation; broad curve/raster equivalence is unqualified.
- The property timeline also applies this operation to selected ordinary keys in one history edit. Paste can retain original ownership or target one compatible layer with new identities; timing collisions and destination locks reject the entire change.

<a id="studio-keyframe-curve"></a>

## Cubic curve handles

ID: `studio.keyframe.curve` • **FUNCTIONAL**

Sets the bounded cubic interpolation curve; X handles stay 0–1 and Y handles may overshoot -2–2 in the shared contract.

Applies to: ordinary layers. Requires: studio.easing.

- Array contains exactly four handles. Shared contract permits Y overshoot; some inspector widgets show narrower Y bounds.
- The same four values can be edited through signed velocity and influence. Value and velocity graphs are inspection views, not separate animation engines. The sampled path uses the same X/Y evaluator.

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
- Groups preserve contiguous canonical leaf order and isolate masks/blends among siblings. Reorder grouped timeline layers in Composite; source-occurrence attachment/remapping and group split/duplicate and broader animated combinations remain open.

<a id="studio-composite-group_x"></a>

## Group X position

ID: `studio.composite.group_x` • **PARTIAL**

Translates the composed group horizontally relative to the programme canvas.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and source-occurrence attachment/remapping are unsupported. Group clips move child timing/keys together and trim visibility without stretching content. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_y"></a>

## Group Y position

ID: `studio.composite.group_y` • **PARTIAL**

Translates the composed group vertically relative to the programme canvas.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and source-occurrence attachment/remapping are unsupported. Group clips move child timing/keys together and trim visibility without stretching content. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_scale"></a>

## Group scale

ID: `studio.composite.group_scale` • **PARTIAL**

Scales the composed group uniformly about the canvas centre, preserving child-local edits.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and source-occurrence attachment/remapping are unsupported. Group clips move child timing/keys together and trim visibility without stretching content. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_rotation"></a>

## Group rotation

ID: `studio.composite.group_rotation` • **PARTIAL**

Rotates the composed group about the canvas centre, before the parent translation.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and source-occurrence attachment/remapping are unsupported. Group clips move child timing/keys together and trim visibility without stretching content. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
- Existing worker Bézier expressions approximate 32 samples while browser interpolation solves the curve. Whole curve/raster equivalence is unqualified.

<a id="studio-composite-group_opacity"></a>

## Group opacity

ID: `studio.composite.group_opacity` • **PARTIAL**

Fades the composed group once after its children overlap, before parent composition.

Applies to: ordinary image/video/title layers, motion scenes, owned 3D alpha scenes. Requires: studio.compositing.

- Keys stay in the existing canonical motionKeyframes with the group ID as targetId. At most 256 keys per group across the five supported properties; duplicate property times and invalid values/curves fail validation. The shared six easing choices apply and evaluated overshoot clamps to these bounds.
- At most 64 groups and eight nesting levels; children need one parent and a contiguous canonical leaf order. Each intermediate must fit the 4K pixel budget; filter graphs above 96,000 characters fail explicitly.
- Editable group anchor and source-occurrence attachment/remapping are unsupported. Group clips move child timing/keys together and trim visibility without stretching content. Group masks and all nine blend modes are static canonical decisions. One native 16-key/eight-channel image/two-motion edit with nested Multiply/Screen and polygon/rectangle masks is bounded; larger/deeper/video/owned 3D groups, native retiming, broader curves/grouped drag/deletion, full raster and live sound remain unqualified.
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

<a id="studio-group_clip-move"></a>

## Move group clip

ID: `studio.group_clip.move` • **PARTIAL**

Moves the group clip and all descendant starts and keys together, preserving durations and source phase.

Applies to: graphic groups. Requires: studio.timeline, studio.compositing.

- Programme seconds; UI commits on the selected delivery-frame grid. Pointer gestures commit once, and keyboard arrows nudge one frame (Shift: ten). Graphics or any owned child-track lock blocks the entire operation.
- Group trim limits visibility and derived linked motion cue ranges; hidden keys, source phase and child timing stay editable. Moving carries descendant group/clip starts and motion/3D keys in one transaction. Bounds protect non-negative owned keys and the current programme range.
- Source-occurrence attachment/remapping, group split/duplicate, time stretching, broad video/owned 3D/deeper/audio cases and continuous/full preview picture/sound remain unqualified.

<a id="studio-group_clip-in"></a>

## Group clip In

ID: `studio.group_clip.in` • **PARTIAL**

Sets the start of the group’s half-open programme visibility range without changing child content phase.

Applies to: graphic groups. Requires: studio.timeline, studio.compositing.

- Programme seconds; UI commits on the selected delivery-frame grid. Pointer gestures commit once, and keyboard arrows nudge one frame (Shift: ten). Graphics or any owned child-track lock blocks the entire operation.
- Group trim limits visibility and derived linked motion cue ranges; hidden keys, source phase and child timing stay editable. Moving carries descendant group/clip starts and motion/3D keys in one transaction. Bounds protect non-negative owned keys and the current programme range.
- Source-occurrence attachment/remapping, group split/duplicate, time stretching, broad video/owned 3D/deeper/audio cases and continuous/full preview picture/sound remain unqualified.

<a id="studio-group_clip-out"></a>

## Group clip Out

ID: `studio.group_clip.out` • **PARTIAL**

Sets the end of the group’s half-open visibility range; child keys and source edits remain available.

Applies to: graphic groups. Requires: studio.timeline, studio.compositing.

- Programme seconds; UI commits on the selected delivery-frame grid. Pointer gestures commit once, and keyboard arrows nudge one frame (Shift: ten). Graphics or any owned child-track lock blocks the entire operation.
- Group trim limits visibility and derived linked motion cue ranges; hidden keys, source phase and child timing stay editable. Moving carries descendant group/clip starts and motion/3D keys in one transaction. Bounds protect non-negative owned keys and the current programme range.
- Source-occurrence attachment/remapping, group split/duplicate, time stretching, broad video/owned 3D/deeper/audio cases and continuous/full preview picture/sound remain unqualified.

<a id="studio-keyframe-selection_scale"></a>

## Selected keyframe time scale

ID: `studio.keyframe.selection_scale` • **PARTIAL**

Scales selected key spacing from the first selected key, retaining property values, curves and ownership.

Applies to: ordinary layers, graphic groups. Requires: studio.keyframes.

- A finite factor greater than zero and at most100 is accepted. Scaling is not animated.
- The first selected key stays fixed. Programme-range overflow or collisions reject the operation. Every selected track must be unlocked.
- Group opacity and ordinary multi-property time scaling use the existing canonical key graph and history. Broad media/retiming/full picture and sound qualification remains open.

<a id="studio-keyframe-paste_target"></a>

## Keyframe paste destination

ID: `studio.keyframe.paste_target` • **PARTIAL**

Chooses original owners or a compatible current-project visual layer for copied property animation.

Applies to: ordinary layers, graphic groups. Requires: studio.keyframes.

- Only one copied source owner may be remapped to a destination. Property identities are retained; unsupported properties and destination value ranges reject the whole paste.
- Destination locks, half-frame collisions and programme overflow reject atomically. Original-layers mode checks original owner locks.
- Clipboard is timeline-local; cross-project/system clipboard interchange is not qualified. Whole picture/sound agreement remains partial.

<a id="studio-keyframe-start_velocity"></a>

## Start velocity

ID: `studio.keyframe.start_velocity` • **PARTIAL**

Sets signed endpoint change per programme second for the selected incoming key interval. Curved position intervals use coordinated path-progress timing instead of scalar endpoint speed.

Applies to: ordinary layer properties, graphic-group properties. Requires: studio.keyframes, studio.easing.

- Writes the existing cubic curve; no independent velocity state is saved. Editing an easing preset explicitly converts it to a custom cubic.
- Only changing intervals support these controls. Hold and constant intervals cannot be reshaped into movement. Cubic time handles stay0–1 and value handles stay-2–2; impossible speeds reject.
- Native image X-curve history/cold/export evidence is scoped. Worker custom curves use32 samples; whole raster/live sound, broad media/retiming and broader spatial-handle combinations remain unqualified.

<a id="studio-keyframe-end_velocity"></a>

## End velocity

ID: `studio.keyframe.end_velocity` • **PARTIAL**

Sets signed endpoint change per programme second for the selected incoming key interval. Curved position intervals use coordinated path-progress timing instead of scalar endpoint speed.

Applies to: ordinary layer properties, graphic-group properties. Requires: studio.keyframes, studio.easing.

- Writes the existing cubic curve; no independent velocity state is saved. Editing an easing preset explicitly converts it to a custom cubic.
- Only changing intervals support these controls. Hold and constant intervals cannot be reshaped into movement. Cubic time handles stay0–1 and value handles stay-2–2; impossible speeds reject.
- Native image X-curve history/cold/export evidence is scoped. Worker custom curves use32 samples; whole raster/live sound, broad media/retiming and broader spatial-handle combinations remain unqualified.

<a id="studio-keyframe-start_influence"></a>

## Start influence

ID: `studio.keyframe.start_influence` • **PARTIAL**

Controls the endpoint time influence while preserving its signed velocity. Curved position intervals use coordinated path-progress timing instead of scalar endpoint speed.

Applies to: ordinary layer properties, graphic-group properties. Requires: studio.keyframes, studio.easing.

- Writes the existing cubic curve; no independent velocity state is saved. Editing an easing preset explicitly converts it to a custom cubic.
- Only changing intervals support these controls. Hold and constant intervals cannot be reshaped into movement. Cubic time handles stay0–1 and value handles stay-2–2; impossible speeds reject.
- Native image X-curve history/cold/export evidence is scoped. Worker custom curves use32 samples; whole raster/live sound, broad media/retiming and broader spatial-handle combinations remain unqualified.

<a id="studio-keyframe-end_influence"></a>

## End influence

ID: `studio.keyframe.end_influence` • **PARTIAL**

Controls the endpoint time influence while preserving its signed velocity. Curved position intervals use coordinated path-progress timing instead of scalar endpoint speed.

Applies to: ordinary layer properties, graphic-group properties. Requires: studio.keyframes, studio.easing.

- Writes the existing cubic curve; no independent velocity state is saved. Editing an easing preset explicitly converts it to a custom cubic.
- Only changing intervals support these controls. Hold and constant intervals cannot be reshaped into movement. Cubic time handles stay0–1 and value handles stay-2–2; impossible speeds reject.
- Native image X-curve history/cold/export evidence is scoped. Worker custom curves use32 samples; whole raster/live sound, broad media/retiming and broader spatial-handle combinations remain unqualified.

<a id="studio-title-kinetic_unit"></a>

## Kinetic unit

ID: `studio.title.kinetic_unit` • **PARTIAL**

Sets unit when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-title-kinetic_style"></a>

## Kinetic movement

ID: `studio.title.kinetic_style` • **PARTIAL**

Sets movement when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-title-kinetic_direction"></a>

## Kinetic order

ID: `studio.title.kinetic_direction` • **PARTIAL**

Sets order when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-title-kinetic_stagger"></a>

## Kinetic stagger

ID: `studio.title.kinetic_stagger` • **PARTIAL**

Sets stagger when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-title-kinetic_entry"></a>

## Kinetic entrance

ID: `studio.title.kinetic_entry` • **PARTIAL**

Sets entrance when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-title-kinetic_travel"></a>

## Kinetic travel

ID: `studio.title.kinetic_travel` • **PARTIAL**

Sets travel when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.
- Available for Rise and Spin. Pop changes scale without translation; its travel input is disabled.

<a id="studio-title-kinetic_tilt"></a>

## Kinetic rotation

ID: `studio.title.kinetic_tilt` • **PARTIAL**

Sets rotation when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.
- Available for Spin. Rise and Pop do not author rotation travel; the rotation input is disabled for those movements.

<a id="studio-title-kinetic_exit"></a>

## Kinetic exit

ID: `studio.title.kinetic_exit` • **PARTIAL**

Sets exit when creating ordinary editable text units and motion keys.

Applies to: ordinary text layer. Requires: studio.titles, studio.keyframes.

- Authoring input; the generated ordinary layers and motion keys are the saved state. Later changes use the existing property timeline.
- The edit must satisfy timing, layer-count and supported title-style validation.

<a id="studio-graphics-import"></a>

## Import animated graphics

ID: `studio.graphics.import` • **PARTIAL**

Imports authored graphics as ordinary editable titles, artwork, groups, static geometric masks and transform keys.

Applies to: ordinary text layer, static SVG artwork. Requires: studio.titles, studio.keyframes.

- AutoPromote graphics v1 JSON; matching programme aspect; timing inside the current programme; at most 128 total graphic layers and 32 new groups; 256 keys per item, 8192 imported keys and 4MiB file size.
- Static SVG artwork passes the existing sanitizer and is rasterized to at most 2048 pixels on its longest side. Source vector paths are not editable after import.
- Adds layers and leaves current footage/audio decisions in place. Invalid or stale imports commit no layers; successful import is one undo step.
- Whole preview/final raster, live sound, broad media combinations and creative/pro/production qualification remain separate.
- Optional title strokeWidth 0–8 and strokeColor hex fields use the ordinary title controls and CPU rasterizer.
- Optional layer/group masks use the existing enabled, shape, percentage-polygon path, radius, feather and inversion fields. Masks remain editable in Composite; imported masks are static.

<a id="studio-timeline-view"></a>

## Composition layers / Sequence tracks

ID: `studio.timeline.view` • **PARTIAL**

Switches between the actual composition stack and source/audio sequence tracks. Layer rows expose native selection, move/trim and inline transform keys.

Applies to: ordinary text/image/video layers, graphic groups, motion scenes. Requires: studio.timeline.

- Display choices do not mutate the canonical project. Source footage remains a base stage; clip timing alone does not certify visible pixels. Whole preview/final picture and sound remain unqualified.

<a id="studio-timeline-at_playhead"></a>

## At playhead

ID: `studio.timeline.at_playhead` • **PARTIAL**

Filters layer rows by their real half-open timing range intersected with every parent group gate. It does not test opacity or occlusion.

Applies to: ordinary text/image/video layers, graphic groups, motion scenes. Requires: studio.timeline.

- Display choices do not mutate the canonical project. Source footage remains a base stage; clip timing alone does not certify visible pixels. Whole preview/final picture and sound remain unqualified.

<a id="studio-media-replace_sequence"></a>

## Replace entire sequence

ID: `studio.media.replace_sequence` • **PARTIAL**

Replaces source clips at the same programme length while preserving graphics and soundtrack timing. Removes source captions/camera/template bindings. Undo restores the original source state.

Applies to: owned project media. Requires: studio.media_ingest.

- Whole preview/final picture and audio, broader combinations and professional/production qualification remain separate.
- Ready video at least as long as the programme; unlocked Video track; source speed 1, no speed keys, opening hook or silence removal. Graphic/sound timing remains intact; source-specific decisions are reset.

<a id="studio-media-remove_unused"></a>

## Remove unused media

ID: `studio.media.remove_unused` • **PARTIAL**

Removes unreferenced project-library assets and animation keys with no remaining layer. Retains active sources, camera/audio references and pending uploads. Undo restores entries; stored files remain available.

Applies to: owned project media. Requires: studio.media_ingest.

- Whole preview/final picture and audio, broader combinations and professional/production qualification remain separate.

<a id="studio-title-outline_color"></a>

## Outline color

ID: `studio.title.outline_color` • **PARTIAL**

Sets the ordinary title outline color in saved state, native preview and CPU output. Outline width remains the existing title property.

Applies to: ordinary text layer. Requires: studio.titles.

- Whole preview/final picture and audio, broader combinations and professional/production qualification remain separate.

<a id="studio-logo_motion-brand_name"></a>

## Logo motion brand name

ID: `studio.logo_motion.brand_name` • **PARTIAL**

Names the authored composition. SVG builds create measured editable brand letters; image builds preserve supplied lettering.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-duration"></a>

## Logo motion duration

ID: `studio.logo_motion.duration` • **PARTIAL**

Sets the duration of the created intro, within the current programme length. It does not stretch existing footage.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-accent"></a>

## Logo motion accent

ID: `studio.logo_motion.accent` • **PARTIAL**

Sets the six-digit colour of the authored broadcast pulse, sweep and rule, preserving supplied logo colours.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-background"></a>

## Add background

ID: `studio.logo_motion.background` • **PARTIAL**

Adds the composition backdrop over source footage; disable to retain the underlying picture.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-separate_symbol"></a>

## Separate left symbol from wordmark

ID: `studio.logo_motion.separate_symbol` • **PARTIAL**

Finds a transparent seam so the original symbol and lettering can move independently. It rejects an opaque cut rather than erasing artwork.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-symbol_width"></a>

## Logo symbol width

ID: `studio.logo_motion.symbol_width` • **PARTIAL**

Places the initial symbol/wordmark boundary as a percentage of the visible image width; the seam follows transparent space around it.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-piece_construction"></a>

## Construct words from pieces

ID: `studio.logo_motion.piece_construction` • **PARTIAL**

Creates interlocking image slices and three masked text pieces per word through ordinary graphics and keys.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-piece_columns"></a>

## Logo wordmark slices

ID: `studio.logo_motion.piece_columns` • **PARTIAL**

Sets the number of original bitmap wordmark slices; each slice is animated as two interlocking pieces.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-logo_motion-piece_style"></a>

## Logo piece choreography

ID: `studio.logo_motion.piece_style` • **PARTIAL**

Chooses a symbol-first spring assembly or a word-first triangular cascade, authoring ordinary editable layers and keys.

Applies to: new logo-motion composition. Requires: studio.logo_motion.

- Creation option. After building, edit the ordinary generated layers and keys through the standard controls.

<a id="studio-keyframe-spatial_curve"></a>

## Curve path / Straighten path

ID: `studio.keyframe.spatial_curve` • **PARTIAL**

Enables or removes spatial handles on an interval with paired neighboring X/Y position keys. Endpoints are retained; X/Y travel timing is coordinated.

Applies to: ordinary image position keys, ordinary title position keys, source position keys. Requires: studio.keyframes, studio.easing.

- Requires paired neighboring X/Y position keys. Bounds apply to handle offsets from the corresponding endpoint.
- Travel timing is separate from screen-distance speed. Changes to individual keys can change neighboring intervals.
- Native image/history/reopen/export checks are bounded; broad media, retiming, animated parents and full picture/sound remain unqualified.

<a id="studio-keyframe-spatial_handle"></a>

## Spatial path handles

ID: `studio.keyframe.spatial_handle` • **PARTIAL**

Shapes the route by dragging or arrow-nudging an endpoint-relative handle. Preview follows the temporary drag; release commits once and Escape cancels.

Applies to: ordinary image position keys, ordinary title position keys, source position keys. Requires: studio.keyframes, studio.easing.

- Requires paired neighboring X/Y position keys. Bounds apply to handle offsets from the corresponding endpoint.
- Travel timing is separate from screen-distance speed. Changes to individual keys can change neighboring intervals.
- Native image/history/reopen/export checks are bounded; broad media, retiming, animated parents and full picture/sound remain unqualified.

<a id="studio-vector-add"></a>

## Add vector artwork

ID: `studio.vector.add` • **PARTIAL**

Creates an ordinary timed artwork layer with editable cubic geometry.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-point"></a>

## Vector points

ID: `studio.vector.point` • **PARTIAL**

Move an anchor while its relative tangent offsets follow it; remove a selected point within the contour limits.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-tangent"></a>

## Vector tangents

ID: `studio.vector.tangent` • **PARTIAL**

Drag or nudge incoming and outgoing handles relative to the selected anchor. Release commits once; Escape cancels the gesture.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-split"></a>

## Split after point

ID: `studio.vector.split` • **PARTIAL**

Insert a midpoint by exact De Casteljau subdivision, retaining the original cubic geometry.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-point_kind"></a>

## Corner / Smooth point

ID: `studio.vector.point_kind` • **PARTIAL**

Corner collapses both handles. Smooth initializes collinear tangents from neighboring points; later handles remain independently editable.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-fill"></a>

## Vector fill and gradient

ID: `studio.vector.fill` • **PARTIAL**

Choose no fill, solid or a linear gradient, two colors and diagonal, horizontal or vertical direction.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-stroke"></a>

## Vector stroke

ID: `studio.vector.stroke` • **PARTIAL**

Choose outline width in the artwork coordinate box and a six-digit color. An unfilled path requires visible stroke.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-closed"></a>

## Close vector path

ID: `studio.vector.closed` • **PARTIAL**

Join the last anchor back to the first. Closing requires at least three points.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires an unlocked Graphics track and image-layer track.
- Static contour authoring; layer transforms use the existing motion keys. See vector artwork limitations.

<a id="studio-vector-stroke_start"></a>

## Stroke start

ID: `studio.vector.stroke_start` • **PARTIAL**

Choose the beginning of the visible outline by travelled path distance. Add or remove its key at the playhead; animate through the ordinary timeline and curve editor.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires editable vector artwork and an unlocked image-layer track. Set a nonzero stroke width in Graphics.
- Values use the programme clock and existing key easing; sampled cubic distance is an approximation. Start greater than or equal to end hides the stroke and preserves fill. Offset shifts the interval: closed contours wrap and open contours clip.
- Numeric drafts commit with Enter or blur. Escape cancels; seeking or locking clears a draft without writing it at another time.

<a id="studio-vector-stroke_end"></a>

## Stroke end

ID: `studio.vector.stroke_end` • **PARTIAL**

Choose the end of the visible outline by travelled path distance. Add or remove its key at the playhead; animate through the ordinary timeline and curve editor.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires editable vector artwork and an unlocked image-layer track. Set a nonzero stroke width in Graphics.
- Values use the programme clock and existing key easing; sampled cubic distance is an approximation. Start greater than or equal to end hides the stroke and preserves fill. Offset shifts the interval: closed contours wrap and open contours clip.
- Numeric drafts commit with Enter or blur. Escape cancels; seeking or locking clears a draft without writing it at another time.

<a id="studio-vector-stroke_offset"></a>

## Stroke offset

ID: `studio.vector.stroke_offset` • **PARTIAL**

Move the selected stroke interval by path distance. Animate positive or negative cumulative values for forward/reverse laps on closed contours; open contours clip at their real endpoints.

Applies to: authored vector artwork. Requires: studio.vector_artwork.

- Requires editable vector artwork, a nonzero stroke width and an unlocked image-layer track. Use a partial start/end interval to see a closed outline move.
- Closed contours wrap continuously across the original seam; open contours clip rather than connecting their endpoints. Equal/crossed start/end ranges remain empty, and fill stays authored.
- Distance uses 128 samples per cubic; full predictive picture/sound and broad effect/parent/retiming combinations remain separately qualified.
- Numeric drafts commit with Enter or blur. Escape cancels; seeking or locking clears a draft without writing it at another time.

<a id="studio-text_animator-enable"></a>

## Animate this title

ID: `studio.text_animator.enable` • **PARTIAL**

Create one native text animator and two ordinary entrance progress keys.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-unit"></a>

## Animate text by

ID: `studio.text_animator.unit` • **PARTIAL**

Choose independent letters or words; spaces retain their advance without consuming a slot.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-order"></a>

## Text animation order

ID: `studio.text_animator.order` • **PARTIAL**

Choose the deterministic order of selected units.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-stagger"></a>

## Stagger

ID: `studio.text_animator.stagger` • **PARTIAL**

Share of the progress window spread between the first and last selected unit.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-from_x"></a>

## Letter travel X (em)

ID: `studio.text_animator.from_x` • **PARTIAL**

Horizontal travel from the starting pose, in 36px logical em units.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-from_y"></a>

## Letter travel Y (em)

ID: `studio.text_animator.from_y` • **PARTIAL**

Vertical travel from the starting pose, in 36px logical em units.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-from_scale"></a>

## Starting scale

ID: `studio.text_animator.from_scale` • **PARTIAL**

Starting local unit scale; selected units settle to scale one.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-from_rotation"></a>

## Starting rotation

ID: `studio.text_animator.from_rotation` • **PARTIAL**

Starting local unit rotation; selected units settle upright.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-from_opacity"></a>

## Starting opacity

ID: `studio.text_animator.from_opacity` • **PARTIAL**

Starting unit opacity, interpolated by linear local progress.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-spread"></a>

## Starting spread

ID: `studio.text_animator.spread` • **PARTIAL**

Spread units around each line’s center by a share of their center distance.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-range_start"></a>

## Range start (%)

ID: `studio.text_animator.range_start` • **PARTIAL**

Beginning of the selector, measured at ordered source-unit centers.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-range_end"></a>

## Range end (%)

ID: `studio.text_animator.range_end` • **PARTIAL**

End of the selector; equal/crossed ranges leave all units settled.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-settle"></a>

## Text settling curve

ID: `studio.text_animator.settle` • **PARTIAL**

Ease or overshoot unit travel, scale, spread and rotation.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-progress"></a>

## Text progress

ID: `studio.text_animator.progress` • **PARTIAL**

Normal motion property: zero shows the starting arrangement and 100 settles it. Keys may reverse or hold.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-rebuild"></a>

## Rebuild entrance keys

ID: `studio.text_animator.rebuild` • **PARTIAL**

Replace only this title’s progress keys over at most its first 1.8 seconds.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-text_animator-remove"></a>

## Remove text animator

ID: `studio.text_animator.remove` • **PARTIAL**

Remove local text choreography and only its progress keys while retaining copy, styling and other layer motion. Undo restores it.

Applies to: ordinary supported Inter titles. Requires: studio.text_choreography.

- Requires an unlocked Graphics track. Numeric settings commit on Enter/blur; Escape or locking cancels drafts.
- Text progress uses ordinary programme-clock keys. Copy/font and combination limits are described under Editable text choreography.

<a id="studio-logo_design-name"></a>

## Brand name

ID: `studio.logo_design.name` • **PARTIAL**

Enter the lettering to convert into ordinary editable glyph contours.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-family"></a>

## Logo symbol family

ID: `studio.logo_design.family` • **PARTIAL**

Choose a ribbon ascent, interlocking orbit or geometric facet symbol.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-layout"></a>

## Logo layout

ID: `studio.logo_design.layout` • **PARTIAL**

Arrange the symbol and lettering or create a symbol-only mark.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-weight"></a>

## Logo lettering

ID: `studio.logo_design.weight` • **PARTIAL**

Use the exact bundled Inter SemiBold or Black glyph contours.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-tracking"></a>

## Logo letter spacing

ID: `studio.logo_design.tracking` • **PARTIAL**

Adjust advance spacing before ordinary vector layers are created.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-symbol_size"></a>

## Logo symbol size

ID: `studio.logo_design.symbol_size` • **PARTIAL**

Scale the symbol relative to the wordmark.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-colours"></a>

## Logo colours

ID: `studio.logo_design.colours` • **PARTIAL**

Choose six-digit primary, accent and lettering colours.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-gradient"></a>

## Gradient symbol

ID: `studio.logo_design.gradient` • **PARTIAL**

Use linear gradients or solid symbol fills.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-assemble"></a>

## Assemble logo pieces

ID: `studio.logo_design.assemble` • **PARTIAL**

Create normal staggered opacity, scale, rotation and Y keys for symbol pieces and outlined letters.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-build"></a>

## Add logo to timeline

ID: `studio.logo_design.build` • **PARTIAL**

Add normal vector layers and one graphic group as a single history operation.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-variant"></a>

## Export logo variant

ID: `studio.logo_design.variant` • **PARTIAL**

Preserve colours or export white/ink without changing the project geometry.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-svg"></a>

## Download logo SVG

ID: `studio.logo_design.svg` • **PARTIAL**

Download a transparent portable SVG with real paths and no font or image dependency.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-png"></a>

## Download logo PNG

ID: `studio.logo_design.png` • **PARTIAL**

Download a transparent raster master generated from the same SVG geometry.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-contour"></a>

## Vector contour

ID: `studio.logo_design.contour` • **PARTIAL**

Select an outer contour or counter for ordinary point/tangent editing. This selection itself does not change project geometry.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="studio-logo_design-canvas"></a>

## Start a logo design

ID: `studio.logo_design.canvas` • **PARTIAL**

Prepare a bundled blank eight-second canvas through the existing Studio entitlement and owned-source upload path.

Applies to: ordinary native vector logo layers. Requires: studio.logo_design.

- Creation drafts become ordinary vector contours and base transforms; the saved project is authoritative after adding. Logo assembly keys use normal Motion controls.
- Static masters export the base layout before animation; source, character and composition limitations are described under Logo Workshop.

<a id="publishing-analytics-sync_latest"></a>

## Sync latest platform statistics

ID: `publishing.analytics.sync_latest` • **PARTIAL**

Refreshes up to six newest owned published posts in the selected release or account scope, one per destination. Selection uses publication time independently of the performance-ranked display.

Applies to: video. Requires: publishing.analytics, system.account.

- Five-minute per-post cooldown; only owned successful non-simulated posts qualify.
- Missing permissions or unsupported platform metrics remain unavailable. The action does not publish content or promise reach.

<a id="publishing-analytics-release"></a>

## Published release

ID: `publishing.analytics.release` • **PARTIAL**

Limits collected statistics and refresh targets to one owned published release within the selected date range.

Applies to: video. Requires: publishing.analytics, system.account.

- Only owned successful non-simulated posts in the selected date range qualify. An empty selection shows all published releases.
- Missing or unsupported counters remain unavailable. Filtering does not establish causal performance or guarantee reach.

<a id="studio-captions-source_language"></a>

## Speech language

ID: `studio.captions.source_language` • **PARTIAL**

Selects the speech recognizer and source language for the next automatic caption request. Does not relabel or replace existing lines.

Applies to: video with speech. Requires: studio.captions.

- Model wording is an editable review draft; changing this preference does not translate existing captions.

<a id="studio-composite-background_edge_radius"></a>

## Edge detail width

ID: `studio.composite.background_edge_radius` • **PARTIAL**

Sets the bounded source-guided unknown edge band after choosing Clean background edges. Zero retains existing alpha while colour cleanup can still run.

Applies to: owned video with a source-bound subject mask. Requires: studio.compositing, studio.subject_cutout.

- This corrects selected edges; missing foreground objects require their own source-bound mask selection. Broad footage quality and whole predictive parity are unqualified.

<a id="studio-composite-background_decontaminate"></a>

## Remove old background colour

ID: `studio.composite.background_decontaminate` • **PARTIAL**

Recovers photographed foreground edge colour using the final mask, including protected-object corrections. Zero keeps the photographed edge RGB.

Applies to: owned video with a source-bound subject mask. Requires: studio.compositing, studio.subject_cutout.

- This corrects selected edges; missing foreground objects require their own source-bound mask selection. Broad footage quality and whole predictive parity are unqualified.

<a id="studio-composite-source_detail_repair"></a>

## Repair opaque detail from source

ID: `studio.composite.source_detail_repair` • **PARTIAL**

Manually copies a clean opaque detail from the same source frame onto an authored target after matte cleanup. Optional cleanup removes damaged outlines; protection paths keep the actual fractional foreground in front of the restored detail.

Applies to: owned video with a source-bound subject mask. Requires: studio.compositing, studio.subject_cutout.

- Advanced manual geometry: each repair needs source and target convex four-corner paths, feather 0–3 and end_blend 0–32 pixels. Optional clear_box removes a damaged footprint; up to sixteen protect_paths preserve crossing accessories.
- The copy uses this frame’s cleaned source colour. It does not reconstruct the hidden original, detect objects or track motion automatically. Review every moving pose and the exported result.
- New native corrections still require founder creative review; source tests alone do not establish finished or general-user quality.
- Protection paths place the existing foreground in front of the repaired detail using its actual alpha. Transparent padding does not punch a hole in the repair; soft accessory edges blend over it.

<a id="studio-composite-edge_refinement_region"></a>

## Edge refinement region points

ID: `studio.composite.edge_refinement_region` • **PARTIAL**

Limits the CPU edge solve to an authored source-frame region. Colour rejection becomes a soft boundary guide inside it; explicit removal paths and boxes remain excluded. Alpha outside the region is unchanged.

Applies to: owned video with a source-bound subject mask. Requires: studio.compositing, studio.subject_cutout.

- Set Edge detail width above zero first. Use 3–64 points forming a nonempty region; clear the field to refine the entire frame.
- This manual region stays fixed in the source frame. Inspect the complete moving shot; it is not automatic tracking or object reconstruction.
- The latest podcast correction remains under review. Broader footage and creative acceptance remain unqualified.

<a id="studio-composite-colour_treatment_paths"></a>

## Colour treatment paths

ID: `studio.composite.colour_treatment_paths` • **PARTIAL**

Apply the foreground holdout saturation to an additional region while keeping the existing cutout alpha. Use this to neutralise source lighting on retained equipment without restoring the old room.

Applies to: owned video with a source-bound subject mask. Requires: studio.compositing, studio.subject_cutout.

- Advanced manual geometry: 1–32 polygons with 3–64 points each, within source coordinates 0–1; [] removes the optional regions.
- Only the existing object saturation treatment applies. These paths never enlarge the inclusion matte or change the source mask.
- The regions stay fixed in source coordinates. They do not detect or track an object and do not prove clean replacement on arbitrary footage.
- The three short room examples pass technical preview/export/reopen checks but remain owner-rejected for whole-shot realism. Colour-only paths fix a selection/colour separation defect; they do not establish a convincing professional background. Fixed geometry and these examples do not qualify arbitrary/longer footage.
