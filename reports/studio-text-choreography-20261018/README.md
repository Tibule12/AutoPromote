# Editable text choreography in Studio

Studio now animates letters or words independently inside **one editable title**.
Copy changes keep the rig; normal Text progress keys control construction,
reversal and holds. Stagger, four ordering modes, selectors, starting travel,
scale, rotation, opacity, spread and overshoot are ordinary project decisions.

- [Watch the one-minute film, with sound](proof/film/final-review.mp4)
- [Watch its actual matching Studio timeline and full playback](proof/film/edited-in-studio-review.mp4)
- [Restore the editable native project](proof/Make-them-look-twice.autopromote.json)
- [Native H.264/AAC export](proof/film/final.mp4) and [original Studio recording](proof/film/edited-in-studio.mp4)
- [Controls](control-contract.md), [delivery checkpoint](checkpoint.json), [exact native restore](proof/fresh-restore-receipt.json)

In this branch, open **Graphics → select a title → Text choreography → Animate
this title**. Choose letters or words and an order. Use the **Text progress** row
in Motion/timeline to hold, reverse or reshape the timing. Numeric drafts commit
on Enter/blur; Escape and track lock cancel drafts. Remove/rebuild uses normal
Undo/Redo. The previous separate-layer kinetic builder remains available for
plain titles and explicitly rejects an enabled animator.

## The actual edit

**Make them look twice** is a private 60-second typography film: ten different
letter/word arrangements, 51 ordinary layers, 255 motion keys, changing rails and
orbits, and an original locally synthesized stereo score. It starts with the
completed result, breaks it apart and reconstructs it, moves through a creator's
repetitive posting problem and ends with “What would you make move?”. The
[design](design.json), [normal Graphics import](assets/make-them-look-twice.graphics.json),
[original score and sources](assets/) remain editable. No external video
synthesis, sample library or paid GPU was used.

Normal signed-in Studio import, copy/settings/progress edits, key rebuilding,
Undo/Redo, track lock, save and exact cold reopen pass. The selected native CPU
export is 1280×720, 24 fps, **1,440 frames**, exactly 60 seconds with stereo AAC
48 kHz. Native download hashes match the server and independent full video/audio
decode passes. The complete movie played to its end in Studio with its matching
canonical timeline. A normal Sound lane reveal is included. A fresh independent
session restored the exact backup and exercised native enable/remove/history
and invalid-copy rejection without submitting another render.

The selected project is `viral-project-0e45271f-1851-43e6-8a8c-ab4f366675f4`;
[render receipt](proof/film/render-receipt.json) binds its canonical hash and
completed job to native SHA-256
`8d2f762d33d1bfe73393f5d0a78c56948e2fec24e43025463952ec17af692d3a`.
MP3-audio review copies retain **identical compressed video packets**, independently
[verified](proof/review-copies.json); AAC originals remain. The muted QA browser's
recording uses the exact final soundtrack at its observed playback-start offset.
Screen capture averaged 20.31 fps and does not establish playback smoothness.

## Verification and practical limits

The implementation passes **66 frontend cases, 176 worker cases plus 11 subtests,
and 29 server replay/render-attempt cases**. Strict App build and generated replay
checks pass. [Verification logs](proof/checks/) retain the exact executed results.
These are targeted checks, not a full Studio or professional-readiness claim.

At sixteen fixed native programme times, **all 268 observed unit transforms and
opacity values exactly match** canonical worker poses. Compiled animator fields
and every progress key match the saved editable decisions. The stricter
[full-frame colour/edge comparison](proof/text-parity.json) **fails**: only 3/16
samples meet both the original IoU ≥0.90 and boundary p95 ≤2px thresholds. These
thresholds have not changed. Low-opacity pixels cross the fixed classifier
boundary, and native compressed colour/glyph edges visibly differ from SVG
preview; the full cause is not isolated. No alignment, crop or time fitting was
used. This film therefore does not qualify exact predictive pixel parity.
The [sampled visual review](proof/visual-review.json) and all original pairs remain.

The score measures −16.27 LUFS / −1.11 dBTP before the normal mixer. Studio's
actual 60% music level yields **−20.74 LUFS / −5.54 dBTP** in the native final;
there is no claim of loudness mastering or human listening approval. Native
export of the minute took about 38 minutes on local CPU. Export latency, whole
predictive picture/sound, uncaptured playback smoothness, broad style/mask/parent/
retime combinations and owner creative/listening acceptance remain separate.

The first contract supports **180 composed Latin characters**, bundled Inter
400/600/800/900 and twelve wrapped rows. It does not supply complex shaping,
combining scripts, emoji, arbitrary fonts, editable glyph contours, automatic
logo tracing or contour morphs. Previous chosen identity, films and publishing
receipts remain. No new schedules, main merge, deployment, paid jobs or public
showcase promotion are included. This feature is available on the current branch.

## Retained attempts and provenance

The first browser observer selected the first title after Undo and rebuilt it
instead of the intended fifth title. Assertions caught the observer error before
any render. Its project and evidence remain in `proof/first-observer-selection/`.
The attempted cold Undo was disabled and is retained as a failed observer attempt.
The corrected helper reselects the intended title after Undo. Initial guide-bearing
captures remain; clean captures use normal Motion path/Escape controls.
No graph, DOM-style, route or authentication injection was used.

The first accepted export stopped when turn-owned API/worker/browser processes
disappeared during a chat interruption; it produced no final movie. Its original
job/project and a losslessly hash-verified scratch archive remain in
`proof/stopped-local-export/`. A **normal Studio Duplicate** created the selected
project with identical edit decisions, then one new native export ran under
persistent user QA services. The original stuck job remains preserved. Both
attempts skipped credits; no paid execution occurred. This QA lifetime correction
does not repair general production restart recovery.

The second observer reached its 30-minute budget while the persistent worker
continued. That same accepted job completed; normal saved-entry recovery
retrieved its final **without another render submission**. The pending checkpoint,
observer failure and original logs remain. Only this task's QA services were
stopped; the owner's daily Studio and retention timers remain active.
