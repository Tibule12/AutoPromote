# AutoPromote security release readiness

27 October 2026 · Africa/Johannesburg · **Security repair applied to production under your full autonomous security authorisation.** Monetisation remains paused. The separately approved ownership-verification tag is now live; it does not activate advertising.

## Verified production state

| Component | Verified result |
| --- | --- |
| Primary Render API, both origins | Runtime commit `593bbcdf86e7ca6e3acc16eac5b52b168f3a45ca`, unchanged policy `security-owner-bootstrap-20261027`, verified on both origins after the 14:31 SAST tag release. Security PRs #498/#499 remain preserved; #503 adds only the approved verification meta tag. |
| Firestore `(default)`, `autopromote-cc6d3` | Owner-scoped ruleset `26b2a18a-c068-46ab-b16a-f73c7caa0699`, published 14:02:35 SAST; exact deployed source hash independently rechecked. |
| Storage, `autopromote-cc6d3.firebasestorage.app` | Owner-scoped ruleset `f9e3b66b-aa66-43eb-855d-5fdced75a979`, published 14:02:40 SAST; exact deployed source hash independently rechecked. |
| Alternate Cloud Run API | Public `allUsers` invoker binding removed from `thulani-api`; its public version request returns 403. No worker IAM or traffic changes. |
| Exposed Firebase CLI OAuth grant | Revocation acknowledged; the old refresh credential returned `invalid_grant`; matching local CLI login cleared. Application-user sessions were not revoked. |

The initial approved E1 deny-all containment has been replaced by the tested owner policies. Protected credits, roles, tiers and financial state remain server-managed; forged historical admin claims/documents cannot grant access under the repair. Current UID-scoped upload paths are restored. Legacy flat/proof paths without verified ownership remain restricted, and Studio model/analysis objects stay API-only. Propagation and existing browser state may delay observed recovery.

Security PR [#499](https://github.com/Tibule12/AutoPromote/pull/499) is merged as `88bef8ff4c9f12c78abac88b644e3b60d4ffa428`; it records the Rules, publisher and tests. Its API runtime files are identical to the verified #498 release. Its Render rebuild is also live and does not publish Rules. No AdSense, unified-credit, rewarded-ad, price or payment-fulfilment changes are included.

[Backend verification](docs/security/evidence/20261027/backend-live-verification.json) · [Rules execution receipt](docs/security/evidence/20261027/owner-rules-execution.json) · [independent Rules verification](docs/security/evidence/20261027/owner-rules-independent-verification.json) · [E2 receipt](docs/security/evidence/20261027/e2-execution.json).

## Repair and validation

Registration now requires ownership of an existing account and preserves its stored financial/profile state. Verified identity overrides profile aliases; token checks request revocation verification. Hosted test bypasses and raw historical admin-claim fallbacks are rejected. Administrator authority is limited to the verified operator's existing Firebase UID; historical records remain preserved for investigation. No claims were rewritten to establish that authority.

- **92 isolated security/authority/packaging/CI-isolation tests passed.**
- **52 existing regressions across ten suites passed**, covering payments/subscriptions, Queue scheduling, Publisher uploads and Studio source/clip billing. Seven affected admin-route unit tests also pass after correcting their identity fixtures.
- The full application suite passed **1,837 tests across 300 suites** (five tests and four suites skipped), and browser E2E passed for the #498 head, including the new demo-only browser workflow. The #499 browser run also passed. [CI evidence](docs/security/evidence/20261027/full-regression-ci.json).
- **10 real Firestore/Storage emulator tests** and **four fake-API Rules publisher tests** passed locally and in the targeted #499 CI job. CodeQL, Semgrep, frontend build and targeted backend CI passed.
- Live benign checks confirm the runtime identity and 401 rejection on unauthenticated profile/admin/reset-password requests. No exploit writes, real charges, payouts, posts or processing jobs were used as smoke tests.

Authenticated production browser workflows and live provider settlement have **not** been demonstrated. Existing regression fixtures and deployed source verification establish a narrower result. The repeated broad #499 CI run is still installing its CPU media-test prerequisites; its application tests have not started. The targeted security/Storage job, browser E2E and scanners passed. The main-branch repeat may also still be finishing; API runtime files are unchanged.

## Unintended CI writes — confirmed and contained

Publishing the security PR triggered a pre-existing workflow that selected cloud seeding when a Firebase credential was available. I should have checked this before pushing. Read-only evidence confirms it refreshed **seven pre-existing production test documents**, including `adminUser123`, `testUser123` and the test subscription, most recently at 13:41:11–13:41:12 SAST. This corrects earlier statements that no production documents/subscription records changed. No cleanup or compensating data rewrite was performed.

The cloud run was cancelled. The repaired workflow receives no Firebase service-account or Render hook secret, uses only `demo-autopromote-e2e`, and both seed entry points reject unsafe CI/cloud configuration. Eight process-boundary denial tests and the subsequent demo browser run passed. The fixture administrator is excluded from the new authority policy. [Exact affected paths/timestamps](docs/security/evidence/20261027/ci-cloud-seed-impact.json).

## Unresolved production risks and manual evidence

- Historical account/session compromise remains unproven and unexcluded. The orphan admin document is now traced to the old CI fixture script; the separate unverified-email admin-claim identity still needs independently corroborated provisioning evidence. No historical account, claim or session was deleted/revoked during this repair.
- No customer balance reconciliation or correction was attempted. Mirror resurrection, capture/order binding, legacy withdrawal validation/concurrency and award replay remain separate financial risks. Direct projected snapshots plus independently verified provider settlements are required before proposing corrections; do not call balance-resynchronising application helpers, sum mirrors or trust internal receipts alone.
- Signed/download URLs and object IAM are separate from Storage Rules. Public callable Functions/workers need version-specific guard review; IAM-restricted Firebase API Function version 23 was not redeployed. This release does not establish that every backend or billing path is secure.
- A legitimate signed-in browser session is still needed for production onboarding/profile, administrator UI, paid-account, Queue/Publisher and Studio checks. Do not send passwords or tokens. Read-only Render dashboard metadata would supply the provider deploy ID, but the exact running security commit is already verified through the API.

[Detailed inventory and investigation procedure](docs/security/REMEDIATION_RUNBOOK_20261027.md). Private identity/source evidence is preserved outside Git at `/home/tibule12/.local/share/autopromote-security/incident-20261027/` with directory mode 0700 and files 0600; copies were hash-verified. No production balance adjustment, migration, live-ad activation or commercial credit decision was performed.

## Containment and rollback

If an invariant fails, retain the repaired backend and alternate API restriction and roll forward. Reapply the exact E1 deny-all release targets if necessary: Firestore `2115bff8-a189-4179-9ecc-516c895d132a`, Storage `7d9cee7f-2189-492d-9d46-9bf7b0bf1200`. Read the current release, verify the intended pointer, update only the named release and re-read its source hash. This deliberately disrupts client uploads/cloud access while backend IAM paths remain separate. Never restore vulnerable Rules or the unpatched authority backend; do not replay provider events or restore balances as rollback.

No renewed approval is required for this security scope under your full-access instruction. Financial corrections or uncertain privilege deletion will not be inferred from an unverified discrepancy.

## Separate AdSense ownership verification

**Explicitly approved, merged and deployed.** [PR #503](https://github.com/Tibule12/AutoPromote/pull/503), revision `593bbcdf86e7ca6e3acc16eac5b52b168f3a45ca`, changes only one line in `frontend/public/index.html` relative to the deployed security base. Anonymous public HTML at `https://autopromote.org/` was verified at 14:31 SAST to contain the exact requested tag once, inside `<head>`. Its release meta and `build-info.json` identify that revision. No ad script, Auto Ads, rewarded-credit, subscription or new billing change was added.

Read-only before/after checks confirm both active Rules pointers/source hashes and all seven tracked test-document timestamps are unchanged. The alternate API remains restricted. Historical balance/session risks and the earlier CI incident remain open; this tag release does not resolve them.

[Release report](docs/adsense/RELEASE_20261027.md) · [live verification evidence](docs/adsense/evidence/20261027/public-verification.json) · [security comparison](docs/adsense/evidence/20261027/security-after.json).
