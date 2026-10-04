# Studio timeline repair — October 4, 2026

**Verified locally with staging Firebase and media:** 23 focused regression tests,
23 full-browser layout checks, nine library-tab checks and 16 delivery checks pass.

The user identified a visual failure in the earlier browser acceptance capture:
the main timeline occupied the 92-pixel tools column. The earlier analysis gate
verified authentication, cloud processing, applied edits and playback, but missed
this layout defect. Its 48 checks did not establish visual acceptance.

## Changes

The workspace children now occupy their declared grid areas. The timeline spans
the workspace with media open or closed and the canvas centered or docked right.
The default dock is 280 pixels tall and remains resizable. The ruler stays visible
while scrolling through tracks. Fixed track headers remain visible when zooming
and panning horizontally. Zoom supports 1–32×, centers on the current playhead,
and has explicit plus/minus and **Fit** controls. Ruler marks adjust to zoom.

The initial full-width repair still crowded 144 framing cuts with partial labels.
Framing cuts now show labels only when at least 120 pixels are available. Their
colors distinguish wide, speaker, multicamera and punch framing; the current
cut's full name and time range remain in the footer. Thumbnails retain their
aspect ratio and repeat as tiles within each sampled source interval.

The preview has a compact horizontal toolbar. **View options** contains framing
shortcuts, display overlays and docking controls; media and timeline toggles stay
visible. Duplicate inspector navigation is hidden on desktop, where the main tool
rail already selects the inspector. Secondary timeline actions open through
**More actions**. Menus dismiss after an action, Escape or an outside click.

## Batch media placement

The project library now has separate **Media**, **Sequence** and **Moments** tabs.
Project settings, source preview and camera grouping collapse to preserve room
for the library. Imported videos remain in the library until explicitly placed;
imports preserve selection order and allow at most three concurrent uploads.
Search and paging handle larger collections. Only the selected card shows its
placement actions, with failure/retry controls available on failed cards.
Cards show **In sequence** and **Used as B-roll** badges.

**Add to sequence** appends the full source to the end of the sequence.
**Add as B-roll** places up to three seconds at the current playhead, with its
length editable afterward. Camera take grouping remains a separate action for
simultaneous angles. Uploading a batch does not automatically arrange a story.

Source video now has a filmstrip sampled from actual source frames. A separate,
muted decoder samples at most 24 images, without seeking the programme monitor;
it releases its source on completion, cancellation or unmount. An unavailable
source stops sampling that source. These are original source thumbnails; framing
and other edits appear on their own tracks and in the output preview.
The decoder attaches outside the visible viewport, allows up to 60 seconds per
media event, and caches at most 24 decoded JPEGs in memory. Hiding and reopening
the timeline reuses these frames rather than restarting all source reads.

The old compact timeline's separate thumbnail videos are removed. Its fallback
filmstrip uses the same bounded decoder when the main dock is closed. Sampling
enables media loading for successive frame seeks and releases the decoder after
the bounded set of frames completes. An earlier stress
attempt exhausted the programme's buffered data at 454.55 seconds, with the video
unpaused, `readyState=2`, `networkState=2` and no decode error. This observed
buffering failure prompted the reduction in duplicate thumbnail loading; it does
not establish a single cause for every playback stall.

Empty tracks are hidden by default and accessible through **Show empty tracks**.
Selecting an editing tool brings its track into view. The block containing the
preview playhead is highlighted. Short framing blocks use their true duration
instead of a minimum percentage that overlapped later cuts.

Clicking a source-video or source-audio block now seeks the clicked output time.
Previously every click on a block sought its start. Keyboard activation retains
the start-of-clip behavior.

## Evidence

- [Browser layout and synchronization receipt](receipt.json)
- [Compiled library-tab visibility receipt](library-tabs.json)
- [Delivery and tested-source verification](delivery-verification.json)
- [Focused regression test results](test-results.json)
- [Raw timeline and thumbnail Jest results](jest-timeline.json)
- [Final six editor interaction tests](jest-editor-final.json)
- [Batch import and camera grouping regressions](jest-media.json)
- [Real owned-source resolution and authorization checks](source-resolution.json)
- [Raw first editor gate](jest-editor.json) and [focused seek retest](jest-editor-seek.json)
- [Screenshot hashes](visuals.json)
- [Observed buffering in the earlier stress attempt](buffering-observation.json)
- [Updated editor screenshot](images/frontend-fixed.png)
- [1440-pixel editor with media closed](../../artifacts/studio-timeline-layout-20261004/layout-1440-closed-center.png)
- [1440-pixel editor with media open](../../artifacts/studio-timeline-layout-20261004/layout-1440-open-center.png)
- [Zoomed framing cuts](images/frontend-zoomed.png)
- [Batch media library](images/media-library-batch.png)
- [Reintroduced original clipping](../../artifacts/studio-timeline-layout-20261004/negative-control.png)

The browser mounts the production Studio component, signs in through real staging
Firebase, plays the same private podcast, and restores the previously verified
1,277-point checkpoint. It submits **zero new analysis jobs**. The matrix covers
1920×1080, 1440×1000, 1280×800, 1100×900 and 1000×800, with media open/closed and
both canvas positions. Additional checks cover resizing, hiding/reopening,
decoded source thumbnails, seeking to 150 and 450 seconds, corresponding ruler
positions, active framing and continued unmuted playback. A negative control
reintroduces auto-placement; the same geometry gate must reject it.
The geometry matrix pauses playback while changing layouts; the playback gate
resumes the real monitor after seeking and resizing. Visual checks also verify
undistorted thumbnails, hidden narrow-cut labels, readable labels at 32× zoom,
playhead centering, fixed headers, Fit reset and secondary-menu access/dismissal.
The full run passes 23 layout checks and the populated-library gate. Library
presentation is checked after pausing the monitor. Its 14 cards are searchable,
paged and limited to one visible placement-action group. The click-time checks
use the checkpoint's 600-second edited range, rather than its 601.002086-second
source duration, and round mouse coordinates to the nearest screen pixel.
The final CSS correction scopes an older rule hiding the sequence pane to the
Media tab. A separate check of the freshly compiled component verifies Media,
Sequence and Moments at three desktop sizes, including pane visibility and
timeline geometry. Each browser receipt records its source and bundle hashes;
the full gate precedes this one-selector CSS correction.
The acceptance host also exposes the production owned-source resolver. User ADC
signs through the existing staging service account using real IAM, with no private
key or mocked response. The owner receives HTTP 200 and a readable signed link
(HTTP 206 for a 4,096-byte range); anonymous access returns 401 and the other
staging owner receives 403. This fixes a limitation of the earlier acceptance
host, which could play its bootstrapped source but could not reopen library links.

The focused Jest checks cover trimmed/scrolled clip seeking, active framing at a
cut boundary, empty-track access, exact short-cut widths, thumbnail decoder
isolation/cleanup/failure, existing motion/adjustment interactions, trim retiming,
undo/redo, sound editing and analysis submission. The full component suite was
not rerun for this repair. The first editor gate passed five tests and failed an
obsolete assertion requiring the compact timeline's multiple video thumbnails.
The updated assertion verifies their removal and the presence of the main
filmstrip; that focused seek test then passed. All six selected editor tests were
then rerun against the simplified Studio and passed. The added batch test imports
13 distinct file fixtures, resolves uploads out of order, fails one upload, checks
the concurrency limit, paging/search and explicit sequence/B-roll placement. The
camera regression covers manual alignment, synchronized previews and export
timing. Four upload-entry tests also pass, giving **23 passing focused tests**.
Upload calls are mocked in these Jest checks. The browser's batch display uses
14 library references to the same real staging source; it does not prove 14
distinct cloud uploads. The receipts preserve the earlier runs.

This is local browser evidence using staging authentication and media. Public
deployment, mobile layout and export-output verification are outside this gate.
The editor, zoom and batch-library screenshots are included in this report.
Additional matrix and negative-control screenshots remain in local artifacts.

## Reproduction

Use the existing staging browser preparation and host described in
[the original acceptance report](../studio-analysis-browser-20261004/README.md).
Then run:

```sh
node test/e2e/playwright/run-studio-timeline-layout.js
```

The optional batch presentation gate uses `STUDIO_MEDIA_BATCH_FIXTURE=1` and a
source-frame JPEG at `artifacts/studio-timeline-layout-20261004/library-poster.jpg`.
`node test/e2e/playwright/run-studio-library-tabs.js` checks the library tabs
against the current compiled acceptance host.

The reusable geometry check also runs at the playback checkpoints in the live
cloud analysis acceptance script and in the existing dashboard browser test.
