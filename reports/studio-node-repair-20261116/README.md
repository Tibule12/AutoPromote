# Node Flow repair — 16 November 2026

The two remaining measured Node Flow defects are repaired locally: all six fixed preview/render comparisons and all three native playback profiles pass on immutable client r9. This is bounded Node qualification, with no global Studio, production or creative readiness promotion.

## What changed

- Preserve verified original video for authored Studio sequences. The segment renderer owns delivery frame rate; an analysis CFR30/CRF23 proxy no longer changes the footage first. Accurate paused inspection uses the matching original-source clock, including fractional cuts and mixed source rates. Legacy source and 3D texture profiles remain supported.
- Convert Rec709 cICP-tagged PNG rendering copies to the browser's sRGB appearance, retaining alpha and leaving uploaded originals unchanged. Keep tone precision through saturation and bounded lossless crop/masked-grade intermediates before final authored delivery quality.
- Retain inline title-matte DOM, static processed media and viewer buffers. Cache monitor geometry and static masks. Newly mounted layers join the displayed picture clock immediately. Moving solo playback avoids a redundant canvas readback; paused inspection retains full detail.

## Fixed limits and results

The six programme frames are 6, 18, 30, 48, 72 and 90 at 24fps. Thresholds remain MAE≤3 and p95 channel error≤12, with no alignment or threshold fitting. MAEs are 2.652, 2.571, 2.705, 2.782, 2.612 and 2.971; p95 errors range from 6 to 9.

Playback is measured without recording. Limits remain wall-time ratio≤1.15, dropped video-frame fraction≤5% and maximum layer clock lag≤2 frames.

| Native project | Wall time | Dropped frames | Maximum layer lag |
| --- | --- | --- | --- |
| Base routing | 4.079s | 1/96 | 0 frames |
| Twelve-layer six-rig project | 4.088s | 2/94 | 0 frames |
| Six rigs with both Node viewers | 4.337s | 4/137 | 0 frames |

178 frontend cases/18 suites, 258 renderer cases/13 additional subtests, 19 actual source-frame service cases and 45 knowledge/help cases pass. Strict client build, eight baseline/candidate welcome checks and actual signed-in help pass. Native keyer edit/Undo, bypass/re-enable, both viewer assignments, all twelve authored layers, save and exact cold reopen pass. The new layer-mount, title-matte DOM-retention and original 24fps picture regressions reproduce their old failures before passing with the corrections.

The corrected four-second 720×1280/24fps film has 96 H264 pictures and non-silent 48kHz stereo AAC. All bytes decode independently. It is an unbilled canonical CPU diagnostic using the retained normal Studio request and exact owned source identities with renewed local access. It is **not a new native submitted/billed export**. The previous report retains seven succeeded native operations and their exact downloads; no new operation, financial settlement, grant or wallet reconstruction is claimed here.

Earlier failed builds, colour/source candidates, CPU profiles and observer/test-harness attempts remain in private evidence. The rejected title-resampling experiment was removed. No paid provider/GPU execution, production write, scheduling, publishing, push, merge or deployment occurred. Unrelated logo/vector/3D changes are preserved and excluded.

Formal Studio counts remain 17 FUNCTIONAL /9 PARTIAL /1 BROKEN /2 UNIMPLEMENTED /0 PRO-READY /0 PRODUCTION-READY. Historical strict typography13/16 and wider S02/S04/S03 gaps remain separate. Next work follows that shared backlog; these passed Node repair gates are no longer the blocker.

See [verification.json](verification.json) for exact measurements and retained evidence locations.

## Delivery and recovery

The corrected film, editable project, actual Studio control/full playback recording and preview are saved under `/home/tibule12/Videos/Studio Node Flow - Repaired - 2026-11-16/`. The successful native recording verifies normal film import and visible native playback through its real ended event; SHA256 matches the corrected film. Browser recording is muted and the separate final film contains sound. Earlier recording observers failed on serialized File markers, a collapsed media panel and native play-button coordinates; those attempts remain separate.

`private/checkpoint-final` retains complete Auth/Firestore/Storage metadata, original wallet/operation history, worker identity/requests/receipts and runtime configuration. It contains seven succeeded operations, zero failed operations, wallet balances0/1 and no held or active credits. The complete immutable client payload is retained in `private/client-r9`. No financial state was reconstructed or granted.

The successful control recording is35.76seconds and is also supplied as independently decoded H264 MP4. All owned local test services were stopped after the complete checkpoint. Final contract validation, source-lock/knowledge checks and diff checks pass.
