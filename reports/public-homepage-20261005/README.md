# AutoPromote public homepage — motion design review

**Superseded visual review:** the public composition was revised after this version was rejected. See the [new art direction and current evidence](../public-homepage-art-direction-20261005/README.md). Receipts and source hashes below describe this earlier version.

**Status: WEB_MOTION_READY_FOR_VISUAL_REVIEW.** The latest creative correction is implemented and verified as a live web prototype: kinetic typography, masks, light sweeps, tracking, animated crop guides, selective Three.js depth and a separate motion asset compositor. Actual After Effects exports are still absent. Full rendered motion blur, depth of field and the authored extraction/glow pass remain creative production work. Changes are local and uncommitted. Nothing was merged, pushed or deployed.

The [sequence classification and asset handoff](after-effects-motion-design.md) identifies every major sequence as **A: live web, B: After Effects, C: Three.js or D: hybrid**, including the remaining authored portions of B and D. Current CSS, JavaScript and shader effects are temporary live representations, not After Effects assets.

## Open the result

The local preview is running at **http://127.0.0.1:3095**. From the frontend directory:

```bash
cd /home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004/frontend
npm run start:landing
```

The preview script uses local API endpoints and inert Firebase configuration. It is intended for visual review; successful real Firebase authentication is outside this local check. Installed frontend dependencies are reused through the worktree's local `node_modules` link.

### Visual proof

- [Recorded opening film, scroll sequence and auth navigation](editing-film.webm)
- [1920px desktop](desktop-1920.png) · [1440px final scene](06-vertical-export.png) · [tablet](tablet-820.png)
- [Mobile first screen](mobile-390.png) · [mobile editor](mobile-editor.png) · [mobile scroll story](mobile-scroll-reframe.png)
- [Pinned final chapter](scroll-8.png) · [features](features.png) · [Director](director.png) · [workflow](workflow.png) · [creator section](creators.png)
- [Reduced motion](reduced-motion.png) · [WebGL fallback](no-webgl-fallback.png) · [original homepage](before-desktop.png)

The latest animation was inspected in the browser at camera entry, timeline assembly, speaker switching, caption typing, selected-range lift and vertical export. The scroll sequence was inspected at all eight chapters, including the 9:16 crop guide and final CTA. Spacing, camera framing and pixel-rounded chapter boundaries were corrected during review. Screenshots can capture a title partway through its finite blur/matte entrance; the recorded film shows the motion. Lower-section captures remain valid because those sections were preserved. Files prefixed `three-pass-` archive the earlier version.

## Branch and scope

| Item | Value |
|---|---|
| Worktree | `AutoPromote-staging-browser-20261004` |
| Branch | `agent/director-analysis-staging-browser-v1` |
| HEAD | `7f7530ad746050c094bfc78d0921190da98d2098` — unchanged |
| Source changes | 38 files; local changes marked for diff review |
| Dependencies added | None; both package lockfiles unchanged |
| Protected files | 11/11 hashes unchanged |

The App/router, authentication forms, authenticated dashboard, Studio and Cam Combiner source are unchanged. The tracked backend diff is empty. [Scope checks and before/after hashes](protected-scope.json).

## Motion implementation

**Libraries:** existing React 19 and Three.js 0.186.0. Three.js is loaded through a dynamic import when the scene becomes visible. Native Web Animations, `requestAnimationFrame`, scroll events and `IntersectionObserver` drive the choreography. CSS supplies layout, typography and controls.

**Hero:** a `WebGLRenderer` and `PerspectiveCamera` render physical panel slabs, separate camera sources, programme preview, native `VideoTexture`, timeline clips, instanced waveforms, playhead, captions, markers, Director suggestions and social outputs. A 24-second animation score uses smooth easing, controlled dolly/parallax and different depth planes. It plays once, then holds the completed frame. Replay and pause/resume controls operate the scene clock.

**Motion graphics:** finite headline assembly uses three text mattes, staggered position/scale, short blur and an animated emphasis gradient. Shader mattes and directional blur introduce the camera feeds and caption. A tracked subject box and analysis pulse lead into a crop guide that narrows from 16:9 to 9:16. A separate compositor supplies graphical strokes, a light sweep and scene typography. Unconfigured Lottie/video/image slots make no media requests; configured assets can seek forward or backward with the same scene clock. Lottie control was tested with a player-protocol fixture; an actual export and player runtime still need asset-specific verification.

**Scroll:** one pinned scene reuses the same editing score and interpolates through:

| Chapter | Visual action |
|---|---|
| 1. Cameras | Three source panels enter from different depths |
| 2. Audio sync | Camera audio and the external waveform align |
| 3. Analysis | Scan indicator and active-speaker switch |
| 4. Director | Split/trim suggestions appear for review |
| 5. Timeline | Captions type, a cut splits, caption/B-roll layers appear |
| 6. Moment | A selected range is highlighted |
| 7. Reframe | The selected section lifts into vertical cards |
| 8. Export | Three social outputs separate; Start Creating appears |

Each chapter has an accessible jump button and explanatory copy. Reduced motion replaces the pinned animation with a still editor preview and eight readable steps.

**Performance:** capped render targets of 30fps desktop/24fps mobile; bounded DPR of 1.5/1.25; simpler mobile geometry and no mobile antialiasing; two instanced waveform draw calls; optimized local WebP stills and a short silent video; no per-frame React state updates; offscreen/hidden pause; no rendering after completion or settled scroll; disposal of frame callbacks, observers, video, textures, materials, geometry and renderer. WebGL initialization/context failure preserves the static preview and CTAs.

## Files and components

Paths below are relative to the worktree. The [source receipt](protected-scope.json) lists every path and SHA-256.

| Area | Files |
|---|---|
| Public entry | `frontend/src/WelcomePage.js`, `frontend/public/index.html`, `frontend/package.json` |
| Sections | `LandingNavbar.js`, `HeroSection.js`, `LandingFeatures.js`, `DirectorShowcase.js`, `LandingWorkflow.js`, `LandingCreators.js`, `LandingFooter.js` |
| UI helpers | `LandingIcon.js`, `LandingDemo.js`, `ProductVisuals.js`, `EditorHeroVisual.js` |
| Motion | `MotionEditingScene.js`, `LandingEditingStory.js`, `createEditingScene.js`, `sceneTextures.js`, `editingSequence.js`, `useKineticTitle.js`, `motionMaterials.js` |
| Compositing and assets | `MotionGraphicsLayer.js`, `MotionAssetLayer.js`, `motionAssetManifest.js` |
| Styles | `LandingPage.css`, `LandingMotion.css`, `LandingCompositing.css` |
| Assets | `frontend/public/landing/README.md`, three podcast WebP stills, `podcast-motion.mp4` |
| Local preview | `frontend/scripts/preview-public-homepage.js` |
| Tests | `LandingPageClaims.test.js`, `PublicPages.copy.test.js`, `LandingMotionLifecycle.test.js`, `MotionAssetLayer.test.js`, `test/e2e/playwright/run-public-homepage.js` |

Section, helper, motion and style files are under `frontend/src/components/landing/`; frontend tests are under `frontend/src/__tests__/`.

## Verification

| Gate | Result | Evidence |
|---|---|---|
| ESLint | 37 JS files; 0 errors, 0 warnings | [Receipt](lint.json) |
| Typecheck | No TypeScript/typecheck script in this JavaScript frontend; production compilation passes | [Build receipt](build-verification.json) |
| Final homepage tests | 16 passed across 4 suites | [Log](landing-tests-final.log) |
| Final frontend regression, excluding legacy Studio suite | 460 passed, 1 skipped; 96 passing suites | [Jest receipt](frontend-final.json) |
| Initial complete frontend run | 545 passed, 3 failed, 1 skipped | [Jest receipt](frontend-tests.json) |
| Real browser verification | 35 checks pass; 25 captures; no page exceptions or console errors | [Browser receipt](browser-verification.json) |
| Production build | Passed; optimized output includes the new media | [Build receipt](build-verification.json) · [log](build-final.log) |
| Exact local preview command | Three.js homepage and existing sign-in form render | [Smoke receipt](preview-smoke.json) |

The complete frontend run is **not fully green**. Its failures are in the unchanged `ViralClipStudio.test.js`: marked middle-range export, audio checkpoint and podcast cutaway timeout. The middle-range failure was reproduced on untouched HEAD; the other two varied across reruns. [Original-HEAD check](studio-original-head.json) · [isolated recheck](studio-recheck.json). Studio changes are outside this homepage task.

The repository's `npm run lint` is currently a placeholder. The actual ESLint configuration was executed with a process-local compatibility adapter for its installed `brace-expansion` export. Reproduce it from the worktree root:

```bash
node reports/public-homepage-20261005/run-lint.cjs
```

The build retains CRA's bundle-size advisory (main JS 919.72 kB gzip) and a Node deprecation warning. Browser verification used Chromium with software WebGL; these checks do not establish performance on every physical mobile device.

### Navigation verified

Public root renders the new page through the existing App/HashRouter. Sign In opens the existing login form; Start Creating opens the existing registration flow. Section navigation scrolls without changing the route. Watch Demo plays the existing podcast video and restores focus on Escape. A local authenticated user/API fixture renders the original dashboard with no homepage class or WebGL canvas. No real user credentials were submitted.

Pricing and footer links retain existing HashRouter routes. Workspace invite behavior remains covered by the existing public-page tests.

## Content and review limits

Footage comes from the repository's existing Cam Combiner demo. The wide camera reuses that recording; the scene illustrates editing, captions, markers and social output. [Asset provenance](../../frontend/public/landing/README.md).

Director copy describes its current human-reviewed split/trim proposals. Reframe, captions, B-roll, zoom, music and social versions are presented as continuation in the editor. No fake creator totals, ratings, views, testimonials or profitability claims were added.

The [artifact manifest](files.json) records source and proof hashes. The live implementation and asset integration are ready for local visual review. Fully authored cinematic assets, production deployment and live authentication validation have not been completed. Work stops here for visual review, as requested.
