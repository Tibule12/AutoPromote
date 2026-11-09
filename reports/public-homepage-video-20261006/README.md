# Public homepage: real video — October 6, 2026

**Status: VIDEO_UPGRADE_FOR_VISUAL_REVIEW.** The existing cinematic layout now
uses real podcast footage in the camera panels, programme preview and three
vertical outputs. Review locally at **http://127.0.0.1:3095**.

Verification completed: **36 browser workflow checks, two media failure cases,
16 homepage tests, 39 JavaScript files with zero ESLint errors/warnings, and a
successful production build**. All 11 protected source hashes are unchanged.
The final browser run reports no page exceptions or console errors. The initial
verification attempt and its source-release assertion correction are preserved
under `first-attempt/`.

## Moving proof

- [Recorded browser walkthrough](editing-film.webm)
- [Camera entrance](01-camera-entry.png)
- [Programme, Director and captions](04-director-and-captions.png)
- [Vertical outputs](06-vertical-export.png)
- [Desktop first screen](desktop-1920.png)
- [Mobile first screen](mobile-390.png)
- [Mobile editing scene](mobile-editor.png)
- [Browser verification](browser-verification.json)
- [Media fallback verification](media-fallback-verification.json)
- [16 homepage tests](jest.json) · [Actual ESLint results](lint.json)
- [Production build](build-verification.json) · [Protected scope](protected-scope.json)
- [Artifact hashes](files.json)

These are local Chromium captures using software WebGL. They show the actual
React homepage, including the existing registration, sign-in and demo flows.
The authenticated dashboard capture uses a local fixture, not production login.
Only the public homepage, its assets, local preview tooling and verification
files changed. No commit, push, merge or deployment was performed.

## Footage and behavior

The silent 1280×720 H.264 clip is about 10.2 seconds and 1.2 MB, with a matching
68 KB WebP poster. It is real stock footage by Ruben Velasco:
[Mixkit item 2948](https://mixkit.co/free-stock-video/people-recording-a-podcast-in-a-studio-2948/),
published under the [Stock Video Free License](https://mixkit.co/license/#videoFree).
See [media provenance and hashes](media-provenance.json).

The camera angles and social versions are digital crops from that single source,
not three synchronized recordings. Captions, waveform and Director analysis are
illustrative. The people are not presented as customers or endorsers. The image
from the prior review is preserved in the repository and its previous proof.

Each visible scene shares one native video decoder and one GPU texture across
its camera, programme and social screens. The local clip loads at the first
camera cue, not before a visible scene starts. The score completes once; video
continues looping inside the held final edit. Pause, hidden tabs and leaving the
viewport stop playback. Unmount removes the media source and disposes graphics
resources. Reduced motion and missing WebGL download no sample video; invalid
media or blocked autoplay retain a matching still preview and working controls.
Static feature illustrations and timeline thumbnails intentionally remain still.

The score now follows active elapsed time, rather than extending its duration
when software rendering is slow. This is a local functional check, not a
cross-device performance benchmark or a live backend processing result.

## Motion classification

| Sequence | Class | Current implementation |
|---|---|---|
| Headline, controls, navigation, scroll progression | A: live web | Native animations and interactive HTML |
| Camera feeds, programme frame, crop and social extraction | C: Three.js | Shared real video texture, shader crops and perspective panels |
| Logo, captions, Director callouts and timeline choreography | D: hybrid | Live composition; authored overlays can be inserted |
| Final optical blur, glow and rendered transitions | B: After Effects | Future authored exports; slots remain unconfigured |

The stock clip is not an After Effects render. No authored AE project or Lottie
export was supplied. The detailed [motion handoff](../public-homepage-20261005/after-effects-motion-design.md)
still applies; this pass replaces the media inside the composition.
