# Studio control UI repair — 21 October 2026

The native Studio inspector now keeps its controls inside the 320px rail. Graphics and Sound previously allowed intrinsic grid widths to push fields and choices off the right edge. The existing scoped [controls stylesheet](../../frontend/src/components/StudioControls.css) now bounds those grids, aligns form sizes, improves label contrast and keyboard focus, and keeps long velocity/easing labels in two columns. All three logo families fit. Placed SFX and preset controls use a readable two-column grid, while the vertical EQ sliders retain their native layout. Programme picture and timeline grid sizes remain unchanged.

## Before and after

- [Original Graphics clipping](before/graphics-desktop.png) → [repaired Graphics](after/graphics-desktop.png).
- [Original Sound clipping](before/sound-desktop.png) → [repaired Sound](after/sound-desktop.png).
- [Repaired Motion fields](after/motion-desktop.png).
- [Detailed browser measurements](after/inspection.json) and [verification scope](verification.json).

## Verification

The normal signed-in Dashboard opens Studio and restores the owner's selected native backup, without account bypass, route mocks or document injection. Initial canonical restore hash is 924eb995e90f1f9ff91896848baf0914afbe7bf365df8c62e66027b9e654162d. Headless muted Chromium checks nine tool families at 1440px, plus seven at each of 1280/1024/900px: **30 panel checks, zero controls outside the inspector, zero browser errors**. At 820px and 390px the existing desktop-only editing boundary is verified, rather than bypassed. Native X changes from 50 to 51; normal header Undo restores every edit field. The history revision legitimately moves from 303 to 305 with a history-restore journal entry, so the Undo comparison excludes only revision/journal metadata.

Three existing component suites pass all **10 cases** for Motion poses, Logo Workshop and curve editing. The strict CI App build passes; its private production-configuration verification bundle skips minification. [Build log](logs/build.log), [component checks](logs/component-tests.log), [browser log](logs/after.log). No new render, inference, provider generation, publishing mutation or GPU job occurs.

Earlier QA attempts remain retained: a localhost API/host-remap mismatch initially reached Billing; the first narrow-screen attempt expected the desktop editor below its existing 900px boundary; two Undo selectors targeted a nonmatching or hidden quick button; a whole-document hash incorrectly included normal history metadata; a sampled input readback followed the preview's clock reset. The corrected driver uses the visible native header Undo and checks actual saved edit data. Layout measurements then revealed the intentionally horizontal placed-SFX strip; the selected UI revision wraps it into a grid. No product test thresholds or editing behavior were changed to hide those harness errors.

## Review and limits

The updated local app is available at **http://localhost:5006/** through autopromote-studio-ui-preview.service, with the existing authenticated background-disabled API on 5145. The selected welcome film and its private media paths are preserved. Production and main are unchanged. The temporary isolated QA listener is stopped after verification. All fourteen daily/retention/performance timers remain present.

This is a bounded inspector styling repair in Chromium, not an exhaustive audit of every expanded tool or browser. Formal counts remain **2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY**. Whole predictive picture/audio, colour/edge/low-alpha, CPU latency, deeper motion/glyph work and ownership remain on the shared S02/S04/S03 backlog. No new film or creative/readiness qualification is claimed. Next: owner review of these controls, then that shared backlog.

## Documentation follow-up

Knowledge 1.0.42 adds practical inspector navigation, the existing desktop screen/pointer requirement, Motion target/value/velocity instructions, Logo Workshop layout and placed sound-cue editing. The canonical source generates the Studio, Motion and Audio guides plus searchable user/AI bundles. Existing feature/control/task IDs and readiness are preserved. This documentation-only follow-up reuses the retained native UI evidence and runs no new browser, render or provider job.
