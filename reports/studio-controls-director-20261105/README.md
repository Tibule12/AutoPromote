# Reframe, Moments and Director — control audit

Started 5 November 2026, continued 6 November. Isolated branch `qa/studio-controls-director-20261105`, baseline `631afd850462c3d66b11eae09a62cc1e4fd3da56`.

**The approved controls/Director release `15c5c1d908d0af8d37118e077b1b33eeb3cf7fe4` is on main and verified live on 6 November.** Native live verification completed thirteen real CPU exports and the authenticated Director review flow. Final frame inspection found an additional render-runtime defect; it is reproduced and repaired locally, with the worker follow-up still awaiting its release verification. The owner authorised using the existing login and ordinary QA credits. No publishing, scheduling, subscription, role, Rules or GPU change is part of this work.

## Verification after deployment — 6 November

The public frontend and both API origins report `15c5c1d9`; the API authority policy remains `security-owner-bootstrap-20261027` and ads.txt stays exact. All twelve listed GitHub Actions runs on that revision completed successfully, including the Emulator Unit Tests, CodeQL, Semgrep, browser E2E, frontend build and backend deployment. The original saved-session file remains byte-for-byte unchanged. [Origin/security checks](evidence/deployed-20261106/deployed-origin-checks.json), [Actions](evidence/deployed-20261106/actions-status.json).

| Actual live workflow | Result |
| --- | --- |
| Repaired controls | 24 rapid frame steps reach exactly 0.8s; manual/top/bottom timestamp selections retain their inspectors; near-zero framing keeps its mandatory zero cut. |
| Moments | Native range creation, selection, ordinary preview, save and cold reopen pass. The subsequent final export range is 0–3.260411s. |
| Four output formats | 9:16, 4:5, 1:1 and 16:9 each export, settle normally, download and finish native playback; each has 78 picture frames at 24fps and audible decoded samples. |
| Show Everyone and cameras | One-source Show Everyone plus all seven two/three/four-camera layouts export and complete playback. Labelled generated camera inputs qualify layout/routing, not real-shoot synchronization or speaker identity. |
| Finished output recovery | The same completed stack output cold-reopens and downloads with its original hash, without another render. Ordinary mid-play Pause is stable; natural completion holds at the end. |
| Director | Real CPU analysis supplies the 4.7s/5.2s choices. Selection invalidates the earlier review. Authenticated server Reject leaves ranges unchanged; fresh exact Approve creates one split at 4.7s. Its two source ranges cold-reopen exactly. |
| Director-approved export | The real 12s export settles once, downloads and plays fully. Its server hash matches, but its picture track has **287 frames rather than 288**; it is not qualified as frame-accurate. The runtime repair below remains separate. |

All thirteen downloaded SHA-256 values match their authenticated completed job records. Normal charges total **65 credits**, taking the actual editing balance **374 → 309**. No new credit grant, balance reset, subscription change or billing bypass occurred during these checks. Both earlier pre-release failed exports remain refunded.

The initial camera upload observer timed out before uploads finished; subsequent native reopening found the four ready sources. The first stack pause assertion toggled near its final frame; the exact same file passed mid-play Pause and natural-end hold without rerendering. The first Director observer inspected the wrong journal nesting; the genuine server rejection had already succeeded and its recovered record passed. These failed observations remain retained, separate from the genuine picture-clock defect. Server review references establish authenticated records; the local client journal is not an independently signed settlement proof.

[Thirteen exports and matching hashes](evidence/deployed-20261106/thirteen-live-exports.json), [all browser attempts](evidence/deployed-20261106/live-browser-attempts.json), [video/audio decode checks](evidence/deployed-20261106/final-media-validation.json), [verification summary](evidence/deployed-20261106/live-summary.json).

## Additional worker repair from live verification

The deployed worker image uses **FFmpeg 7.1.5**. Replaying the exact owned source/edit locally with its verified base/system runtime reproduces the 287-frame output. The first 113-frame source segment reports only 4.666667s instead of 4.708333s because its last packet lacks a complete duration. Concat then advertises an incorrect programme rate, so timed framing and final delivery lose one picture interval. Local FFmpeg 6.1 and 8.1 did not reproduce this; their earlier passes were insufficient runtime coverage. The defect affects shared fractional source-cut assembly, not only Director.

The canonical sequence now gives non-reordered source segments and their copy mux explicit CFR packet durations, reusing the existing packet-clock helper. The exact replay retains **288/288 frames and 12.000000s** throughout assembly, framing and final delivery. Three actual-render regressions cover 24/25/60fps, assert intermediate duration/rate, final frame count and full audio/video decode, and forbid network/cloud writers. All pass with the deployed FFmpeg runtime. The targeted host worker run passes **21 tests plus 2 subtests**. The immutable-image predeployment gate now includes these regressions; the full new container gate and repaired live export are still pending.

Only base/system image layers were read to obtain the exact local FFmpeg runtime; no application/model image was deployed or cloud job started for diagnosis. Its original failing replay, corrected movie, native edit/backups and recordings remain private. [Runtime repair evidence](evidence/deployed-20261106/packet-clock-repair.json), [before](evidence/deployed-20261106/packet-clock-before.json), [after](evidence/deployed-20261106/packet-clock-after.json).

## Live observations before repairs

Ordinary native controls were exercised in a headless, muted browser using a separate QA project and the owner's real session. The original user's browser/project library was not imported into or edited by this QA browser. Source upload and CPU analysis used the real API. Constructed camera signals qualify layout transport, not a synchronized real shoot or speaker identity.

- Reframe: on/off, four aspects, solo zoom/picture fill, framing correction axes and cut/smooth, speaker shortcuts, correction removal, playback/pause, single-source split anchors and tracking-point editing/clearing, timed speaker order and landscape fitting.
- Cameras: all seven compositions, each active panel's horizontal/vertical/zoom endpoints, divider/gap, four reaction corners/size, source routing, duplicate-source exclusion, offset/sync invalidation, focus add/remove/clear, reset and unused-reference removal/Undo.
- Moments: native trimming and named-range creation, duplicate guard, switching to original and back, playback, hook/Undo, Cut entry, lock protection, save and cold reopen. The final persistent run passes range switching, playback and reopen after decoder readiness.
- Actual CPU source-shot analysis returned 26 keys and cuts at 4.7/5.2s. Anchored/split analysis safely reported insufficient faces for the selected regions; this is not successful simultaneous two-face tracking.

Confirmed failures before repair:

1. Framing, split-tracking and reviewed-speaker timestamp buttons supplied an options object as an inspector tool identifier, replacing the inspector with an empty panel.
2. Twenty-four rapid transport ArrowRight presses advanced 0.2s instead of the requested 0.8s at the default 30fps. Decoder/clock paints overwrote the next keyboard gesture's starting position.
3. A framing decision at 0.033s could omit the required zero-second cut. Two real CPU exports failed with `The framing timeline needs a cut at 0 seconds`. Both server records confirm failure/refund; balance returned to 374. At that pre-release checkpoint, other live export combinations were blocked by this common preflight defect. The deployed follow-up results are recorded above.
4. Choosing a two-camera composition did not record a timed `group_stack` mode, so an existing Solo cut could leave that layout inactive. This was reproduced live, failed a new regression, and now commits the composition at the actual playhead.
5. Camera copy promised twelve angles although the shared bank limit is eight. The live bank correctly stopped at eight; the limit is preserved and copy is corrected.

The 390px app deliberately presents its existing desktop-editor notice instead of Studio controls. This task does not claim a fully usable mobile Studio or remove that product restriction.

A workstation restart destroyed the first `/tmp` audit recordings/backups. Retained observations are distinguished from subsequent persistent evidence. Initial UI observer failures caused by premature upload checks, an incorrect 25/75 preset expectation, automatic four-camera selection, URL refresh differences and missing saved-range preconditions are not counted as product defects. Saved source bytes were recovered exactly by SHA-256; all subsequent evidence is under the access-restricted `~/.local/share/autopromote-qa/studio-controls-director-20261105/`.

## Test funding

A single tagged 200-credit grant was committed atomically at `2026-11-05T18:12:44.926863Z`: the owner's Studio top-up field changed 39 → 239, with matching grant/audit records. The separate pre-existing payment mirror stayed 300; no reconciliation, subscription change or global bypass occurred. Actual total editing balance was 374. Both failed render attempts refunded normally. An independent post-interruption read confirmed the grant without repeating it.

The historical 39/300 authority disagreement remains a separate financial risk; mirrors must not be summed or maximized to reconcile them. Grant metadata and private receipts contain account identifiers and are excluded from committed evidence.

## Local repair and verification

The new failing regressions were retained before repair. Final checks:

| Check | Result and scope |
| --- | --- |
| Full-editor targeted regressions | **11 passed**: Moments selection/save, native clock, framing timestamps, zero-origin/legacy export, shared bank limit and composition selection. |
| Playback clock/range and camera groups | **14 passed**; rapid stepping is also verified in the actual local browser. |
| Director proposal/review/source/revision libraries | **33 passed**, including evidence rejection, bounded/deduplicated candidates and one-operation preview. |
| Server review/source ownership/replay | **28 passed**, using isolated in-memory test doubles; no cloud records seeded. |
| Canonical Python worker | **16 passed plus 2 subtests**; CPU only. |
| Actual local App | Rapid24-frame stepping, all three timestamp paths, zero-origin native export-plan capture and Director selection/re-review passed in a private headless/muted browser. The locally built files were served only to that browser; they were not published. Production rendering writes were blocked. |
| Local canonical renders | **12 decoded outputs**, 87 frames each at 24fps: four aspects, one-source Show Everyone and all seven camera layouts. These exercise canonical worker components, not the complete cloud API/export-receipt chain. |
| Welcome/help preservation | **8 anonymous viewport comparisons passed**, exact welcome text/links/media and no overflow; normal real-login help opened/closed without a question. |
| Build/static/records | Separate candidate and baseline production builds, targeted lint (including installed hooks plugin), whitespace and Studio contract validation passed. |

This is **102 distinct focused tests**, plus the two Python subtests and separate browser/render checks. The broad full-editor run was stopped after more than 18 minutes in an SFX test; that test passes independently against both baseline and candidate. Full-suite CI remains unqualified. The initial editor lint command lacked the repository's existing hooks-plugin registration; loading the installed plugin passed without changing project lint policy.

The exact near-zero preflight failure now rejects the original captured plan and accepts the repaired native plan. The 12 local component renders consumed about 131.95 CPU-seconds and 44.09 wall-seconds in aggregate, including decode/probe overhead under local contention. This is not cloud cost/pricing evidence. Outputs and native QA recordings/backups stay private.

[Check summaries](evidence/checks.json), [all persistent browser attempts](evidence/browser-validation.json), [local render measurements](evidence/local-render-results.json), [preflight comparison](evidence/preflight-local.json), [welcome comparison](evidence/welcome-preservation.json), [source preservation](evidence/source-preservation.json).

## Director continuation

The existing Director now offers up to 64 distinct eligible detected-cut choices instead of exposing only the nearest cut. Each choice previews the matching source frame, clears the previous prepared review and requires a fresh exact review before the existing single-operation approve/reject flow. Source/hash/artifact binding, stale project checks, server reviewer identity and replay protection remain mandatory. Selecting or previewing a cut does not split the timeline, award credits, write a production review or request generation.

The actual local App browser verified choosing 4.7s/5.2s cuts, seeking 5.2s, removing the old approval action and reopening the exact 468000-tick review with unchanged source ranges. This browser used an explicitly controlled analysis response; it is not Google/provider evidence or a new real inference qualification. Existing actual live CPU analysis is recorded separately above. Choices are session-local and analysis must be rerun after cold reopen. This remains a bounded source-cut assistant, not unrestricted natural-language editing, whole-film directing or generation.

## What remains before production qualification

- Release and verify the additional packet-clock repair through the immutable worker-image gate; repeat the exact twelve-second native Director export, server hash, 288-frame check and complete finished playback. The deployed control fixes already pass their scoped live checks; this new worker defect remains live until that follow-up completes.
- The previously interrupted broad local editor run is retained. Released CI passes, but it does not retroactively turn that SFX-stalled local attempt into a passing full-suite run.
- Real two-person anchored tracking with suitable footage, broader source cuts/retiming/compositions, complete picture/audio/colour/edge parity and human listening remain open. The 390px desktop-editor restriction is unchanged.
- Director choices are session-local and require analysis again after cold reopen. This qualifies one authenticated source-cut proposal/review/apply/export flow, not autonomous whole-film directing, unrestricted natural-language editing or generation.

Historical balance/session risks and the seven incident test documents remain separate and unresolved. No incident cleanup, subscription change or security rollback occurred. Formal Studio readiness counts remain unchanged.

Reproduce focused tests with the existing installed dependencies (no installation/cloud seed needed):

```sh
# From frontend/, using the existing node_modules for this worktree:
CI=true node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand \
  --runTestsByPath src/components/__tests__/ViralClipStudio.test.js \
  --testNamePattern='source-shot analysis offers|Moments selects|Moments saves|Reframe mode switches|native playback advances|choosing a camera composition records|split tracking timestamps|legacy late-first|framing timestamp selection|near-zero framing|shared eight-angle'
# From repository root with the existing CPU Python environment:
python -m pytest python_media_worker/test_studio_reframe_cuts.py python_media_worker/test_studio_reframe_clock.py -q
node test/e2e/validate-studio-contract.js
```


No claim of universal Studio functionality, whole picture/audio parity, creative approval or PRO/production readiness is made.
