# Studio interaction and responsive layout repairs — October 4, 2026

**Verified locally:** 17 browser checks and 16 selected regression tests pass.
The browser uses the production Studio component, native video playback and real
IndexedDB storage with a short generated video. No signed-in account or cloud API
is supplied. This report covers local editing behavior and responsive layout;
public deployment and rendered-file verification are outside this run.

## Repairs

- A single-clip sequence loops at its trimmed end instead of continuing into
  excluded source footage. Paused scrubbing remains at the chosen frame.
- Source metadata preserves the selected range and current editing frame.
  Replacing a private source URL retains the current position within its range.
  A completed render's metadata cannot overwrite editable source clip durations.
- Escape dismisses an open menu and returns focus to its trigger. A subsequent
  Escape remains available to the expanded preview. Outside clicks and actions
  also dismiss menus.
- Media, Sequence and Moments support arrow keys, wraparound, Home and End,
  one active tab stop and explicit tab/panel associations. Existing browser
  runners and the camera grouping regression use these panel identifiers.
- Phone headers keep Close within the screen. The tools occupy a horizontal
  strip. Preview and timeline precede the inspector, and the media library uses
  the available width and a scrollable 360-pixel panel with sticky tabs. Explicit
  row heights prevent the tool strip and library from collapsing. Repeated
  explanatory copy and secondary preview badges
  are hidden where they crowded the picture.
- Timeline height adapts to window height while retaining the preferred size
  when the window grows again. Short landscape windows scroll the workspace
  to keep the programme picture and its transport usable.

## Evidence

- [Native browser interaction and layout receipt](browser.json)
- [Raw focused Jest results](jest-regression.json)
- [Lint comparison with the previous commit](lint-summary.json)
- [Source, evidence and bundle verification](delivery-verification.json)
- [SHA-256 manifest](files.json)
- [Phone editor](images/phone-editor.png)
- [Tablet editor](images/tablet-editor.png)
- [Phone media library](images/phone-library.png)
- [Landscape programme monitor after scrolling](images/landscape-monitor.png)
- [Landscape scroll verification](landscape-monitor.json)

The browser retains a selected 2–8-second range from a 12-second source,
seeks to its exact trimmed end while paused, and plays across that boundary.
It verifies keyboard trim undo/redo, library navigation, menu dismissal, and a
saved checkpoint after a full page reload. The responsive matrix covers
1440×1000, 1000×800, 820×1024, 768×1024, 390×844 and 844×390. Checks include
the actual picture's dimensions, transport separation, Close placement and
media library access, card visibility and usable tool/library heights. There
are zero page errors and zero API requests.

The first geometry check established timeline width but missed a collapsed
picture. Visual inspection led to stronger picture and transport assertions.
Opening Media also exposed an older rule restoring desktop columns on tablets;
the corrected layout passes with Media open and closed. Landscape requires
vertical scrolling to reach each editing surface at a 390-pixel window height.
The final screenshot review also caught collapsed automatic rows for the mobile
tools and library. Explicit heights and matching assertions correct that defect.

The 16 selected Jest checks cover the new playback and keyboard regressions,
existing hook sequencing, completed-render loading, linked motion/sound trim
retiming, undo/redo, batch import ordering/failures, clip reordering and camera
grouping/export timing. Uploads and export callbacks are mocked in these checks.
The remaining 76 tests were skipped. Lint reports zero errors; its 11 existing
test warnings match the previous commit. The installed brace-expansion package
required a callable-export compatibility wrapper in the lint process; no
dependency files were modified.

## Reproduction

With the repository's frontend and browser dependencies installed, and FFmpeg
available, start the local fixture host:

```sh
node scripts/run-studio-interaction-preview.js
```

Once it prints `ready`, run in another terminal:

```sh
node test/e2e/playwright/run-studio-interactions.js
```

The host generates a small test-pattern video if absent, compiles the production
component and serves only localhost. It uses inert Firebase client configuration
for module initialization. The fixture, compiled bundle and extra screenshots
remain under ignored `artifacts/studio-interactions-20261004/`.
