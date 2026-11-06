# Reframe, Moments and Director — control audit

Started 5 November 2026, continued 6 November. Isolated branch `qa/studio-controls-director-20261105`, baseline `631afd850462c3d66b11eae09a62cc1e4fd3da56`.

The live audit is recorded and the reproduced issues are repaired locally. No new source has been pushed, merged or deployed. The owner authorised live testing with their existing login and additional test credits. No publishing, scheduling, subscription, role, Rules or GPU change is part of this work.

## Live observations before repairs

Ordinary native controls were exercised in a headless, muted browser using a separate QA project and the owner's real session. The original user's browser/project library was not imported into or edited by this QA browser. Source upload and CPU analysis used the real API. Constructed camera signals qualify layout transport, not a synchronized real shoot or speaker identity.

- Reframe: on/off, four aspects, solo zoom/picture fill, framing correction axes and cut/smooth, speaker shortcuts, correction removal, playback/pause, single-source split anchors and tracking-point editing/clearing, timed speaker order and landscape fitting.
- Cameras: all seven compositions, each active panel's horizontal/vertical/zoom endpoints, divider/gap, four reaction corners/size, source routing, duplicate-source exclusion, offset/sync invalidation, focus add/remove/clear, reset and unused-reference removal/Undo.
- Moments: native trimming and named-range creation, duplicate guard, switching to original and back, playback, hook/Undo, Cut entry, lock protection, save and cold reopen. The final persistent run passes range switching, playback and reopen after decoder readiness.
- Actual CPU source-shot analysis returned 26 keys and cuts at 4.7/5.2s. Anchored/split analysis safely reported insufficient faces for the selected regions; this is not successful simultaneous two-face tracking.

Confirmed failures before repair:

1. Framing, split-tracking and reviewed-speaker timestamp buttons supplied an options object as an inspector tool identifier, replacing the inspector with an empty panel.
2. Twenty-four rapid transport ArrowRight presses advanced 0.2s instead of the requested 0.8s at the default 30fps. Decoder/clock paints overwrote the next keyboard gesture's starting position.
3. A framing decision at 0.033s could omit the required zero-second cut. Two real CPU exports failed with `The framing timeline needs a cut at 0 seconds`. Both server records confirm failure/refund; balance returned to 374. Other live export combinations are blocked by this common preflight defect and are not reported as passing.
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

- Review and explicitly approve a named push/merge/deployment of this isolated repair. Then rerun the ordinary live render → settlement/refund → private output → download → complete matching finished playback on that exact revision. Current production still contains the observed defects.
- Finish full-suite order-sensitive SFX diagnosis; passing focused tests does not qualify the stalled broad run.
- Real two-person anchored tracking with suitable footage, broader source cuts/retiming/compositions, complete picture/audio/colour/edge parity and human listening remain open. The 390px desktop-editor restriction is unchanged.
- Director's unchanged server approval protocol has regression evidence, but no production approval was submitted for the new choices. No autonomous multi-operation edits or live provider/Google ad rewards are enabled.

Production frontend/API still reported `631afd850462c3d66b11eae09a62cc1e4fd3da56` at 03:06:33 UTC on 6 November, with the repaired security policy and exact ads.txt retained. Firestore/Storage/auth/backend worker sources match the baseline. Historical balance/session risks and the seven incident test documents remain separate and unresolved. No cleanup, production feature deployment, subscription change or security rollback occurred.

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
