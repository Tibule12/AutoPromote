# Director-driven Reframe and Moments

8 November 2026 · `feat/director-reframe-moments-20261108` · continues `ad3ce5e5` and the existing Director save/recovery foundation. Local development only. No push, merge or deployment.

Director now has two additional editing paths through the existing Studio command, review, history and render systems:

| Workspace | Result |
| --- | --- |
| Reframe | **Director: propose tracked framing** requests the existing source-shot analysis and proposes an occurrence-bound face-follow path. It is reachable while Reframe is off. The edit, grade, frame, captions and sound remain unchanged before approval. |
| Moments | **Director: prepare strongest available moment** ranks existing source-bound suggestions and proposes one retained range. A single reviewed trim can remove both ends while retaining the original media and applying the existing linked-timing ripple. No candidate is invented when none fits. |

Both paths use the current revision, source identity and normal signed-in review. They support the existing Save/autosave, backup, cold recovery and Undo/Redo. Pending requests remain drafts; approvals are never restored automatically. Existing split proposals, manual controls, saved projects and render paths remain available. No other editing engine or wallet was introduced.

## Trust and recovery

The server checks a Reframe proposal against the owner's immutable source-shot artifact, source binding and **exact stored worker-result SHA-256**. It rebuilds the proposed tracking operation and replays the same command kernel used by the browser. Replacing both the submitted tracking result and its command still fails the stored hash check. A local hash or browser completion claim cannot create an owned artifact.

Tracking points retain source coordinates and source ticks. They are converted through the existing crop/interpolation functions into canonical programme keys. The original source's loaded dimensions are required; dimensions from an already rendered output are not used as a fallback. Camera cuts remain cuts. Neighbouring keys/modes are preserved, and a multi-clip command cannot change the project's existing zoom/aspect. Preserved ranges and track locks remain enforced.

The native browser run exposed a real recovery discrepancy: an explicit default `zoom: 1` was dropped by the editor's mode-cut normalizer during Redo. The command now emits the existing normalized representation, and a focused regression checks that the approved framing state survives Redo exactly. The failure, screenshots and recordings remain retained. A separate browser precondition initially reselected the already selected source, which intentionally preserves its trim; selecting the saved range and then the original source corrected that test setup without changing that behaviour.

## Verification

Final results are recorded in [validation](evidence/validation.json). **153 targeted tests passed** (110 graph/Director, 32 server, two selected actual-editor cases and nine CPU worker checks). The strict frontend build, generated-kernel source check and full media decode pass. The other 176 editor cases were skipped in the selected run, not claimed as passing. Tests run locally; database/provider boundaries in server unit tests are mocked. The broader whole-editor suite is not represented as passing.

The actual built App runs headless and muted using the already authorised login in disposable browser contexts. Production mutations and export submissions are intercepted. Source resolution/preview uses the existing authenticated read paths. Browser analysis replays a previously captured actual result; review responses are test fixtures. These are not new production reviews, fresh detector executions or verified cloud-provider jobs.

The combined native flow checks: request from Off → unchanged unapproved edit → Save/cold reopen → fresh review → approval → exact Undo/Redo → cold recovery → advancing playback controls → an owned saved moment → one reviewed two-edge trim → Undo/Redo → cold recovery → native export compilation. The Moments browser candidate is authored through normal Cut/Save moment controls as a QA precondition; the run does not claim new model discovery or creative quality.

The exact captured export request was rendered through the canonical Python CPU renderer locally, with cloud/network writes blocked. The finished **720×1280 / 24 fps / 167-frame** movie retains its requested **6.951556-second** source range, with video duration rounded to **6.958333 seconds**, within one frame. Full video/audio decode, an independent exact backup restore, native download of identical bytes and complete finished playback passed. Movie SHA-256: `eee718b2ccd26c70528a0d57c4bd3d11925c9d48501b087be54a5b3915531401`. Four retained picture samples include the original brief room cut; they do not establish continuous picture/sound or listening/creative approval. Private originals, recordings, failed observations, backups and raw payloads stay under `~/.local/share/autopromote-qa/director-reframe-moments-20261108/`; authenticated state and signed media URLs are excluded from committed evidence.

## Training and remaining limits

This extends Director's executable actions and structured review history. It does not run model fine-tuning or establish improved editorial judgement. Automated QA approvals are not human preference labels. Genuine owner reviews/corrections and held-out evaluations are still needed for any learning claim.

The first tracked command supports one forward occurrence at its original programme rate, two to 128 source points, zoom 1–1.5×, complete selected-range analysis, no decode failures and at least 65% sampled coverage. Coverage is not model confidence or proof of continuous face visibility. The detector follows the foreground face; it does not identify a person or establish who is speaking. Larger tracking results require a shorter analysis range. Existing manual higher zoom and multi-camera controls are preserved; they are not new Director commands.

Moments requires an existing owned candidate contained in the current source range. Scores remain hints. Whole-film semantic planning, generated layer/audio/effect operations, unrestricted media/retiming, multi-user conflict qualification and general predictive picture/sound parity remain open. The review shows canonical timing and tracking coordinates; full moving pre-approval picture qualification remains separate. Do not treat this bounded delivery as whole-Studio, professional or creative approval.

Firestore/Storage Rules, authentication authority, analysis artifact/binding services, worker source, billing, subscriptions and payment writers retain their base source. No production credit grant, balance migration, price change, advertisement, publishing action, Cam Combiner change or cloud/GPU job launch was performed. Historical security/balance/session follow-up remains open. Formal readiness counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY.

Before an approved rollout, integrate/review the exact candidate against current main and release the compatible API/replay kernel with the frontend. Older APIs reject the new operations; the client must not fall back to unreviewed application. Fresh account-bound provider qualification follows that approved release. Continue owner-reviewed examples and bounded manual corrections alongside shared S02/S04/S03 work.
