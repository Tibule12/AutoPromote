# AutoPromote homepage — revised art direction

This pass responds to the rejected composition. It changes the public homepage's visual hierarchy and imagery while preserving the editor, dashboard, authentication implementation and backend.

**Status: REVISED_FOR_VISUAL_REVIEW.** Build, lint and 16 homepage tests pass. The 36-check browser workflow passed; subsequent screenshot review found and repaired a completed-headline replay bug. Three additional viewport checks verify that repair. The source inventory contains 40 files, with all 11 protected file hashes unchanged.

## Review the revised version

Local preview: **http://127.0.0.1:3095**. Start it from `frontend` with `npm run start:landing` if the existing preview stops.

- [Recorded motion and navigation](editing-film.webm)
- [Desktop composition](desktop-1920.png) · [Caption scene](04-director-and-captions.png) · [Final social cuts](06-vertical-export.png)
- [Mobile first screen after the headline repair](mobile-headline-return.png) · [Mobile editing scene](mobile-editor.png) · [Mobile crop sequence](mobile-scroll-reframe.png)
- [Pinned final scene](scroll-8.png) · [Reduced motion](reduced-motion.png) · [WebGL fallback](no-webgl-fallback.png)
- [Previous composition](../public-homepage-20261005/desktop-1920.png)

## What changed

The opening now uses a full-width film stage beneath an editorial headline and concise supporting copy. Camera shots arrive at larger scale, then give way to the programme preview. The preview grows, the timeline settles below it, and captions remain clear. The source cards exit once their part of the story is complete.

Giant background words, simultaneous analysis callouts and an extra closing text panel were removed. Graphical labels and strokes are restrained. The timeline is flatter, borders are quieter, and the closing composition pairs the master edit with three vertical cuts and the real creation CTA.

The new 118 kB WebP image gives the illustrative scenes a consistent studio, lighting and cast. It was generated with the built-in imagegen tool and depicts fictional people. Camera angles are crops of one still; these are not recorded camera feeds. The public sequence labels its generated demo imagery. The original recorded podcast demo remains available through Watch Demo. [Generation prompt and provenance](image-generation.md).

## Motion classification

| Class | Major sequences |
|---|---|
| A — live web | Accessible kinetic headline, waveform timing, analysis labels, scroll clock, controls and CTAs |
| B — After Effects | Full cinematic motion blur, depth of field, glow and optical finishing assets; still outstanding |
| C — Three.js | Programme composition/screen replacement, timeline construction, crop transformation and social outputs |
| D — hybrid | Logo reveal, camera entrances, Director callouts, captions and clip extraction; live representations and export slots are implemented |

The [detailed sequence classification and asset handoff](../public-homepage-20261005/after-effects-motion-design.md) still describes the integration architecture. The programme now uses coherent illustrative still textures by default; the native video path is optional in `MOTION_TEXTURES.video`. No authored After Effects or Lottie export was created. Unconfigured asset slots mount no media or player.

## Verification and scope

Current verification receipts:

- [36 workflow browser checks and screenshot hashes](browser-verification.json)
- [Completed headline remains visible on return: three viewports](headline-verification.json)
- [16 homepage tests across four suites](homepage-tests.log)
- [ESLint: 38 files, no errors or warnings](lint.json)
- [Production build](build-verification.json) · [build log](build.log)
- [Protected file hashes and source inventory](protected-scope.json)
- [Artifact manifest](files.json)

The earlier broader frontend regression passed 460 tests with the unchanged Studio suite excluded. That full regression was not repeated for this visual revision. The earlier complete-suite failures and original-HEAD comparison remain documented in the [prior review](../public-homepage-20261005/README.md#verification).

Browser checks use local Chromium/software WebGL and a local dashboard fixture. They verify the actual application routes, auth forms, animation controls, eight pinned chapters, 9:16 crop ratio, mobile layout, reduced motion, fallback and resource disposal. They do not verify real Firebase login or physical-device GPU performance. CRA retains its existing bundle-size advisory and Node deprecation warning.

The original `mobile-390.png` captured the headline visibility issue after the 36-check run. It is retained as before-repair evidence. The current first-screen proof is `mobile-headline-return.png`. The focused follow-up catches completed animations being rewound after scrolling away and returning. The final build includes the repair.

Changes remain local and uncommitted on `agent/director-analysis-staging-browser-v1`, with HEAD `7f7530ad746050c094bfc78d0921190da98d2098`. No deployment, merge or push. Work stops for visual review.
