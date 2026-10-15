# Audio editing and sound design

Development documentation • product 1.2.0 • knowledge 1.0.20 • 2026-10-15

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

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

## Audio template cues

ID: `creative.audio` • **PARTIAL** • DETERMINISTIC

Template definitions place editable music/SFX/voice cues in normal audio lanes. Professional sound quality still requires listening to the actual film.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

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

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
