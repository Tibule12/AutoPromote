# Public homepage imagery

## Current video composition — October 6, 2026

`podcast-conversation.mp4` is real sample podcast footage, downloaded from
[Mixkit item 2948, People recording a podcast in a studio](https://mixkit.co/free-stock-video/people-recording-a-podcast-in-a-studio-2948/)
by Ruben Velasco. The item explicitly carries the
[Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree), including
commercial and personal use. It does not depict AutoPromote customers or imply
endorsement. The original download URL is
`https://assets.mixkit.co/videos/2948/2948-720.mp4`.

The local silent H.264 asset is 1280×720 at 24 fps, about 10.2 seconds and 1.2 MB,
encoded at CRF 24 with faststart. `podcast-conversation.webp` is its matching
poster at one second. The homepage serves these local files, not a stock CDN.
The moving camera panels, programme preview and social crops share one native
video and one GPU texture per visible Three.js scene. Their angles are digital
crops of this single recording, not three synchronized recorded cameras.
Timeline thumbnails and static feature examples intentionally use the poster.
Caption text, audio visualization and analysis are illustrative choreography,
not a transcript or backend analysis of this footage.

Video is muted and loads only when an unreduced, visible scene reaches its
first camera cue. Pause, hidden tabs and offscreen scenes stop playback. The
final composition holds while visible footage loops; reduced motion, missing
WebGL, failed media and blocked autoplay retain the matching still preview.
Unmount removes video sources and disposes graphics resources. Empty authored
After Effects slots remain empty; this stock video is not an AE render.

## Preserved prior illustrative composition

`studio-conversation-v2.webp` is a new 1672×941 illustrative photograph generated
with the built-in imagegen tool on October 5, 2026. It depicts two fictional
creators; it is not recorded footage, a customer endorsement or an After Effects
export. WebP encoding preserves the composition and reduces download size.
This was the October 5 composition and is no longer the configured hero media.
The full generation prompt and provenance are recorded in
`reports/public-homepage-art-direction-20261005/image-generation.md`.

## Preserved recorded demo assets

These older optimized WebP stills come from the existing repository asset
`public/demos/cam-combiner-demo.webm`.

- `podcast-preview.webp`: frame at 10 seconds, crop 1870×780 at (0,16), scaled to 1122×468.
- `podcast-host.webp`: frame at 10 seconds, crop 880×680 at (60,100), scaled to 528×408.
- `podcast-guest.webp`: frame at 4 seconds, crop 376×194 at (562,832).
- `podcast-motion.mp4`: silent 1.2-second guest excerpt starting at 1 second,
  crop 1600×700 at (0,16), scaled to 960×420, H.264 / CRF 25.

The wide camera card reuses the existing podcast frame to illustrate the layout;
it is not evidence of a third recorded camera. Caption text, clip markers and
social outputs are illustrative. The older Cam Combiner recording is preserved
under `public/demos`. It is not spliced into the current stock-footage composition.

## Recorded product tour — October 6, 2026

`product-tour.mp4` is a 36-second, four-chapter edit of the real AutoPromote
application: Uploads, Studio, Schedule and Analytics. The sample workspace and
metrics are fixtures, labeled in the film and player. The Studio chapter shows
an actual output-frame choice and timeline split. No production accounts were
accessed and nothing was published. The source podcast retains the Mixkit
license above. Music is an original procedural two-note pulse; there is no speech.

The edit uses two views per chapter, deliberate cuts, branded mattes, a violet
edit line, a moving playhead and readable titles. FFmpeg composes on CPU and
NVIDIA H.264 NVENC encodes the chapters. The finished MP4 uses faststart and has
English WebVTT captions. WebP posters match the four chapters.

Capture: `test/e2e/playwright/capture-public-product-tour.js`.
Render: `python3 scripts/render-public-product-tour.py` (CPU fallback:
`--encoder libx264`). Receipts are in `reports/public-product-tour-20261006`.
These files are recorded and edited video, not AI generated clips or AE exports.
Watch Demo now opens this tour; the original Cam Combiner recording remains
preserved under `public/demos`.

## NVIDIA L40S film — October 6, 2026

`product-tour-l40s.mp4` is the new 36-second desktop master used by the homepage
and Watch Demo. It reuses the same verified recording and licensed creator
footage, with a moving creator opening, kinetic titles, a diagonal cut into
the actual application, and an enlarged synchronized preview/timeline detail.
The Analytics range-change loading interval is edited out; both displayed
metric states are the recorded sample data. The final card invites the next
release. A new original synthesized soundtrack accompanies the edit.

`product-tour-l40s-vertical.mp4` is a separately composed 24-second 9:16 edit
with four chapters and readable brand titles. It does not crop the desktop
master. Matching WebP posters and English captions are local assets. Previous
masters are retained.

Both films were rendered on the existing `autopromote-l40s-staging` NVIDIA L40S
using actual CUDA/NVDEC input decoding and NVENC encoding. Editorial filters,
typography and compositing run on CPU. These are authored recorded-video edits;
they are not AI generated footage or After Effects exports. No Google Cloud
workload, production account or publishing action was involved.

Render source: `scripts/render-public-l40s-film.py`. Commands, hashes, full-frame
decode evidence and reviewed contact sheets are in
`reports/public-l40s-film-20261006/`. This change is local and has not been deployed.
