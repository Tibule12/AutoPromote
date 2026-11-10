> Historical pre-isolation review. Superseded by [security release readiness](../../../AutoPromote-security-readiness-20261026/SECURITY_RELEASE_READINESS.md). Security source and tests now live only in that worktree.

# Profile authority and financial permissions: security repair review

Reviewed: 26 October 2026. Local branch: `security/profile-authority-repair-20261026`.
Status: **local repair prepared and tested; production rollout is not authorised**.

## Review snapshot

Base commit: `832d11eeff5df4f3a25455cd2dca7ffed3a08b70`. Review snapshot SHA-256: `be5b9bf086cbd4c82a09e98a9e8be58945319f6863f16fc75bf509d058512b88`.
The snapshot hashes the ordered JSON array of path/SHA-256 pairs below with compact
JSON separators. It identifies the prepared source files without a commit, push or
deployment. The added npm script is shown in Appendix B.

Rendered Markdown normalises trailing whitespace in the diff and the old plaintext
rules fixture; their logic is unchanged. Use these actual-file hashes to identify the
reviewed revision, rather than applying a diff copied from rendered Markdown.

| Source file                                      | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `firestore.rules`                                | `22dd6d767df4e67f1177021ed8bcf143eb835131363cf15b65f8010c239fb0ed` |
| `src/authMiddleware.js`                          | `78ab5a5b071e40e7795ad9361fb414ba460ebee19bf5054f73e1e0fb9d554f09` |
| `src/authRoutes.js`                              | `ae66eda8473840831b2f58923082ad5ecc74ef1d06351a7121dfd1c8173e9318` |
| `src/userController.js`                          | `f06f6250c0dcb3869afddddd91351ef914494c17c94d2f06768069e1cfc514dc` |
| `src/userRoutes.js`                              | `2c08072fe54fa4b5175f52afeb5e26082587cdd886f61e2e9bcdb7c5d6ac8a31` |
| `src/server.js`                                  | `8beb77fa3f78ea39d16c9b354ca52f01c3aff4f29a58bafd2ace01e472669f06` |
| `src/utils/authAuthority.js`                     | `b909ec75674f8a75c3a3799923314c18462844bfbf5fdbcd81c37e843a1d9c78` |
| `scripts/test-profile-security.cjs`              | `4e77d8992e7ec152cb6896731c0c42381b75f4fb3afa9ad351ad2a84ff3e60ec` |
| `scripts/audit-profile-security.cjs`             | `70ecc4d015b2c4f9262c8c545b8060745ae2503405317b212350ba69390fdea4` |
| `test/security/profile-security.test.cjs`        | `436c3c35f91d717f475ea7273de40a1a06a34bff87f438a79c64e8a20166c523` |
| `src/__tests__/server.hostedAdminRoutes.test.js` | `70621fbcde2a41c886838bbcf247605f98cd863d9cf38bd7b29d0a7359e9a7ee` |
| `test/security/fixtures/firestore.before.rules`  | `0e7ee93d839e2a23d5c218f1b44cff3808eecdcc191bc10334818332691f6513` |

## Confirmation and limits

The original repository Firestore rules were reproduced in a fresh local emulator.
An ordinary account could update `users/{itsUid}.credits`, change its tier, set its
role to `admin`, create `admins/{itsUid}`, then write another user's credit document.
The regression suite includes that successful before-repair reproduction and reloads
the repaired rules before checking denials. No exploit request was sent to production.

A read-only Firebase Rules API request for the project's Firestore and Storage releases
returned **HTTP 403**. Consequently, the vulnerable **repository** rules and their
emulated behaviour are confirmed; the deployed rules version, exposure window and
whether anyone exploited it remain unverified. No production user documents, balances,
admin records or Auth claims were changed or enumerated to infer a compromise.

The local branch also contains the earlier uncommitted credits foundation. Its demo
configuration has not been turned into commercial policy or connected to this repair.

## Confirmed findings and local repair

| Finding                                                        | Evidence and consequence                                                                                                                                                                                                                 | Prepared repair                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical: owner-editable financial and entitlement fields      | The old `users/{uid}` owner write accepted credits, money balances, AI/growth credits, roles, tiers, tester counters, verification and upload restrictions.                                                                              | Allow only reviewed profile/preference fields on client creation/update. Reject protected-field additions, removal, transforms, nested changes, replacement and profile deletion. New fields are denied by default.                                                                                                                  |
| Critical: profile role grants global Firestore authority       | `isAdmin()` read the same owner-editable `users.role`; the recursive fallback granted that account access to every collection and subcollection.                                                                                         | Resolve admin rights from signed Firebase claims or `admins/{uid}`, never `users.role`. Ordinary users cannot create an admin record, including in a batch. Existing legitimate collection admins and claim admins retain access.                                                                                                    |
| Critical: backend profile authority and identity substitution  | `authMiddleware` spread user data after verified UID/email; profile `isAdmin`, `admin`, nested claims, `customClaims` and `fromCollection` influenced different admin guards.                                                            | Set verified UID/ID/userId/email and all recognised admin aliases after the profile spread. Real verified sessions cannot inherit a profile's `test` bypass flag. Remove the shortcut that accepted a pre-attached user without token verification.                                                                                  |
| Critical: login launders profile privileges into signed claims | Password login verified the password, then took role/isAdmin from the profile and used them in `createCustomToken`.                                                                                                                      | Password verification stays in place. Login authority comes only from verified claims or the server-managed admin collection. Both token verification responses and middleware follow the same authority policy.                                                                                                                     |
| High: existing-email registration can overwrite account state  | Registration fell back to `getUserByEmail` after an existing-account error, without proving ownership; `.set` replaced the profile and claims were rewritten.                                                                            | Require a valid owner ID token for an existing account. Invalid tokens return 401; an unauthenticated existing email returns 409. Merge display data, preserve balances/subscriptions/tester data and timestamps, preserve all existing custom claims, and reject registration email switching.                                      |
| High: direct client mutation of paid state                     | Owners could directly create/update/delete `ads` and `paid_boosts`, including budgets, approval/payment status and ownership fields. Current UI uses backend routes for these writes.                                                    | Preserve owner reads. Write these documents through existing backend APIs or trusted administrators. Client changes to financial state are denied.                                                                                                                                                                                   |
| High: client-controlled reward inputs and claim markers        | Owners could change `content.views`, `metrics`, `revenue` and `claimedBonuses`, which legacy reward/reporting code reads.                                                                                                                | Protect those fields and `earnings` against client creation/update/removal. Prevent owner-alias conflicts at creation and ownership/workspace reassignment during client updates. Preserve normal source creation and title editing. Backend metric ingestion remains available. This does not fix every legacy award's idempotency. |
| Conditional hosted-runtime exposure                            | Local E2E/admin-token bypasses and admin setup mounting depended only on `NODE_ENV`.                                                                                                                                                     | Also recognise Cloud Run, Functions and Render hosting markers. Hosted deployments do not expose the unauthenticated local admin setup endpoint even if NODE_ENV is misconfigured. This does not establish that production was misconfigured.                                                                                        |
| Latent/unmounted legacy setters                                | `userController` accepted caller roles; its current HTTP mounting was not found. The pseudo-billing plan setter uses `tier` while current plan records use `id`, so a working upgrade exploit through that endpoint was not established. | Ignore role injection in the legacy controller and return 410 from the self-assignment endpoint, pointing callers to the existing PayPal subscription flow. No verified payment endpoint or plan price was changed.                                                                                                                  |

The main authentication middleware and Auth routes now request revocation checks with
`verifyIdToken(token, true)`. Existing verification caching remains: its default is
15 seconds, and the profile/admin lookup cache defaults to 30 seconds. Approved
incident containment needs coordinated session revocation and cache invalidation or
process restarts; this patch is not proof that existing forged sessions are gone.

**Important dependency:** an attacker who previously created an `admins` document or
obtained valid signed admin claims could still satisfy the new authority policy.
Legitimate and fraudulent privileged records cannot be distinguished from field
values alone. Establish an independently verified admin roster before rollout.
Do not automatically promote every historical `users.role=admin` profile.

Official Firebase references: [field allowlists and affected keys](https://firebase.google.com/docs/firestore/security/rules-fields),
[overlapping rules and recursive matches](https://firebase.google.com/docs/firestore/security/rules-structure),
[session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions).
Backend Admin SDK writes use IAM and bypass client rules; a rules repair therefore
also needs the backend authority repairs above.

## Affected collections and checks

The original recursive `/{document=**}` permission made the blast radius **all
collections and subcollections**, including names not present in source. An explicit
list cannot narrow that wildcard. The full static inventory is reproduced in the
single delivery report and saved as `docs/security/PROFILE_SECURITY_PATHS.json`.

Direct financial/authority paths reviewed include:

- `users` and `admins`: identity, admin flags, all credit fields, monetary balances,
  subscription fields, tester access, upload controls and verification state.
- `user_credits`: purchased/referral `balance`, `growth_credits`, aggregate earnings
  and transaction history; these are not automatically interchangeable currencies.
- `user_billing`, `user_subscriptions`, `subscription_intents`, `subscription_events`,
  `subscription_refunds`: entitlements, provider bindings, renewals and cancellations.
- `payments`, `payment_events`, `transactions`, `paypal_webhook_events`, `webhook_logs`,
  `usage_ledger`: payment state, fulfilment, verification, deduplication and usage.
- `credit_usage`, `credit_charges`, `credit_refunds`, `credit_ledger`: deductions,
  refunds, operation receipts and growth awards.
- `payouts`, `withdrawals`, `earnings_events`, `reward_history`, `redemption_history`,
  `referral_invitations`, `referrals`, `squad_shares`, `bounties`, `engagement_proofs`:
  earnings, referral/engagement rewards and redemption dependencies.
- `content`, `ads`, `paid_boosts`, `ad_analytics`: user-editable inputs to financial
  reporting, rewards or paid campaign state.
- All workspaces, memberships/invites, provider connections, configuration, audit,
  operations, model/job records, future collections and isolated `credits_v2_*`
  documents were reachable through the old global admin fallback after escalation.

Authentication and authorisation review covered the shared middleware; login,
registration, verification and admin login; `adminOnly`; inline admin checks in
admin dashboards/analytics/cache/security/content/support/operations; media render
review; live ownership checks; user/profile and subscription admin routes; compliance,
system diagnostics and monetary payout administration. The generated Functions
server is a packaging copy; it was not hand-edited. Source references in the inventory
include provider functions, root maintenance programs and scripts as well as the API
and frontend. Dynamic collection expressions are listed separately and are not
claimed to be exhaustively resolved by static analysis.

## Profile and billing compatibility

The owner-editable client fields are name/display name, photo/avatar/thumbnail URL,
bio, timezone, notification and scheduling preferences, default platforms/frequency,
auto-repost preference, PayPal contact and update timestamp. On initial creation an
optional creation timestamp must equal the server request time; it cannot later be
backdated. Email identity, role, plan, credits and verification are not client fields.
The existing authenticated profile APIs still support their normal display/contact
editing fields while ignoring injected credit/role/tier input.

No balance reconciliation, payment capture, fulfilment routine, credit deduction,
renewal amount, subscription price, provider setting or Cam Combiner implementation
was changed. Actual backend writers continue through the Admin SDK. The tests verify
that registration/profile changes preserve financial fixtures and that existing
subscription/entitlement behaviour still passes its prior regression tests.

This is not proof of live-provider settlement or every frontend screen. Staging still
needs browser onboarding/profile tests, administrator access checks, invoice-bound
sandbox payment/renewal tests and generated Functions packaging validation.

## Legacy financial risks reviewed but not changed

| Risk                                  | Source and assessment                                                                                                                                                                                                                                                       | Required follow-up                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mirror resurrection                   | `paymentsRoutes`, `paymentsExtendedRoutes` and `referralGrowthEngine.getCreditBalance` select the maximum of `users.credits` and `user_credits.balance`. Some apparent reads write that result back. A stale 100-credit mirror can restore a real 20-credit balance to 100. | Read-only reconciliation from immutable provider/usage evidence; choose an authority only after review. Never invoke these apparent read helpers against production as an audit. No mirror was repaired here.                                                 |
| Capture/package/owner binding         | Both credit capture routers select the award from a request package ID after a COMPLETED response without fully binding stored order owner, reference/package, actual capture amount and currency. Existing receipt deduplication does not replace those checks.            | Persist a server order intent and validate every capture attribute and receiver before fulfilment. Review both routes together with refunds and replay handling. No actual provider transaction or award was attempted.                                       |
| Shared fulfilment metadata            | `fulfillmentService` bases conversions on payment metadata/type/user and monetary amounts; it has transactional and fallback branches.                                                                                                                                      | Prove callback verification, order ownership, currency/amount binding, and exactly-once fulfilment across every caller before changing it.                                                                                                                    |
| Webhook protocol consistency          | The custom PayPal webhook handler uses a SHA-256 body digest and optionally a local HMAC, whereas PayPal's REST self-verification documentation specifies CRC32 or its verification API. A different wrapper already calls the verification API.                            | Reconcile the actual deployed handler and provider protocol in a separate sandbox-tested fix; do not assume a local test signature validates a PayPal notification. [Official PayPal verification guidance](https://developer.paypal.com/api/rest/webhooks/). |
| Referral/viral award replay           | Legacy referral awards use read-modify-write balances; signup bonuses can replace a document. `awardViralLoopBonuses` can add the same computed positive contribution on repeated calls without a unique settlement period/event.                                           | Introduce reviewed transaction/event receipts and correct currency/source accounting; validate effects with emulator tests before rollout. These award routines are unchanged.                                                                                |
| Withdrawal validation/concurrency     | `withdrawalRoutes` compares/subtracts a request amount without strict positive finite monetary validation or a single reserve/create transaction. Negative values can invert the debit in the source logic.                                                                 | Separate payment-safety patch with negative/NaN/currency/concurrent-withdrawal tests and provider sandbox checks. No withdrawal or balance adjustment was executed.                                                                                           |
| Storage ACLs                          | `storage.rules` has a broad authenticated fallback allowing reads and small-file writes across paths, overlapping narrower owner rules; its admin helper still reads the profile role.                                                                                      | A separate scoped Storage rules repair and Storage emulator/browser regressions are required. Storage rules were not changed or deployed; no Storage exploit was performed.                                                                                   |
| Workspace and secondary-document ACLs | Existing rules let workspace members/owners and some document owners modify broad document payloads. Protected financial/profile fields alone do not prove every workspace seat, publication, message or job-state invariant.                                               | Review field permissions and trusted input sources separately. This patch is not a full authorisation redesign or a guarantee that every business abuse path is closed.                                                                                       |

These residual financial risks prevent calling the whole billing system secure or
the unified-credit migration ready. Closing profile escalation does not validate
historical balances or justify a production monetary migration.

## Isolated test results

- **75 security tests passed** in a fresh real Firestore emulator; no failed, skipped
  or cancelled cases. The suite reproduces the old exploit, then tests the repaired
  rules, forged authority aliases, UID/email substitution, privileged session
  revocation, password/token login, registration ownership, profile editing,
  financial fixture preservation, server writes, content reward fields, paid-state
  writes, trusted admins, hosted bypass rejection and legacy plan self-assignment.
- **10 server/billing/subscription regression tests passed** across five Jest suites,
  including a hosted deployment returning 404 for unauthenticated admin setup.
- Targeted ESLint, changed-file JavaScript syntax and whitespace checks passed.
  Expected `PERMISSION_DENIED` emulator messages are successful negative tests.

Run the isolated security suite from the repository root:

```sh
CREDITS_JAVA_BIN=/path/to/java21/bin/java npm run test:security:profile
```

`CREDITS_JAVA_BIN` is the existing test-runner convention; the default is `java`.
The runner starts and owns a fresh loopback emulator for `demo-autopromote-security`,
uses the cached Firestore emulator jar and removes its scratch data on exit. It does
not point at or clear an existing emulator. Identity verification, password responses,
email delivery and revocation outcomes are controlled fixtures; production Firebase
credential initialization and actual provider requests are not used by this suite.

Existing regression command:

```sh
FIREBASE_ADMIN_BYPASS=1 CI_ROUTE_IMPORTS=1 OPENAI_LOGGING_ENABLED=1 \
ENABLE_BACKGROUND_JOBS=false NODE_ENV=test \
node_modules/.bin/jest --runInBand --selectProjects server --runTestsByPath \
  src/__tests__/server.hostedAdminRoutes.test.js \
  test/paypal-subscription.routes.test.js \
  test/payments.dev.mock.subscription.test.js \
  test/payments-routes.test.js src/__tests__/billingService.entitlements.test.js
```

Limitations: Auth cryptography and real account revocation are delegated to Firebase,
not reproduced by the fixtures; Storage rules, live deployments, account compromise,
provider settlement, load and all legacy financial risk cases were not end-to-end tested.
No production tests, session revocations, credit mutations or provider payments occurred.

## Separate Google web reward verification investigation

Checked the current official GPT sample/reference, rewarded web help, GPT release
notes, Offerwall Custom Choice documentation and Mobile Ads SSV documentation.

| Option                           | What is documented                                                                                                                            | Decision for AutoPromote                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPT rewarded web                 | The browser event `rewardedSlotGranted`; documented reward payload fields are `amount` and `type`.                                            | Useful for UI, not authenticated proof delivered to the backend. No public signed web transaction/callback protocol was verified. [GPT reference](https://developers.google.com/publisher-tag/reference#googletag.RewardedPayload), [official sample](https://developers.google.com/publisher-tag/samples/display-rewarded-ad). |
| Web help's SSV heading           | A table-of-contents anchor exists, but the accessible article body does not specify callback fields, signing keys or a verification contract. | Unresolved, rather than proof that a supported web SSV product exists or cannot exist. Request an account-supported protocol and fixtures from Google. [Web rewarded help](https://support.google.com/admanager/answer/9116812?hl=en).                                                                                          |
| Offerwall/custom choice          | Client integration and page-access decisions for a publisher's own monetisation solution.                                                     | Does not establish that Google completed or paid for a particular ad. [Official Custom Choice API](https://developers.google.com/funding-choices/offerwall-custom-choice-docs).                                                                                                                                                 |
| Mobile Ads SSV                   | Signed callbacks with transaction IDs, keys and user/custom-data fields for mobile inventory.                                                 | Cryptographic completion verification is documented there, but support must not be transplanted to GPT web without confirmation. Even an authentic completion is not a guarantee of final advertising revenue. [Mobile SSV](https://developers.google.com/admob/android/ssv).                                                   |
| AutoPromote nonce/HMAC/App Check | Evidence of our own session/issuer or app integrity.                                                                                          | Cannot prove Google served, completed or paid for an ad. Keep mock completion isolated and live award adapters absent.                                                                                                                                                                                                          |

No announcement establishing a usable GPT web SSV integration was verified in the
[GPT release notes](https://developers.google.com/publisher-tag/release-notes).
No Google support request was sent, account setting changed or real ad requested.
An eventual provider verifier needs authenticated signed evidence bound to user,
session, ad unit and event, global replay protection, expiry/key rotation and test
fixtures. Inventory eligibility and finalised revenue are separate checks.

## Commercial decisions remain pending measured costs

The earlier demo's allowance, ad reward/cap and microdollar pricing are test inputs,
not final free-plan policy or an approved reward offer. No amount is finalised here.
Measure actual billed worker lifetime/startup, CPU/GPU shape, retries, storage byte-time,
downloads/egress, Firestore/Tasks and external API costs per operation before proposing
commercial credits. Use measured failure costs and conservative ceilings. Verify
real eligible demand and final revenue separately; assume no ad income meanwhile.

## Exact approval and access gates

1. **Deployed-state evidence:** obtain an owner-exported active Firestore/Storage
   ruleset and release identifiers, or suitable read-only Rules access. HTTP 403 is
   not permission to deploy or change IAM. Compare the export with the tested files.
2. **Privileged-record/incident plan:** independently verify legitimate admins and
   decide whether session revocation, removing forged admin entries/claims or other
   containment is necessary. Those production writes require explicit approval and
   a named scope. Restart/invalidate caches as part of an approved coordinated plan.
   No balance repair is implied by approval to repair permissions.
3. **Staging validation:** explicitly authorise any deployment or real provider
   sandbox integration to a named nonproduction project. Review the precise patch,
   administrator compatibility, profile/onboarding behaviour, paid-state APIs,
   content editing, token revocation and packaged Functions imports first.
4. **Production security repair:** explicitly approve the exact rules/API revision,
   target project/database/services, maintenance window, admin roster, session/cache
   handling, monitoring and rollback. Rules and backend authority repairs must be
   coordinated. Rolling back to the vulnerable rules is not a safe default rollback;
   preserve billing data and use a reviewed restrictive fallback if needed.
5. **Separate money/provider work:** reconciliation, migration, balance corrections,
   changing payment fulfilment, revoking sessions, changing provider settings, live
   ads and final allowances/rewards each need their own explicit scoped approval.
   Operational costs and provider verification must be measured/verified first.
6. **Repository publication:** pushing or merging requires explicit approval. A
   local patch, passing tests or this report does not authorise either action.

Production systems, balances, prices, subscriptions, claims, rules releases, storage
objects and advertising accounts remain unchanged. No push, merge or deployment
was performed. The complete proposed source patch and audit inventory are included
in the single delivery report for review.
