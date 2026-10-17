# Turn a podcast into a vertical promo

Development documentation • product 1.2.0 • knowledge 1.0.24 • 2026-10-17

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

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

- studio.export — **PARTIAL**: Requests a final movie and downloads the exact completed output after applicable ownership and review checks. Full preview parity and all product combinations are not qualified.
- cam_combiner.synchronization — **PARTIAL**: Aligns camera material and optional master audio using the existing deterministic synchronization path. Review offsets before editing.
- director.find_viral_clips — **PARTIAL**: Scans an owned source for candidate clip ranges and recommendations, then sends selected material to editing. A score or suggestion cannot guarantee virality.
- studio.crop_reframe — **FUNCTIONAL**: Reframes a source or crops an overlay using the shared time map and existing renderer. Preserve subject framing and inspect source geometry at cuts.
- studio.captions — **BROKEN**: Caption controls and reviewed phrase rendering exist, but the retained automatic-word workflow has a repetition defect. Treat automatic word output as broken until that path is repaired and requalified.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Automatic-word caption repetition remains broken; reviewed phrases are a limited subset.
- Camera synchronization and deterministic final rendering remain authoritative.

Troubleshooting references: system.unsupported_media, studio.revision.
