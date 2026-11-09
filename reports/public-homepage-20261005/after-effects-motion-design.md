# After Effects creative correction — implementation and handoff

The original Three.js version supplied depth, editing objects and scroll choreography. This pass adds the motion graphics language: kinetic text, mattes, directional blur, light passes, tracking, animated crop guides and an independent asset compositor. It preserves the existing copy, navigation, auth callbacks and public layout.

**Authorship:** no `.aep`, `.aepx` or authored Lottie assets were found in this repository. The current effects are live web representations. No element is claimed to be rendered in After Effects. The following classification separates the best implementation for each sequence.

## Sequence classification

A = live web; B = authored in After Effects; C = Three.js; D = hybrid.

| Sequence | Class | Current implementation | Authored asset opportunity |
|---|---|---|---|
| Logo introduction | D | Brand texture; shader matte, light sweep and depth | Lottie vector strokes/logo polish; rendered glow pass |
| Headline assembly | A | Accessible HTML; native Web Animations with masks, blur, scale settling and animated gradient | Keep responsive copy live; optional graphical accent export |
| Camera feed entrance | D | Separate 3D panels; per-panel matte and directional blur | More detailed motion blur/trails in a composited overlay |
| Programme preview | C | Perspective/depth transition and native video screen replacement | Higher-quality source footage/textures can be substituted |
| Clean audio synchronization | A | Procedural, clock-controlled waveforms and alignment | Optional vector sync accent; waveform timing stays live |
| Analysis indicators | A | Scan line, active-speaker change, tracked bounding box and one analysis pulse | Optional authored stroke accents |
| Director suggestions | D | Live review wording and separate depth plane | Transition/light overlay; proposal text remains truthful and readable |
| Timeline construction/cuts | C | Individual clip objects, playhead, split, markers and added layers | Optional cut accents; responsive timing stays live |
| Caption entrance | D | Text typing, phrase highlight, moving matte and short blur | Optional authored text/accent treatment for fixed demo copy |
| Clip extraction | D | Highlighted range; clips peel away into different depth planes | Rendered smear, glow and speed-ramped extraction transition |
| 16:9 → 9:16 reframe | C | Crop guide narrows to exactly 9:16 and moves toward the subject | Optional authored frame-guide accent |
| Social outputs | C | Three independent vertical panels and real HTML creation CTA | Optional platform accents or final polish pass |
| Scroll progression | A | One clock interpolated by scroll; eight pinned chapters and finite title mattes | Asset frames scrub with the same clock |
| Cinematic optical finish | B | Restrained live lighting and temporary directional blur | Full motion blur, depth of field, complex glow and sparse particle/light passes |

The outstanding difference from a fully authored commercial is the **B layer and authored portions of D**. The current branch provides the live choreography and integration points needed to insert those exports.

## Architecture

`MotionEditingScene` owns the WebGL renderer and scene controls. `MotionGraphicsLayer` owns the visual overlay composition. `MotionAssetLayer` owns configured Lottie/video/image assets. The navbar, headline, buttons, demo dialog and authentication remain real HTML/React UI.

`motionAssetManifest.js` contains three currently empty export slots:

- `brand-reveal` — Lottie visual enhancement
- `editor-light-pass` — transparent or composited video
- `clip-extraction` — transparent or composited video

Empty slots mount no player or media. They make no asset requests. The live composition remains usable when an export or runtime is missing, invalid or fails to load.

An imperative frame callback forwards the scene score to the compositor. Lottie uses `goToAndStop` with frame units; video seeks to the corresponding media time, including reverse scroll. Assets do not autoplay or run independent infinite loops. Video metadata starts loading when its cue is reached. Leaving the page destroys player instances and releases native video sources. These player controls follow the [official Lottie API](https://github.com/airbnb/lottie-web#usage).

Lottie integration was verified with a player-protocol fixture. No actual Bodymovin export/player bundle has been supplied or included; rendering a specific authored export still needs verification with that export and its local runtime.

## Export handoff

Place licensed export files under `frontend/public/landing/motion/`, then configure the manifest. Keep the player and exports on the same application origin.

Example Lottie slot:

```js
{
  id: "brand-reveal",
  format: "lottie",
  src: "/landing/motion/brand-reveal.json",
  runtimeSrc: "/landing/motion/lottie-player.min.js",
  start: 0,
  end: 3.4,
  fit: "contain",
}
```

Use the matching local Lottie player supplied with the export. Preserve its license. Author the slot as a transparent graphical enhancement to the live brand composition, with no authentication text or interactive controls embedded in the animation. Bodymovin JSON and player installation are described in the [official export documentation](https://github.com/airbnb/lottie-web#how-it-works).

Example video slot:

```js
{
  id: "clip-extraction",
  format: "video",
  sources: [
    { src: "/landing/motion/extraction-alpha.webm", type: "video/webm" },
    { src: "/landing/motion/extraction-fallback.mp4", type: "video/mp4" },
  ],
  poster: "/landing/motion/extraction-poster.webp",
  transparent: true,
  start: 16,
  end: 22.4,
  fit: "contain",
}
```

Supply an opaque composited fallback/poster for devices that cannot display the chosen alpha codec correctly. Actual codec/alpha behavior must be checked with the delivered assets. Do not assume a playable video implies correct alpha compositing.

Keep exports short, silent, compressed and seekable; dense keyframes help scroll scrubbing. Supply mobile variants when a full desktop composition is too heavy. Texture replacements can be configured in `MOTION_TEXTURES` and retain the renderer's resource cleanup.

Keep a source note with author, license, composition dimensions, frame rate, duration and export version. Real navigation/CTAs remain outside the asset. Complex blur/glow/optical passes belong in rendered assets; the interactive text, phase clock and controls stay live.

## Review

The local preview remains `http://127.0.0.1:3095`, started with `npm run start:landing` from the frontend directory. The implementation is local; nothing has been pushed, merged or deployed. Current browser evidence and build/test receipts are linked from the [review report](README.md).
