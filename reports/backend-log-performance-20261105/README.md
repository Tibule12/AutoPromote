# Backend log safety and content loading — 5 November 2026

Implemented locally on `fix/backend-log-content-performance-20261105`, based on production source `f3695207`. **Not pushed, merged or deployed.** The original checkout, `.env`, Studio work and live-test evidence remain untouched.

Release follow-up: the owner subsequently explicitly authorised a direct push to `main`. The local validation below is the pre-release checkpoint. The commit/push and normal release results are tracked separately; passing these checks does not itself establish that the new revision is live.

## Repairs

- Replace full render-option dumps with bounded job/operation/count summaries. Related worker, media-route and cleanup error logs redact signed URLs and credentials, omit Axios request/config bodies and bound error text. Request/access/slow logs omit query strings, preserving request IDs, status and duration.
- Remove content-account identity dumps and repetitive entitlement debug output. Hosted runtimes suppress verbose authentication/account debug even if old debug flags remain enabled. Authentication decisions, authority policy, tiers, prices, charges and refunds are unchanged.
- Use a 41-byte authenticated access probe for login's existing terms gate, with **no content query**. It stays behind the existing Auth/terms/workspace middleware; it does not bypass acceptance.
- Add an explicit projected dashboard/Queue response. It retains all 139 captured records and the fields used for source identity, copy, media previews, retention display and Publisher fallback. Full legacy and explicit Publisher reads retain their existing payload/enrichment. No pagination cutoff, data migration or deletion was added.
- Count already-serialized response bytes without another JSON serialization. Optional access-file logging creates its directory asynchronously once instead of synchronously on every response. A logging-sink failure cannot fail a completed request.
- Expand event-loop warnings with sampled CPU time, utilization and resident memory. These metrics help investigate a future stall without recording payloads or collecting a production CPU profile automatically.

## Measured evidence

One owner-authorised GET captured the existing library privately; no production records were changed. Replaying that same data through the candidate produces:

| Measurement | Before | Candidate |
| --- | ---: | ---: |
| Dashboard list, 139 records | 796,260 bytes | 428,739 bytes (**46.2% smaller**) |
| Terms probe + dashboard list | 1,592,520 bytes | 428,780 bytes (**73.1% smaller**) |
| Content queries for those two requests | 2 | 1 |
| Representative render log formatting | 16,180 characters | 140 characters |

The combined comparison is the existing terms-probe/full-dashboard path, not a claim about every login or compressed network transfer. Projection reduces returned data; it does not make the remaining 139-document query free. Full Publisher reads intentionally remain approximately 796 KB to preserve their established contract.

[Local profiling](evidence/profile.json) and a [sampled V8 CPU profile summary](evidence/cpu-profile-summary.json) confirm lower serialization/log-formatting work on this workstation. They exclude production database, network, stdout and host scheduling. **The historical 461 ms stall's exact cause is unresolved.** That aggregate warning cannot establish a stack trace or prove the Studio browser freeze has been eliminated. Confirmed unnecessary work is removed; the next production observation must use the added diagnostics if stalls recur.

## Verification

- **66 tests passed**, 15 suites, zero failures/skips: log safety and sink failure, real failed-worker log path, access-probe Auth/terms gates, projected ownership/scope, full Publisher compatibility, Queue media/copy, scheduling, payments/subscriptions, existing Studio analysis and Cam Combiner route regressions. Provider boundaries in these tests are mocked.
- **99 security tests passed**, zero failures/skips, using a fresh loopback `demo-autopromote-security` emulator. No cloud seed or revoked Firebase CLI credential was used.
- A separate fresh **real Firestore emulator** verifies nested field masks, owner/order constraints and required workspace fields. A 700,218-byte engineering fixture projects to 161 bytes; this synthetic fixture demonstrates field-mask behavior, not the real library's reduction above.
- **Actual candidate React build/browser passed**, headless and muted, with faithful saved Auth, the real candidate content router over the privately recorded fixture and other account APIs restricted to GET. The probe returns 41 bytes/zero fixture queries, Queue shows three releases with media, and Publisher requests the full asset response. Metadata enrichment is stubbed in this candidate test; actual publication and production rollout are not claimed. No render or credit-consuming action occurred.
- Configured frontend build and its 19 welcome-asset / 47 public-page checks pass. Syntax, targeted lint and whitespace checks pass. [Validation](evidence/validation.json) retains the initial harness/configuration/path failures and their corrected results.

Rules, authority policy, credit-system source, subscription-plan configuration, AdSense ownership tag, ads.txt and hosting configuration retain their baseline hashes. Billing/authentication service edits only remove or sanitise logs; the security and financial regressions above remain passing. Existing projects, media, balances, schedules and publishing records were not modified by this repair work.

## Release and remaining checks

After approval, release the backend and frontend through the normal process, preferably backend first. No media-worker image, billing migration, Rules deployment or IAM change is needed. Old clients and full-record readers remain supported; an old backend also ignores the new optional query parameters, so version skew retains the previous behavior.

Verify authenticated login/terms, compact Queue loading and full Publisher loading after release, then observe payload/latency and event-loop diagnostics under representative traffic. Preserve repaired security permissions on rollback. A frontend regression can revert the client while retaining the backend log-safety changes; a backend failure should receive a scoped forward fix that keeps credential redaction.

This patch prevents the identified future log leakage once deployed. It does not erase already-retained logs or revoke signed media capabilities. Existing incident evidence is preserved; no session/credential revocation, log deletion, advertising activation, subscription change or extra paid test was performed. Private payloads, authentication and screenshots remain outside the repository. Production continues using its current code until release approval.
