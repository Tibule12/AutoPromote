# Native Logo Workshop

Studio now designs a symbol and outlined brand lettering as **ordinary editable
vector layers**. The new **Start a logo design** entry, verified through the real UI, prepares a blank canvas
through the existing signed-in source/ownership flow. In the editor, open
**Graphics → Logo Workshop**, choose a design, then **Add logo to timeline**.

- [AutoPromote design study: colour, white and ink](assets/AutoPromote-flow-review.jpg)
- [Transparent colour SVG](assets/restored-AutoPromote-flow-colour.svg) · [PNG](assets/restored-AutoPromote-flow-colour.png)
- [White SVG](assets/restored-AutoPromote-flow-light.svg) · [PNG](assets/restored-AutoPromote-flow-light.png)
- [Ink SVG](assets/restored-AutoPromote-flow-dark.svg) · [PNG](assets/restored-AutoPromote-flow-dark.png)
- [Motion film with sound](proof/film/final-review.mp4)
- [Actual matching Studio timeline and complete playback](proof/film/edited-in-studio-review.mp4)
- [Editable native project backup](proof/AutoPromote-logo-design.autopromote.json)
- [Delivery checkpoint](checkpoint.json) · [native render receipt](proof/film/render-receipt.json)

## Design and editing

**Flow**, **Orbit** and **Facet** are three deterministic starting families with
editable symbol pieces. Horizontal, stacked and symbol-only lockups support
bundled Inter Black/SemiBold letter outlines, spacing, symbol size, three colours
and a gradient/solid switch. Signed spacing drafts commit on Enter/blur;
Escape or track lock discards uncommitted input.

Accepted designs become normal image/vector layers inside one ordinary graphic
group. The name field authors a new design; each accepted letter is an outline,
with editable anchors, cubic tangents and real transparent counters. In
**Vector artwork**, select a letter and its **Contour** to reshape the outer path
or its hole. Copy changes after construction require a new design, rather than
silently replacing manually edited outlines.

Version-two vector geometry supports one to eight contours, at most 64 nodes per
contour and 256 total. Even-odd fills retain counters across backgrounds. Stroke
start/end/offset follows each contour independently, without artificial bridges.
Existing version-one artwork keeps its previous representation and behavior.
Font contours are extracted from exact bundled, licensed Inter assets;
[font and sound provenance](assets/provenance.json) and [font licence](assets/Inter-LICENSE.txt)
are retained. No bitmap tracing or external provider generation is involved.

The optional assembly adds ordinary opacity, scale, rotation and Y keys. All
pieces remain adjustable in the normal Motion workspace and compiler. Portable
SVG masters contain real paths and unique gradient IDs, with no text, font or
embedded bitmap dependency. PNG masters have true alpha. Choose the current logo
group and colour, white or ink version; these static masters use current vector
geometry and **base layout before timeline motion**. Masks, crops, filters,
rounded frames, unsupported blends and nested/non-vector members are rejected.

## Real Studio delivery

The AutoPromote study uses **14 editable layers and 112 normal motion keys**.
Real signed-in creation, draft family changes, inner-letter point editing,
Undo/Redo, Graphics lock and exact cold reopen pass. All six masters were
downloaded through normal controls. A fresh independent real-auth session
restored the exact backup and re-exported all six assets with the CPU worker
offline. **All three restored PNGs are byte-identical** to their originals;
[alpha and portable-vector checks](proof/master-assets.json) pass.

One native CPU export produced exactly **8 seconds / 192 frames**, 1280×720 at
24 fps with stereo 48 kHz AAC. Native server/download SHA-256 agrees:
`2c2f6278f56ba43c3a4c349dcb3c7d78ca0b4d4d4947e66ec19341f030b90bc9`.
The normal media-upload materialization changes the source-bound canonical hash
from the pre-upload edit to the selected final graph; the receipt preserves both.
The final graph is `ff031560fbf51468e058adfde8983331ea13c874ce333a9da6544df0c8c02ad8`.
Complete independent picture/audio decode, full movie playback beside its exact
native timeline and independent backup recovery pass. The original AAC
[movie](proof/film/final.mp4) and [recording](proof/film/edited-in-studio.mp4)
remain. MP3 review copies retain identical compressed video packets, independently
[verified](proof/review-copies.json). The QA browser was headless and muted;
recording sound is muxed from the exact native movie at the observed start.

All 14 compiled vector geometries and all 112 keys match the saved decisions.
Three fixed settled-frame [native geometry pairs](proof/logo-parity.json) pass
unchanged IoU ≥0.95 and boundary p95 ≤2 screenshot-pixel bounds: minimum IoU
**0.971710**, maximum p95 **1 pixel**. No alignment, crop or time fitting was used.
This qualifies opaque settled geometry; low-alpha arrivals, complete colour/paint,
whole live sound and broader combinations remain separate. Screen capture is
20.03 fps and does not establish playback smoothness. The final score measures
−20.71 LUFS / −5.57 dBTP; human listening/creative acceptance remains separate.

Targeted checks pass **71 frontend cases / 10 suites**, **176 worker cases** and
**30 server replay/render-attempt cases / 3 suites**, including compound counters
and all 130 bundled non-space glyphs. The strict App build and generated replay
check pass. These are scoped checks, not a full Studio or professional-readiness
qualification. The final documentation/record checks are retained separately.

## Scope and continuity

This is a design workshop with three editable starting families and bounded
A–Z/a–z, digit, space, ampersand, period and hyphen glyphs (1–32 characters).
Arbitrary-brief AI design, automatic tracing of uploaded identities, arbitrary
font conversion, boolean operations and contour morphs are separate work.
The AutoPromote example is a **design study**; the selected Gradient Tech app
identity, earlier films and publishing receipts remain. No new publishing,
paid GPU/provider job, main merge, deployment or showroom promotion occurred.

Prior text-choreography colour/edge parity remains failed. Its raw measurements
contain **3/16** passing samples; earlier prose incorrectly counted four.
The summary has been corrected without changing original measurements or
thresholds. That separate failure is not repaired by this settled vector result.
General interrupted-job recovery, CPU latency and whole predictive picture/audio
remain S02 work alongside shared S04 motion/glyph depth, then S03 ownership.

The first real blank-entry click caught an inherited upload-button style with pointer events disabled. That attempt and screenshot are retained. The logo button now explicitly accepts pointer input, sits above saved projects and the saved-project list has a bounded scroll area. No source upload or render was started by that rejected click.

The corrected real blank-entry run passes with an owned eight-second programme and visible Logo Workshop; its [receipt](proof/blank-canvas-entry.json) and screenshot are retained. Signed negative spacing commit/Escape and alternate layout drafts pass on the final App without changing the selected logo graph. [Detailed control/consumer contract](control-contract.md).
