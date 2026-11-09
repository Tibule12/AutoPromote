> Historical preparation record. See [current security status](../../SECURITY_RELEASE_READINESS.md) and the 27 October runbook for executed containment, credential revocation, autonomous authorisation and the current PR revision. The pending-approval and unrevoked-credential statements below describe an earlier stage.

# Security release runbook and supporting evidence

Run commands below from the repository root.

26 October 2026 · **Local candidate tested; not ready for production approval.**
This report supersedes Section 9's earlier lack of deployed-rules evidence. No production
data, claims, sessions, rules, billing or services were changed. No deployment, push or
merge occurred. No monetisation development was performed in this branch.

## Isolated release candidate

- Branch: `security/release-readiness-20261026`.
- Worktree: `/home/tibule12/Projects/AutoPromte/AutoPromote-security-readiness-20261026`.
- Base: `832d11eeff5df4f3a25455cd2dca7ffed3a08b70`.
- [Security-only patch](../../artifacts/security/security-only.patch), 22 application/configuration/tool/test files;
  [per-file manifest](../../artifacts/security/manifest.json).
- Patch SHA-256: `811a375de34b75f112e087c66781ba4351c49a49e088ec7a5b21542a94f85c38`.
  Applied to extracted clean base files and every resulting file hash verified.

The original worktree is back on `feat/unified-credits-foundation-20261026`, with its
foundation preserved and the security application changes removed. A complete pre-split
backup is at `../autopromote-before-security-isolation-20261026.tar.gz`. Historical
reports remain there. This security worktree contains no new unified-wallet, reward-ad,
demo UI or commercial-pricing implementation. No dependency versions changed.

The repair restricts client profile fields, removes profile-derived backend authority,
preserves verified identities on requests, protects registration from account overwrite,
blocks forged paid/content-metric state, and disables local admin bypasses on hosted
runtimes. Existing server billing writers remain unchanged. The legacy plan self-setter
returns 410 and points to the existing subscription flow.

## Verified production evidence and remaining uncertainty

| Item                      | Evidence / conclusion                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active Firestore rules    | Read-only Rules API GETs succeeded using the existing Firebase login. Release `cloud.firestore` points to ruleset `e6af0088-be7a-4050-88ec-69af2b9d1066`, updated **19 July 2026, 17:11:26 UTC**.                                                                                                                             |
| Comparison                | The deployed source is **byte-for-byte identical to the vulnerable repository fixture**, SHA-256 `0e7ee93d839e2a23d5c218f1b44cff3808eecdcc191bc10334818332691f6513`. It differs from the candidate repair. The release pointer was unchanged on a second GET during capture.                                                  |
| Confirmed permission flaw | Those rules permit owner financial/role/tier changes and use that role to grant recursive admin access. The exact source was exploited only in the local emulator. This confirms deployed vulnerable permissions; it does **not** establish exploitation, historical balances or the entire exposure period.                  |
| Active Storage rules      | Ruleset `80b0f755-37a3-488a-8466-f4a33eb59a5b`, updated 21 July 2026, matches repository `storage.rules` exactly. Its broad authenticated fallback remains a separate confirmed rules-design risk, outside this patch. No Storage exploit or repair was performed.                                                            |
| Backend                   | Read-only metadata confirms the Firebase `api` function is ACTIVE, version 23, updated 12 February 2026. This does not identify the current Render/API source revision or prove which backend the deployed frontend uses. Backend flaws are confirmed in source/local tests; deployed backend code parity remains unverified. |
| Access denial clarified   | The gcloud credential returned 403 with reason `SERVICE_DISABLED`; the Firebase credential succeeded. No API was enabled and no IAM changed. The earlier 403 was not evidence about rule safety.                                                                                                                              |

[Captured releases, full rule sources, comparisons and request statuses](../../docs/security/evidence/autopromote-security-rules-firebase-20261026/evidence.json)
and [function metadata](../../docs/security/evidence/api-function-metadata.json) are retained.
These are observations at capture time, not a guarantee against later changes. No
production exploit, application login or financial read-helper was invoked.

## Administrator authority and read-only review

The candidate's application-admin sources are signed claims (`admin === true`,
`isAdmin === true`, or `role === "admin"`) **or existence of `admins/{uid}`**. Backend
Admin SDK operations separately use IAM and bypass client Rules. Profile fields, email
addresses and Google Cloud IAM administrator status alone are not application-admin
proof. An inactive/disabled-looking admin document still grants authority by existence.

**Legitimate people and provenance remain unverified.** An attacker may already have
created an admin document or obtained signed claims. Do not approve a roster by copying
these records or historical profile roles. The existing admin-login route can create an
admin record from signed claims; avoid using that route as an audit read.

Read-only procedure, prepared but **not run against production accounts**:

1. The owner supplies independently approved Firebase UIDs, approver and approval date,
   including which tenants/databases are in scope. Verify people through an independent
   channel; never send passwords, tokens, service-account keys or full billing exports.
2. On an owner-controlled workstation, run the GET-only exporter with an existing
   authorised Google login. It paginates Auth accounts and field-masked `admins`/`users`
   documents, discards passwords/hashes/emails and financial fields, and saves only
   authority signals plus provenance hints. Keep snapshots outside Git with restricted
   permissions. Export tenants separately. Capture times are recorded; this is not a
   transaction spanning Auth and Firestore.

   ```sh
   python3 scripts/security/export-admin-authority.py \
     --project autopromote-cc6d3 --database '(default)' \
     --output /private/new-authority-snapshot.json
   node scripts/security/review-admin-authority.cjs \
     /private/new-authority-snapshot.json /private/approved-roster.json
   ```

   Roster format: `{"project":"autopromote-cc6d3","tenant":null,"approvedBy":"OWNER","reviewedAtUtc":"ISO_TIMESTAMP","admins":[{"uid":"APPROVED_UID"}]}`.
   Use `--tenant TENANT_ID` and a matching roster for tenant accounts.

3. Investigate unapproved/orphaned records, claim/document differences, disabled admins,
   profile-only authority and approved admins missing effective access. Flags are review
   leads, not proof of malicious activity. Corroborate with independently retained admin
   provisioning and Auth/audit logs. Review deltas again immediately before any rollout.
4. Stored Auth claims do not enumerate historical custom-token claims or active sessions.
   Any approved containment must cover those tokens, refresh sessions, direct Firestore
   access and backend caches. `verifyIdToken(..., true)` applies to the backend; the
   candidate Rules do not implement a per-user revocation-time check. Do not assume
   refresh-token revocation immediately invalidates every existing direct-client ID token.
   Prepare rules-side containment or an explicitly reviewed expiry window before reopening
   privileged access. Default token/profile caches remain 15/30 seconds.

The exporter imports no application code, so it cannot call balance-resynchronising
helpers. It never deletes records, changes claims, revokes sessions or grants authority.
[Firebase session/revocation guidance](https://firebase.google.com/docs/auth/admin/manage-sessions)
and [custom-claim behaviour](https://firebase.google.com/docs/auth/admin/custom-claims).

## Compatibility and regression evidence

| Flow                     | Verified locally                                                                                                                                                                                                         | Still required before release                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login / registration     | Password/token fixture verification, revoked-session rejection, regular and claim/collection-admin access; frontend registration already supplies an owner ID token. Existing account financial fields/claims preserved. | Real Auth emulator/staging sign-in, email verification, refresh, disabled accounts and recovery screens; no real Auth cryptography tested by fixtures.                                                                                                                                                |
| Profile editing          | Allowed owner preferences and authenticated profile APIs work; financial/authority injection fails.                                                                                                                      | Browser settings/onboarding smoke checks. Direct profile deletion, financial writes and sample database seeding by ordinary users are intentionally denied.                                                                                                                                           |
| Payments / subscriptions | Existing PayPal route and entitlement regression suites pass; server Admin SDK billing writes remain permitted, including under emergency fallback. No capture, price or fulfilment code changed.                        | Provider-sandbox capture, callback, refund/renewal and receipt checks. Existing mirror resurrection, capture binding, webhook, referral/withdrawal risks remain unresolved.                                                                                                                           |
| Queue / Publisher        | Scheduled versus immediate distribution, upload/source handling, post deduplication and owned schedule/content operations pass with mocked external dispatch.                                                            | Real staging OAuth/queue scheduling, retry/cancel and ownership/workspace browser flows. No social post was sent.                                                                                                                                                                                     |
| Studio                   | Source loading, clip ownership/billing regressions and direct owned-source creation/title editing pass.                                                                                                                  | Browser upload/save/render-failure checks using staging storage/workers; no cloud render was started. Storage ACL repair remains separate.                                                                                                                                                            |
| Administrator workflows  | Profile-only authority denied; signed-claim and collection admins accepted.                                                                                                                                              | Owner-approved roster. Legacy `PUT /api/admin/users/:id/role` changes only the profile and will no longer grant/revoke effective authority. Agree a trusted provisioning/removal procedure; do not silently migrate profile admins.                                                                   |
| Packaging / hosting      | Actual `copy-server.js` copied the repaired files/helper correctly in a temporary tree. Hosted admin-setup route returns 404.                                                                                            | Functions runtime gate: repository `index.js` requests a `verifyFirebaseToken` export absent from `authRoutes.js`, a pre-existing mismatch. Confirm actual serving target/source and resolve/test this if Functions is used. Node runtime/package-engine compatibility also needs staging validation. |

**Passed:** 82 isolated security/authority/packaging tests; 34 existing regressions across
10 Jest suites; 3 mocked read-only-export tests; targeted lint, JavaScript syntax and
whitespace checks. [Commands and limits](../../docs/security/evidence/local-validation.json).
Jest emitted the existing duplicate-package-name warning; all selected suites passed.

```sh
SECURITY_JAVA_BIN=/path/to/java21/bin/java npm run test:security:profile
python3 test/security/read_only_tools_test.py -v
```

These results support a local candidate, not production end-to-end certification.
The repeatable [source-path inventory](../../docs/security/PROFILE_SECURITY_PATHS.json) records
potential authority/financial paths; static references do not establish deployment.

## Proposed deployment and rollback sequence — not executed

1. **Before approval:** confirm serving backend(s), deployed commit/build IDs and database;
   compare/apply the security-only patch to that exact code revision and rerun checks.
   Independently review the admin roster and incident/token-containment plan. Record
   the current ruleset, candidate hashes, backend artifacts and operational owners.
2. **Approved staging only:** use a named nonproduction project and sandbox provider
   accounts, with no production credentials or automatic social/worker dispatch. Exercise
   every remaining compatibility item above, both backend package paths if applicable,
   token lifecycle, signed webhook handling and monitoring. Confirm hosted bypass flags
   are off and the backend identity can perform revocation-aware Auth reads.
3. **Approved production window:** coordinate a temporary gate on user/admin financial
   mutations, direct-client access and vulnerable login/token-minting paths. Preserve
   trusted payment webhook/worker settlement or durable retry; never drop/replay payouts.
   Resolve approved suspicious privileges/session handling first. Deploy reviewed Rules
   and repaired backend(s) within that controlled window: neither half alone is adequate.
4. **Verify before reopening:** re-export active Rules and compare hashes, allow Rules
   propagation, verify backend release IDs and clear/restart relevant caches. Use
   preapproved benign accounts and narrowly scoped probes; observe admin failures,
   profile permission errors, login latency and payment/queue backlog. Stop if a roster
   mismatch, financial invariant failure or unexpected admin success appears.
5. **Rollback/containment:** keep the access gate closed. Prefer a forward security fix or
   a previously verified secure backend artifact. Never restore the captured vulnerable
   Rules or an unpatched authority backend as routine rollback. A prepared, emulator-tested
   [restrictive fallback](../../config/security/firestore.restrictive-fallback.rules) denies all
   direct Firestore client reads/writes while Admin SDK/IAM billing writes continue.
   This causes a deliberate partial outage and requires explicit incident approval;
   it does not protect insecure backend endpoints or change Storage access. Gate those
   separately. No balance restore, credit reissue or provider replay is part of rollback.

Rules-only configurations `firebase.security.rules-only.json` and
`firebase.security.fallback.json` exclude Hosting, Storage, Functions and indexes.
After approval, an operator must supply the exact project explicitly and deploy only
`firestore:rules` with the selected configuration; **do not run a broad `firebase deploy`**.
Rules/backend changes are not atomic and Rules propagation takes time.
[Official deployment guidance](https://firebase.google.com/docs/rules/manage-deploy).
No automatic deployment or rollback script was added.

## Exact owner inputs and approvals still required

| Needed                         | Minimum access / manual step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent admin roster       | Approved UIDs, approver/date, tenant/database scope and independent provisioning evidence. Decide how profile-only historical admins should be handled; no automatic promotions.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Read-only authority evidence   | Prefer owner-run sanitised export. Required permissions: `firebaseauth.users.get` and Firestore `datastore.entities.get`/`datastore.entities.list`. Those data-reader privileges can be broad; field masks limit this export, not the credential's permissions. No hash-export permission or private-key sharing is needed. No IAM changes made here. [Auth API](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchGet), [Firestore list API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/list). |
| Serving release map            | Sanitised Render service/deploy ID and commit SHA, built frontend API origin, all alternate API endpoints, Functions artifact/source revision and any nondefault databases. Do not send secret environment values. Confirm all public backend copies are included.                                                                                                                                                                                                                                                                                                                           |
| Rules evidence refresh         | Current read access succeeded. The GET-only `scripts/security/export-deployed-rules.py` can recapture releases/source before rollout. If access changes, owner-run export or `roles/firebaserules.viewer` suffices; no admin role/API enablement is implied. [Rules Viewer permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules).                                                                                                                                                                                                                             |
| Staging approval               | Named project/services, test users and sandbox provider scope, browser test owner and acceptable test costs. Deployment remains prohibited until explicitly approved.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Production / incident approval | Exact patch hashes and target revision/project/database/services, maintenance/access gate, admin cleanup and token/session scope, cache handling, monitoring, fallback outage tolerance and named operator. Removing records/claims or revoking sessions needs separate explicit scope. Publication/push/merge also needs explicit approval.                                                                                                                                                                                                                                                 |

One operator-security issue occurred during this review: a Firebase CLI account-list
JSON command included cached Google OAuth credentials in tool output. No values were
copied into release artifacts. The owner should invalidate the exposed **CLI Google OAuth
credential** and authenticate again; reauthentication alone may leave the old credential
valid. This is separate from application-user sessions. I have not revoked either.

**Release decision:** retain the tested local patch; do not deploy until the admin,
serving-release, containment and staging gates above are closed. Production remains
unchanged. Existing Storage/payment risks need separately scoped repairs. No new
allowance, ad reward or monetisation policy is part of this security release.
