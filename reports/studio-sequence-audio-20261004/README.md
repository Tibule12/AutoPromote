# Studio sequence, audio and timing repairs — October 4, 2026

**Verified locally:** 49 targeted Jest tests and 25 native browser checks pass.
The browser runs the production editor with two distinct generated MP4 files,
real pointer input and IndexedDB. There are zero page errors and zero API requests.
Authenticated export payload checks use the existing Jest authentication mock;
the signed-out browser verifies that export is blocked. These results do not
establish cloud rendering or a public deployment.

## Repairs

- Full-length source clips advance at native EOF even though the browser pauses
  before dispatching `ended`. The last clip loops back to the first. A new decoder
  retries playback on `canplay` while Play remains requested; an explicit Pause
  prevents that retry. Rendered output keeps its own EOF behavior.
- The main timeline receives the same resolved source windows as the preview.
  Immediately importing another video can no longer reduce the first displayed
  clip to 0.04 seconds while its metadata is still loading.
- Background-audio synchronization no longer overwrites the original track's
  mute, solo or automated gain. The original mixer owns those settings, including
  after a saved project is reopened.
- Track locks block B-roll, adjustment, motion and original-audio timing handles,
  plus source trim, split, delete and silence-cut quick actions as applicable.
  Selection and seeking remain available. This protects those timeline gestures;
  it is not a global read-only document mode.
- Dragging B-roll's right edge emits its absolute programme end. A layer beginning
  at five seconds can extend from eight to nine seconds without collapsing to
  0.1 seconds. Adjustment layers use the same end-time convention.
- Titles and B-roll use the programme clock when exported. Source trim is applied
  once, and repeated source identities resolve through the specific clip
  occurrence. Legacy source-time captions remain readable. Tests also cover
  mapping layer starts through moved hook ranges; spans crossing those ranges
  are not split by this helper.
- Mute and Solo appear on audio buses. Timeline dimming is labelled as a display
  control, and Lock describes its timing scope. Toggle states are exposed to
  assistive technology.

## Evidence

- [Two-source native browser receipt](sequence-browser.json)
- [Interaction and responsive regression receipt](interaction-browser.json)
- [Raw focused Jest results: 48 passing tests](jest-regression.json)
- [Authenticated export integration: one passing test](jest-export.json)
- [Five failing controls against the original implementation](negative-control.json)
- [First import display failure before repair](import-before.json)
- [Lint comparison](lint-summary.json)
- [Source, receipt and bundle verification](delivery-verification.json)
- [SHA-256 manifest](files.json)
- [Two sources and the retimed blue B-roll in the programme monitor](images/edited-sequence.png)
- [Phone editor](images/phone-editor.png)
- [Phone media library](images/phone-library.png)

The sequence check plays through the actual 12-second source EOF into a different
four-second source, then through its EOF back to the first. It places B-roll at
five seconds, drags its end to nine, attempts a locked pointer trim, changes the
original-audio mute state, and trims the source opening. B-roll then occupies
three to seven seconds in the resulting 14-second programme. Pixel-driven seeks
and drags allow 25 milliseconds of rounding error. Synthetic storage paths only
permit placement of localhost fixtures; no account or upload service is mocked
in this browser host.

The separate browser regression covers trimmed playback, paused scrubbing,
metadata reload, trim undo/redo, keyboard library navigation, menu dismissal,
checkpoint reload and responsive layouts from desktop to phone and landscape.
Both receipts identify the same compiled bundle and bind the relevant sources.

The 49 Jest checks cover the repairs and existing camera grouping/export,
ordering, hook playback, render loading, linked motion/audio retiming, imported
media ordering and isolated failures, audio controls and local asset export.
The export integration submits a title at programme second five and B-roll at
second twelve across two trimmed occurrences sharing a source identity. Their
export times and durations stay unchanged. This captures the editor's callback,
not a worker-encoded video. Remaining tests were skipped by the focused runs.

Five negative-control cases fail against the original production implementation
with the expected EOF, lock, audio and end-trim errors. The source-lock fixture
was subsequently strengthened to initialize metadata and exercise both trim
toolbars and seeking. The first browser import receipt separately records the
incorrect 4.04-second displayed total before the resolved-window fix.

Lint reports zero errors and the same 11 existing test warnings as the previous
commit. The lint process uses a callable-export compatibility wrapper for the
installed `brace-expansion` package; dependency files were not modified.

## Reproduction

With the frontend and Playwright dependencies installed and FFmpeg available:

```sh
STUDIO_INTERACTION_FOLDER=artifacts/studio-sequence-audio-20261004 \
  node scripts/run-studio-interaction-preview.js
```

After the host prints `ready`, run in another terminal:

```sh
node test/e2e/playwright/run-studio-sequence-audio.js
STUDIO_INTERACTION_FOLDER=artifacts/studio-sequence-audio-20261004 \
  node test/e2e/playwright/run-studio-interactions.js
```

The host listens only on localhost and supplies inert Firebase client
configuration for module initialization. Its compiled bundle and source MP4s
remain under ignored `artifacts/studio-sequence-audio-20261004/`.
