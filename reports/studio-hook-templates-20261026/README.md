# Footage-led Studio hook templates — 26 October 2026

Six families and twelve authored arrangements are implemented on the isolated
`feat/studio-hook-templates-20261026` branch. The existing Studio adapter,
canonical project, Director replay kernel, compiler and CPU renderer assemble
actual footage. There is no second editing engine. The inherited local Studio
repairs remain intact. [Controls and source-selection guide](../../docs/STUDIO-HOOK-TEMPLATES.md).

## What the templates create

| Family | Pinned template | Editing structure |
| --- | --- | --- |
| Podcast | `podcast_cold_open_v1@1.0.0` | Selected statement, genuine source reaction, question/context; original speech and source captions |
| Interview | `interview_revelation_v1@1.0.0` | Complete question and answer excerpt, or answer-first arrangement |
| Cinematic | `cinematic_flashforward_v1@1.0.0` | Action flash-forward, wide context, accelerating conflict cuts, open question and sound accents |
| Story | `storytelling_comeback_v1@1.0.0` | Hope/struggle/journey/payoff footage, optional source narration, closing words and music |
| Motion typography | `kinetic_pressure_v1@1.0.0` | Nine actual action/detail cuts with five separately editable, timed word reveals and sound |
| Educational/creator | `creator_action_edit_v1@1.0.0` | Unstructured source followed by a preparation/process/result demonstration |

Every family has a second arrangement. Six signature examples have native moving
exports; the alternate arrangements are checked through the canonical/compiler/
Director tests and normal panel selection, rather than six additional renders. Sources, in-points, spoken out-points,
copy, aspect, focus, captions, motion and sound remain editable. Optional assets
stay optional. Spoken range changes move downstream decisions; they do not
speed up speech to fit a preset. Each selected duration resolves once to 24 fps.
The Director button prepares the same project for explicit review/application.
Audience, promise and recommendation signals are metadata for a future semantic
recommender; no automatic footage understanding is claimed.

## Actual native films

The selected film, matching complete Studio playback, portable backup and exact
receipt for each family are listed below after final verification. All initial
six exports already have independent full decode, native complete timeline
playback, exact cold recovery and fresh independent backup restore. Correction
copies retain their earlier movies and projects rather than replacing evidence.

<!-- verified-films -->
| Family / duration | Moving film | Complete Studio recording | Editable project |
| --- | --- | --- | --- |
| Podcast · 22.5833s | [Watch](proof/podcast-complete-question/review.mp4) · [Native master](proof/podcast-complete-question/final.mp4) | [Timeline + full playback](proof/podcast-complete-question/edited-in-studio.mp4) | [Backup](proof/podcast-complete-question/podcast-complete-question.autopromote.json) |
| Interview · 17.25s | [Watch](proof/interview-refined/review.mp4) · [Native master](proof/interview-refined/final.mp4) | [Timeline + full playback](proof/interview-refined/edited-in-studio.mp4) | [Backup](proof/interview-refined/interview-refined.autopromote.json) |
| Cinematic · 14s | [Watch](proof/cinematic/review.mp4) · [Native master](proof/cinematic/final.mp4) | [Timeline + full playback](proof/cinematic/edited-in-studio.mp4) | [Backup](proof/cinematic/cinematic.autopromote.json) |
| Story · 16s | [Watch](proof/storytelling-refined/review.mp4) · [Native master](proof/storytelling-refined/final.mp4) | [Timeline + full playback](proof/storytelling-refined/edited-in-studio.mp4) | [Backup](proof/storytelling-refined/storytelling-refined.autopromote.json) |
| Motion typography · 10s | [Watch](proof/typography/review.mp4) · [Native master](proof/typography/final.mp4) | [Timeline + full playback](proof/typography/edited-in-studio.mp4) | [Backup](proof/typography/typography.autopromote.json) |
| Creator / educational · 14s | [Watch](proof/educational/review.mp4) · [Native master](proof/educational/final.mp4) | [Timeline + full playback](proof/educational/edited-in-studio.mp4) | [Backup](proof/educational/educational.autopromote.json) |

All six selected masters pass complete independent decode, exact delivery frame
count and picture/audio clock checks. Their canonical project hashes match the
owned render receipts. All six selected backups restore exactly in a fresh
signed-in browser. The podcast uses its full reaction and closing question;
the story uses the intended 8.69-second narration in-point and 49.13-second
closing words. The retained [movie manifest](proof/selected-movies.json) records
exact master/project hashes, frame counts, dimensions and editable cut counts.
<!-- /verified-films -->

Proof files contain private source/project information and remain locally ignored.
No signed URLs or authentication sessions belong in a published report or commit.
The native AAC movie is the master. An optional IDE review copy changes the audio
codec only and verifies that every H.264 picture packet remains unchanged.

## Repairs required by real use

- Preserve imported caption speaker/language/translation/review metadata so
  ordinary caption gates work. Reopening restores cues once per source;
  switching a source/project clears unrelated imported speech.
- Give every new authored framing mark an independent identity. Older saved
  marks remain selectable without changing their graph until edited. A native correction
  changes only the selected mark, and Undo restores it.
- Accept paused framing-seek options without assigning an object as the active
  inspector tool. Clicking a framing mark keeps its controls available.
- Renew owned source access before CPU face/camera analysis reads saved media.
  Cancellation and project-change checks still reject stale results.
- Resolve custom spoken intervals to the delivery frame grid once, preventing
  independent source-segment rounding from shortening the final picture.
- Resolve sequential camera intervals on one global delivery grid. The reproduced
  355-frame result for a 353-frame edit is retained; the corrected native result
  contains exactly 353 frames. Single-frame intervals also retain their display
  duration at 60 fps. A real moving-video regression covers fractional
  camera boundaries, frame count, duration and complete decode.

Normal **Reframe → Follow existing camera cuts** reuses the existing CPU detector.
It follows a foreground face rather than identifying the speaking person. Review
all cuts; if the initial face is missed, add a manual starting correction. Source
camera changes and template source cuts are separate editable decisions.

## Validation and limits

- 56 existing/new template, registry, canonical/Director and recovery tests pass.
- 3 template-panel tests pass, including explicit Director application and
  source-caption recovery/isolation.
- 5 focused real-editor regressions pass for source renewal, existing analysis
  paths and paused framing-key selection. Other editor cases were not rerun.
- 65 worker tests plus 23 subtests pass, including real moving FFmpeg outputs.
- The compiled hook library is 327 px wide with zero clipped inputs at 1600 px.
  Expanding it reserves readable rail space; closing it restores the usual layout.
- Strict normal frontend build passes and verifies the 19 inherited welcome
  assets. The shared Director bundle matches its browser sources.
- 17 product-knowledge tests, generated documentation checks, frontend lint and
  the five-authority record validator pass.

These counts describe the commands retained in `proof/`; they are not a claim
that the repository-wide emulator suite was executed. Failed source/build/QA
attempts and rejected framing/timing/narration takes remain alongside the fixes.
Early observer failures included an accidentally imported QA helper that changed
expected export dimensions, a backup restore that had not opened the restored
project, and a seek that had not selected the next source occurrence.

Technical export success is distinct from human creative/listening approval.
The conversation source is a biographical introduction; the example does not
manufacture a provocative revelation or an unrelated reaction. The stock action
and kitchen footage are editorial assemblies, not proof of one continuous bout
or one restaurant service. Existing source provenance is retained. Imported
English cues are the retained reviewed translation, not newly inferred dialogue.

Whole predictive picture/sound/colour/edge/low-alpha parity, broad media and
latency qualification, shared S02/S04/S03 gates and professional/public-showcase
approval remain open. Browser screen captures are below the movie's 24 fps and
do not establish playback smoothness. Twenty-one paused Live Edit/final pairs verify their actual native
source and output clocks (no fitted offset, no new render). Maximum measured
source error is 0.000001s and final-file error is 0.000001s. They are
review evidence, not a full pixel or listening qualification. No readiness count
is promoted: 17 FUNCTIONAL, 9 PARTIAL, 1 BROKEN, 2 UNIMPLEMENTED, 0 PRO-READY,
0 PRODUCTION-READY.

## Isolation

No merge, push, deployment, publication, paid generation or GPU execution.
Publisher, Queue, subscriptions, credits and advertising implementations are
unchanged by this feature. The user's normal App/API/CPU worker and saved login
are preserved. Corrected native exports were made through a separate local authenticated API
and CPU worker on 5118/8020. Those temporary QA servers are now stopped; the
original App/API/CPU worker remain available. The isolated candidate frontend is separate from the
user's installed App. Storage currently permits the `http://localhost:5000`
origin. The rejected separate-port preview cannot read those media sources; no
cloud CORS setting was changed. Native QA uses that existing allowed origin on
a separate loopback host. Do not describe port 5166 as a working media preview. Existing production work and other active services remain.
