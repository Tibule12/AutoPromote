# Use Cam Combiner

Development documentation • product 1.2.0 • knowledge 1.0.25 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.cam_combiner` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Align owned cameras and master audio, review the heuristic edit plan and send the result into Studio.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Upload two or three camera sources and, when available, clean/master audio.
   Feature: `cam_combiner.upload`. Controls: [cam_combiner.source_count](../control-reference/index.md#cam_combiner-source_count).

2. Synchronize and check alignment near the beginning, middle and end.
   Feature: `cam_combiner.synchronization`. Controls: [cam_combiner.sync_offset](../control-reference/index.md#cam_combiner-sync_offset).

3. Review any estimated drift rate and recheck sync later in the recording; the automatic estimator is narrower than the time-mapping bounds.
   Feature: `cam_combiner.drift`. Controls: [cam_combiner.sync_rate](../control-reference/index.md#cam_combiner-sync_rate).

4. Listen to isolated channels; swap and confirm speaker mapping if needed.
   Feature: `cam_combiner.channel_mapping`. Controls: [cam_combiner.swap_channels](../control-reference/index.md#cam_combiner-swap_channels), [cam_combiner.verify_channels](../control-reference/index.md#cam_combiner-verify_channels).

5. Generate/edit the activity-based switching plan and its reaction/split views.
   Feature: `cam_combiner.switching`. Controls: [cam_combiner.switch_interval](../control-reference/index.md#cam_combiner-switch_interval).

6. Review reaction/split layouts and the selected source framing rather than relying on activity scores alone.
   Feature: `cam_combiner.split_views`. Controls: [cam_combiner.zoom](../control-reference/index.md#cam_combiner-zoom).

7. Watch/listen to the deterministic candidate, approve only a usable result and hand it into Studio.
   Feature: `cam_combiner.review`.

## Feature readiness

- cam_combiner.master_audio — **PARTIAL**: Uses a separately owned clean audio take as the programme reference, with selectable camera-bed policy. Camera audio is not automatically the authoritative master.
- cam_combiner.reactions — **PARTIAL**: Proposes companion-camera reaction windows using heuristic evidence. Review whether the chosen reaction actually serves the conversation.
- cam_combiner.split_views — **PARTIAL**: Normalizes cut, split and picture-in-picture layouts with bounded source framing. Render uses the reviewed camera plan.
- cam_combiner.export — **PARTIAL**: Renders the reviewed deterministic camera programme and hands it into the existing Studio project as owned material. Final Studio editing remains manual and editable.
- cam_combiner.upload — **PARTIAL**: Select two or three source cameras and retain durable owned media for the same session. Mixed-source and decode constraints apply.
- cam_combiner.synchronization — **PARTIAL**: Aligns camera material and optional master audio using the existing deterministic synchronization path. Review offsets before editing.
- cam_combiner.channel_mapping — **PARTIAL**: Swaps the left/right speaker association when needed and requires explicit verification of which speaker belongs to each channel. This changes mapping, not the original recording.
- cam_combiner.switching — **PARTIAL**: Builds an editable switching plan using audio activity, continuity and reaction heuristics. It is distinct from Studio Director proposals and neural visual perception.
- cam_combiner.review — **PARTIAL**: Retains a candidate output for approved/rejected review before the final handoff. A needs-review result is not a published finished edit.
- cam_combiner.drift — **PARTIAL**: Maps each camera through its synchronization offset and rate. Normal automatic drift correction is bounded; long recordings require review at multiple times.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
