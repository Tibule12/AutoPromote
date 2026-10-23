# Retained speed curves and bounded speech decoding

23 October 2026. Shared Studio continuation for complex timeline behavior and
preview/sound accuracy. This is a private engineering check, with no readiness,
creative, public-showroom or production qualification.

## Change

Removing footage previously removed speed points without preserving the curves
on either side of the gap. Linked cuts now crop the same automation curves as
other buses and use deterministic canonical speed identities. Custom handles
survive projection, replay, validation, recovery and the actual preview clock.
A one-tick speed interval samples inside its half-open range.

Those joins also exposed speech decoding failures. FFmpeg duration fields now
use fixed decimal notation. Speech pieces use finite sample lengths with
cumulative rounding, so repeated joins cannot accumulate rounding drift.
Intervals projecting to zero samples are omitted; a sub-sample join preserves
its sample without WSOLA. Short stretched ranges read following speech for
decoder context, with bounded silence only at the cue end, and are trimmed to
their exact output sample length. Normal 1x recordings retain exact samples.
Both prepared speech preview and final rendering use this same helper.

Native export then exposed a second clock defect: a fractional cut reaching the
source end lost a picture before sequence CFR conversion. One bounded cloned
source frame before conversion restores that picture’s coverage. The caller’s
exact cut duration still bounds the output; a real missing-tail regression
proves that this cannot pad a longer missing section into apparent success.

The private screen recorder also pads odd-sized captures to an even encoding
width; this does not alter the Studio movie or its edit decisions.

## Verification

- Eight frontend helper suites: **86 cases pass**, covering six arrival easing
  types, retained speed error below 0.00006 across 600 positions, repeated cuts,
  repeated-source ownership, nested group gates, fade phase, exact history and
  canonical recovery/render compilation.
- Ordinary Studio component split/trim, decoder rate and Undo/Redo: **one case
  passes**; 135 unrelated cases were not selected in that focused run.
- Five backend suites: **35 cases pass**, including strict curve validation,
  owner/project bindings, replay and real CPU speech preview/cancellation.
- **21 worker unit cases and 12 picture-clock cases plus two subtests pass.**
  Real FFmpeg regressions cover 15 one-tick cases, 50 short-range/rate/edge
  combinations and 200 speed intervals with exact cumulative sample length.
  Source-reference and pitch checks retain their existing assertions.
- Product knowledge: **17 cases pass**. Knowledge 1.0.47 documents source-backed
  Pacing/cut/recovery behavior while retaining the PARTIAL status.
- Strict optimized App build passes. Eight anonymous viewport comparisons and
  three real signed-in help questions pass, with zero browser errors. Saved
  login bytes remain unchanged.

The ordinary signed-in native flow also passes: three source occurrences,
Pacing points, linked split/trim through a ramp, exact Undo/Redo, exact cold
reopen, six decoder rates matching the canonical map, and complete live playback.
An independent fresh session restores the downloaded completed project backup
with the identical canonical document and zero new render requests.

The corrected CPU movie has **277 frames, 1280×720, 24 fps, 11.541667 seconds**,
with stereo 48 kHz AAC. Its downloaded bytes match the owned server SHA-256
`8e0f3c5681551e6aaceef5dd9a317c6be6372a76cf2b4dd4d9571b200206bc0c`.
Complete picture/audio decode and matching finished-movie playback with the
editable Studio timeline pass. The separate native recording and project backup
are retained in `proof/native/`.

Prepared speech and the final mixer match **all 1,107,622 scalar PCM samples**
(553,811 stereo sample frames), with maximum absolute error **0**, at the existing
0.00004 tolerance. This is before lossy AAC encoding, not a whole-mix or human
listening qualification.

The first native export had 276 frames and failed the unchanged 277-frame gate.
It remains under `proof/native-short-picture-failure/`. An offline production-
pipeline replay retained intermediate streams and exposed the 71-frame source
fragment. The corrected replay guards pass at 24 and 60 fps; the second ordinary
native export passes the original gate. There were two native CPU exports and
one local diagnostic pipeline replay, with zero new GPU/model jobs.

## Evidence and limits

Raw failures, private authenticated receipts, project graphs, sound samples and
recordings are retained under ignored `proof/`. No credentials or private media
are included in the source commit. Temporary QA builds initially used the wrong
local API prefix and login configuration; those attempts are preserved and do
not qualify the signed-in check. The corrected build uses the existing local
development Firebase settings and ordinary authenticated API.

Formal counts remain 17 FUNCTIONAL, 9 PARTIAL, 1 BROKEN, 2 UNIMPLEMENTED, and zero
PRO/PRODUCTION-ready. Earlier typography colour/edge failures, whole live mixed
sound/picture parity, listening review, capture smoothness (19.72 fps capture of a 24 fps film), broader motion/glyph
depth and occurrence/group ownership remain separate. No paid GPU/model job,
new schedule, main merge or deployment is part of this continuation.

Next: continue S02 whole mixed sound/picture and strict colour/edge/latency
checks alongside S04
motion depth and S03 ownership. Preserve all prior selected films, branding,
backups, publishing receipts and daily/retention/performance timers.
