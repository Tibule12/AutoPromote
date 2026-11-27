# Turn a podcast into a vertical promo

Development documentation • product 1.2.0 • knowledge 1.0.72 • 2026-11-26

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.podcast_vertical` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Select an owned conversation excerpt, prepare the authoritative audio and refine the vertical edit.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. If there are multiple cameras, synchronize them and verify clean-audio speaker mapping.
   Feature: `cam_combiner.synchronization`.

2. Select/review an excerpt or clip proposal; scores do not guarantee virality.
   Feature: `director.find_viral_clips`.

3. Reframe to the intended vertical view and inspect faces across the selected range.
   Feature: `studio.crop_reframe`.

4. Use reviewed caption phrases and listen to voice/music before final export.
   Feature: `studio.captions`.

## Feature readiness

- studio.export — **PARTIAL**: Downloads the exact completed movie. The released 45-second GPU export is verified, including a faster byte-identical retest. Strict size enforcement, Opus, Display P3 and SDR-mapped HDR10/PCM32 also have retained native local proof; those extensions have not reached the released build. PARTIAL applies to the wider delivery and compatibility scope.
- cam_combiner.synchronization — **PARTIAL**: Aligns camera material and optional master audio using the existing deterministic synchronization path. Review offsets before editing.
- director.find_viral_clips — **PARTIAL**: Finds source-bound short-form candidates with requested length, opening/context/payoff, audio and visual evidence, transcript review flags and duplicate filtering. Preview a range and send it into the editable Studio.
- studio.crop_reframe — **FUNCTIONAL**: Reframes a source or crops an overlay using the shared time map and existing renderer. Preserve subject framing and inspect source geometry at cuts.
- studio.captions — **BROKEN**: Creates editable speech drafts. The expanded local correction workflow has passing tests and a real signed-in save/reopen/export example. The overall BROKEN rating refers to remaining recognition errors; it does not mean the tested correction controls fail. Expanded uncertain-word review, missing-speech markers and names/terms are not yet part of the released build.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Automatic-word caption repetition remains broken; reviewed phrases are a limited subset.
- Camera synchronization and deterministic final rendering remain authoritative.

Troubleshooting references: system.unsupported_media, studio.revision.
