> Historical report from 26 October; superseded by the [current E1 execution and remediation report](../../SECURITY_RELEASE_READINESS.md).

# AutoPromote security release readiness

26 October 2026 · **Tested local candidate; production release remains blocked.**

## Security-only candidate

Branch `security/release-readiness-20261026` is isolated in
`/home/tibule12/Projects/AutoPromte/AutoPromote-security-readiness-20261026`.
The foundation remains in the original worktree on its foundation branch; its security
application changes were removed after a complete local backup. Historical reports
point here. No monetisation development occurred in this security worktree.

[Security-only patch](../../artifacts/security/security-only.patch): **22 files**, based on
`832d11eeff5df4f3a25455cd2dca7ffed3a08b70`. It applied to clean base files and every
resulting source hash matched the [manifest](../../artifacts/security/manifest.json).
Patch SHA-256: `811a375de34b75f112e087c66781ba4351c49a49e088ec7a5b21542a94f85c38`.

It repairs profile/financial field permissions, backend authority and identity trust,
registration ownership, paid/content-metric writes and hosted test bypasses. Existing
payment, subscription and credit-fulfilment implementations remain unchanged.

## Verified findings versus unresolved risks

| Status                                | Finding                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verified: deployed Firestore flaw** | Read-only Rules API GETs retrieved the active `cloud.firestore` release, ruleset `e6af0088-be7a-4050-88ec-69af2b9d1066`, updated **19 July 2026, 17:11:26 UTC**. Its source matches the vulnerable repository fixture **byte for byte**, SHA-256 `0e7ee93d839e2a23d5c218f1b44cff3808eecdcc191bc10334818332691f6513`. A second GET confirmed the release pointer remained stable. |
| **Verified: permission consequence**  | That exact source permits owner credit/role/tier changes, then recursive admin access. The exploit was reproduced only in the local emulator. Production exploitation, historical balance integrity and the complete exposure period remain **unverified**.                                                                                                                      |
| **Verified: separate Storage risk**   | Active Storage source also matches the repository's broad authenticated fallback. It is unchanged and outside this patch; no Storage exploit was attempted.                                                                                                                                                                                                                      |
| **Unresolved: backend parity**        | Firebase `api` metadata shows ACTIVE version 23, updated 12 February 2026. The actual Render/API serving revision and frontend routing remain unverified. Backend vulnerabilities are confirmed in source/local tests, not by production exploitation.                                                                                                                           |
| **Unresolved: historical authority**  | Existing admin records or signed claims may already be unauthorised. Passing tests cannot establish which people are legitimate administrators.                                                                                                                                                                                                                                  |

[Read-only release/source/comparison evidence](../../docs/security/evidence/autopromote-security-rules-firebase-20261026/evidence.json)
supersedes Section 9's earlier 403 limitation. The gcloud request returned
`SERVICE_DISABLED`; the existing Firebase login succeeded. No API or IAM was changed.
The permission repair does not correct previously forged balances or tiers; those
require separately approved reconciliation.

## Administrator model and read-only verification

The candidate accepts signed claims (`admin`/`isAdmin` strictly true, or `role=admin`)
or existence of `admins/{uid}`. Backend Admin SDK operations separately use IAM.
Profiles are not authority. A disabled-looking admin document still grants access by
existence. Neither current records nor email addresses independently prove legitimacy.

Prepared procedure: obtain an independently approved UID roster; owner-run the GET-only
`scripts/security/export-admin-authority.py`; compare its sanitised snapshot with the
roster using `scripts/security/review-admin-authority.cjs`; investigate unapproved,
orphaned, disabled, profile-only and mismatched authority. Neither tool imports the app
or modifies records. **No production account enumeration was performed.** Exact commands,
roster format and tenant handling are in the [runbook](../../docs/security/RELEASE_RUNBOOK.md).

Stored claims do not enumerate historical custom-token claims or active sessions.
Backend revocation checks do not themselves revoke direct Firestore access; the candidate
Rules have no per-user revocation-time check. Containment must cover issued tokens,
refresh sessions and the existing 15/30-second backend caches before privileged access
reopens. [Firebase session guidance](https://firebase.google.com/docs/auth/admin/manage-sessions).

## Compatibility and tests

| Flow                          | Verified locally / remaining gate                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, registration, profiles | Owner-token registration, password/token fixtures, revocation rejection, profile editing and financial-state preservation pass. Real browser/Auth lifecycle checks remain.                                                               |
| Payments, subscriptions       | Existing PayPal and entitlement regressions pass; server billing writes remain available. Provider-sandbox settlement/renewal/refund checks remain. Legacy mirror, capture-binding, webhook and withdrawal risks are unchanged.          |
| Queue, Publisher              | Scheduling versus immediate publishing, uploads, deduplication and owned schedules/content pass with mocked dispatch. Staging OAuth/retry/workspace flows remain.                                                                        |
| Studio                        | Source loading, owned-source creation/title edits and clip billing regressions pass. Staging browser/upload/render-failure checks remain; no paid job ran.                                                                               |
| Admin management              | Claim/collection admins work and profile-only escalation fails. The legacy role endpoint changes only profiles; agree a trusted provisioning/removal procedure before release.                                                           |
| Packaging                     | Temporary `copy-server.js` packaging passes. The repository Functions wrapper requests a missing `verifyFirebaseToken` export: a pre-existing runtime gate if Functions serves traffic. Confirm target/source and runtime compatibility. |

**Passed:** 82 isolated security/authority/packaging tests, **34 existing regressions**
across 10 Jest suites, three mocked export-tool tests, targeted lint, syntax and whitespace
checks. [Repeatable commands and limits](../../docs/security/evidence/local-validation.json).
These are emulator/fixture results, not live-provider certification.

## Deployment and rollback proposal — not executed

1. Confirm deployed backend revision(s), routing and database; apply this patch to that
   exact code and rerun checks. Approve the independent admin roster and containment plan.
2. Explicitly authorise a named staging project and provider-sandbox scope; close every
   compatibility gate above without production credentials or automatic live dispatch.
3. In a separately approved production window, gate vulnerable user/admin mutation and
   token-minting paths, preserve trusted webhook/worker settlement or durable retries,
   and coordinate repaired Rules plus all serving backends. Neither half is sufficient.
4. Re-export Rules, compare hashes, allow propagation, verify backend revisions/caches
   and preapproved benign probes, then monitor permissions, login and settlement backlog.
5. On failure, keep access gated and use a forward fix or verified secure backend.
   **Do not restore the vulnerable Rules/unpatched backend.** The tested
   [restrictive fallback](../../config/security/firestore.restrictive-fallback.rules) stops all
   direct Firestore client access while IAM backend writes continue. It causes a partial
   outage, needs explicit approval, and does not secure backend endpoints or Storage.

Rules-only and fallback Firebase configurations are supplied; no automatic deployment
script was added. [Detailed sequence and rollback limits](../../docs/security/RELEASE_RUNBOOK.md).

## Exact owner inputs and approvals needed

- **Admin evidence:** independently approved UIDs, approver/date, tenant/database scope
  and provisioning/audit evidence. Decide how historical profile-only admins are treated.
- **Read-only snapshot:** prefer owner-run export. Required permissions are
  `firebaseauth.users.get` and `datastore.entities.get/list`; these can expose broad data,
  so avoid granting unnecessary access. No hash-export permission, keys or token sharing.
  Current Rules read access already succeeds. [Auth API](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchGet).
- **Serving release map:** sanitised Render service/deploy ID and commit SHA, built
  frontend API origin, alternate endpoints, Functions source revision and database scope.
- **Staging approval:** named project/services, test users, sandbox providers and cost scope.
- **Production approval:** exact patch/target revision, maintenance/access gate, admin and
  session-containment scope, cache handling, monitoring, operator and fallback outage
  tolerance. Record/claim cleanup and session revocation need explicit scope; push/merge
  require separate approval. No balance or billing change is included.

A Firebase CLI account-list command included cached Google OAuth credentials in tool
output. None were copied into release artifacts. The owner should invalidate the exposed
CLI OAuth credential and authenticate again; reauthentication alone may leave the old
credential valid. I have not revoked it or any application session.

**Production remains unchanged.** No data correction, session revocation, deployment,
push, merge, billing change or live-ad activation was performed.
