# Cam Combiner

Development documentation • product 1.2.0 • knowledge 1.0.27 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Camera upload

ID: `cam_combiner.upload` • **PARTIAL** • DETERMINISTIC

Select two or three source cameras and retain durable owned media for the same session. Mixed-source and decode constraints apply.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Camera count](../control-reference/index.md#cam_combiner-source_count)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Camera synchronization

ID: `cam_combiner.synchronization` • **PARTIAL** • DETERMINISTIC

Aligns camera material and optional master audio using the existing deterministic synchronization path. Review offsets before editing.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Camera sync offset](../control-reference/index.md#cam_combiner-sync_offset)

**Guides:** [Turn a podcast into a vertical promo](../task-guides/task-podcast_vertical.md), [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Clean/master audio

ID: `cam_combiner.master_audio` • **PARTIAL** • DETERMINISTIC

Uses a separately owned clean audio take as the programme reference, with selectable camera-bed policy. Camera audio is not automatically the authoritative master.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Clean audio mode](../control-reference/index.md#cam_combiner-clean_audio_mode)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md), [Correct reversed clean-audio channels](../task-guides/task-reversed_channels.md)

**Templates:** No pinned shared-template binding recorded.

## Clock drift handling

ID: `cam_combiner.drift` • **PARTIAL** • DETERMINISTIC

Maps each camera through its synchronization offset and rate. Normal automatic drift correction is bounded; long recordings require review at multiple times.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Camera clock rate](../control-reference/index.md#cam_combiner-sync_rate)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Clean-audio channel mapping

ID: `cam_combiner.channel_mapping` • **PARTIAL** • DETERMINISTIC

Swaps the left/right speaker association when needed and requires explicit verification of which speaker belongs to each channel. This changes mapping, not the original recording.

**Purpose:** Ensure the camera plan follows the correct speaker when clean-audio channel association is reversed.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Listen to isolated channels; swap and confirm speaker mapping if needed.
2. Toggle Swap left/right clean-audio channels when the association is reversed.
3. Confirm I verified which speaker belongs to each channel for the current mapping.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Suggested cuts show the other speaker: Listen to each channel, swap association when reversed and explicitly verify the current mapping before rebuilding the plan.
- Mapping verification no longer holds: Changing channel/camera association invalidates prior confirmation; verify the current pair again.

**Controls:** [Swap left/right clean-audio channels](../control-reference/index.md#cam_combiner-swap_channels), [I verified which speaker belongs to each channel](../control-reference/index.md#cam_combiner-verify_channels)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md), [Correct reversed clean-audio channels](../task-guides/task-reversed_channels.md)

**Templates:** No pinned shared-template binding recorded.

## Active-speaker planning

ID: `cam_combiner.active_speaker` • **PARTIAL** • DETERMINISTIC

Uses reviewed channel association and activity scores to propose speaker views. Activity is not semantic visual understanding and may mistake noise or overlap for speech.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Cam Director switching

ID: `cam_combiner.switching` • **PARTIAL** • DETERMINISTIC

Builds an editable switching plan using audio activity, continuity and reaction heuristics. It is distinct from Studio Director proposals and neural visual perception.

**Purpose:** Create a reviewed multi-camera conversation edit while preserving authoritative synchronization and master audio.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Generate/edit the activity-based switching plan and its reaction/split views.
2. Rebuild/review the switching plan and inspect the actual rendered audio/video alignment.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Switch interval](../control-reference/index.md#cam_combiner-switch_interval)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md), [Correct reversed clean-audio channels](../task-guides/task-reversed_channels.md)

**Templates:** No pinned shared-template binding recorded.

## Reaction views

ID: `cam_combiner.reactions` • **PARTIAL** • DETERMINISTIC

Proposes companion-camera reaction windows using heuristic evidence. Review whether the chosen reaction actually serves the conversation.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Split / picture-in-picture views

ID: `cam_combiner.split_views` • **PARTIAL** • DETERMINISTIC

Normalizes cut, split and picture-in-picture layouts with bounded source framing. Render uses the reviewed camera plan.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Camera framing zoom](../control-reference/index.md#cam_combiner-zoom)

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Cam review

ID: `cam_combiner.review` • **PARTIAL** • DETERMINISTIC

Retains a candidate output for approved/rejected review before the final handoff. A needs-review result is not a published finished edit.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.

## Cam export to Studio

ID: `cam_combiner.export` • **PARTIAL** • DETERMINISTIC

Renders the reviewed deterministic camera programme and hands it into the existing Studio project as owned material. Final Studio editing remains manual and editable.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** camera video, master audio

**Requires:** cam_combiner.upload (PARTIAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Preview follows the session camera plan and sync offsets; inspect lip/audio alignment at several points.

**Final render:** Existing deterministic camera render is authoritative. A generated model must not replace camera synchronization or the final switching render.

**Limits**

- Source and test evidence establish the documented contract, not broad professional workflow qualification.
- Review audio alignment, speaker mapping and final moving output for this recording.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** [Use Cam Combiner](../task-guides/task-cam_combiner.md)

**Templates:** No pinned shared-template binding recorded.
