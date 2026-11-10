# Studio Reframe and Moments — live owner-account check

5 November 2026 · Verified at 18:57 SAST · Source `f369520746c1d7a312c901e0f604067958f99501`.

The owner authorised using the existing saved login for live verification. Its genuine Firebase session opened the production application in an independent headless, muted browser. Only the authentication database was carried over; existing project databases, the running browser and the original saved session were left untouched. No password was read or requested.

| Live workflow | Result |
| --- | --- |
| Reframe | 4:5 aspect, left/right positions, smooth framing, Undo/Redo, native playback/position/counter/timeline movement, save and cold reopen passed. A normal production render produced a 720×900, six-second movie with audio; download and full decode passed. |
| Moments | Named interval, Undo/Redo, switching, preview, explicit live-edit trim, save and cold reopen passed. The selected source interval 0.398033–6 seconds survived reopening; the actual trimmed movie is 5.602 seconds, matching the 5.601967-second interval. |
| Finished playback | The actual Studio player advanced through the trimmed finished movie to 5.602 seconds, with the visible position at 100% and transport paused at its endpoint. |
| Billing | Three ordinary renders charged five credits each. An independent final GET confirms **189 → 174 credits**. Billing bypass was false. No balance was granted, corrected, reset or migrated. |

[Sanitised live evidence](evidence/live-verification.json) records output hashes, geometry, durations, playback samples and the final credit check. Private recordings, actual movies, native backups, failed attempts and refreshed authenticated test state are retained under `~/.local/share/autopromote-qa/live-studio-20261105/`, with restricted permissions. Credentials, capability URLs and personal identifiers are excluded from this report and shareable evidence.

The first Moments export used the full six-second source. It did not qualify a trimmed export. The corrected test explicitly selected Live Edit, verified the persisted trim before submission and completed one additional five-credit export. Earlier hidden-library assertions and a comparison that incorrectly treated refreshed signed-URL queries as source identity also failed; corrected checks compare the same owned source path and exact editing decisions. Those failures are retained privately rather than reported as product defects or passing checks.

This is one owner-account smoke test with a generated moving colour pattern and tone. It does not qualify real speaker/face identity, transcript accuracy, human listening, all footage/project combinations, ordinary free/subscriber accounts or whole preview/final colour/audio parity. Formal readiness classifications are unchanged. Shared S02/S04/S03 work remains open.

Two separately named QA projects were saved in the isolated test browser. The normal production upload/render paths created their owned test media and render/credit records. Existing user projects and the original saved login remain unchanged. No publishing, scheduling, subscription/price change, ad activation, credit migration, Rules/IAM modification, source-code release, push, merge or deployment occurred in this check.

Next: use these results as bounded live evidence; qualify representative real footage and remaining shared preview/composition gaps separately. No further paid test is scheduled or started.

The Studio record validator and `git diff --check` pass. This local QA branch contains documentation/evidence updates only; it is uncommitted and unpublished. The earlier release's unit/image/browser totals were not rerun or counted as new tests here.


7 November local continuation: the [Director brief-to-motion edit](../studio-director-creative-20261107/README.md) and [paused layer readiness repair](../studio-preview-layers-20261107/README.md) use only the isolated demo; they are separate from this earlier owner-account check. The new movie, exact native project, source clips and actual Studio recordings are delivered privately in Videos. Production availability/readiness is unchanged.
