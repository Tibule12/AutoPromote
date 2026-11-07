# Director suggestions — save and recovery

7 November 2026 · `qa/studio-director-durable-suggestions-20261107` · based on `e6800b4f` (application source unchanged from deployed `ce82bb90`). **Local development only; no push, merge or deployment.**

Director's existing source-cut suggestions now survive normal Save, autosave, cold reopen and native backup/independent restore. The selected boundary and proposal/command identities remain stable. The implementation extends the existing project snapshot and command/review system; it creates no other editor or wallet.

## Behaviour

- A saved suggestion contains bounded source identity, timing and unreviewed requests. It contains no approval, reviewer, authentication or expiring media URL. Review preparation binds the current document again; approval still requires the existing authenticated server revision and owned-artifact verification.
- Restoring a project clears the old prepared review and invalidates in-flight analysis/selection/decision work. An earlier response cannot approve a newly restored edit.
- Changed sources, ranges, playback or project identity invalidate the draft. Malformed/oversized drafts are discarded without preventing access to the edit. Existing projects without this optional field still open normally.
- Duplicating a project preserves its edit/media but drops the original project's analysis suggestion. Rejected/consumed proposal IDs cannot reappear as approval-ready after recovery. Remaining choices still need fresh review.
- Suggestion selection/save does not become a timeline edit or consume Undo. Approving a split uses the existing canonical command, linked-timing projection and Undo/Redo. Once the original occurrence is replaced, the saved draft is removed.

## Verification

Detailed results and limitations are recorded in [validation](evidence/validation.json). The targeted editor test covers analysis → exact selected boundary → Save → cold remount → fresh review → approval → Undo/Redo → Save → export compilation. Existing server ownership/artifact/replay checks are retained.

The actual built App ran headless and muted with the existing saved owner login in separate disposable contexts. Native controls verified Save/cold reopen, independent backup restore, project copying, rejection/recovery, malformed-draft recovery, one approved split, Undo/Redo and export compilation. Production writes and paid rendering were intercepted. Analysis replay and review responses in these browser runs were **fixtures**, not new authenticated provider evidence. No cloud execution or production review is qualified by these responses.

The exact native export request also ran through the canonical Python renderer on local CPU with network/cloud writes blocked. Its output has **360 frames, 1080×1920, 30 fps, 12 seconds**, using source ranges `[0, 5.2)` and `[5.2, 12)`. All video/audio streams decode. Native Studio then downloaded identical bytes and played the complete finished movie with the same saved canonical document. Its completion transport was a local fixture backed by that actual CPU file; it is not a cloud job/settlement receipt.

Output SHA-256: `2f0b726ce6c003745c4a76ff86401e72dd71f1d9c2a635e98eab1589b834b712`.

Actual Studio authoring/finished-playback recordings, source backups, failed attempts, compiled requests, final movie and refreshed-session state remain in the access-restricted local evidence directory `~/.local/share/autopromote-qa/studio-director-durable-20261107/`. Authenticated state, signed media URLs and raw review payloads are excluded from committed evidence. Initial browser setup used the repository's older public Firebase configuration; the corrected build preserves the deployed public settings and original login. An initial capture waited for a literal backend error string instead of the native export request; that harness failure is retained. Early one-second DOM/async restore checks and the corrected regression results are retained separately.

## Preservation and remaining work

Firestore/Storage Rules, authentication authority, server review/binding/artifact/replay services and canonical Python renderer match the base source. Original saved-login hash is unchanged. No production balance, subscription, price, financial grant, advertisement, schedule, publishing, Cam Combiner or cloud/GPU workload was changed or started. The deployed Reframe/Moments repair remains in place. Existing historical security/session/balance follow-up and CodeQL #1227 are not resolved by this work.

Director remains a bounded, reviewed source-analysis editor. Whole-film semantic/story planning, generated layer/effect/audio commands, broader media, multi-user conflicts and the full Director → manual layer/audio editing combination remain unqualified. The local review/renderer fixtures do not qualify production provider recovery or settlement. Fresh account-bound production verification requires a separately approved release. Shared S02/S04/S03 picture/audio/colour/edge/ownership work and creative/listening approval remain open. Formal readiness counts are unchanged: 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY.

Next: review this candidate, then qualify its exact revision through an approved release; continue bounded Director/manual editing combinations before expanding supported commands. Do not interpret passing local tests as approval to deploy or as autonomous whole-video direction.
