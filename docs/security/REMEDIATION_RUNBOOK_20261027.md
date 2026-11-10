> **Current status:** later autonomous security authorisation supersedes the approval gates recorded below. E1 and E2 are completed; alternate API public access was removed; backend repair is now PR #498. See [SECURITY_RELEASE_READINESS.md](../../SECURITY_RELEASE_READINESS.md) for the current release status. Earlier patch manifests and proposed E4 text below are historical evidence, not current instructions.

# Security incident runbook — 27 October 2026

## E1 executed scope and evidence

The user explicitly approved **E1 rules-only containment**. The Rules REST API was used
with the existing gcloud identity and the explicit `X-Goog-User-Project` header, avoiding
the exposed Firebase CLI credential and all Firebase predeploy hooks. Only ruleset
creation and two release-pointer updates were performed. No IAM/API enablement, backend
deployment, stored-data/object change, session/credential revocation or Git publication
occurred.

| Target                                     | Active restrictive ruleset             | Published UTC            |
| ------------------------------------------ | -------------------------------------- | ------------------------ |
| `autopromote-cc6d3`, Firestore `(default)` | `2115bff8-a189-4179-9ecc-516c895d132a` | 27 October 2026 03:39:25 |
| `autopromote-cc6d3.firebasestorage.app`    | `7d9cee7f-2189-492d-9d46-9bf7b0bf1200` | 27 October 2026 03:39:31 |

Both active pointers and exact source hashes were re-read after publication. See
[execution receipt](evidence/20261027/e1-execution.json) and the
[approved file manifest](../../artifacts/security/emergency-containment/manifest.json).
Rules propagation/existing connections may lag. No live exploit or authenticated client
probe was performed. All direct client reads/writes are denied by these policies; Admin
SDK/IAM, signed URLs, Firebase download tokens, public bucket IAM and cached files are
separate. The three real emulator cases reproduced the old cross-owner Storage read and
overwrite, tested denial for ordinary/admin clients, and preserved trusted bypass writes.

Expected disruption includes direct cloud loading/saving, uploads and client media reads.
Do not discard users' unsaved editor state. No claim is made that complete application
workflows remain usable during containment. Backend billing/worker code was not disabled;
rule bypass in the emulator is not a live-payment certification.

## Serving inventory and confidence

- Public frontend bundle: `https://autopromote.org/static/js/main.3b046ac5.js`, SHA-256
  `fea2699903a0375ef0c5b417534f63e7eb4e5ca06a5314f75cd81d83160ae7ed`.
  It references `https://api.autopromote.org`.
- Primary API: `api.autopromote.org` resolves through `autopromote.onrender.com` to
  Render's origin. Both public version endpoints return `1.2.0` and `commit: null`.
  The owner supplied a Render event screenshot showing commit `9008721` live; GitHub
  resolves it to `900872157ee67aaedfc114a017299a769fced147`. This is owner/dashboard
  evidence, not a signed runtime attestation. `autopromote:10000` is a service/port,
  not a deploy ID. The deploy ID is absent from the screenshot and historical hook log.
  Do not merge to discover one. A dashboard event link or owner-run Render GET
  `/v1/services/{serviceId}/deploys?status=live` can supply provider IDs without deploying.
- Alternate API: Cloud Run `thulani-api-00021-joc`, 100% traffic, image
  `us-central1-docker.pkg.dev/autopromote-cc6d3/thulani-repo/thulani-api@sha256:1c78cd2eaffaf5fde046fa9750261aebbde8c4b436579a2c36531865e548e715`.
  Its public `/api/version` also returns `1.2.0`, no commit. Resource IAM grants
  `allUsers` invocation. Source parity with the primary API remains unverified.
- Cloud Run `media-worker-v1-00121-vup` has 100% default traffic and many old tagged
  URLs; `cam-combiner-worker-00082-bej`, `thulani-frontend-00050-47p` and
  `thulani-worker-00049-rpf` are also serving. Media worker resource IAM is public.
  Network reachability alone does not prove missing application authentication. No
  worker/job request was issued, and worker/service settings were not changed.
- Firebase `api`: ACTIVE version 23, build
  `1b3deb35-b3e1-4413-a232-c7375840912c`, last updated 12 February 2026. A public GET
  returned platform 403; its resource policy returned no bindings. Do not infer the
  policies of every function from this one. Its version-23 source archive was read
  privately from the source bucket (SHA-256
  `341f2a05edf285b910b9f81d018323aa4a8f8072c855440521dfe0d7147445ae`). It contains old
  profile-derived authority and the missing wrapper-export mismatch. No code was executed.
  Keep this entry point restricted; it needs a separate version-specific repair if used.
  Resource policy reads separately confirm public invocation on `getRevenueSummary`,
  `autoPromoteContent`, `createPromotionTemplate` and `logMonetizationEvent`. The bundled
  source contains Auth guard references, but source from the API bundle does not prove
  parity or correctness for every independently deployed Function version. No callable
  invocation was attempted. E1 and the proposed E4 API gate do not suspend those Functions.
- The complete read-only inventory contains 45 Functions, 37 HTTP/callable URLs and
  290 relevant API source-route declarations. These are inventories, not live probes
  of every endpoint. [Functions](evidence/20261027/http-function-index.json),
  [routes](evidence/20261027/production-route-map.json),
  [Cloud Run traffic/tag URLs](evidence/20261027/cloud-run-services.json).

Do not gate only the custom domain: direct Render, alternate API, Functions and worker
origins require explicit review. No Cloudflare/Render service suspension or public-IAM
removal is approved. Any proposed emergency maintenance gate must name each origin,
protect provider retry/backlog handling and explain effects on running jobs and callbacks.

### E4 proposed temporary API maintenance — not approved

E1 does not stop the still-serving legacy registration/login handlers' Admin SDK paths.
If prompt backend repair is unavailable, the concrete broader containment request is:

1. Owner-suspend the Render **`autopromote`** service in its dashboard, covering both
   `api.autopromote.org` and `autopromote.onrender.com`. Do not merely hide the custom
   domain or deploy a frontend maintenance page. An owner/dashboard operator or approved
   Render access is required; no Render API key is available in this session.
2. Remove only member **`allUsers`** from role **`roles/run.invoker`** on Cloud Run
   **`thulani-api`**, project `autopromote-cc6d3`, region `us-central1`, after recapturing
   its policy. Preserve other bindings; no project-wide IAM, worker or Function change.
3. Confirm the two origins are restricted using benign unauthenticated metadata probes.
   Do not alter any account, balance, Auth claim/session, object or payment/provider state.

This intentionally interrupts app API access, registration/login completion, new
Queue/Publisher/Studio admissions and potentially provider/job callbacks. Do not assume
all providers will retry indefinitely or all workers will reconcile automatically.
Agree an incident owner, bounded outage window and backlog handling. Existing workers
are not stopped by this request. Their public/in-application authorisation remains a
separate investigation. The Firebase API currently returns platform 403.

No E4 action has been taken. Its approval would not authorise code publication/deploy,
new billing activity, data correction, token revocation or reopening E1 policies. When
a verified secure backend is ready, reopening suspended/invoker access requires its own
reviewed approval. Do not reopen vulnerable services as an automatic rollback.

## Small application repair, separate from containment

The primary candidate lives in `../AutoPromote-security-production-20261027`, branch
`security/production-9008721-20261027`, directly based on the dashboard commit. Its runtime
patch changes six files: Firestore Rules, shared authentication middleware/routes,
user routes, the hosted-route mount condition and the new authority helper. It preserves
the production revision's additional Studio mounts and server-only model collection
exclusions. The latent, unmounted user controller was deliberately excluded.

[Exact six-file manifest](../../../AutoPromote-security-production-20261027/artifacts/security/production-manifest.json)
identifies the patch SHA-256
`560d1ecc7c689b6731d934b751e5881ea1226ea0ab4372bd421d70a42225ba13`.
The patch applies to the exact base and reproduces all six file hashes. It is not pushed,
merged, built as a paid cloud artifact or deployed. It contains no unified-credit/ad code,
balance migration, plan-price change or payment-fulfilment change.

83 isolated tests and 52 existing regressions pass on this production base. They cover
real emulator Rules/transactions and actual Express handlers with fixture identity,
email, workers and payment providers. They do not prove live Auth cryptography, browser
workflows or provider settlement. Rules, backend authority and historical privileges
must all be addressed; publishing the normal candidate Rules would reopen client access
and therefore needs a separate approval from deploying backend code.

Before a separately approved backend release: confirm the admin plan below, exact
Render service/deploy identifiers and rollback artifact; test a named staging project
and sandbox providers; review alternative public APIs; decide whether admin-facing
functions should remain inaccessible until identity ownership is established. The old
role setter only edits profile metadata and cannot serve as trusted admin provisioning.
No account may be silently promoted to repair a login problem.

After approved publication/build/deploy: verify exact runtime revision and sanitized
release identity, run agreed benign smoke checks, monitor auth/permission failures and
provider/queue backlog. Do not perform real charges, payouts or renders as unapproved
smoke tests. Keep E1 policies while backend issues are investigated. Roll forward or
restore a verified secure backend artifact; never restore the old Rules or unpatched
authority code. If maintenance is necessary, obtain named service/origin approval first.

## Administrator and balance investigation

The user authorised a read-only authority investigation after being unable to identify
the legitimate roster. The default-project export found 17 Auth accounts, one admin
document, one stored admin-claim account and two privileged profiles. The admin document
UID is absent from the default Auth export. The stored-claim account is a different UID,
has an unverified email, and has no admin document. Neither matches the operator-email
account, whose Auth email is verified and which has no current admin grant. Tenants,
deleted-user history and independent ownership are not established by that comparison.
No record is labelled malicious merely because it differs.

The actual identity/provenance details are private, not in Git:

- `/tmp/autopromote-security-private-20261027/authority.json`
- `/tmp/autopromote-security-private-20261027/authority-provenance.json`
- `/tmp/autopromote-security-private-20261027/operator-matches.json`

An initial log query reached its 100-record cap with Firestore Commit metadata, so it
cannot explain Auth provisioning. The targeted Auth query timed out after 30 seconds;
no zero-event or provisioning conclusion is claimed. Log
absence, an email field or an old creation timestamp cannot establish legitimacy.
Have the owner verify control of the concrete privileged sign-in identified in the
private evidence. Independently corroborate provisioning approval; do not automatically
trust profiles, `admins` existence, or a signed claim minted by previously vulnerable
code. Existing custom-token sessions are not enumerated by stored claims. Removals,
session revocation, owner-admin enrollment and token/download-token rotation all require
explicit approval. Backend caches default to 15/30 seconds; direct Rules have no per-user
revocation-time check.

Balance investigation is **prepared, not executed**. No balances were read, compared,
selected, adjusted or migrated during this phase. Safe next steps are:

1. Obtain a bounded UID/time scope and evidence-retention owner. Use read-only projected
   Firestore REST/SDK reads directly, never app endpoints/imports such as profile/credits
   helpers that can create profiles, normalise roles or resynchronise balances.
2. Preserve timestamped, access-restricted snapshots and hashes of `users` credit/tier
   fields, `user_credits`, billing/subscription bindings, usage/charge/refund records and
   payment/event receipts. Collect owner-run provider settlement records independently.
   Do not export credentials, OAuth tokens, password hashes or unrelated project content.
3. Keep monthly usage, purchased balances, growth credits, AI credits, earnings and cash
   distinct. Flag mirror divergence, impossible values, duplicate provider IDs, grants
   without provider evidence and subscriptions without verified billing events. Do not
   sum mirrors, take their maximum or call divergence proof of fraud.
4. Internal ledgers/receipts were within the old wildcard's blast radius and could also
   have been altered. Corroborate with external provider records and retained logs before
   proposing a balance. Preserve disputed values; produce a per-UID discrepancy report
   and separate correction proposal. No automatic repair/replay is authorised.

## E2: exact CLI OAuth credential and revocation procedure

E2 was **explicitly approved and executed**. Google acknowledged the revocation; a
verification refresh returned HTTP 400 `invalid_grant`, and the matching local login
was cleared. [Execution receipt](evidence/20261027/e2-execution.json). No Firebase Auth
application-user session was revoked. The following records the exact approved procedure;
do not rerun it against a replacement credential without fresh approval.

The exposed credential was the Firebase CLI Google
OAuth cache for `tmtshwelo21@gmail.com`, not an AutoPromote Firebase Auth user session or
service-account key. CLI version: 14.23.0. Cache:
`/home/tibule12/.config/configstore/firebase-tools.json`, account `tokens.refresh_token`;
cached access/ID tokens were also included in the original account-list output.

OAuth client ID (public identifier):
`563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com`.
The current cached refresh credential's nonsecret fingerprint is
`c24fd8f8d91878e4cecf55eadf7d185f27147be9a1b1fa78f9bbac084daa5db1`.
No token values are retained in these reports. A fingerprint from the original exposure
was not independently recorded; grant-level revocation also addresses earlier tokens
for the same account/OAuth project if the cache has since changed.

The approved command, run from the security-readiness repository root, was:

```sh
python3 scripts/security/revoke-cli-oauth.py \
  --account tmtshwelo21@gmail.com \
  --expected-sha256 c24fd8f8d91878e4cecf55eadf7d185f27147be9a1b1fa78f9bbac084daa5db1 \
  --execute-revocation
```

The tested operator tool verifies account, OAuth client and fingerprint, reads the secret
locally, and sends it only in the HTTPS POST form body to Google's fixed `/revoke`
endpoint with redirects disabled. Default invocation without `--execute-revocation`
only inspects metadata and makes zero network requests. Only inspection and fake-token
tests preceded the approved execution. A fingerprint mismatch stops execution and needs
fresh review; the old account is now absent from the CLI cache.

Google documents that revocation can invalidate all access/refresh tokens for that
account's grant across clients registered under the OAuth project; CLI/CI integrations
using those grants can need reauthentication. This does not invoke Firebase Auth session
revocation or change IAM, service accounts, balances or subscriptions. HTTP 200 is provider
acknowledgement; full effect may lag. Do not claim immediate worldwide invalidation.
[Official token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).

Alternative owner-controlled procedure: sign into the same Google account at
[Google Account connections](https://myaccount.google.com/connections), choose
**Access to your Google Account**, inspect the Firebase CLI connection, confirm account
and client identity, then **Remove access** and confirm. Remove the data-access grant,
not merely a Sign in with Google link. If the app identity is unclear, use the guarded
local POST tool instead of removing unrelated grants.
[Official connection-removal steps](https://support.google.com/accounts/answer/13533235?hl=en).

The matching invalid local login was removed after acknowledgement and verification;
no further logout command is needed. Authenticate again interactively with
`firebase login --reauth` when CLI access is needed. Do not pass token values in CLI arguments, enable debug dumps,
use `login:list --json` or share token/cache files. Reauthentication alone is not revocation.
Provider acknowledgement and rejection of the old credential are recorded. A separate
Google Account UI inspection is not claimed. Restrict access to earlier transcript/log exports.

No other session/grant revocation is implied by E2. App-user incident containment,
publishing, backend deployment, service/IAM gates, financial corrections and reopening
client access each retain their separate approval requirements.
