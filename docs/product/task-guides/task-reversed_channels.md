# Correct reversed clean-audio channels

Development documentation • product 1.2.0 • knowledge 1.0.11 • 2026-10-14T04:31:18.521294Z

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.reversed_channels` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Correct speaker association in the camera session before trusting suggested cuts.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Listen to the left/right clean-audio channels and identify which camera shows each speaker.
   Feature: `cam_combiner.master_audio`.

2. Toggle Swap left/right clean-audio channels when the association is reversed.
   Feature: `cam_combiner.channel_mapping`. Controls: [cam_combiner.swap_channels](../control-reference/index.md#cam_combiner-swap_channels).

3. Confirm I verified which speaker belongs to each channel for the current mapping.
   Feature: `cam_combiner.channel_mapping`. Controls: [cam_combiner.verify_channels](../control-reference/index.md#cam_combiner-verify_channels).

4. Rebuild/review the switching plan and inspect the actual rendered audio/video alignment.
   Feature: `cam_combiner.switching`.

## Feature readiness

- cam_combiner.master_audio — **PARTIAL**: Uses a separately owned clean audio take as the programme reference, with selectable camera-bed policy. Camera audio is not automatically the authoritative master.
- cam_combiner.channel_mapping — **PARTIAL**: Swaps the left/right speaker association when needed and requires explicit verification of which speaker belongs to each channel. This changes mapping, not the original recording.
- cam_combiner.switching — **PARTIAL**: Builds an editable switching plan using audio activity, continuity and reaction heuristics. It is distinct from Studio Director proposals and neural visual perception.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
