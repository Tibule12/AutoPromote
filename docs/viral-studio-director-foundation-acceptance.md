# Viral Clip Studio Director foundation — acceptance receipt

**Status: COMPLETE against the original 14 foundation acceptance criteria, 30 September 2026.** This receipt closes the safe foundation requested in the original brief. It does not qualify the full AI Director, L4 acceleration, or pixel-perfect parity across renderers. No production deployment was performed.

Follow-up review found four correctness defects in this accepted foundation. Their fixes and regression coverage are recorded in [Director foundation review fixes](viral-studio-director-review-fixes.md); the measurements below describe the original acceptance run.

## A–C. Branch, commits, and files

- **A. Branch:** `agent/viral-studio-director-foundation`.
- **B. Commits:** 32 implementation and documentation commits from `413294a4` through `aeae445d`, followed by this acceptance receipt. The exact implementation sequence is available with `git log --reverse --oneline 413294a4^..aeae445d`.
- **C. Files:** 54 added or changed implementation, documentation, fixture, and test files in that sequence. The exact manifest is `git diff --name-status 413294a4^ aeae445d`. Principal boundaries are `studioTime.js`, `studioProjectDocument.js`, `studioCommands.js`, `studioRenderCompiler.js`, `studioCapabilities.js`, `studioSemanticTimeline.js`, the Director proposal/review modules, the authenticated project revision and evidence services, the Studio controller integration, linked-timing fixtures, and paired Node/Python/Playwright tests. No Cam Combiner file differs from `main` on this branch.

Implementation commit IDs, in order:

```text
413294a4 0610fa8f dd9f6895 23a2fd46 ac0f7414 66b745fd 82b126b3 0ff557c1
3c99050c 21ccf67b 9d855373 45c6f704 2314bd54 47cd74f9 c3686655 94043486
82324720 421de63a 831a1f89 3a298d24 e4f090a6 4fe44369 094591aa eb8acb8d
3d9fbbbf 30f00ebe a803de99 be255e77 3ffdaaf8 7af64253 50a326fc aeae445d
```

## D–L. Delivered foundation

- **D. Speed-plan defect:** Re-running the pre-fix `buildSpeedSegmentsFromKeyframes()` on 20 alternating 1×/2× linear keys over 76 seconds produced 233 merged segments ending at **30 seconds**. The current function produces 223 merged segments covering **76 seconds**. It reserves every key boundary, distributes optional samples over the whole duration before emission, merges equal-rate neighbors, and fails explicitly if mandatory boundaries exceed the 240-segment budget. Regression tests cover short and long plans, uneven keys, edge boundaries, merging, and the two-hour project boundary.
- **E. Time model:** A 90 kHz integer clock and half-open ranges distinguish source, programme, clip-local, and post-speed output time. The kernel models duplicate clip occurrences, source/programme maps, speed partitions, freeze/reverse semantics, caption mapping, and exact frame/audio rounding. Destructive edits on unsupported reverse/freeze paths fail explicitly.
- **F. Document:** A versioned canonical document adapts existing browser snapshots incrementally. It records immutable source references, occurrences, typed layers, audio/timing references, locks, style and semantic artifact references, revision/journal/idempotency data, and compatibility facts. Heavy word, track, matte, waveform, and depth payloads remain outside the document. Authenticated Director review now registers a bounded, owner-scoped canonical revision before a decision.
- **G. Commands:** The headless executor validates, resolves, dry-runs, and atomically applies `split_clip`, `trim_clip`, and `preserve_range`. It checks base revision, target/source preconditions, locks, capability, and idempotency, and records read/write sets and inverse data. Stale or conflicting operations fail without a partial edit.
- **H. Human/AI equivalence:** The existing **Split current clip**, **Trim start to playhead**, and **Trim end to playhead** UI actions use the same command executor as programmatic calls. Mounted tests compare their canonical results; there is no AI-only timeline or DOM click path.
- **I. Capabilities:** The versioned registry marks split, trim, and preserve-range foundation state as exact; remove-range, reframe, captions, titles, B-roll, ducking, motion, speed, Creator FX, and 3D scenes as approximate where preview/final behavior differs; and 3D audio reactivity as unsupported for final rendering. Entries carry execution paths, limits, resources, compatibility, and evidence suites.
- **J. Semantic timeline:** Versioned records distinguish utterances, words, voice clusters, visual tracks, associations, shot/scene boundaries, audio/prosody/OCR evidence, hypotheses, chapters, coverage, uncertainty, provenance, and verification. Cache keys include source content hash, analysis type, model revision, and config revision. A voice cluster is not treated as a visible person or an identity.
- **K. Conformance:** Synthetic timing fixtures and paired frontend/Python tests compare canonical sequence and timing with browser preview mapping, render payload, and worker interpretation. Coverage includes duplicate occurrences, linked trims, captions, cuts, long speed ramps, and changed render ranges. The full-minute real-media Playwright case passed.
- **L. 3D parity:** Shared pose fixtures test browser/Blender numeric motion. Audio-reactive intensity, opacity/fade, light direction, font family/weight, and related fields are classified by actual support in the field matrix. This is a classification and numeric-pose foundation, not pixel parity or an HQ/GPU claim. JSON and owned-artifact boundaries remain in force.

## M–N. Current verification and limits

| Check                                                                                               |                                                                                                                                 Result |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------: |
| Studio frontend broad run                                                                           | 32 suites; 244/245 initially; the sole outdated rejection-revision assertion was corrected, and its affected suite passed 3/3 on rerun |
| 3D frontend panel                                                                                   |                                                                                                                                  10/10 |
| Cam Combiner frontend regressions                                                                   |                                                                                                                  27/27 across 5 suites |
| Relevant Node backend, including project revisions, source evidence, media tracking, and 3D service |                                                                                                                  70/70 across 6 suites |
| Python worker source-shot, trim timing, and focused render contracts                                |                                                                                                                                  20/20 |
| Python Cam Combiner contract                                                                        |                                                                                                                                    8/8 |
| Browser/Blender numeric pose fixture                                                                |                                                                                                                                    1/1 |
| Production frontend build and touched-file ESLint                                                   |                                                                                                                                 passed |
| Full-minute real-media Playwright                                                                   |                                                                                                                                    1/1 |

The complete frontend set was not rerun after changing that one test expectation; its affected suite passed after the correction. The full monorepo suite, the ten-minute playback audit, real Blender pixel output, and L4 qualification were not run for this acceptance gate. The latter GPU/pixel checks are separate workstreams in the original brief. System Python lacks the required worker packages; the project worker virtual environment ran the available Python suites.

## O–P. Remaining scope

- **O. Foundation blockers:** None against the original 14 criteria. The registered document is an authenticated browser submission, and the preview fingerprint is still computed in the browser. The foundation does not claim independent proof of browser state, automatic editing, renderer pixel parity, or GPU qualification.
- **P. Optional next phase:** A trusted server-side command kernel could recompute the proposed result from the registered document and check the preview fingerprint before recording a review. This is separate from foundation acceptance. Human approval and automatic-application restrictions remain.
