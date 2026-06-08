# Cam Combiner Next Steps

Date: 2026-06-06

## Current Proven State

- Switching timing is in a good place for the latest 5-minute proof.
- The active-speaker/reaction mismatch was traced to clean-audio stereo channel ownership, not the switch cadence.
- Reaction placement was corrected after the full-episode render showed the PiP sitting over the yellow-hoodie speaker. The render must now use explicit source-side placement, not camera identity:
  - This episode: Camera 1 primary uses reaction on the right.
  - This episode: Camera 2 primary uses reaction on the left.
  - Do not assume cam1/cam2 always map to physical left/right across shoots.
- Latest full-episode proof used explicit director channel mapping: `["cam1", "cam2"]`.
- Proof video:
  `/home/tibule12/Downloads/AutoPromote-proof-renders/active-speaker-channel-map-fixed-proof-5min-v2-1780684192_single_0s_300s.mp4`
- Contact sheet:
  `/home/tibule12/Downloads/AutoPromote-proof-renders/active-speaker-channel-map-fixed-proof-5min-v2-1780684192_contact.jpg`
- Segment proof:
  - Reliable active-speaker mismatches: `0`
  - Active speaker in reaction slot: `0`
  - Layout summary: `21` PiP, `2` split-vertical
- Reaction-side proof:
  `/home/tibule12/Downloads/AutoPromote-proof-renders/reaction-side-safe-proof-30s-1780745926_single_0s_30s.mp4`
- Reaction-side frame:
  `/home/tibule12/Downloads/AutoPromote-proof-renders/reaction-side-safe-proof-30s-1780745926_frame_5s.jpg`
- Full-episode premium proof pack:
  `/home/tibule12/Downloads/cam-combiner-full-episode-render/full-episode-repair-proof-premium-1780747046_qa_report.md`
- Full-episode proof pack status: `SAFE`
  - Start max post-render sync residual: `0.012s`
  - Middle max post-render sync residual: `0.009s`
  - Late max post-render sync residual: `0.021s`
  - Final max post-render sync residual: `0.027s`

## Changes Already Prepared

- Worker accepts per-job `director_channel_camera_ids` / `directorChannelCameraIds`.
- API route and video editing service forward that mapping to the worker.
- Local proof CLI supports `--director-channel-camera-map`.
- Frontend has a `Swap clean-audio speaker channels` control for reversed stereo clean-audio files.
- Reaction-hero logic is blocked: active speaker should stay primary/full frame, with the other camera as reaction.
- Tests added for active-speaker reclaim and mandatory reaction PiP behavior.

## Tomorrow Priority Order

1. Read `CAM_COMBINER_PROD_ENGINEERING_CORRECTIONS.md` first.
2. Treat render runtime/cost as the next production blocker.
3. Run one fresh browser-to-worker render with the correct channel map and explicit reaction side metadata.
4. Confirm production payload includes:
   - `directorChannelCameraIds`
   - `director_channel_camera_ids`
   - per-source `reaction_side` / `reactionSide` when physical side is known.
   - expected source order for the two selected cameras.
5. Watch the worker receipt for:
   - `mapping_method: "request_override"`
   - expected `channel_camera_ids`
   - expected reaction side per source.
6. Render proof windows from the UI path, not only local CLI.
7. Generate a contact sheet and inspect:
   - active speaker is full frame
   - silent/non-active camera is reaction PiP
   - reaction remains present
   - no long active speaker trapped in reaction
8. Only after UI proof and runtime/cost gates pass, consider prod deployment.

## Next Improvement Ideas

- Add a small render summary in the UI after completion:
  - channel mapping used
  - segment count
  - mismatch count if worker returns it
- Add automatic warning if both clean-audio channels are loud at the same time for too long.
- Add a cheaper proof mode for testing:
  - same director plan
  - lower bitrate or 720p
  - no captions, thumbnail, or watermark
- Add full-render cost estimation and budget guards before Cloud Run starts the expensive stage.
- Add a hard worker receipt to the output summary:
  - `active_speaker_mismatch_count`
  - `active_speaker_in_reaction_count`
  - `director_channel_camera_ids`
- Investigate render speed/cost after quality is stable. Do this after the active-speaker product result is trusted.

## Do Not Reopen Tomorrow Unless Needed

- Do not retune switching thresholds first.
- Do not remove reaction.
- Do not disable Cam Combiner.
- Do not call logs proof by themselves. Final proof must include rendered video and contact sheet.
