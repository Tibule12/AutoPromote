# AutoPromote — Ad-Supported Freemium and Unified Credits: All Deliverables

> **27 October security update:** monetisation work is paused. Approved emergency Firestore/Storage containment and CLI credential revocation have been executed, and public access to the alternate API was removed under subsequent autonomous security authorisation. The repaired backend and owner-scoped Firestore/Storage Rules are live; security PRs #498/#499 are merged. A pre-existing CI workflow also refreshed seven historical test documents; the unsafe cloud-seeding path has been removed. See [current security status](../AutoPromote-security-readiness-20261026/SECURITY_RELEASE_READINESS.md) for the release, incident evidence and remaining limits. Earlier “production unchanged” statements and Section 9's authority policy describe historical snapshots, not the current incident state.

Prepared: **26 October 2026**  
Foundation branch: `feat/unified-credits-foundation-20261026`

Security work is now isolated on `security/release-readiness-20261026` in a separate worktree.
Read the [latest concise security release-readiness report](../AutoPromote-security-readiness-20261026/SECURITY_RELEASE_READINESS.md)
for the confirmed deployed-rules evidence, clean security-only patch, updated tests and approval gates.
Section 9 and Appendix B below are the earlier historical security snapshot; their former
HTTP 403 limitation has been superseded by a successful read-only rules export. The security
application changes and test command were removed from this foundation worktree during isolation.
Production remains unchanged. All demo allowances and ad rewards remain unapproved examples
pending measured operation costs.

**CREDITS determine what users can afford to do on AutoPromote.**

This file contains the complete delivery report, official Google documentation links,
architecture assessment, proposed credit model, implemented foundation, security and
financial test evidence, economics, manual Google steps and approval requirements.
Appendix A includes the full source of the 18 foundation implementation/configuration/test
files and its four npm scripts. Appendix B includes the prepared security repair and tests. You can review or share this file without opening
the separate reports. Running the code still uses the existing AutoPromote repository
and dependencies; this report is not a standalone application installer.

**Current state:** the foundation works only with an explicitly enabled local demo
Firestore emulator. It is not connected to live advertisements, existing production
wallets or actual processing jobs. Existing users, balances, subscriptions, prices,
billing behaviour and Cam Combiner remain unchanged. No production credits, live
advertisements, deployment, merge or push were performed.

## Deliverables at a glance

| Requested deliverable                                            | Included here                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Verified Google setup instructions and official documentation | Sections 1 and 6                                      |
| 2. Existing credit and billing architecture assessment           | Section 2                                             |
| 3. Proposed free and paid credit model                           | Section 3                                             |
| 4. Actual isolated, testable foundation                          | Sections 3 and 4; complete source in Appendix A       |
| 5. Security and financial-abuse tests                            | Section 5; runnable test source in Appendix A         |
| 6. Manual Google actions                                         | Section 6                                             |
| 7. Implemented, unverified and approval-required status          | Section 8 and the migration gates in Section 3        |
| Advertising economics and spending recommendations               | Section 7; calculator and configuration in Appendix A |

## Contents

- [1. Google advertising research and official documentation](#1-google-advertising-research-and-official-documentation)
- [2. Existing architecture audit and infrastructure evidence](#2-existing-architecture-audit-and-infrastructure-evidence)
- [3. Credit model, implementation and migration gates](#3-credit-model-implementation-and-migration-gates)
- [4. Local preview and verification instructions](#4-local-preview-and-verification-instructions)
- [5. Security, financial-abuse and browser validation](#5-security-financial-abuse-and-browser-validation)
- [6. Manual Google setup instructions](#6-manual-google-setup-instructions)
- [7. Advertising economics and financial safeguards](#7-advertising-economics-and-financial-safeguards)
- [8. Implementation status, unknowns and approval requirements](#8-implementation-status-unknowns-and-approval-requirements)
- [9. Security repair review](#9-security-repair-review)
- [Appendix B. Proposed security repair patch and test source](#appendix-b-proposed-security-repair-patch-and-test-source)
- [Appendix A. Complete implementation and test source](#appendix-a-complete-implementation-and-test-source)

## 1. Google advertising research and official documentation

Research date: 26 October 2026. Branch: `feat/unified-credits-foundation-20261026`.
This is a staged foundation, not permission to change production monetisation.

### Google product and implementation decision

Use **Google Ad Manager + Google Publisher Tag (GPT)** for evaluating a custom,
voluntary credit reward flow. AdSense is the simpler ad network; Ad Manager adds
inventory, direct sales and exchange controls. **AdSense also has rewarded ads
through Offerwall**; saying AdSense has no rewarded advertising would be wrong.
Offerwall primarily rewards content access, with metering and potentially blocking
messages. Its documented flow is not a verified account-credit settlement API.
Do not add Offerwall across the editor.

Official sources:

- [Product comparison](https://support.google.com/admanager/answer/9234653?hl=en)
- [AdSense Offerwall](https://support.google.com/adsense/answer/13865318?hl=en)
- [Ad Manager web rewarded implementation and reporting](https://support.google.com/admanager/answer/9116812?hl=en)
- [GPT rewarded sample](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)
- [GPT API reference](https://developers.google.com/publisher-tag/reference)

GPT supports desktop, mobile and tablet web on mobile-optimised pages with neutral
zoom. A slot can be unsupported (`defineOutOfPageSlot` returns null) or unfilled.
Use `rewardedSlotReady` to offer display, `makeRewardedVisible` after opt-in,
`rewardedSlotGranted` for the browser reward event, and `rewardedSlotClosed` for
cleanup. A video-complete or close event alone is insufficient. Display demand
can also fill rewarded slots; do not promise that every ad is a video. Test slots
and simulations generate **no real revenue**.

#### Critical verification uncertainty

The current web help page contains a table-of-contents anchor labelled server-side
verification, but the accessible article body does not provide a callback protocol,
signing keys, signed fields or verification instructions. The public GPT sample
documents browser events. The [Mobile Ads SSV protocol](https://developers.google.com/admob/android/ssv)
is for mobile SDK inventory and must not be assumed to apply to GPT web inventory.
No trustworthy production web completion channel has been verified for this account.
This is an unresolved integration requirement, **not a claim that Google can never
offer web SSV**. Ask Google for an account-supported, documented signed protocol.
An AutoPromote HMAC, nonce, timer, App Check token or browser event cannot prove that
Google served and completed a paid advertisement. Therefore the implementation
accepts only clearly marked **local mock** completions and has no live-ad adapter.

### Eligibility, accounts, demand and payments

The publisher needs a valid AdSense account to sign up for Ad Manager; active
AdSense serving is not required. Accounts are permanently linked. AdSense requires
an adult applicant, site control and original, policy-compliant content. Approval
of AutoPromote, its logged-in tool pages or its inventory has not been established.
Ad Manager access does not itself establish access to Ad Exchange demand.

- [Ad Manager signup](https://support.google.com/admanager/answer/7084151?hl=en)
- [AdSense eligibility](https://support.google.com/adsense/answer/9724?hl=en)
- [Site management and approval](https://support.google.com/admanager/answer/10130765?hl=en)
- [ads.txt authorisation](https://support.google.com/admanager/answer/9422067?hl=en)

Advertisers supply reviewed creatives and bids through Google Ads, DSPs and
Authorized Buyers, or a publisher sells a reservation/direct deal and traffics its
creative. Ad Manager selects eligible demand according to inventory, targeting,
consent, pricing and campaign availability. Creating an ad unit does not create
advertisers. Google handles eligible programmatic collections/payments; traditionally
negotiated direct campaigns require the publisher to collect from the advertiser.
There is no guaranteed fill, CPM, completion price or per-view revenue.

Report impressions, rewarded interaction type, revenue, eCPM and fill by ad unit,
country/device and consent state. Reconcile earned credits and issuance liability
against **finalised** revenue, separately from estimated reports and cash received.
Invalid traffic can reduce final earnings. Google filtering protects ad demand,
not the AutoPromote wallet from fabricated client requests.

- [Invalid traffic questions](https://support.google.com/admanager/answer/1348754?hl=en)
- [Estimated versus final earnings](https://www.google.com/ads/adtrafficquality/publishers/)
- [Payment guide](https://support.google.com/admanager/answer/2671026?hl=en)
- [Identity verification](https://support.google.com/admanager/answer/13985965?hl=en)
- [Address verification](https://support.google.com/admanager/answer/1251398?hl=en)
- [Payment thresholds](https://support.google.com/admanager/answer/2731681?hl=en)

Complete legal/payee details, applicable tax information, identity verification,
address/PIN verification and payment-method setup when required. Thresholds depend
on account currency: the published USD payment threshold is $100, not a universal
threshold in the user's local currency. Holds and adjustments can delay payment.
Do not budget compute against an assumed payout date or unfinalised views.

### Reward and consent policy

[Google reward policies](https://support.google.com/admanager/answer/7496282?hl=en)
require clear action/reward disclosure before every ad, affirmative opt-in, usable
skip/dismiss controls and delivery of the promised reward on completion. Declining
must not interfere with normal use. Avoid copy asking people to support the business
by watching or clicking. Never incentivise clicks. Rewards must be non-transferable,
usable within AutoPromote and not convertible to cash, gift cards or transferable
items. Credits should buy processing services only. Existing rewards, referrals,
cash payouts and promotion incentives need separate policy review; they are not
automatically compatible with an ad-earned processing credit.

Ad opt-in and consent to personalised advertising/storage are separate choices.
Apply Google's [EU user consent policy](https://www.google.com/about/company/user-consent-policy/)
and [certified CMP guidance](https://www.google.com/about/company/user-consent-policy-help/)
for the EEA, UK and Switzerland, and relevant age and regional requirements.
Do not pass email, name, project text or identifying URLs in ad targeting; see
[Google's PII policy](https://support.google.com/admanager/answer/7686480?hl=en).

[App Check for custom backends](https://firebase.google.com/docs/app-check/web/custom-resource)
and [token replay protection](https://firebase.google.com/docs/app-check/custom-resource-backend)
can supplement Firebase Auth, rate limits and anomaly monitoring. They do not
verify an ad completion. Production additionally needs verified identities,
account-farming controls, transaction deduplication, reward-session expiry and a
global issuance budget. An account-level monthly cap alone cannot stop Sybil abuse.

## 2. Existing architecture audit and infrastructure evidence

### Repository audit before implementation

| Area                | Existing implementation and consequence                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication      | `src/authMiddleware.js` verifies Firebase ID tokens with a short cache and has nonproduction token/E2E bypasses. New sandbox routes use a separate, explicit local demo identity and never import production credentials.                                                                                                                                                   |
| Editing credits     | `src/creditSystem.js` calculates a UTC calendar-month allowance from `credit_usage` plus `users.credits`. Some charges/refunds have idempotency receipts; no general reservation state machine. Summing total usage rather than monthly-funded usage can distort allowance reporting after top-ups. No strict finite positive integer validation.                           |
| Credit stores       | `users.credits`, `user_credits.balance`, `user_credits.growth_credits`, `users.aiCredits`, tester allowance counters and monthly usage coexist. They have different meanings and cannot safely be summed.                                                                                                                                                                   |
| Purchase flow       | `src/paymentsRoutes.js` has server package tables, PayPal capture, a transactional receipt and mirrors balances with `Math.max`. A stale mirror can resurrect spent credits. Capture uses a client package ID; amount, currency, stored order owner and purchased package need binding in a future reviewed fix. Do not migrate purchases until all writers are identified. |
| Payment providers   | `src/services/payments/paypalService.js`, PayPal subscription routes/webhooks and shared fulfilment services coexist. Stripe subscription sync code remains, while `billingRoutes.js` says Stripe integration removed. Presence of source is not evidence of an active provider.                                                                                            |
| Subscriptions       | `subscriptionPlans.js` currently grants 15 / 150 / 500 / 2000 credits for Starter / Creator / Studio / Agency. Existing plan prices and benefits are preserved. `user_billing`, user fields and tester access influence effective tier.                                                                                                                                     |
| Queue / Publisher   | `contentRoutes.js`, `usageLimitMiddleware.js`, billing checks, publishing quotas, promotion queues and platform-specific dispatch exist. Processing credits do not yet replace their quotas. Platform API limits and team benefits must remain.                                                                                                                             |
| Studio / clips      | `mediaRoutes.js` and media workers charge for scans and selected renders, provide estimates and refund selected failed jobs. Durable jobs can outlive HTTP calls; a timeout is not proof work stopped. Preserve projects/local editing when the wallet is empty.                                                                                                            |
| Infrastructure      | Firebase Hosting/Auth/Firestore/Storage/Functions, Express API and Python Cloud Run workers, Cloud Tasks and durable Cloud Run Jobs. The generated `autopromote-functions/_server` copy is produced by predeploy; do not hand-edit it.                                                                                                                                      |
| Firestore security  | `firestore.rules` lets owners write their whole user document, including credits/role/tier. Admin status reads that writable role. This is a **production blocker**. New sandbox rules deny all client financial writes independently. Existing rules are not deployed or silently rewritten in this foundation.                                                            |
| Browser integration | Firebase Hosting sets COEP `require-corp` and COOP `same-origin`; Express CSP also restricts external resources. GPT/CMP must be tested on the actual origin. A dedicated opt-in credits page may need a reviewed header exception. Do not relax editor isolation globally.                                                                                                 |
| Cam Combiner        | Has existing render billing, approval, service and job implementations. Excluded and unchanged.                                                                                                                                                                                                                                                                             |

### Read-only infrastructure evidence

Queried the already authenticated `autopromote-cc6d3` project with `gcloud` describe/list
commands; no deploy, execution, mutation, billing query or production credit grant.

- `media-worker-v1`, us-central1: 4 vCPU, 4 GiB, concurrency 1, request timeout
  3600 seconds, max instances 3, request CPU throttling and startup CPU boost enabled.
- `cam-combiner-worker`: concurrency 1, timeout 3600 seconds, max instances 3;
  implementation excluded from rollout.
- `autopromote-model-v1-video`: 20 vCPU, 80 GiB, one GPU, task count/parallelism 1,
  timeout 3300 seconds, retries 0. Segmentation job: 20 vCPU, 80 GiB, one GPU,
  timeout 600 seconds. GPU model/region-specific billing must be checked against
  job node selector and actual SKUs before commercial pricing.
- Additional tracking/vision jobs and a GPU qualification job exist. Listing a job
  does not establish actual production usage or cost per operation.
- Main media bucket is US-CENTRAL1. Existing prefix-scoped lifecycle rules delete
  temp objects after 1 day, ingest after 3 custom-time days, selected outputs after
  7 days and edited videos after 30 days. The 3D temp bucket has a 1-day rule.
  Prefixes outside these rules require a storage exposure review.

Billing export/invoices, request durations, GPU utilisation, API invoices, actual
served ads, Google account approval, demand and revenue are **unverified**.
Public unit prices and configured limits are not actual invoice totals.

## 3. Credit model, implementation and migration gates

### Proposed model

One available balance determines affordability across Queue, Publisher, Studio and
Find Viral Clips. Reserving work removes credits from the available balance and
holds them until a trusted worker outcome. Saving, editing and project recovery
never require a reservation. Cam Combiner stays on its existing implementation.

Keep the existing monthly allocations for the first measured pilot:

| Plan    | Monthly credits | Rewarded ads                                                  | Existing benefits |
| ------- | --------------: | ------------------------------------------------------------- | ----------------- |
| Starter |              15 | Optional; proposed test reward 1 credit, maximum 20 per cycle | Preserved         |
| Creator |             150 | Ad-free                                                       | Preserved         |
| Studio  |             500 | Ad-free                                                       | Preserved         |
| Agency  |            2000 | Ad-free                                                       | Preserved         |

These are a proposal and **sandbox settings**, not an approved commercial reward
rate. Paid prices and existing billing behaviour have not changed. The 1-credit
reward has no assumed advertising revenue; a real pilot needs a funded subsidy or
validated economics. All allocations, caps, resource prices, wallet capacity and
financial ceilings come from server configuration. The example reuses allocations
from `subscriptionPlans.js` unless explicitly overridden by the sandbox config.

Renew at 00:00 UTC on the first calendar day each month, matching the existing
editing-credit calendar rather than silently moving users to PayPal billing dates.
Renewal is lazy and transactional. Issue only the current month's allowance after
inactivity, never a backlog. Unspent monthly grants and earned ad credits expire;
purchased/opening credits persist. Spend expiring credits first. A reservation
remains held over renewal; a confirmed failure of started work after its original
month yields persistent compensation credits so the failed operation does not erase
the refund. Cancelling work that never started returns its purchased portion; an
already expired allowance portion expires. Queuing and cancelling across renewal
cannot turn a monthly allowance into permanent credits.

The wallet has a configurable total holding cap, including outstanding reservations
and pending rewards. Renewal grants only the room available under that cap; no
later catch-up during that cycle. The UI discloses capacity. Purchases exceeding
capacity are rejected before issuance. The legacy purchase routes are not wired
to this policy and must be reviewed before migration.

There are no feature-specific monthly usage quotas in the new wallet. Credits can
be spent in one day. Safety controls limit global/per-user infrastructure spending,
concurrent work, input size and worst-case runtime; these do not grant separate
feature allowances. Preserve external platform API constraints and plan benefits.

### Implemented foundation

`src/services/unifiedCredits/wallet.js` uses real Firestore transactions. Each user's
`credits_v2_wallets` document is the authority for available and reserved credits.
`expiring` and `permanent` are internal provenance, checked against `balance`; they
are not independent feature wallets. Every credit amount is a nonnegative safe
integer. Monetary budgets use integer USD microdollars. Nothing trusts browser
prices, balances, tiers or a completion boolean.

The immutable ledger distinguishes opening balances, granted credits, earned ad
credits, purchased credits, reservations, consumption, releases and expiry. Lifetime
totals separate gross successful consumption, refunds and expirations. A reservation
release is not a new earned or granted credit. Financial budget documents preserve
the operation's original month. A global control document tracks outstanding work
across calendar boundaries and provides spending/reward/issuance kill switches.

| Transition                     | Credits                            | Infrastructure budget                                    |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| Reserve                        | Move available credits into a hold | Reserve worst-case configured resource cost              |
| Start                          | Hold remains                       | Hold remains; one caller can acquire dispatch permission |
| Success                        | Consume held credits once          | Account full configured resource ceiling as spent        |
| Cancel before start            | Release once                       | Release cost reservation                                 |
| Confirmed failed worker        | Refund once                        | Keep resource ceiling as spent                           |
| Timeout / unknown worker state | Keep held                          | Keep held until reconciliation proves terminal outcome   |

`reserve` requires a stable request ID plus the approved credit price and configuration
digest. Reusing an ID for a different operation/workload is rejected. `start` succeeds
only once; a redelivery must not repeat processing. `settle` is idempotent and rejects
contradictory outcomes. Call these from trusted job orchestration, not browser routes.
Actual dispatch and the `running` transition are not one atomic distributed operation:
a crash between them requires reconciliation. Never automatically rerun or refund a
job merely because its HTTP request timed out.

The mock reward protocol binds user, session, global event ID and completion time
with a local HMAC. It verifies signature, ownership, TTL, cycle, caps and replay.
One session can be pending per account; a session holds its reward liability and
wallet space before the reward is promised. Skip/expiry close the session and release
the financial hold. A promised valid completion is honoured even if new reward
issuance has been paused. This is **not Google verification**.

Expired sessions are recovered explicitly by closing/dismissing them. An API caller
can resume/dismiss the pending mock ad after reloading. No scheduler automatically
releases uncertain processing jobs. A future operator reconciler must inspect worker
execution IDs, verify termination, and call the existing settlement methods.

The local UI demonstrates reward disclosure, optional ad display, skipping, balance,
cost quotes, insufficient credits, failure/refund, ad-free paid accounts, activity and
notes saved at zero balance. It has no Google SDK, external creative, payment SDK,
production Firebase client or disruptive editor toast. No exported media is touched.
These tools are **simulated in the preview**; the live Queue/Publisher/Studio/clips
dispatch paths still use their existing billing and entitlements.

### Isolation and testing

No new code is mounted by `src/server.js`, imported by production billing or copied
manually into the generated Functions server. Every wallet entry point requires:

- `UNIFIED_CREDITS_SANDBOX=true`;
- project ID exactly `demo-autopromote-credits`;
- a literal `127.0.0.1:PORT` Firestore emulator;
- a Firestore client explicitly configured for that host with TLS disabled;
- no production, Cloud Run, Cloud Functions or Render runtime marker.

The standalone HTTP preview also binds to loopback, enforces same-origin requests,
limits request sizes and rates, and accepts only explicit demo identities. The mock
completion endpoint intentionally simulates completion; it is not a live-ad security
boundary. The application does not accept arbitrary identities or production tokens.

`test/unified-credits/firestore.rules` denies client financial writes, including
forged admin claims. It allows only the owner to get their wallet. It is a separate
emulator ruleset, **not a remediation of the existing deployed rules**. Tests run
against a fresh emulator with real transaction conflicts and Firebase rule checks,
not the repository's non-transactional in-memory Admin stub.

### Migration and production gates

1. Review and repair production rules and backend role/tier trust. Protect credit,
   subscription, tester, billing and admin fields; test real application onboarding,
   profile editing and every financial collection. Do not merge the sandbox rules
   into permissive production catch-alls and assume access is restricted.
2. Inventory every writer to all legacy balances and payment fulfilment paths. Produce
   a read-only per-user reconciliation: monthly allocation, `fromMonthly` usage,
   purchased balance, mirrored balances, tester access and existing reservations.
   Investigate discrepancies; do not add mirrors together or select their maximum.
   `openingBalance` in the demo is an explicit input, not an automatic migration.
3. Snapshot and reconcile users under a maintenance/transactional cutover plan. Stop
   or redirect **all** old financial writers for an enrolled user. Match payment
   callbacks to a stored owner/order/package/currency/amount and unique provider event.
   Record a signed-off opening entry once. Never dual-charge or dual-grant a cohort.
4. Bind verified subscription events and effective plan benefits to the new authority.
   Make monthly grant amounts stable within a cycle; explicitly review upgrade,
   downgrade, cancellation, refunds and founding tester conversion. No subscription
   price, paid benefit or billing-date migration is part of this foundation.
5. Wire each supported operation through a trusted dispatcher: derive resource ceilings
   from validated server metadata, compare the user's approved quote, reserve, acquire
   dispatch once, persist execution ID and settle only a trusted terminal outcome.
   Implement a durable outbox/reconciler for the dispatch crash window. Aggregate
   retries, output storage and third-party calls into the cost ceiling. Remove redundant
   feature quotas only for the migrated cohort; keep platform/API/size constraints.
6. Harden Auth/App Check, account-farming controls, worker IAM and global spending
   limits before free access can create real infrastructure jobs. Private workers must
   reject calls that bypass admission. Enforce maximum runtime, task count and retries
   at the worker; a quote alone cannot cap a cloud bill.
7. Resolve Google's account approval, ad demand, consent/header compatibility and
   trustworthy completion channel. Implement a separately reviewed live verifier;
   never reuse the mock issuer. Observe final revenue and measured costs by cohort.
8. After explicit approval, deploy to a nonproduction project, exercise provider sandbox
   payments and worker failure/recovery, then propose a limited production cohort.

Rollback before cutover is simply leaving the isolated code unmounted. After cutover,
rollback must reconcile the ledger back into the old authority without replaying
grants/payments or resurrecting a stale mirror. Never switch stores on a transient error.

**Not performed:** production grants, legacy migration, Google signup/configuration,
live ads, live payment changes, production deployment, a merge or a remote push.

## 4. Local preview and verification instructions

### Run the local preview

Use Node 20+ and Java 21+ with the existing installed dependencies. If necessary,
download the official emulator with `npx firebase setup:emulators:firestore`.
No Google advertising credentials or production Firebase credentials are needed.

Terminal 1, from the repository root:

```sh
npx firebase emulators:start --only firestore \
  --project demo-autopromote-credits \
  --config test/unified-credits/firebase.json
```

Terminal 2:

```sh
UNIFIED_CREDITS_SANDBOX=true \
UNIFIED_CREDITS_PROJECT_ID=demo-autopromote-credits \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 \
npm run credits:sandbox
```

Open `http://127.0.0.1:8190`. Choose Starter or the simulated Creator subscriber.
Watch/skip/complete a mock ad, review a cost, consume credits, test failure/refund,
and save notes even at zero credits. Only the demo project is written. The preview
does not access real projects, authenticate production users, process media or take
payments. Stop both local processes when finished.

To supply a different reviewed test policy, set `UNIFIED_CREDITS_CONFIG` to a JSON
file based on `config/unified-credits.sandbox.example.json`. Server restarts preserve
existing wallets and kill switches; they do not overwrite balances or tiers.

### Verify

```sh
npm run test:credits
npm run test:credits:browser
npm run credits:economics
```

The test runner owns a fresh ephemeral emulator and cleans it up. It does not use
the configured production project or delete an existing emulator's data. It expects
the cached v1.22.0 emulator by default; `CREDITS_FIRESTORE_JAR` selects another local
jar. `CREDITS_JAVA_BIN` can select a Java 21+ executable without changing system Java.
Browser checks require an installed Playwright Chromium (`npx playwright install chromium`).

Security/financial tests cover real concurrent Firestore transactions, duplicate
reservation/dispatch/settlement, overspending, nonpositive and unsafe inputs, stale
quotes, cross-user events, forged/tampered rewards, monthly caps, expiry, renewals,
cross-cycle jobs, refund abuse, global/per-user budgets, issuance farming, wallet
headroom, kill switches, demo HTTP auth/origin boundaries and client-write denial.
Browser checks cover opt-in, skip, reward, consumption/refund, zero-credit saving,
paid ad-free state, mobile layout and absence of external network requests.

## 5. Security, financial-abuse and browser validation

Validated locally on 26 October 2026, on branch
`feat/unified-credits-foundation-20261026`.

| Check                                                       | Result                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Fresh real Firestore emulator suite                         | 36 tests passed; 0 failed, skipped or cancelled                           |
| Concurrent overspend, duplicate dispatch/settlement/rewards | Passed with real transaction conflicts and retries                        |
| Financial limits and failure/refund abuse                   | Passed                                                                    |
| Firebase client security rules                              | Passed; expected `PERMISSION_DENIED` output proves client-write rejection |
| Chromium desktop/mobile flow                                | Passed at 1280px and 390px widths, no horizontal overflow                 |
| Browser network isolation                                   | No external requests observed                                             |
| Zero-credit editing/save                                    | Notes saved and survived reload; processing remained disabled             |
| Paid subscriber preview                                     | Larger balance and ad-free state passed                                   |
| Targeted ESLint `no-undef` / `no-unused-vars`               | Passed for new backend, scripts, tests and browser JavaScript             |
| JavaScript syntax                                           | All 12 new `.js` / `.cjs` files passed `node --check`                     |
| Formatting / whitespace                                     | Prettier and `git diff --check` passed                                    |
| Existing repository sanity tests                            | `npm run test:unit` passed                                                |

Command used for the complete suite and browser checks:

```sh
CREDITS_JAVA_BIN=/tmp/autopromote-credits-java21/jdk-21.0.13+9-jre/bin/java \
npm run test:credits:browser
```

The installed system Java was version 17. A temporary Temurin Java 21 runtime was
downloaded to `/tmp` to run the cached Firestore emulator; system Java was unchanged.
The emulator used the demo project and a fresh ephemeral loopback port, then shut
down and removed its temporary data. Production Firebase Admin was never imported.

Desktop and mobile screenshots were inspected at
`/tmp/autopromote-credits-desktop.png` and `/tmp/autopromote-credits-mobile.png`.
They are temporary local evidence, not committed product assets.

`npm run credits:economics` also passed. With the explicitly hypothetical example's
zero revenue and zero verified completions it returned zero revenue-funded reward
credits, $35 maximum processing exposure and $20 unfunded exposure for 1000 users
against a $15 subsidy. These are scenario calculations, not revenue forecasts.

Limits of this validation: no live Google ads or real provider callbacks, production
auth/payment/worker integrations, migration, live-origin CSP/CMP compatibility,
actual billing invoices, load/throughput qualification or production deployment was
tested. The isolated demo's passing rules do not validate the existing production
ruleset, which still needs a separate repair and deployment review.

## 6. Manual Google setup instructions

Verified against official Google documentation on 26 October 2026. Account-specific
eligibility and available demand still require your Google account access. Nothing
on this checklist has been activated by this implementation.

1. Choose the legal publisher/payee and responsible adult account. Prepare original
   public site content, terms/privacy information and control of the domain. Review
   [AdSense eligibility](https://support.google.com/adsense/answer/9724?hl=en) and apply
   for a valid account. An authenticated productivity tool is not automatically approved.
2. Create the [Ad Manager account](https://support.google.com/admanager/answer/7084151?hl=en)
   with the intended AdSense account. Confirm network code, reporting currency/timezone,
   permissions and which ad demand products are actually available. Ask Google about
   Ad Exchange eligibility or a vetted publishing partner if needed. Do not buy advertiser
   campaigns expecting them to become AutoPromote's publisher inventory.
3. Add the real serving domain in [Inventory → Sites](https://support.google.com/admanager/answer/10130765?hl=en),
   follow ownership/site-review instructions and resolve Policy Center issues. Publish
   Google's account-specific [ads.txt record](https://support.google.com/admanager/answer/9422067?hl=en)
   at the root domain after reviewing the actual seller IDs. No fake publisher ID is
   supplied in this branch. Approval, ownership and ads.txt checks are separate.
4. Ask Google to confirm that AutoPromote's proposed account-bound processing credits
   satisfy the [reward policy](https://support.google.com/admanager/answer/7496282?hl=en),
   especially separation from transferable, monetary, referral or creator payout rewards.
   Credits must remain usable only for AutoPromote's processing services.
5. **Resolve completion verification before promising production rewards.** Request a
   supported web protocol with authenticated completion evidence, signed fields/key
   rotation, replay identifiers, user/session binding, test fixtures and failure semantics.
   The web help page's SSV anchor alone is not an integration specification. A mobile
   SDK protocol is not proof of web support. If unavailable, keep Google web credit
   awards disabled and review a different verified provider separately.
6. Configure a [Google-certified CMP](https://www.google.com/about/company/user-consent-policy-help/)
   where required and review age/regional rules. Add the required privacy disclosures,
   consent controls and ad vendor choices. Confirm personalised, nonpersonalised and
   no-consent behaviour. An affirmative "watch" click is not CMP consent.
7. In a **test environment**, create a dedicated rewarded ad unit and the appropriate
   demand/line item. Follow [web trafficking instructions](https://support.google.com/admanager/answer/9116812?hl=en):
   configure reward amount/type to match the disclosed offer, review the non-instream
   video protection, and use the documented reservation or Ad Exchange creative sizes.
   Only configure a real ad unit after approval; no unit is configured in this branch.
8. Exercise the [official GPT test sample](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)
   separately from the wallet. Use its documented test inventory rather than testing on
   paid live ads. Cover unsupported slots, no fill, ad blockers, visibility, skip/close,
   multiple tabs and loss of connectivity. Never award wallet credits for test inventory
   outside the local demo. No test impression is advertising revenue.
9. Validate the actual serving origin's CSP, COEP, COOP, cookies, iframe behaviour and
   CMP/GPT network calls. Current Firebase Hosting has `require-corp`; use a reviewed,
   narrowly scoped credits-page strategy if compatibility requires it. Avoid placing
   messages on login, editor or save flows; never modify exported videos.
10. Configure reports using rewarded interaction type and dedicated ad-unit dimensions.
    Measure fill, impressions, rewarded events, estimated/final revenue and invalid-traffic
    adjustments. Reconcile these aggregate reports with wallet awards and cost ceilings;
    aggregate revenue reporting is not per-session reward verification.
11. Complete [payment setup](https://support.google.com/admanager/answer/2671026?hl=en):
    legal address, tax information where required, identity, address/PIN, payment method
    and holds. Check the [thresholds for your reporting currency](https://support.google.com/admanager/answer/2731681?hl=en).
    Do not assume a payout before these checks and the threshold are satisfied.
12. In Cloud Billing, inspect actual invoices and enable a suitably scoped billing export
    for cost attribution after approval. Use labelled nonproduction measurements to
    capture startup, elapsed billed resource seconds, retries, output bytes, storage,
    egress, service API usage and costs per operation. Set project/service limits and
    review [spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).
    Eligible service caps still have reporting/enforcement delay; persistent resources
    and services outside the cap can continue to incur charges. Retain admission limits.

Your explicit approval is required before activating real ads, setting a commercial
reward rate, migrating/granting production credits, changing live prices or billing,
deploying to production or merging. A production rollout proposal should include the
exact Google account/inventory, verified callback protocol, migrated cohort, revised
rules, worker limits, pricing configuration, funding ceiling and rollback procedure.

## 7. Advertising economics and financial safeguards

The actual account's advertising revenue and per-operation invoices are unknown.
The implementation assumes **zero ad revenue** until there is a verified observation.
Credits represent processing capacity, not cash, and cannot be withdrawn or transferred.

### Verified unit prices and configured resources

On-demand USD reference prices checked on 26 October 2026, before discounts, free
tiers, taxes and region-specific differences. These are cost calculations from live
resource settings, **not measured invoice totals or runtime benchmarks**.

| Resource / scenario                                             | Published reference or derived compute allocation        |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Request-billed CPU                                              | $0.000024 per vCPU-second                                |
| Request-billed memory                                           | $0.0000025 per GiB-second                                |
| Instance/job CPU                                                | $0.000018 per vCPU-second                                |
| Instance/job memory                                             | $0.000002 per GiB-second                                 |
| L4 GPU, without zonal redundancy                                | $0.0001867 per GPU-second, plus CPU/memory               |
| RTX PRO 6000 GPU, without zonal redundancy                      | $0.00036522 per GPU-second, plus CPU/memory              |
| Current 4-vCPU / 4-GiB media service, 60 active seconds         | $0.00636, plus startup/boost, request and other services |
| Hypothetical L4, 4 vCPU / 16 GiB, 60 billed seconds             | $0.017442 before other services                          |
| Current RTX job allocation, 20 vCPU / 80 GiB, 60 billed seconds | $0.0531132 before other services                         |
| Same RTX allocation for its 3300-second video-job timeout       | $2.921226 before other services                          |

Sources: [Cloud Run rates and billing minimums](https://cloud.google.com/run/pricing),
[GPU requirements](https://docs.cloud.google.com/run/docs/configuring/services/gpu).
Cloud Run jobs have a one-minute billing minimum and bill the instance lifetime,
including startup, rather than just media duration. Read-only job inspection confirmed
`nvidia-rtx-pro-6000`, with zonal redundancy disabled. The example CPU-only operation
table is **not a valid quote for these GPU jobs**; no GPU dispatcher is integrated.

Also include storage byte-time and operations, uploads, output downloads, internet
egress, Firestore transactions/index reads/writes, Cloud Tasks attempts, application
hosting, builds/images, logs and external transcription/AI/media APIs. Check
[Cloud Storage pricing](https://cloud.google.com/storage/pricing),
[Firestore billing](https://firebase.google.com/docs/firestore/pricing) and
[Cloud Tasks pricing](https://cloud.google.com/tasks/pricing). Storage rate depends
on bucket location/class, operations and transfer destination. Task API calls and
delivery attempts are billable, chunked in 32-KiB units; above the account free tier,
the published task rate is $0.40/million operations. Do not assume these costs are zero
just because a compute free tier exists.

### How to measure before approving a reward

Record operation ID, worker execution ID, resource shape, billed wall time, CPU/GPU
model, cold start, retries, output/retained bytes, download bytes, Firestore operations
and external API usage. Match to billing export SKUs, region, discounts and provider
invoices. Measure successful and failed work. Use a high percentile plus margin or
the enforced worst-case ceiling, not only the average successful render.

Until measured limits are available, keep GPU work outside the credit pilot. Retain
hard worker timeouts, low instance/task limits, bounded retries, lifecycle retention
and private dispatch. Existing live workers are not protected by this isolated demo's
budgets. A calendar reset must not erase outstanding work or already-incurred costs.

### Calculator and proposed pilot envelope

`npm run credits:economics` reads the explicitly hypothetical example observation.
All monetary inputs are USD microdollars (1,000,000 = $1). Replace the observation
file with actual **finalised** revenue and trustworthy completions when available.

The calculator first subtracts ad-serving overhead from finalised revenue, then
applies `spendableBps` to retain a reserve. It divides that budget by verified reward
completions and maximum resource liability per credit, rounding down. Zero revenue,
zero completions or insufficient revenue yield zero revenue-funded reward credits.
This retrospective ceiling is not a promise of future revenue; use a conservative
cohort floor and reduce rewards only for future offers, never already promised ones.

The sandbox example sets 1 credit to a maximum resource liability of $0.001, a
15-credit free allowance and a proposed 1-credit reward, capped at 20 ads per month.
The 106-microdollar CPU-second example follows 4 vCPU / 4 GiB service unit prices;
the 1000-microdollar base cost and dispatch/publish costs are illustrative overhead
estimates, not calibrated costs. Prices are rounded up to whole credits.

At these **illustrative** settings:

- Free baseline exposure is $0.015 per active user/month.
- Fully awarded exposure is $0.035 per active user/month.
- 1000 fully awarded free users create up to $35 of processing liability.
- A $15 explicit subsidy with zero revenue funds only 428 fully awarded users;
  serving all 1000 leaves $20 unfunded. This excludes unmodelled fixed/service costs.
- A 60-billed-second RTX allocation costs about 54 such credits for compute alone;
  a 3300-second run costs about 2922. One unpriced ad view cannot justify either.

Retain the current 15 / 150 / 500 / 2000 allowances provisionally; approving larger
allowances requires measured costs and subscription margin analysis. Do not change
subscription prices to make this example work. A proposed ad cap of 20 is a maximum
exposure limit, not an availability guarantee. Start with no live rewards, then use a
small explicitly funded cohort if account approval and verification are resolved.

### Financial controls and their limits

The foundation atomically checks global/per-user monthly spend, maximum job cost,
outstanding concurrency, wallet capacity and global credit issuance liability.
Reserve at the **enforced upper bound** before dispatch, including storage/network/API
overhead. Once work starts, failures retain the full financial reservation as spend,
even if the user's credits are refunded. This prevents unlimited free retries from
recycling the infrastructure budget. Reward sessions reserve issuance liability
before displaying an offer, limiting account-farming exposure globally.

These are hard admission limits for operations using this service and correctly
bounded costs. They cannot hard-cap the company's entire cloud bill: the legacy
dispatchers are unintegrated, storage may persist, and configured estimates can be
wrong. Production must enforce worker limits and private IAM, deny bypass dispatch,
and use provider controls and cost reconciliation as well.

Google now documents [service-scoped spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
for eligible services including Cloud Run. They have enforcement delay, do not cover
all services and do not stop all ongoing/persistent costs. They supplement application
admission and worker controls. Ordinary alert-only budgets do not stop processing.
No cloud limit or billing configuration has been changed here.

## 8. Implementation status, unknowns and approval requirements

Implemented: emulator-only wallet/ledger, pricing, renewal, reservations/settlement,
source reporting, mock verification, caps, spending controls, local UX and tests.
Unverified: Google account/site approval, live demand/revenue, a signed web completion
protocol, real per-operation runtime/invoice cost and browser headers on the live origin.
Remaining before rollout: production rules repair, legacy reconciliation/cutover,
trusted worker/payment/subscription adapters, durable dispatch recovery and live-provider
verification. Those are explicit migration gates, not completed integrations.

No production credits were awarded; no live ads, subscriptions, prices, cloud settings
or billing behaviour were changed. No production deployment, merge or push was done.
Real ads, production migration/grants, live price changes, deployment and merging
require your explicit approval after review of a concrete rollout proposal.

## 9. Security repair review

Reviewed: 26 October 2026. Local branch: `security/profile-authority-repair-20261026`.
Status: **local repair prepared and tested; production rollout is not authorised**.

### Review snapshot

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

### Confirmation and limits

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

### Confirmed findings and local repair

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

### Affected collections and checks

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

### Profile and billing compatibility

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

### Legacy financial risks reviewed but not changed

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

### Isolated test results

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

### Separate Google web reward verification investigation

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

### Commercial decisions remain pending measured costs

The earlier demo's allowance, ad reward/cap and microdollar pricing are test inputs,
not final free-plan policy or an approved reward offer. No amount is finalised here.
Measure actual billed worker lifetime/startup, CPU/GPU shape, retries, storage byte-time,
downloads/egress, Firestore/Tasks and external API costs per operation before proposing
commercial credits. Use measured failure costs and conservative ceilings. Verify
real eligible demand and final revenue separately; assume no ad income meanwhile.

### Exact approval and access gates

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

### Complete source-path inventory

The repeatable static scan covered **959 source files**, with **0 parse errors**; it recorded **185 literal collection names**, **36 dynamic collection expressions**, **130 authority references** and **336 candidate financial/profile writes**. Candidates include benign display/preferences and maintenance code; these counts are not counts of confirmed vulnerabilities. Runtime reachability and unresolved dynamic names are not established by this scan. All recursive paths were affected by the old admin fallback regardless of the scan.

#### Every literal collection name found

`_diagnostics`, `_health_test`, `_system_health`, `_test`, `_test_`, `_test_connection`, `ab_test_variant_metrics`, `ab_tests`, `activities`, `ad_analytics`, `ad_events`, `admin`, `admin_audit`, `admin_logs`, `admin_settings`, `admins`, `ads`, `affiliate_events`, `ai_usage_logs`, `algorithm_optimizations`, `analytics`, `api_requests`, `assets`, `assistant_actions`, `audit_logs`, `audits`, `bandit_selection_metrics`, `bandit_weight_history`, `blocked_ips`, `boost_chains`, `boost_intents`, `bot_accounts`, `bounties`, `campaigns`, `chat_conversations`, `chat_messages`, `chat_usage`, `clip_analyses`, `clip_learning_profiles`, `clip_outcomes`, `clip_scanner_cache`, `comments`, `community_comments`, `community_following`, `community_helpful`, `community_likes`, `community_posts`, `community_shares`, `community_user_stats`, `compliance_logs`, `connections`, `content`, `content_daily_metrics`, `content_diagnosis`, `content_optimizations`, `content_recovery_actions`, `credit_charges`, `credit_ledger`, `credit_refunds`, `credit_usage`, `credits_v2_wallets`, `daily_stats`, `dead_letter_tasks`, `diagnosis_policy_events`, `discord_tokens`, `earnings_events`, `edit_history`, `engagement_campaigns`, `engagement_logs`, `engagement_proofs`, `error_logs`, `events`, `facebook_tokens`, `feature_flags`, `forum_posts`, `generated_clips`, `growth_actions`, `growth_squads`, `hashtag_generations`, `hashtag_performance`, `hashtag_stats`, `influencer_bookings`, `instagram_tokens`, `invites`, `kyc_tokens`, `leaderboard`, `linkedin_tokens`, `live_tokens`, `manual_reposts`, `media_transform_tasks`, `members`, `memetic_experiments`, `memetic_seeds`, `metric_scraping_schedules`, `mission_control_ops`, `monthly_stats`, `notifications`, `oauth1_states`, `oauth_state`, `oauth_states`, `openai_usage`, `paid_boosts`, `payment_events`, `payments`, `payouts`, `paypal_webhook_events`, `performance_validations`, `permissions_test`, `pinterest_tokens`, `platform_posts`, `programs`, `promotion_executions`, `promotion_schedules`, `promotion_tasks`, `promotion_templates`, `promotions`, `query_metrics`, `recent_activity`, `reddit_tokens`, `redemption_history`, `referral_invitations`, `referrals`, `report`, `responses`, `retry_boosts`, `revenue`, `reward_history`, `security_events`, `settings`, `shortlinks`, `smart_links`, `snapchat_tokens`, `sounds`, `sponsor_approvals`, `spotify_tokens`, `squad_shares`, `status`, `studio_3d_capacity`, `studio_3d_jobs`, `studio_3d_requests`, `studio_3d_usage`, `subscription_events`, `subscription_intents`, `subscription_refunds`, `support_tickets`, `system`, `system_counters`, `system_diagnostics`, `system_latency_snapshots`, `system_locks`, `system_metrics`, `system_scans`, `system_scans_remediation`, `system_status`, `test`, `testCollection`, `testers`, `tiktok_tokens`, `tips`, `transactions`, `twitter_tokens`, `usage_daily`, `usage_ledger`, `user_billing`, `user_cosmetics`, `user_credits`, `user_defaults`, `user_features`, `user_rewards`, `user_stats`, `user_subscriptions`, `users`, `variant_anomalies`, `variant_stats`, `video_edits`, `viral_boosts`, `viral_challenges`, `viral_insurance_claims`, `viral_seeding`, `webhook_logs`, `withdrawals`, `workflow_events`, `workspaces`, `youtube_tokens`, `youtube_uploads`.

#### Every dynamic collection reference found

| Source                                        | Expression            |
| --------------------------------------------- | --------------------- |
| `create-test-firebase-users.js:38`            | `collection`          |
| `create-test-firebase-users.js:79`            | `collection`          |
| `generateSampleData.js:464`                   | `collection`          |
| `importFirestore.js:19`                       | `collectionName`      |
| `runTests.js:81`                              | `collectionName`      |
| `scripts/createTestAudit.js:22`               | `collectionName`      |
| `scripts/detectSuspicious.js:64`              | `collectionName`      |
| `scripts/detectSuspicious.js:67`              | `collectionName`      |
| `scripts/detectSuspicious.js:69`              | `collectionName`      |
| `scripts/exportAuditEvidence.js:19`           | `collectionName`      |
| `scripts/exportAuditEvidence.js:22`           | `collectionName`      |
| `scripts/exportAuditEvidence.js:24`           | `collectionName`      |
| `scripts/migrate-encrypt-tokens.js:58`        | `collectionName`      |
| `scripts/peekCollection.js:9`                 | `collectionName`      |
| `src/analyticsRoutes.js:50`                   | `collectionName`      |
| `src/routes/adminSystemRoutes.js:292`         | `collectionName`      |
| `src/routes/chatRoutes.js:305`                | `${p}_connections`    |
| `src/routes/systemDiagnosticsRoutes.js:329`   | `collection`          |
| `src/routes/systemDiagnosticsRoutes.js:976`   | `collection`          |
| `src/server.js:295`                           | `col`                 |
| `src/services/auditLogger.js:50`              | `this.col`            |
| `src/services/banditTuningService.js:17`      | `COLLECTION`          |
| `src/services/banditTuningService.js:47`      | `COLLECTION`          |
| `src/services/banditTuningService.js:61`      | `COLLECTION`          |
| `src/services/configService.js:12`            | `DOC_PATH.collection` |
| `src/services/configService.js:23`            | `DOC_PATH.collection` |
| `src/services/multicamCapacityService.js:57`  | `CAPACITY_COLLECTION` |
| `src/services/multicamCapacityService.js:114` | `CAPACITY_COLLECTION` |
| `src/services/statsService.js:24`             | `this.collectionName` |
| `src/services/statsService.js:103`            | `this.collectionName` |
| `src/services/statsService.js:123`            | `this.collectionName` |
| `src/utils/startupDiagnostics.js:228`         | `collection`          |
| `src/validationMiddleware.js:224`             | `collectionName`      |
| `src/validationMiddleware.js:236`             | `collectionName`      |
| `validationMiddleware.js:338`                 | `collectionName`      |
| `validationMiddleware.js:348`                 | `collectionName`      |

#### Authority references by file

Each location identifies the field read and line; the linked JSON inventory also preserves the receiver expression. Profile display references are included and are not all access gates.

| Source file                                      | Every recorded line and field                                                                                                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App.js`                                         | `39:role`, `42:role`                                                                                                                                                                                                                                                        |
| `admin-login-firestore-test.js`                  | `25:role`                                                                                                                                                                                                                                                                   |
| `admin-login-test.js`                            | `28:role`                                                                                                                                                                                                                                                                   |
| `adminTestRoutes.js`                             | `172:role`, `173:isAdmin`                                                                                                                                                                                                                                                   |
| `create-fresh-admin.js`                          | `153:admin`                                                                                                                                                                                                                                                                 |
| `firebase-auth-fix.js`                           | `226:customClaims`, `240:customClaims`                                                                                                                                                                                                                                      |
| `frontend/src/AdminLoginForm.js`                 | `59:isAdmin`, `70:fromCollection`                                                                                                                                                                                                                                           |
| `frontend/src/App.js`                            | `291:admin`, `394:role`, `504:role`, `508:role`, `802:role`, `811:role`, `815:role`, `918:role`, `921:role`, `1741:role`                                                                                                                                                    |
| `frontend/src/ChatWidget.js`                     | `12:isAdmin`                                                                                                                                                                                                                                                                |
| `frontend/src/InternalDemoEditorPage.js`         | `43:isAdmin`                                                                                                                                                                                                                                                                |
| `frontend/src/UserDashboard_full.js`             | `501:isAdmin`, `502:role`, `506:isAdmin`                                                                                                                                                                                                                                    |
| `frontend/src/contexts/AuthContext.js`           | `20:admin`                                                                                                                                                                                                                                                                  |
| `frontend/src/utils/dbSchemaSync.js`             | `26:role`                                                                                                                                                                                                                                                                   |
| `recreate-admin-improved.js`                     | `112:customClaims`                                                                                                                                                                                                                                                          |
| `recreate-all-users.js`                          | `83:role`, `98:role`, `107:role`, `117:role`, `133:role`, `159:role`, `168:role`, `177:role`, `191:role`, `236:role`                                                                                                                                                        |
| `scripts/diagnostics/check-admin-claims.js`      | `29:customClaims`, `33:admin`, `39:customClaims`                                                                                                                                                                                                                            |
| `scripts/diagnostics/check-admin-credentials.js` | `52:admin`, `53:role`                                                                                                                                                                                                                                                       |
| `scripts/diagnostics/check-admin-password.js`    | `28:customClaims`                                                                                                                                                                                                                                                           |
| `scripts/diagnostics/check-admin-user.js`        | `34:customClaims`                                                                                                                                                                                                                                                           |
| `src/adminAnalyticsRoutes.js`                    | `30:fromCollection`, `48:fromCollection`, `49:role`, `354:fromCollection`, `355:role`, `386:role`, `410:fromCollection`, `411:role`, `466:fromCollection`, `467:role`, `546:fromCollection`, `547:role`, `600:fromCollection`, `601:role`, `826:fromCollection`, `827:role` |
| `src/adminRoutes.js`                             | `39:role`, `46:customClaims`, `48:admin`                                                                                                                                                                                                                                    |
| `src/adminTestRoutes.js`                         | `182:role`, `183:isAdmin`                                                                                                                                                                                                                                                   |
| `src/analyticsRoutes.js`                         | `232:role`                                                                                                                                                                                                                                                                  |
| `src/authMiddleware.js`                          | `97:isAdmin`, `98:role`, `100:isAdmin`, `101:role`, `241:admin`, `242:role`, `248:role`, `344:isAdmin`, `345:role`, `351:role`, `352:isAdmin`, `374:role`, `375:isAdmin`                                                                                                    |
| `src/authRoutes.js`                              | `146:customClaims`, `402:isAdmin`, `484:role`, `530:admin`, `701:admin`, `702:role`                                                                                                                                                                                         |
| `src/contentRoutes.js`                           | `1228:role`, `1229:isAdmin`, `1230:fromCollection`, `2101:role`, `2173:role`                                                                                                                                                                                                |
| `src/mediaRoutes.js`                             | `667:admin`, `668:isAdmin`, `669:role`, `670:admin`, `671:admin`, `672:admin`                                                                                                                                                                                               |
| `src/middlewares/adminOnly.js`                   | `4:isAdmin`                                                                                                                                                                                                                                                                 |
| `src/routes/adminCacheRoutes.js`                 | `13:isAdmin`, `14:admin`                                                                                                                                                                                                                                                    |
| `src/routes/adminEmailVerificationRoutes.js`     | `18:isAdmin`                                                                                                                                                                                                                                                                |
| `src/routes/complianceRoutes.js`                 | `7:isAdmin`                                                                                                                                                                                                                                                                 |
| `src/routes/liveRoutes.js`                       | `74:isAdmin`                                                                                                                                                                                                                                                                |
| `src/routes/monetizationRoutes.js`               | `442:isAdmin`, `455:isAdmin`, `484:isAdmin`, `498:isAdmin`                                                                                                                                                                                                                  |
| `src/routes/paypalSubscriptionRoutes.js`         | `1315:role`, `1316:isAdmin`, `1356:role`, `1357:isAdmin`, `1473:role`, `1474:isAdmin`                                                                                                                                                                                       |
| `src/routes/systemDiagnosticsRoutes.js`          | `107:role`, `114:role`, `149:role`, `1074:role`                                                                                                                                                                                                                             |
| `src/routes/tiktokRoutes.js`                     | `1981:isAdmin`, `1997:isAdmin`                                                                                                                                                                                                                                              |
| `src/services/userSegmentation.js`               | `13:role`                                                                                                                                                                                                                                                                   |
| `src/userRoutes.js`                              | `86:role`, `87:isAdmin`, `228:role`, `229:isAdmin`                                                                                                                                                                                                                          |
| `src/utils/authAuthority.js`                     | `16:admin`, `26:role`, `35:role`, `37:role`                                                                                                                                                                                                                                 |
| `verify-firebase-setup.js`                       | `24:customClaims`                                                                                                                                                                                                                                                           |

#### Identity verification and token/claim writers

| Source                                           | Operation             |
| ------------------------------------------------ | --------------------- |
| `adminTestRoutes.js:32`                          | `setCustomUserClaims` |
| `adminTestRoutes.js:67`                          | `setCustomUserClaims` |
| `adminTestRoutes.js:132`                         | `verifyIdToken`       |
| `create-admin-user.js:12`                        | `setCustomUserClaims` |
| `create-admin-user.js:26`                        | `setCustomUserClaims` |
| `create-custom-admin.js:16`                      | `setCustomUserClaims` |
| `create-custom-admin.js:36`                      | `setCustomUserClaims` |
| `create-fresh-admin.js:110`                      | `setCustomUserClaims` |
| `create-fresh-admin.js:152`                      | `verifyIdToken`       |
| `create-new-admin-users.js:16`                   | `setCustomUserClaims` |
| `create-new-admin-users.js:36`                   | `setCustomUserClaims` |
| `create-new-admin-users.js:64`                   | `setCustomUserClaims` |
| `create-new-admin-users.js:75`                   | `setCustomUserClaims` |
| `create-specific-admin.js:17`                    | `setCustomUserClaims` |
| `create-specific-admin.js:33`                    | `setCustomUserClaims` |
| `create-test-admin.js:37`                        | `setCustomUserClaims` |
| `create-test-firebase-users.js:31`               | `setCustomUserClaims` |
| `create-test-firebase-users.js:72`               | `setCustomUserClaims` |
| `debug-token.js:68`                              | `verifyIdToken`       |
| `delete-users-batch.js:236`                      | `setCustomUserClaims` |
| `firebase-auth-fix.js:185`                       | `setCustomUserClaims` |
| `firebase-auth-fix.js:312`                       | `setCustomUserClaims` |
| `firebase-auth-test.js:94`                       | `setCustomUserClaims` |
| `recreate-admin-improved.js:83`                  | `setCustomUserClaims` |
| `recreate-admin-verbose.js:83`                   | `setCustomUserClaims` |
| `recreate-admin.js:64`                           | `setCustomUserClaims` |
| `recreate-all-users.js:99`                       | `setCustomUserClaims` |
| `recreate-all-users.js:160`                      | `setCustomUserClaims` |
| `scripts/diagnostics/check-admin-claims.js:35`   | `setCustomUserClaims` |
| `scripts/diagnostics/check-admin-password.js:43` | `setCustomUserClaims` |
| `scripts/diagnostics/check-bounty-wiring.js:41`  | `createCustomToken`   |
| `setAdminClaims.js:11`                           | `setCustomUserClaims` |
| `setup-admin-claims.js:20`                       | `setCustomUserClaims` |
| `setup-admin-collection.js:25`                   | `setCustomUserClaims` |
| `setup-admin-collection.js:45`                   | `setCustomUserClaims` |
| `setup-admin-user.js:48`                         | `setCustomUserClaims` |
| `setup-admin-users.js:20`                        | `setCustomUserClaims` |
| `setup-test-users.js:43`                         | `setCustomUserClaims` |
| `src/adminTestRoutes.js:38`                      | `setCustomUserClaims` |
| `src/adminTestRoutes.js:73`                      | `setCustomUserClaims` |
| `src/adminTestRoutes.js:142`                     | `verifyIdToken`       |
| `src/authMiddleware.js:179`                      | `verifyIdToken`       |
| `src/authRoutes.js:76`                           | `verifyIdToken`       |
| `src/authRoutes.js:96`                           | `verifyIdToken`       |
| `src/authRoutes.js:439`                          | `verifyIdToken`       |
| `src/authRoutes.js:471`                          | `verifyIdToken`       |
| `src/authRoutes.js:627`                          | `createCustomToken`   |
| `src/authRoutes.js:687`                          | `verifyIdToken`       |
| `src/authRoutes.js:848`                          | `verifyIdToken`       |
| `src/routes/adminSupportRoutes.js:265`           | `createCustomToken`   |
| `src/routes/facebookRoutes.js:70`                | `verifyIdToken`       |
| `src/routes/facebookRoutes.js:131`               | `verifyIdToken`       |
| `src/routes/paypalSubscriptionRoutes.js:1028`    | `verifyIdToken`       |
| `src/routes/platformRoutes.js:731`               | `verifyIdToken`       |
| `src/routes/tiktokRoutes.js:316`                 | `verifyIdToken`       |
| `src/routes/tiktokRoutes.js:479`                 | `verifyIdToken`       |
| `src/routes/youtubeRoutes.js:70`                 | `verifyIdToken`       |
| `src/routes/youtubeRoutes.js:121`                | `verifyIdToken`       |
| `system-test.js:378`                             | `setCustomUserClaims` |
| `testApiFunction.js:9`                           | `createCustomToken`   |
| `tmpcheck.js:69`                                 | `verifyIdToken`       |
| `tmpcheck.js:130`                                | `verifyIdToken`       |

#### Every candidate financial/profile write reference

All detected candidate calls are listed, including scripts and inactive/maintenance code. A call with a variable payload may have no inline field names; review the receiver and referenced update object in the JSON inventory or source. These are static candidates, not proof that every handler is deployed.

| Source file                                          | Every recorded line and mutation method                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adminTestRoutes.js`                                 | `38:set`, `73:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `analyticsController.js`                             | `9:add`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `autopromote-functions/discordOAuth.js`              | `75:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/instagramOAuth.js`            | `73:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/linkedinOAuth.js`             | `74:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/pinterestOAuth.js`            | `78:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/redditOAuth.js`               | `76:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/snapchatOAuth.js`             | `61:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/spotifyOAuth.js`              | `77:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `autopromote-functions/telegramWebhook.js`           | `88:set`, `99:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `autopromote-functions/twitterOAuth.js`              | `62:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `contentController.js`                               | `16:add`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `create-admin-user.js`                               | `32:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `create-auth-user.js`                                | `13:set`, `30:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `create-fresh-admin.js`                              | `115:set`, `124:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `create-personal-account.js`                         | `18:set`, `42:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `create-specific-admin.js`                           | `40:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `create-test-admin.js`                               | `56:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `create-test-firebase-users.js`                      | `38:set`, `79:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `create-user.js`                                     | `10:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `delete-users-batch.js`                              | `242:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `firebase-auth-fix.js`                               | `319:set`, `331:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `firebase-auth-test.js`                              | `71:set`, `100:set`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `frontend/src/components/PayPalSubscriptionPanel.js` | `517:create`                                                                                                                                                                                                                                                                                                                                                                                                         |
| `generateSampleData.js`                              | `103:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `insertTestDashboardData.js`                         | `45:add`, `172:add`, `187:add`, `202:add`                                                                                                                                                                                                                                                                                                                                                                            |
| `optimizationService.js`                             | `30:add`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `recreate-admin-improved.js`                         | `90:set`, `99:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `recreate-admin-verbose.js`                          | `91:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `recreate-admin.js`                                  | `70:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `recreate-all-users.js`                              | `108:set`, `128:set`, `169:set`, `187:set`                                                                                                                                                                                                                                                                                                                                                                           |
| `scripts/create-boost-direct.js`                     | `23:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/credits-browser-check.cjs`                  | `67:update`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/debug-tiktok-enqueue.js`                    | `23:update`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/generate-tiktok-auth-url-for-uid.js`        | `25:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/grant-unlimited.js`                         | `18:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/kyc_test_runner.js`                         | `9:set`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `scripts/seed-autopilot-cloud.js`                    | `64:set`, `71:set`, `90:set`, `108:set`                                                                                                                                                                                                                                                                                                                                                                              |
| `scripts/seed-autopilot-emulator.js`                 | `20:set`, `26:set`, `42:set`                                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/seed-test-user.js`                          | `9:set`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `scripts/simulate-ad-credits-capture.js`             | `14:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `setup-admin-user.js`                                | `56:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `setup-admin-users.js`                               | `31:set`, `45:update`                                                                                                                                                                                                                                                                                                                                                                                                |
| `setup-collections.js`                               | `9:set`, `19:set`, `67:set`                                                                                                                                                                                                                                                                                                                                                                                          |
| `setup-firestore-collections.js`                     | `6:set`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setup-firestore-for-user.js`                        | `28:set`, `63:add`, `71:add`                                                                                                                                                                                                                                                                                                                                                                                         |
| `setup-test-users.js`                                | `19:set`, `46:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `setup-user-credits.js`                              | `10:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `setupFirestoreSchema.js`                            | `21:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/adminRoutes.js`                                 | `215:update`, `259:update`, `290:update`, `316:update`, `345:update`, `383:add`, `519:set`, `534:set`, `545:set`, `563:add`                                                                                                                                                                                                                                                                                          |
| `src/adminTestRoutes.js`                             | `44:set`, `79:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/authMiddleware.js`                              | `290:set`, `306:update`                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/authRoutes.js`                                  | `152:set`, `309:set`, `323:set`, `383:set`, `739:set`                                                                                                                                                                                                                                                                                                                                                                |
| `src/contentRoutes.js`                               | `2140:set`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/creditSystem.js`                                | `196:update`, `201:update`, `211:set`, `242:set`, `305:update`, `313:update`, `322:set`, `334:set`                                                                                                                                                                                                                                                                                                                   |
| `src/mediaRoutes.js`                                 | `748:set`, `781:set`, `815:set`, `1540:create`, `1575:set`, `2309:set`, `2345:set`                                                                                                                                                                                                                                                                                                                                   |
| `src/middlewares/usageLimitMiddleware.js`            | `245:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/paymentsRoutes.js`                              | `44:set`, `172:set`, `174:set`, `183:set`                                                                                                                                                                                                                                                                                                                                                                            |
| `src/routes/adminCommunityRoutes.js`                 | `343:update`, `375:update`                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/routes/adminSecurityRoutes.js`                  | `53:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/adsRoutes.js`                            | `243:update`                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/routes/boostRoutes.js`                          | `35:set`, `54:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/routes/chatRoutes.js`                           | `52:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/clipRoutes.js`                           | `1684:set`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/routes/communityRoutes.js`                      | `752:set`, `759:set`, `769:set`, `799:set`, `809:set`                                                                                                                                                                                                                                                                                                                                                                |
| `src/routes/creditsRoutes.js`                        | `27:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/facebookRoutes.js`                       | `105:set`, `137:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/routes/payfastRoutes.js`                        | `75:add`, `100:set`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/routes/paymentsExtendedRoutes.js`               | `90:set`, `208:set`, `211:set`, `220:set`, `381:set`, `414:set`, `416:set`, `600:set`, `683:add`, `733:set`                                                                                                                                                                                                                                                                                                          |
| `src/routes/paymentsStatusRoutes.js`                 | `87:add`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/paypalSubscriptionRoutes.js`             | `172:set`, `192:set`, `203:set`, `305:set`, `317:set`, `327:set`, `337:add`, `449:set`, `468:set`, `479:set`, `501:set`, `517:add`, `565:set`, `765:set`, `803:set`, `885:set`, `951:update`, `963:set`, `975:update`, `984:add`, `1412:update`, `1424:set`, `1436:update`, `1448:add`, `1568:add`                                                                                                                   |
| `src/routes/paypalWebhookRoutes.js`                  | `167:set`, `183:set`, `224:set`, `265:set`, `464:add`, `475:set`, `514:update`, `532:set`, `550:set`, `576:update`, `584:add`, `633:update`, `648:set`                                                                                                                                                                                                                                                               |
| `src/routes/platformRoutes.js`                       | `337:set`, `373:set`, `398:set`, `456:set`, `502:set`, `550:set`, `808:set`, `830:set`, `839:set`, `853:set`, `939:set`, `963:set`, `983:set`, `993:set`, `1076:set`, `1125:set`, `1145:set`, `1169:set`, `1190:set`, `1210:set`, `1220:set`, `1357:set`, `1382:set`, `1402:set`, `1412:set`, `1539:set`, `1563:set`, `1583:set`, `1593:set`, `1708:set`, `1733:set`, `1880:set`, `2013:set`, `2026:set`, `2034:set` |
| `src/routes/profileDefaultsRoutes.js`                | `81:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/rewardsRoutes.js`                        | `310:set`, `328:update`, `397:add`, `715:update`, `746:set`, `764:update`, `774:set`                                                                                                                                                                                                                                                                                                                                 |
| `src/routes/telegramRoutes.js`                       | `421:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/routes/tiktokRoutes.js`                         | `338:set`, `351:set`, `390:set`, `485:set`, `1947:set`                                                                                                                                                                                                                                                                                                                                                               |
| `src/routes/usageRoutes.js`                          | `107:set`, `122:set`, `133:set`, `154:add`                                                                                                                                                                                                                                                                                                                                                                           |
| `src/routes/withdrawalRoutes.js`                     | `58:update`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/routes/workspaceRoutes.js`                      | `208:set`, `461:set`, `614:set`, `779:update`                                                                                                                                                                                                                                                                                                                                                                        |
| `src/routes/youtubeRoutes.js`                        | `93:set`, `127:set`, `245:set`                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/services/billingService.js`                     | `390:set`, `594:update`                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/services/chatbotService.js`                     | `266:add`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/services/clipOutcomeLearningService.js`         | `186:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/services/communityEngine.js`                    | `180:update`, `183:set`, `193:set`, `447:update`, `639:update`                                                                                                                                                                                                                                                                                                                                                       |
| `src/services/earningsService.js`                    | `17:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/services/facebookService.js`                    | `39:set`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/services/healthRunner.js`                       | `219:set`, `232:set`, `264:set`                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/services/monetizationService.js`                | `142:set`, `376:update`, `413:set`, `448:update`, `469:update`, `492:update`, `622:update`                                                                                                                                                                                                                                                                                                                           |
| `src/services/multicamCapacityService.js`            | `95:set`, `125:set`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/services/payments/fulfillmentService.js`        | `27:set`, `56:set`, `80:set`, `106:set`, `128:set`, `138:set`, `208:set`, `227:set`, `245:set`, `256:set`                                                                                                                                                                                                                                                                                                            |
| `src/services/payments/payfastProvider.js`           | `168:set`, `222:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/services/paypalPayoutService.js`                | `36:update`, `47:add`, `59:update`, `82:update`                                                                                                                                                                                                                                                                                                                                                                      |
| `src/services/pinterestService.js`                   | `187:set`, `206:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/services/promotionTaskQueue.js`                 | `828:set`, `841:set`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/services/referralGrowthEngine.js`               | `118:set`, `156:set`, `203:set`, `213:add`, `284:set`, `296:add`, `351:set`, `459:set`, `757:set`                                                                                                                                                                                                                                                                                                                    |
| `src/services/revenueEngine.js`                      | `30:set`, `41:set`, `90:set`, `101:set`, `222:add`                                                                                                                                                                                                                                                                                                                                                                   |
| `src/services/statsService.js`                       | `103:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/services/studio3DService.js`                    | `106:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/services/subscriptionSyncService.js`            | `10:set`, `33:set`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/services/testerProgramService.js`               | `78:set`, `86:set`, `87:set`                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/services/userDefaultsCache.js`                  | `27:set`, `37:set`, `39:set`, `48:set`, `49:set`                                                                                                                                                                                                                                                                                                                                                                     |
| `src/services/videoEditingService.js`                | `282:set`, `350:set`, `437:update`, `492:update`, `556:update`                                                                                                                                                                                                                                                                                                                                                       |
| `src/services/viralBonusService.js`                  | `48:update`, `76:set`                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/snapchatRoutes.js`                              | `629:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/userController.js`                              | `22:set`, `80:update`                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/userRoutes.js`                                  | `161:set`, `210:set`, `238:update`, `281:update`, `352:set`, `451:update`, `611:update`                                                                                                                                                                                                                                                                                                                              |
| `system-test.js`                                     | `381:set`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tmpcheck.js`                                        | `104:set`, `136:set`, `258:set`                                                                                                                                                                                                                                                                                                                                                                                      |
| `update-content-analytics.js`                        | `40:update`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `userController.js`                                  | `19:set`, `85:update`                                                                                                                                                                                                                                                                                                                                                                                                |

Regenerate the machine-readable inventory without initialising Firebase or a payment provider:

```sh
node scripts/audit-profile-security.cjs > docs/security/PROFILE_SECURITY_PATHS.json
```

## Appendix A. Complete implementation and test source

The following is an exact source snapshot of the files created for this foundation.
Paths are relative to the AutoPromote repository root. The four scripts shown
below were added at the foundation stage. Appendix B contains the additional security
test script. Other package settings and existing runtime dependencies were preserved. Existing production files are not
replaced by these source listings. Mock signing secrets in tests are local fixtures.

### Added package.json scripts

```json
{
  "scripts": {
    "test:credits": "node scripts/test-unified-credits.cjs",
    "test:credits:browser": "node scripts/test-unified-credits.cjs --browser",
    "credits:sandbox": "node scripts/credits-sandbox.cjs",
    "credits:economics": "node scripts/credits-economics.cjs config/unified-credits.economics.example.json"
  }
}
```

### Source inventory

| File                                            | Purpose                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/services/unifiedCredits/runtime.js`        | Local demo project, emulator and runtime guards                                 |
| `src/services/unifiedCredits/policy.js`         | Server policy validation, configuration digest and resource pricing             |
| `src/services/unifiedCredits/rewardProof.js`    | Mock completion proof signing and verification                                  |
| `src/services/unifiedCredits/wallet.js`         | Transactional wallet, ledger, renewal, reservations, settlement and reward caps |
| `src/services/unifiedCredits/economics.js`      | Compute cost and ad-funded credit economics calculations                        |
| `src/routes/unifiedCreditsSandboxRoutes.js`     | Isolated local HTTP API and static preview routes                               |
| `scripts/credits-sandbox.cjs`                   | Local preview server entry point                                                |
| `scripts/test-unified-credits.cjs`              | Fresh emulator test runner and cleanup                                          |
| `scripts/credits-browser-check.cjs`             | Desktop/mobile browser validation                                               |
| `scripts/credits-economics.cjs`                 | Economics calculator command                                                    |
| `config/unified-credits.sandbox.example.json`   | Configurable sandbox pricing, allowances and financial safeguards               |
| `config/unified-credits.economics.example.json` | Explicitly hypothetical revenue/funding inputs                                  |
| `sandbox/credits/index.html`                    | Credit preview interface                                                        |
| `sandbox/credits/style.css`                     | Responsive preview styling                                                      |
| `sandbox/credits/app.js`                        | Opt-in mock ad, quote, operation and zero-credit saving flow                    |
| `test/unified-credits/firestore.rules`          | Emulator-only financial write protection                                        |
| `test/unified-credits/firebase.json`            | Demo Firestore emulator configuration                                           |
| `test/unified-credits/foundation.test.cjs`      | 36 security, financial, concurrency, HTTP and Firestore rule tests              |

### A1. src/services/unifiedCredits/runtime.js

```javascript
const DEMO_PROJECT = "demo-autopromote-credits";

function assertSandbox(env = process.env, db = null) {
  const host = env.FIRESTORE_EMULATOR_HOST || "";
  const match = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(host);
  if (
    env.UNIFIED_CREDITS_SANDBOX !== "true" ||
    env.UNIFIED_CREDITS_PROJECT_ID !== DEMO_PROJECT ||
    env.NODE_ENV === "production" ||
    env.K_SERVICE ||
    env.FUNCTION_TARGET ||
    env.RENDER === "true" ||
    !match ||
    Number(match[1]) < 1 ||
    Number(match[1]) > 65535 ||
    (db &&
      (db.projectId !== DEMO_PROJECT ||
        `${db._settings?.servicePath}:${db._settings?.port}` !== host ||
        db._settings?.ssl !== false))
  ) {
    throw Object.assign(new Error("Unified credits require the explicit local demo emulator"), {
      code: "SANDBOX_ONLY",
      status: 503,
    });
  }
}

function createSandboxDatabase(env = process.env) {
  assertSandbox(env);
  const { Firestore } = require("firebase-admin/firestore");
  // Explicit host/project; never initialise the application's production Firebase app.
  return new Firestore({ projectId: DEMO_PROJECT, host: env.FIRESTORE_EMULATOR_HOST, ssl: false });
}

module.exports = { DEMO_PROJECT, assertSandbox, createSandboxDatabase };
```

### A2. src/services/unifiedCredits/policy.js

```javascript
const crypto = require("crypto");
const { SUBSCRIPTION_PLANS } = require("../../config/subscriptionPlans");

const OPERATIONS = [
  "queue.dispatch",
  "publisher.publish",
  "studio.render",
  "clips.analyze",
  "clips.render",
];
function fail(code, status = 400) {
  throw Object.assign(new Error(code), { code, status });
}
function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`INVALID_${name}`);
  return value;
}
function checkedAdd(a, b) {
  return integer(a + b, "ARITHMETIC");
}
function checkedMultiply(a, b) {
  return integer(a * b, "ARITHMETIC");
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function validatePolicy(input) {
  const policy = JSON.parse(JSON.stringify(input));
  if (typeof policy.version !== "string" || !/^[\w.-]{1,80}$/.test(policy.version))
    fail("INVALID_VERSION");
  for (const name of [
    "microsPerCredit",
    "maxBalance",
    "maxJobMicros",
    "monthlySpendMicros",
    "userMonthlySpendMicros",
    "monthlyIssuanceMicros",
    "maxActiveGlobal",
    "maxActiveUser",
    "rewardCredits",
    "rewardMonthlyCap",
    "rewardTtlSeconds",
  ])
    integer(policy[name], name, 1);
  policy.monthlyCredits =
    policy.monthlyCredits ||
    Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => [id, plan.features.monthlyCredits])
    );
  for (const tier of ["free", "premium", "pro", "enterprise"]) {
    integer(policy.monthlyCredits[tier], `ALLOWANCE_${tier}`);
    if (policy.monthlyCredits[tier] > policy.maxBalance) fail("ALLOWANCE_EXCEEDS_WALLET_CAP");
  }
  if (policy.rewardCredits > policy.maxBalance) fail("REWARD_EXCEEDS_WALLET_CAP");
  for (const op of OPERATIONS) {
    const price = policy.operations?.[op];
    if (!price || !["seconds", "destinations"].includes(price.unit)) fail("MISSING_OPERATION");
    integer(price.baseMicros, "BASE_COST");
    integer(price.microsPerUnit, "UNIT_COST", 1);
    integer(price.maxUnits, "MAX_UNITS", 1);
    checkedAdd(price.baseMicros, checkedMultiply(price.microsPerUnit, price.maxUnits));
  }
  // Bind consent and retries to the entire pricing configuration, not just an editable label.
  policy.revision = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
  return freeze(policy);
}

function quoteOperation(policy, operation, units) {
  if (!OPERATIONS.includes(operation)) fail("UNSUPPORTED_OPERATION");
  const price = policy.operations[operation];
  integer(units, "UNITS", 1);
  if (units > price.maxUnits) fail("RESOURCE_LIMIT", 413);
  const maxCostMicros = checkedAdd(price.baseMicros, checkedMultiply(price.microsPerUnit, units));
  if (maxCostMicros > policy.maxJobMicros) fail("JOB_BUDGET_EXCEEDED", 429);
  return {
    operation,
    units,
    unit: price.unit,
    maxCostMicros,
    credits: integer(Math.ceil(maxCostMicros / policy.microsPerCredit), "PRICE", 1),
    pricingVersion: policy.version,
    pricingRevision: policy.revision,
  };
}

module.exports = {
  OPERATIONS,
  fail,
  integer,
  checkedAdd,
  checkedMultiply,
  validatePolicy,
  quoteOperation,
};
```

### A3. src/services/unifiedCredits/rewardProof.js

```javascript
const crypto = require("crypto");
const { fail, integer } = require("./policy");

function createMockVerifier(secret) {
  if (typeof secret !== "string" || secret.length < 32) fail("MOCK_SECRET_TOO_SHORT");
  function sign(payload) {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }
  return {
    // This is an emulator fixture issuer, NOT Google verification or a live-ad token.
    issue({ userId, sessionId, eventId, completedAt }) {
      const payload = JSON.stringify({
        provider: "local-mock",
        userId,
        sessionId,
        eventId,
        completedAt,
      });
      return { payload, signature: sign(payload) };
    },
    verify(proof) {
      if (
        typeof proof?.payload !== "string" ||
        proof.payload.length > 2048 ||
        !/^[a-f0-9]{64}$/.test(proof.signature || "")
      )
        fail("UNVERIFIED_REWARD", 403);
      if (
        !crypto.timingSafeEqual(
          Buffer.from(proof.signature, "hex"),
          Buffer.from(sign(proof.payload), "hex")
        )
      ) {
        fail("UNVERIFIED_REWARD", 403);
      }
      let data;
      try {
        data = JSON.parse(proof.payload);
      } catch {
        fail("UNVERIFIED_REWARD", 403);
      }
      if (
        data.provider !== "local-mock" ||
        ![data.userId, data.sessionId, data.eventId].every(
          v => typeof v === "string" && v.length > 0 && v.length <= 160
        )
      ) {
        fail("UNVERIFIED_REWARD", 403);
      }
      integer(data.completedAt, "COMPLETION_TIME");
      return data;
    },
  };
}
module.exports = { createMockVerifier };
```

### A4. src/services/unifiedCredits/wallet.js

```javascript
const crypto = require("crypto");
const { assertSandbox } = require("./runtime");
const {
  fail,
  integer,
  checkedAdd,
  checkedMultiply,
  validatePolicy,
  quoteOperation,
} = require("./policy");

const id = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const month = time => new Date(time).toISOString().slice(0, 7);
const emptyBudget = () => ({
  spentMicros: 0,
  reservedMicros: 0,
  issuedMicros: 0,
  pendingRewardMicros: 0,
});
function identifier(value) {
  if (typeof value !== "string" || !value.length || value.length > 160) fail("INVALID_IDENTIFIER");
  return value;
}

function createWalletService({ db, policy: input, verifier, now = Date.now }) {
  assertSandbox(process.env, db);
  const policy = validatePolicy(input);
  const ref = (collection, key) => db.collection(`credits_v2_${collection}`).doc(key);
  const walletRef = uid => ref("wallets", id(identifier(uid)));
  const controlRef = ref("control", "global");
  const budgetRef = cycle => ref("budgets", cycle);
  const userBudgetRef = (uid, cycle) => ref("user_budgets", id(uid, cycle));
  function guard() {
    assertSandbox(process.env, db);
  }
  function ledger(tx, key, data) {
    tx.create(ref("ledger", id(key)), { ...data, timestamp: now(), sandbox: true });
  }
  function checkWallet(w) {
    for (const key of [
      "balance",
      "reserved",
      "expiring",
      "permanent",
      "activeOperations",
      "adsAwarded",
      "pendingRewardCredits",
    ])
      integer(w[key], key);
    if (w.balance !== checkedAdd(w.expiring, w.permanent)) fail("WALLET_INVARIANT", 503);
    if (checkedAdd(checkedAdd(w.balance, w.reserved), w.pendingRewardCredits) > policy.maxBalance)
      fail("WALLET_CAP", 409);
  }
  function issueBudget(b, amount) {
    const cost = checkedMultiply(amount, policy.microsPerCredit);
    if (
      checkedAdd(checkedAdd(b.issuedMicros, b.pendingRewardMicros), cost) >
      policy.monthlyIssuanceMicros
    ) {
      fail("ISSUANCE_BUDGET_EXCEEDED", 429);
    }
    b.issuedMicros = checkedAdd(b.issuedMicros, cost);
  }
  async function context(tx, uid) {
    const cycle = month(now());
    const [ws, cs, bs, us] = await tx.getAll(
      walletRef(uid),
      controlRef,
      budgetRef(cycle),
      userBudgetRef(uid, cycle)
    );
    if (!ws.exists) fail("WALLET_NOT_ENROLLED", 404);
    if (!cs.exists) fail("CONTROL_NOT_CONFIGURED", 503);
    return {
      uid,
      cycle,
      w: ws.data(),
      c: cs.data(),
      b: bs.exists ? bs.data() : emptyBudget(),
      u: us.exists ? us.data() : { spentMicros: 0, reservedMicros: 0 },
    };
  }
  function renew(tx, ctx) {
    const { uid, cycle, w, c, b } = ctx;
    if (w.cycle === cycle) return;
    if (w.cycle && w.cycle > cycle) fail("CLOCK_MOVED_BACKWARDS", 503);
    if (!c.issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
    const expired = w.expiring;
    w.balance -= expired;
    w.expiring = 0;
    w.totals.expired = checkedAdd(w.totals.expired, expired);
    const amount = Math.min(
      policy.monthlyCredits[w.tier],
      policy.maxBalance - w.balance - w.reserved - w.pendingRewardCredits
    );
    issueBudget(b, amount);
    w.expiring = amount;
    w.balance = checkedAdd(w.balance, amount);
    w.totals.granted = checkedAdd(w.totals.granted, amount);
    w.cycle = cycle;
    w.adsAwarded = 0;
    ledger(tx, [uid, "renew", cycle], {
      userId: uid,
      kind: "monthly_grant",
      source: "granted",
      cycle,
      amount,
      expired,
      tier: w.tier,
      pricingRevision: policy.revision,
    });
  }
  function save(tx, ctx) {
    checkWallet(ctx.w);
    tx.set(walletRef(ctx.uid), ctx.w);
    tx.set(controlRef, ctx.c);
    tx.set(budgetRef(ctx.cycle), ctx.b);
    tx.set(userBudgetRef(ctx.uid, ctx.cycle), ctx.u);
  }
  function summary(w) {
    checkWallet(w);
    return {
      sandbox: true,
      balance: w.balance,
      reserved: w.reserved,
      tier: w.tier,
      cycle: w.cycle,
      renewsAt: new Date(
        Date.UTC(Number(w.cycle.slice(0, 4)), Number(w.cycle.slice(5)), 1)
      ).toISOString(),
      monthlyAllowance: policy.monthlyCredits[w.tier],
      maxBalance: policy.maxBalance,
      totals: w.totals,
      rewardCredits: policy.rewardCredits,
      adsRemaining:
        w.tier === "free"
          ? Math.max(0, policy.rewardMonthlyCap - w.adsAwarded - Number(Boolean(w.activeReward)))
          : 0,
      activeReward: w.activeReward,
      adFree: w.tier !== "free",
      pricingRevision: policy.revision,
    };
  }
  async function initialiseControl() {
    guard();
    // An explicit local setup action. Restarting the server never overwrites a kill switch.
    await db.runTransaction(async tx => {
      const snap = await tx.get(controlRef);
      if (!snap.exists)
        tx.create(controlRef, {
          spendingEnabled: true,
          rewardsEnabled: true,
          issuanceEnabled: true,
          activeOperations: 0,
        });
    });
  }
  async function enroll(uid, { tier = "free", openingBalance = 0 } = {}) {
    guard();
    identifier(uid);
    integer(openingBalance, "OPENING_BALANCE");
    if (!Object.hasOwn(policy.monthlyCredits, tier)) fail("INVALID_TIER");
    if (openingBalance > policy.maxBalance) fail("WALLET_CAP", 409);
    await db.runTransaction(async tx => {
      const [ws, cs, bs] = await tx.getAll(walletRef(uid), controlRef, budgetRef(month(now())));
      if (ws.exists) return; // Never reset an existing wallet on restart.
      if (!cs.exists || !cs.data().issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
      const b = bs.exists ? bs.data() : emptyBudget();
      issueBudget(b, openingBalance);
      tx.create(walletRef(uid), {
        userId: uid,
        tier,
        cycle: null,
        balance: openingBalance,
        permanent: openingBalance,
        expiring: 0,
        reserved: 0,
        activeOperations: 0,
        activeReward: null,
        adsAwarded: 0,
        pendingRewardCredits: 0,
        totals: {
          opening: openingBalance,
          granted: 0,
          earned: 0,
          purchased: 0,
          consumed: 0,
          refunded: 0,
          expired: 0,
        },
      });
      tx.set(budgetRef(month(now())), b);
      ledger(tx, [uid, "enroll"], {
        userId: uid,
        kind: "opening_balance",
        source: "opening",
        amount: openingBalance,
      });
    });
  }
  async function getAccount(uid) {
    guard();
    return db.runTransaction(async tx => {
      const ctx = await context(tx, uid);
      renew(tx, ctx);
      save(tx, ctx);
      return summary(ctx.w);
    });
  }
  async function grantPurchased(uid, amount, paymentEventId) {
    guard();
    integer(amount, "PURCHASE_AMOUNT", 1);
    identifier(paymentEventId);
    // Internal sandbox adapter only. A future payment adapter must verify owner, amount,
    // currency and package against a stored order before calling the wallet.
    const eventRef = ref("events", id("purchase", paymentEventId));
    return db.runTransaction(async tx => {
      const [ctx, existing] = await Promise.all([context(tx, uid), tx.get(eventRef)]);
      if (existing.exists) {
        if (existing.data().userId !== uid || existing.data().amount !== amount)
          fail("EVENT_CONFLICT", 409);
        return { alreadyProcessed: true };
      }
      renew(tx, ctx);
      if (!ctx.c.issuanceEnabled) fail("ISSUANCE_PAUSED", 503);
      issueBudget(ctx.b, amount);
      ctx.w.permanent = checkedAdd(ctx.w.permanent, amount);
      ctx.w.balance = checkedAdd(ctx.w.balance, amount);
      ctx.w.totals.purchased = checkedAdd(ctx.w.totals.purchased, amount);
      save(tx, ctx);
      tx.create(eventRef, { userId: uid, amount, source: "purchased", paymentEventId });
      ledger(tx, ["purchase", paymentEventId], {
        userId: uid,
        source: "purchased",
        kind: "purchase",
        amount,
      });
      return { alreadyProcessed: false, balance: ctx.w.balance };
    });
  }
  async function reserve(uid, { operation, units, requestId, approvedCredits, pricingRevision }) {
    guard();
    identifier(requestId);
    const quote = quoteOperation(policy, operation, units);
    if (approvedCredits !== quote.credits || pricingRevision !== quote.pricingRevision)
      fail("PRICE_CHANGED", 409);
    const operationId = id(uid, requestId);
    const operationRef = ref("operations", operationId);
    const fingerprint = id(operation, units, approvedCredits, pricingRevision);
    return db.runTransaction(async tx => {
      const [ctx, existing] = await Promise.all([context(tx, uid), tx.get(operationRef)]);
      if (existing.exists) {
        if (existing.data().fingerprint !== fingerprint) fail("IDEMPOTENCY_CONFLICT", 409);
        return { ...existing.data(), alreadyReserved: true };
      }
      renew(tx, ctx);
      const { w, c, b, u } = ctx;
      if (!c.spendingEnabled) fail("SPENDING_PAUSED", 503);
      if (w.balance < quote.credits) fail("INSUFFICIENT_CREDITS", 402);
      if (
        c.activeOperations >= policy.maxActiveGlobal ||
        w.activeOperations >= policy.maxActiveUser
      )
        fail("CAPACITY_LIMIT", 429);
      if (
        checkedAdd(checkedAdd(b.spentMicros, b.reservedMicros), quote.maxCostMicros) >
          policy.monthlySpendMicros ||
        checkedAdd(checkedAdd(u.spentMicros, u.reservedMicros), quote.maxCostMicros) >
          policy.userMonthlySpendMicros
      )
        fail("SPEND_BUDGET_EXCEEDED", 429);
      const fromExpiring = Math.min(w.expiring, quote.credits);
      const fromPermanent = quote.credits - fromExpiring;
      w.balance -= quote.credits;
      w.expiring -= fromExpiring;
      w.permanent -= fromPermanent;
      w.reserved = checkedAdd(w.reserved, quote.credits);
      w.activeOperations++;
      c.activeOperations++;
      b.reservedMicros = checkedAdd(b.reservedMicros, quote.maxCostMicros);
      u.reservedMicros = checkedAdd(u.reservedMicros, quote.maxCostMicros);
      const record = {
        operationId,
        userId: uid,
        requestId,
        fingerprint,
        ...quote,
        fromExpiring,
        fromPermanent,
        cycle: ctx.cycle,
        state: "reserved",
        createdAt: now(),
      };
      save(tx, ctx);
      tx.create(operationRef, record);
      ledger(tx, [operationId, "reserve"], {
        userId: uid,
        kind: "reservation",
        operationId,
        amount: quote.credits,
      });
      return { ...record, alreadyReserved: false };
    });
  }
  async function start(uid, operationId) {
    guard();
    identifier(operationId);
    return db.runTransaction(async tx => {
      const [os, cs] = await tx.getAll(ref("operations", operationId), controlRef);
      if (!os.exists || os.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
      if (!cs.exists || !cs.data().spendingEnabled) fail("SPENDING_PAUSED", 503);
      const record = os.data();
      if (record.state !== "reserved") fail("OPERATION_ALREADY_STARTED_OR_SETTLED", 409);
      if (record.cycle !== month(now())) fail("RESERVATION_EXPIRED", 409);
      // Exactly one dispatcher obtains this transition. Redelivery must not rerun a worker.
      tx.update(os.ref, { state: "running", startedAt: now() });
      return { ...record, state: "running" };
    });
  }
  async function settle(uid, operationId, outcome) {
    guard();
    identifier(operationId);
    if (!["succeeded", "failed", "cancelled"].includes(outcome)) fail("INVALID_OUTCOME");
    return db.runTransaction(async tx => {
      const os = await tx.get(ref("operations", operationId));
      if (!os.exists || os.data().userId !== uid) fail("OPERATION_NOT_FOUND", 404);
      const op = os.data();
      if (["succeeded", "failed", "cancelled"].includes(op.state)) {
        if (op.state !== outcome) fail("SETTLEMENT_CONFLICT", 409);
        return { state: op.state, alreadySettled: true };
      }
      if (outcome === "succeeded" && op.state !== "running") fail("OPERATION_NOT_STARTED", 409);
      if (outcome === "cancelled" && op.state === "running")
        fail("WORKER_TERMINATION_REQUIRED", 409);
      const [ws, cs, bs, us] = await tx.getAll(
        walletRef(uid),
        controlRef,
        budgetRef(op.cycle),
        userBudgetRef(uid, op.cycle)
      );
      if (![ws, cs, bs, us].every(s => s.exists)) fail("ACCOUNTING_STATE_MISSING", 503);
      const w = ws.data(),
        c = cs.data(),
        b = bs.data(),
        u = us.data();
      w.reserved -= op.credits;
      w.activeOperations--;
      c.activeOperations--;
      b.reservedMicros -= op.maxCostMicros;
      u.reservedMicros -= op.maxCostMicros;
      // Once started, a failed worker still costs money. Charge the conservative entire
      // resource ceiling to the financial budget, even when refunding user credits.
      if (op.state === "running") {
        b.spentMicros = checkedAdd(b.spentMicros, op.maxCostMicros);
        u.spentMicros = checkedAdd(u.spentMicros, op.maxCostMicros);
      }
      let releasedCredits = 0;
      let expiredCredits = 0;
      if (outcome === "succeeded") w.totals.consumed = checkedAdd(w.totals.consumed, op.credits);
      else {
        // Holding queued work over renewal must not turn an expiring allowance into
        // permanent credits. Only a confirmed failure of started work gets compensation.
        if (month(now()) !== op.cycle && op.state !== "running") expiredCredits = op.fromExpiring;
        releasedCredits = op.credits - expiredCredits;
        w.balance = checkedAdd(w.balance, releasedCredits);
        if (w.cycle === op.cycle && month(now()) === op.cycle) {
          w.expiring = checkedAdd(w.expiring, op.fromExpiring);
          w.permanent = checkedAdd(w.permanent, op.fromPermanent);
        } else w.permanent = checkedAdd(w.permanent, releasedCredits);
        w.totals.refunded = checkedAdd(w.totals.refunded, releasedCredits);
        w.totals.expired = checkedAdd(w.totals.expired, expiredCredits);
      }
      checkWallet(w);
      for (const value of [c.activeOperations, b.reservedMicros, u.reservedMicros])
        integer(value, "ACCOUNTING_STATE");
      tx.set(walletRef(uid), w);
      tx.set(controlRef, c);
      tx.set(budgetRef(op.cycle), b);
      tx.set(userBudgetRef(uid, op.cycle), u);
      tx.update(os.ref, { state: outcome, settledAt: now() });
      ledger(tx, [operationId, "settle"], {
        userId: uid,
        kind: outcome === "succeeded" ? "consumption" : "release",
        source: outcome === "succeeded" ? "consumed" : "refunded",
        operationId,
        amount: outcome === "succeeded" ? op.credits : releasedCredits,
        reservationCredits: op.credits,
        expiredCredits,
        infrastructureMicros: op.state === "running" ? op.maxCostMicros : 0,
      });
      return {
        state: outcome,
        alreadySettled: false,
        balance: w.balance,
        refunded: releasedCredits,
        expired: expiredCredits,
      };
    });
  }
  async function beginReward(uid) {
    guard();
    const sessionId = crypto.randomUUID();
    return db.runTransaction(async tx => {
      const ctx = await context(tx, uid);
      renew(tx, ctx);
      const { w, c, b } = ctx;
      if (!c.rewardsEnabled || !c.issuanceEnabled) fail("REWARDS_PAUSED", 503);
      if (w.tier !== "free") fail("SUBSCRIBER_AD_FREE", 409);
      if (w.activeReward) fail("REWARD_IN_PROGRESS", 409);
      if (w.adsAwarded >= policy.rewardMonthlyCap) fail("MONTHLY_AD_CAP", 429);
      if (w.balance + w.reserved + policy.rewardCredits > policy.maxBalance)
        fail("WALLET_CAP", 409);
      const liabilityMicros = checkedMultiply(policy.rewardCredits, policy.microsPerCredit);
      if (
        checkedAdd(checkedAdd(b.issuedMicros, b.pendingRewardMicros), liabilityMicros) >
        policy.monthlyIssuanceMicros
      )
        fail("ISSUANCE_BUDGET_EXCEEDED", 429);
      b.pendingRewardMicros = checkedAdd(b.pendingRewardMicros, liabilityMicros);
      w.activeReward = sessionId;
      w.pendingRewardCredits = policy.rewardCredits;
      const session = {
        sessionId,
        userId: uid,
        cycle: ctx.cycle,
        credits: policy.rewardCredits,
        liabilityMicros,
        state: "pending",
        createdAt: now(),
        expiresAt: now() + policy.rewardTtlSeconds * 1000,
      };
      save(tx, ctx);
      tx.create(ref("reward_sessions", sessionId), session);
      return { ...session, sandbox: true };
    });
  }
  async function closeReward(uid, sessionId) {
    guard();
    identifier(sessionId);
    return db.runTransaction(async tx => {
      const ss = await tx.get(ref("reward_sessions", sessionId));
      if (!ss.exists || ss.data().userId !== uid) fail("REWARD_NOT_FOUND", 404);
      const session = ss.data();
      if (session.state !== "pending") return { state: session.state };
      const [ws, bs] = await tx.getAll(walletRef(uid), budgetRef(session.cycle));
      if (!ws.exists || !bs.exists) fail("ACCOUNTING_STATE_MISSING", 503);
      const w = ws.data(),
        b = bs.data();
      if (w.activeReward !== sessionId) fail("REWARD_STATE_CONFLICT", 409);
      w.activeReward = null;
      w.pendingRewardCredits = 0;
      b.pendingRewardMicros -= session.liabilityMicros;
      integer(b.pendingRewardMicros, "REWARD_LIABILITY");
      tx.set(walletRef(uid), w);
      tx.set(budgetRef(session.cycle), b);
      const state =
        now() >= session.expiresAt || month(now()) !== session.cycle ? "expired" : "cancelled";
      tx.update(ss.ref, { state });
      return { state };
    });
  }
  async function completeReward(proof) {
    guard();
    const verified = verifier.verify(proof); // No browser flags/timers or Google client events accepted.
    const { userId: uid, sessionId, eventId, completedAt } = verified;
    const eventRef = ref("events", id("local-mock", eventId));
    return db.runTransaction(async tx => {
      const [ctx, ss, es] = await Promise.all([
        context(tx, uid),
        tx.get(ref("reward_sessions", sessionId)),
        tx.get(eventRef),
      ]);
      if (es.exists) {
        if (es.data().userId !== uid || es.data().sessionId !== sessionId)
          fail("EVENT_CONFLICT", 409);
        return { alreadyAwarded: true };
      }
      if (!ss.exists || ss.data().userId !== uid) fail("REWARD_NOT_FOUND", 404);
      const s = ss.data();
      if (s.state !== "pending" || ctx.w.activeReward !== sessionId)
        fail("REWARD_ALREADY_CLOSED", 409);
      if (
        ctx.cycle !== s.cycle ||
        now() >= s.expiresAt ||
        completedAt < s.createdAt ||
        completedAt > now() ||
        completedAt >= s.expiresAt
      )
        fail("REWARD_EXPIRED", 409);
      if (ctx.w.tier !== "free" || ctx.w.adsAwarded >= policy.rewardMonthlyCap)
        fail("MONTHLY_AD_CAP", 429);
      // Honour an already promised mock reward even if new issuance is paused.
      ctx.b.pendingRewardMicros -= s.liabilityMicros;
      integer(ctx.b.pendingRewardMicros, "REWARD_LIABILITY");
      ctx.b.issuedMicros = checkedAdd(ctx.b.issuedMicros, s.liabilityMicros);
      ctx.w.balance = checkedAdd(ctx.w.balance, s.credits);
      ctx.w.expiring = checkedAdd(ctx.w.expiring, s.credits);
      ctx.w.totals.earned = checkedAdd(ctx.w.totals.earned, s.credits);
      ctx.w.adsAwarded++;
      ctx.w.activeReward = null;
      ctx.w.pendingRewardCredits = 0;
      save(tx, ctx);
      tx.update(ss.ref, { state: "awarded", eventId, completedAt });
      tx.create(eventRef, { userId: uid, sessionId, eventId });
      ledger(tx, ["reward", sessionId], {
        userId: uid,
        kind: "reward",
        source: "earned",
        amount: s.credits,
        eventId,
        sessionId,
      });
      return { alreadyAwarded: false, balance: ctx.w.balance, earned: s.credits };
    });
  }
  return {
    policy,
    initialiseControl,
    enroll,
    getAccount,
    grantPurchased,
    quote: (operation, units) => {
      guard();
      return quoteOperation(policy, operation, units);
    },
    reserve,
    start,
    settle,
    beginReward,
    closeReward,
    completeReward,
  };
}
module.exports = { createWalletService };
```

### A5. src/services/unifiedCredits/economics.js

```javascript
const { integer, fail } = require("./policy");
const safe = value => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) fail("ECONOMICS_OVERFLOW");
  return Number(value);
};
const big = (value, name, min = 0) => BigInt(integer(value, name, min));

function estimateComputeMicros(input) {
  const seconds = big(input.seconds, "SECONDS", 1);
  const perSecond =
    big(input.vcpu, "VCPU", 1) * big(input.cpuNanoUsdPerSecond, "CPU_RATE", 1) +
    big(input.memoryGiB, "MEMORY", 1) * big(input.memoryNanoUsdPerSecond, "MEMORY_RATE", 1) +
    big(input.gpuNanoUsdPerSecond || 0, "GPU_RATE");
  // Round up from nanodollars to microdollars. Add separate storage/network/API costs.
  return safe((seconds * perSecond + 999n) / 1000n);
}

function analyseEconomics(input) {
  const revenue = big(input.finalizedAdRevenueMicros, "FINALISED_REVENUE");
  const overhead = big(input.adServingMicros, "AD_OVERHEAD");
  const completions = big(input.verifiedRewardCompletions, "COMPLETIONS");
  const bps = big(input.spendableBps, "SPENDABLE_FRACTION");
  if (bps > 10000n) fail("INVALID_SPENDABLE_FRACTION");
  const creditCost = big(input.microsPerCredit, "CREDIT_LIABILITY", 1);
  const net = revenue > overhead ? revenue - overhead : 0n;
  const spendable = (net * bps) / 10000n;
  const maxReward = completions > 0n ? spendable / (completions * creditCost) : 0n;
  const allowance = big(input.freeMonthlyAllowance, "ALLOWANCE");
  const adCap = big(input.monthlyAdCap, "AD_CAP");
  const reward = big(input.proposedRewardCredits, "PROPOSED_REWARD");
  const users = big(input.activeFreeUsers, "FREE_USERS");
  const subsidy = big(input.subsidyBudgetMicros, "SUBSIDY");
  const baseline = allowance * creditCost;
  const perUser = (allowance + adCap * reward) * creditCost;
  const exposure = perUser * users;
  const funded = spendable + subsidy;
  return {
    observationAvailable: completions > 0n,
    spendableFinalizedRevenueMicros: safe(spendable),
    maxRevenueFundedRewardCredits: safe(maxReward),
    proposedRewardRevenueFunded: completions > 0n && reward <= maxReward,
    baselineFreeLiabilityPerUserMicros: safe(baseline),
    maximumLiabilityPerUserMicros: safe(perUser),
    maximumMonthlyLiabilityMicros: safe(exposure),
    unfundedExposureMicros: safe(exposure > funded ? exposure - funded : 0n),
    maxActiveUsersWithinFunding: perUser > 0n ? safe(funded / perUser) : null,
    recommendation:
      completions === 0n || maxReward === 0n
        ? "Keep live rewards disabled; fund any pilot explicitly as a subsidy."
        : "Use a conservative observed revenue floor and recheck cohorts before approving a live reward.",
  };
}
module.exports = { estimateComputeMicros, analyseEconomics };
```

### A6. src/routes/unifiedCreditsSandboxRoutes.js

```javascript
const express = require("express");
const rateLimit = require("express-rate-limit");
const { assertSandbox } = require("../services/unifiedCredits/runtime");

function createSandboxApp({ service, verifier, origin, now = Date.now }) {
  assertSandbox();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    assertSandbox();
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.set("Cache-Control", "no-store");
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      return res.status(403).json({ error: "SAME_ORIGIN_REQUIRED" });
    }
    next();
  });
  app.use(
    "/api/",
    rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false })
  );
  app.use(express.json({ limit: "8kb" }));
  app.use("/api/", (req, res, next) => {
    // Deliberately simulated identity. No Firebase production tokens are read or accepted.
    const uid = req.headers["x-credits-sandbox-user"];
    if (
      req.headers["x-credits-sandbox"] !== "local" ||
      !["demo-free", "demo-premium"].includes(uid)
    ) {
      return res.status(401).json({ error: "LOCAL_DEMO_IDENTITY_REQUIRED" });
    }
    req.creditUserId = uid;
    next();
  });
  app.get("/api/account", async (req, res) => res.json(await service.getAccount(req.creditUserId)));
  app.get("/api/catalogue", (req, res) =>
    res.json({
      operations: service.policy.operations,
      monthlyCredits: service.policy.monthlyCredits,
      version: service.policy.version,
    })
  );
  app.post("/api/quote", async (req, res) => {
    const quote = service.quote(req.body.operation, req.body.units);
    const account = await service.getAccount(req.creditUserId);
    res.json({ ...quote, canAfford: account.balance >= quote.credits });
  });
  app.post("/api/rewards", async (req, res) => {
    if (req.body.consent !== true) return res.status(400).json({ error: "OPT_IN_REQUIRED" });
    res.json(await service.beginReward(req.creditUserId));
  });
  app.post("/api/rewards/:sessionId/close", async (req, res) =>
    res.json(await service.closeReward(req.creditUserId, req.params.sessionId))
  );
  app.post("/api/rewards/:sessionId/mock-completion", async (req, res) => {
    const sessionId = req.params.sessionId;
    // Only the isolated emulator app exposes this simulator. A live provider must supply
    // its own authenticated completion evidence; this endpoint is not a Google callback.
    const proof = verifier.issue({
      userId: req.creditUserId,
      sessionId,
      eventId: `mock-${sessionId}`,
      completedAt: now(),
    });
    res.json(await service.completeReward(proof));
  });
  app.post("/api/operations", async (req, res) => {
    const op = await service.reserve(req.creditUserId, req.body);
    if (op.alreadyReserved) return res.json({ state: op.state, alreadyProcessed: true });
    // No actual processing, uploads, queue dispatch or provider API calls in this app.
    await service.start(req.creditUserId, op.operationId);
    res.json(
      await service.settle(
        req.creditUserId,
        op.operationId,
        req.body.simulateFailure === true ? "failed" : "succeeded"
      )
    );
  });
  app.use(express.static(require("path").resolve(__dirname, "../../sandbox/credits")));
  app.use((err, req, res, _next) =>
    res.status(err.status || 500).json({
      error: err.code || "SANDBOX_REQUEST_FAILED",
    })
  );
  return app;
}
module.exports = { createSandboxApp };
```

### A7. scripts/credits-sandbox.cjs

```javascript
// Standalone local preview. This file is never mounted by src/server.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSandboxDatabase } = require("../src/services/unifiedCredits/runtime");
const { createWalletService } = require("../src/services/unifiedCredits/wallet");
const { createMockVerifier } = require("../src/services/unifiedCredits/rewardProof");
const { createSandboxApp } = require("../src/routes/unifiedCreditsSandboxRoutes");

async function main() {
  const port = Number(process.env.CREDITS_SANDBOX_PORT || 8190);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid sandbox port");
  const db = createSandboxDatabase();
  const policyFile =
    process.env.UNIFIED_CREDITS_CONFIG ||
    path.resolve(__dirname, "../config/unified-credits.sandbox.example.json");
  const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"));
  const verifier = createMockVerifier(crypto.randomBytes(32).toString("hex"));
  const service = createWalletService({ db, policy, verifier });
  await service.initialiseControl();
  await service.enroll("demo-free");
  await service.enroll("demo-premium", { tier: "premium" });
  const origin = `http://127.0.0.1:${port}`;
  const app = createSandboxApp({ service, verifier, origin });
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(`Credits preview: ${origin} (demo emulator only)`)
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(async () => {
        await db.terminate();
        process.exit(0);
      });
    });
}
main().catch(error => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
```

### A8. scripts/test-unified-credits.cjs

```javascript
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { once } = require("events");
const { assertSandbox, DEMO_PROJECT } = require("../src/services/unifiedCredits/runtime");

async function main() {
  // Own a fresh ephemeral emulator; never delete data from a pre-existing emulator.
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "test",
    UNIFIED_CREDITS_SANDBOX: "true",
    UNIFIED_CREDITS_PROJECT_ID: DEMO_PROJECT,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  assertSandbox(env);
  const jar =
    process.env.CREDITS_FIRESTORE_JAR ||
    path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar");
  if (!fs.existsSync(jar))
    throw new Error("Install the Firestore emulator first: npx firebase setup:emulators:firestore");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-credits-tests-"));
  const emulator = spawn(
    process.env.CREDITS_JAVA_BIN || "java",
    [
      "-jar",
      jar,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--project_id",
      DEMO_PROJECT,
      "--rules",
      path.resolve(__dirname, "../test/unified-credits/firestore.rules"),
    ],
    { env, cwd: scratch }
  );
  let log = "",
    exited = false;
  emulator.on("exit", () => {
    exited = true;
  });
  emulator.on("error", error => {
    log += error.message;
    exited = true;
  });
  for (const stream of [emulator.stdout, emulator.stderr])
    stream.on("data", data => {
      log = (log + data).slice(-12000);
    });
  let tests;
  const stop = () => {
    tests?.kill("SIGTERM");
    emulator.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150 && !exited; attempt++) {
      try {
        const response = await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/`, {
          signal: AbortSignal.timeout(500),
        });
        ready = response.ok;
      } catch {
        /* Starting. */
      }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Firestore emulator did not start. Java 21+ is required.\n${log}`);
    tests = spawn(process.execPath, ["--test", "test/unified-credits/foundation.test.cjs"], {
      cwd: path.resolve(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    const [code] = await once(tests, "exit");
    process.exitCode = Number.isInteger(code) ? code : 1;
    if (code === 0 && process.argv.includes("--browser")) {
      tests = spawn(process.execPath, ["scripts/credits-browser-check.cjs"], {
        cwd: path.resolve(__dirname, ".."),
        env,
        stdio: "inherit",
      });
      const [browserCode] = await once(tests, "exit");
      process.exitCode = Number.isInteger(browserCode) ? browserCode : 1;
    }
  } finally {
    stop();
    if (!exited) await once(emulator, "exit");
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
```

### A9. scripts/credits-browser-check.cjs

```javascript
/* global document, window */
const assert = require("assert/strict");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { chromium } = require("@playwright/test");
const { createSandboxDatabase } = require("../src/services/unifiedCredits/runtime");
const { createMockVerifier } = require("../src/services/unifiedCredits/rewardProof");
const { createWalletService } = require("../src/services/unifiedCredits/wallet");
const { createSandboxApp } = require("../src/routes/unifiedCreditsSandboxRoutes");

async function main() {
  const db = createSandboxDatabase();
  const verifier = createMockVerifier(crypto.randomBytes(32).toString("hex"));
  const service = createWalletService({
    db,
    verifier,
    policy: require("../config/unified-credits.sandbox.example.json"),
  });
  await service.initialiseControl();
  await service.enroll("demo-free");
  await service.enroll("demo-premium", { tier: "premium" });
  const server = require("http").createServer();
  server.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on("request", createSandboxApp({ service, verifier, origin }));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [],
      external = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      if (!route.request().url().startsWith(`${origin}/`)) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const { expect } = require("@playwright/test");
    await page.goto(origin);
    await expect(page.locator("#balance")).toHaveText("15");
    await expect(page.locator("#watch")).toBeEnabled();
    await page.screenshot({
      path: path.join(os.tmpdir(), "autopromote-credits-desktop.png"),
      fullPage: true,
    });
    await page.locator("#watch").click();
    await expect(page.locator("#ad")).toBeVisible();
    await page.locator("#skip").click();
    await expect(page.locator("#ad")).not.toBeVisible();
    await expect(page.locator("#balance")).toHaveText("15");
    await page.locator("#watch").click();
    await page.locator("#complete").click();
    await expect(page.locator("#balance")).toHaveText("16");
    await page.locator("#run").click();
    await expect(page.locator("#balance")).toHaveText("15");
    await page.locator("#fail").click();
    await expect(page.locator("#status")).toContainText("refunded");
    await expect(page.locator("#balance")).toHaveText("15");
    const uidHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(["demo-free"]))
      .digest("hex");
    await db
      .collection("credits_v2_wallets")
      .doc(uidHash)
      .update({ balance: 0, expiring: 0, permanent: 0 });
    await page.reload();
    await expect(page.locator("#balance")).toHaveText("0");
    await expect(page.locator("#run")).toBeDisabled();
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator("#notes").fill("Keep creating at zero credits");
    await page.locator("#save").click();
    await page.reload();
    await expect(page.locator("#notes")).toHaveValue("Keep creating at zero credits");
    await expect(page.locator("#account")).toBeEnabled();
    await page.locator("#account").selectOption("demo-premium");
    await expect(page.locator("#balance")).toHaveText("150");
    await expect(page.locator("#watch")).toBeDisabled();
    await expect(page.locator("#reward-copy")).toContainText("ad-free");
    await expect(page.locator("#account")).toBeEnabled();
    await page.locator("#account").selectOption("demo-free");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#balance")).toHaveText("0");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), "autopromote-credits-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      "Browser checks passed: opt-in, skip, reward, cost, consumption, refund, zero-credit saving, subscriber and mobile layout."
    );
    console.log(
      `Screenshots: ${path.join(os.tmpdir(), "autopromote-credits-desktop.png")} and ${path.join(os.tmpdir(), "autopromote-credits-mobile.png")}`
    );
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await db.terminate();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

### A10. scripts/credits-economics.cjs

```javascript
const fs = require("fs");
const { analyseEconomics } = require("../src/services/unifiedCredits/economics");
if (!process.argv[2]) {
  console.error("Usage: node scripts/credits-economics.cjs observation.json");
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(analyseEconomics(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))), null, 2)
  );
}
```

### A11. config/unified-credits.sandbox.example.json

```json
{
  "version": "sandbox-example-v1",
  "microsPerCredit": 1000,
  "maxBalance": 10000,
  "maxJobMicros": 40000,
  "monthlySpendMicros": 1000000,
  "userMonthlySpendMicros": 500000,
  "monthlyIssuanceMicros": 10000000,
  "maxActiveGlobal": 4,
  "maxActiveUser": 2,
  "rewardCredits": 1,
  "rewardMonthlyCap": 20,
  "rewardTtlSeconds": 600,
  "operations": {
    "queue.dispatch": {
      "unit": "destinations",
      "baseMicros": 0,
      "microsPerUnit": 1000,
      "maxUnits": 6
    },
    "publisher.publish": {
      "unit": "destinations",
      "baseMicros": 1000,
      "microsPerUnit": 1000,
      "maxUnits": 6
    },
    "studio.render": {
      "unit": "seconds",
      "baseMicros": 1000,
      "microsPerUnit": 106,
      "maxUnits": 300
    },
    "clips.analyze": {
      "unit": "seconds",
      "baseMicros": 1000,
      "microsPerUnit": 106,
      "maxUnits": 300
    },
    "clips.render": { "unit": "seconds", "baseMicros": 1000, "microsPerUnit": 106, "maxUnits": 300 }
  }
}
```

### A12. config/unified-credits.economics.example.json

```json
{
  "finalizedAdRevenueMicros": 0,
  "verifiedRewardCompletions": 0,
  "adServingMicros": 0,
  "spendableBps": 5000,
  "microsPerCredit": 1000,
  "freeMonthlyAllowance": 15,
  "monthlyAdCap": 20,
  "proposedRewardCredits": 1,
  "activeFreeUsers": 1000,
  "subsidyBudgetMicros": 15000000
}
```

### A13. sandbox/credits/index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AutoPromote · Credits preview</title>
    <link rel="stylesheet" href="/style.css" />
    <script defer src="/app.js"></script>
  </head>
  <body>
    <div class="preview">
      Local preview · Ads and operations are simulated. No payments or cloud processing.
    </div>
    <main>
      <header>
        <a class="brand" href="/">AutoPromote<span>CREATE. PUBLISH. GROW.</span></a
        ><label class="account"
          >Preview account<select id="account">
            <option value="demo-free">Starter</option>
            <option value="demo-premium">Creator subscriber</option>
          </select></label
        >
      </header>
      <section class="intro">
        <p class="eyebrow">YOUR WORK, YOUR PACE</p>
        <h1>A little credit.<br />A lot of possibility.</h1>
        <p>Watch an ad, earn credits, and use them across AutoPromote.</p>
      </section>
      <div class="grid">
        <section class="card wallet" aria-labelledby="wallet-title">
          <div class="card-top">
            <h2 id="wallet-title">Your credits</h2>
            <span id="plan" class="pill">Starter</span>
          </div>
          <p class="balance"><span id="balance">—</span><span>available credits</span></p>
          <p id="renewal"></p>
          <p id="reserved"></p>
          <hr />
          <h3>Make room for your next idea</h3>
          <p id="reward-copy">Loading reward availability…</p>
          <button id="watch" disabled>Watch test ad</button
          ><button id="resume" class="secondary" hidden>Resume or dismiss test ad</button>
          <p class="muted">
            Your choice. Skip at any time. Ads never appear in your exported videos.
          </p>
          <a href="#plans">Explore subscription benefits →</a>
        </section>
        <section class="card" aria-labelledby="operation-title">
          <h2 id="operation-title">Put your credits to work</h2>
          <p>See the cost before you begin.</p>
          <label
            >Tool<select id="operation">
              <option value="queue.dispatch">Queue · schedule dispatch</option>
              <option value="publisher.publish">Publisher · publish</option>
              <option value="studio.render">Studio · render</option>
              <option value="clips.analyze">Find Viral Clips · analyse</option>
              <option value="clips.render">Find Viral Clips · render clip</option>
            </select></label
          ><label id="units-label"
            >Destinations<input id="units" type="number" min="1" value="1" step="1"
          /></label>
          <div class="price"><span>Operation cost</span><strong id="cost">—</strong></div>
          <p id="affordability"></p>
          <button id="run" disabled>Run test operation</button
          ><button id="fail" class="secondary" disabled>Test a failed operation & refund</button>
          <p class="muted">
            No daily tool quota. Your balance determines what you can run. Resource limits keep
            processing within budget.
          </p>
        </section>
      </div>
      <section class="card editor">
        <div class="card-top">
          <h2>Keep creating</h2>
          <span class="pill">Always available</span>
        </div>
        <p>You can keep editing and saving when your credits run out.</p>
        <label
          >Project notes<textarea
            id="notes"
            rows="4"
            placeholder="Your next great idea starts here…"
          ></textarea></label
        ><button class="secondary" id="save">Save notes on this device</button
        ><span id="saved" role="status"></span>
      </section>
      <section class="card" id="plans">
        <h2>More room to create</h2>
        <p>
          Subscribers receive more monthly credits and ad-free usage, alongside their plan benefits.
        </p>
        <p id="allowances"></p>
        <p class="muted">This preview cannot create subscriptions or take payments.</p>
      </section>
      <section class="card">
        <h2>Credit activity</h2>
        <dl id="activity"></dl>
        <p class="muted">
          Monthly allowances and ad rewards expire at renewal. Purchased credits are retained.
          Wallet capacity is shown beside renewal details.
        </p>
      </section>
      <p id="status" role="status" aria-live="polite"></p>
    </main>
    <dialog id="ad">
      <p class="eyebrow">SIMULATED ADVERTISEMENT</p>
      <h2 id="ad-title">Complete this test ad</h2>
      <p>This local test does not request an advertisement or generate revenue.</p>
      <div class="mock-creative">
        A moment for your next idea.<span>AutoPromote preview creative</span>
      </div>
      <button id="complete">Complete test ad</button
      ><button id="skip" class="secondary">Skip without a reward</button>
    </dialog>
  </body>
</html>
```

### A14. sandbox/credits/style.css

```css
:root {
  font-family: Inter, system-ui, sans-serif;
  color: #eef0f7;
  background: #0b1020;
  color-scheme: dark;
  line-height: 1.6;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
.preview {
  background: #1d2847;
  color: #c6d5f5;
  text-align: center;
  padding: 9px 16px;
  font-size: 13px;
}
main {
  max-width: 1050px;
  margin: auto;
  padding: 32px 24px 80px;
}
header,
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.brand {
  color: #fff;
  font-size: 24px;
  letter-spacing: -1px;
  font-weight: 800;
  text-decoration: none;
}
.brand span {
  display: block;
  font-size: 9px;
  letter-spacing: 2.2px;
  color: #8c9ab9;
}
.account {
  font-size: 12px;
  max-width: 220px;
}
.intro {
  padding: 42px 0 28px;
  max-width: 660px;
}
h1 {
  font-size: clamp(34px, 6vw, 56px);
  line-height: 1.1;
  letter-spacing: -2px;
  margin: 12px 0 20px;
}
h2 {
  font-size: 20px;
  margin: 0 0 14px;
}
h3 {
  font-size: 17px;
}
.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #acb4ff;
}
p {
  color: #aab5ce;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.card {
  padding: 28px;
  border: 1px solid #29334b;
  border-radius: 20px;
  background: #121a2d;
  margin-bottom: 20px;
}
.wallet {
  background: linear-gradient(140deg, #1f2546, #131a2e);
}
.balance {
  margin: 24px 0;
}
.balance > span:first-child {
  font-size: 64px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
  letter-spacing: -2px;
}
.balance > span:last-child {
  display: block;
  font-size: 14px;
  margin-top: 12px;
}
.pill {
  border: 1px solid #4c527b;
  border-radius: 20px;
  color: #c5caff;
  font-size: 11px;
  white-space: nowrap;
  padding: 4px 10px;
}
button {
  display: block;
  background: #a8a4ff;
  color: #15132b;
  width: 100%;
  border: 0;
  border-radius: 10px;
  font: inherit;
  font-weight: 650;
  padding: 12px 18px;
  margin: 10px 0;
  cursor: pointer;
}
button:hover {
  filter: brightness(1.08);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.secondary {
  background: transparent;
  border: 1px solid #465273;
  color: #dce2f2;
}
.muted {
  font-size: 12px;
  color: #8b98b5;
}
a {
  color: #b7b4ff;
}
label {
  display: block;
  font-size: 13px;
  color: #bec8df;
  margin: 16px 0;
}
input,
select,
textarea {
  display: block;
  background: #0c1325;
  color: #eef0f7;
  border: 1px solid #354261;
  border-radius: 9px;
  padding: 12px;
  width: 100%;
  margin-top: 6px;
  font: inherit;
}
input:focus,
select:focus,
textarea:focus,
button:focus-visible {
  outline: 2px solid #aaa6ff;
  outline-offset: 3px;
}
hr {
  border: 0;
  border-top: 1px solid #34405b;
  margin: 24px 0;
}
.price {
  display: flex;
  justify-content: space-between;
  background: #1d2740;
  padding: 16px;
  border-radius: 10px;
  margin-top: 22px;
}
.price strong {
  color: #c6c3ff;
}
.editor button {
  width: auto;
}
.editor #saved {
  font-size: 13px;
  color: #b7e8ca;
}
dl {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
dl div {
  min-width: 90px;
}
dt {
  font-size: 12px;
  color: #91a0be;
}
dd {
  margin: 4px 0;
  font-size: 22px;
}
#status {
  min-height: 24px;
}
dialog {
  max-width: 440px;
  background: #151f35;
  color: #fff;
  border: 1px solid #4c5a7e;
  border-radius: 20px;
  padding: 30px;
}
dialog::backdrop {
  background: #030611d9;
}
.mock-creative {
  padding: 45px 20px;
  border-radius: 12px;
  text-align: center;
  background: linear-gradient(130deg, #38415f, #574b85);
  font-size: 24px;
  margin: 22px 0;
}
.mock-creative span {
  display: block;
  font-size: 11px;
  margin-top: 18px;
  color: #d0ccea;
}
[hidden] {
  display: none !important;
}
@media (max-width: 680px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .card {
    padding: 22px;
  }
  main {
    padding: 24px 16px;
  }
  .account {
    max-width: 170px;
  }
  header {
    align-items: flex-start;
  }
  .intro {
    padding-top: 26px;
  }
  dl {
    gap: 16px;
  }
}
```

### A15. sandbox/credits/app.js

```javascript
/* Local preview only. No ad SDK, payment SDK or production Firebase client. */
const el = id => document.getElementById(id);
const creditLabel = count => `${count} ${count === 1 ? "credit" : "credits"}`;
let account,
  quote,
  session,
  catalogue,
  quoteGeneration = 0;
let busy = false;
async function api(path, body) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Credits-Sandbox": "local",
      "X-Credits-Sandbox-User": el("account").value,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
const messages = {
  INSUFFICIENT_CREDITS:
    "You need more credits for this operation. Keep editing, earn credits, or explore subscriptions.",
  SPEND_BUDGET_EXCEEDED:
    "Processing is paused because the available service budget is exhausted. Your credits are safe.",
  ISSUANCE_BUDGET_EXCEEDED:
    "Additional credits are temporarily unavailable. You can keep editing and saving.",
  REWARD_EXPIRED: "This test ad session expired. Dismiss it and start again.",
  MONTHLY_AD_CAP: "You have reached your monthly rewarded-ad limit.",
  PRICE_CHANGED: "The price changed. Review the updated quote before starting.",
};
function status(message) {
  el("status").textContent = message;
}
function buttons() {
  el("run").disabled = busy || !quote?.canAfford;
  el("fail").disabled = busy || !quote?.canAfford;
  el("watch").disabled =
    busy || !account || account.adFree || account.adsRemaining < 1 || Boolean(account.activeReward);
  el("account").disabled = busy;
}
async function updateQuote() {
  const generation = ++quoteGeneration;
  quote = null;
  buttons();
  const operation = el("operation").value;
  const price = catalogue.operations[operation];
  el("units-label").firstChild.textContent =
    price.unit === "seconds" ? "Processing seconds (test ceiling)" : "Destinations";
  el("units").max = price.maxUnits;
  try {
    const result = await api("/quote", { operation, units: Number(el("units").value) });
    if (generation !== quoteGeneration) return;
    quote = result;
    el("cost").textContent = creditLabel(result.credits);
    el("affordability").textContent = result.canAfford
      ? "Ready when you are."
      : "More credits needed. You can keep editing and saving.";
  } catch (error) {
    if (generation !== quoteGeneration) return;
    el("cost").textContent = "Unavailable";
    el("affordability").textContent =
      messages[error.message] || "Choose a valid workload within the resource limit.";
  }
  buttons();
}
async function refresh() {
  account = await api("/account");
  el("balance").textContent = account.balance;
  el("plan").textContent = account.adFree ? "Creator" : "Starter";
  const renewalDate = new Date(account.renewsAt).toLocaleDateString("en-ZA", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  el("renewal").textContent =
    `${account.monthlyAllowance} monthly credits · Renews ${renewalDate} (00:00 UTC). Wallet capacity: ${account.maxBalance}.`;
  el("reserved").textContent = account.reserved
    ? `${account.reserved} credits reserved for work in progress.`
    : "No credits reserved.";
  el("reward-copy").textContent = account.adFree
    ? "Your subscription includes ad-free usage."
    : `Complete a test ad to earn ${creditLabel(account.rewardCredits)}. ${account.adsRemaining} ads available this monthly cycle.`;
  el("watch").textContent = `Watch test ad · Earn ${creditLabel(account.rewardCredits)}`;
  el("resume").hidden = !account.activeReward;
  session = account.activeReward
    ? { sessionId: account.activeReward, credits: account.rewardCredits }
    : null;
  el("activity").replaceChildren();
  for (const name of ["granted", "earned", "purchased", "consumed", "refunded", "expired"]) {
    const entry = document.createElement("div"),
      term = document.createElement("dt"),
      value = document.createElement("dd");
    term.textContent = name[0].toUpperCase() + name.slice(1);
    value.textContent = account.totals[name];
    entry.append(term, value);
    el("activity").append(entry);
  }
  await updateQuote();
}
async function action(work) {
  if (busy) return;
  busy = true;
  buttons();
  try {
    await work();
  } catch (error) {
    status(messages[error.message] || error.message);
  } finally {
    busy = false;
    buttons();
  }
}
el("watch").onclick = () =>
  action(async () => {
    session = await api("/rewards", { consent: true });
    el("ad-title").textContent = `Complete this test ad to earn ${creditLabel(session.credits)}`;
    el("ad").showModal();
  });
el("resume").onclick = () => {
  el("ad-title").textContent = `Complete this test ad to earn ${creditLabel(session.credits)}`;
  el("ad").showModal();
};
el("complete").onclick = () =>
  action(async () => {
    const result = await api(`/rewards/${session.sessionId}/mock-completion`, {});
    el("ad").close();
    status(`You earned ${creditLabel(result.earned || account.rewardCredits)}.`);
    await refresh();
  });
async function skip() {
  if (!session) return;
  await api(`/rewards/${session.sessionId}/close`, {});
  el("ad").close();
  status("Ad dismissed. No credits awarded.");
  await refresh();
}
el("skip").onclick = () => action(skip);
el("ad").addEventListener("cancel", event => {
  event.preventDefault();
  action(skip);
});
async function run(simulateFailure) {
  if (!quote) return;
  const result = await api("/operations", {
    operation: quote.operation,
    units: quote.units,
    approvedCredits: quote.credits,
    pricingRevision: quote.pricingRevision,
    requestId: crypto.randomUUID(),
    simulateFailure,
  });
  status(
    result.state === "failed"
      ? "Test operation failed. Your credits were refunded."
      : "Test operation completed. Credits used."
  );
  await refresh();
}
el("run").onclick = () => action(() => run(false));
el("fail").onclick = () => action(() => run(true));
el("operation").onchange = () => {
  el("units").value = "1";
  updateQuote();
};
el("units").oninput = () => updateQuote();
el("account").onchange = () =>
  action(async () => {
    el("ad").close();
    await refresh();
  });
el("save").onclick = () => {
  try {
    localStorage.setItem("autopromote-credit-preview-notes", el("notes").value);
    el("saved").textContent = "Saved on this device.";
  } catch {
    el("saved").textContent = "Device storage is unavailable. Copy your notes to save them.";
  }
};
try {
  el("notes").value = localStorage.getItem("autopromote-credit-preview-notes") || "";
} catch {
  /* Device storage may be disabled. */
}
action(async () => {
  catalogue = await api("/catalogue");
  el("allowances").textContent =
    `Starter: ${catalogue.monthlyCredits.free} · Creator: ${catalogue.monthlyCredits.premium} · Studio: ${catalogue.monthlyCredits.pro} · Agency: ${catalogue.monthlyCredits.enterprise} credits per month.`;
  await refresh();
});
```

### A16. test/unified-credits/firestore.rules

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /credits_v2_wallets/{walletId} {
      allow get: if request.auth != null && resource.data.userId == request.auth.uid;
      allow list, create, update, delete: if false;
    }
    // Custom admin claims and user-writable role/tier fields grant no financial access.
    // Only the backend Admin SDK may mutate the sandbox's financial documents.
    match /{document=**} { allow read, write: if false; }
  }
}
```

### A17. test/unified-credits/firebase.json

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "firestore": { "host": "127.0.0.1", "port": 8188 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

### A18. test/unified-credits/foundation.test.cjs

```javascript
const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const {
  assertSandbox,
  createSandboxDatabase,
} = require("../../src/services/unifiedCredits/runtime");
const { validatePolicy, quoteOperation } = require("../../src/services/unifiedCredits/policy");
const { createMockVerifier } = require("../../src/services/unifiedCredits/rewardProof");
const { createWalletService } = require("../../src/services/unifiedCredits/wallet");
const { createSandboxApp } = require("../../src/routes/unifiedCreditsSandboxRoutes");
const {
  analyseEconomics,
  estimateComputeMicros,
} = require("../../src/services/unifiedCredits/economics");
const example = require("../../config/unified-credits.sandbox.example.json");
const hash = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const code = expected => error => error.code === expected;
const db = createSandboxDatabase();
const verifier = createMockVerifier("local-test-secret-not-a-provider-key-000000");
let service, time;
const now = () => time;
const make = changes =>
  createWalletService({ db, verifier, now, policy: { ...example, ...changes } });
const wallet = uid => db.collection("credits_v2_wallets").doc(hash(uid));
const budget = cycle => db.collection("credits_v2_budgets").doc(cycle || "2026-10");
const control = () => db.collection("credits_v2_control").doc("global");
async function enroll(uid = "alice", options = {}) {
  await service.enroll(uid, options);
  return service.getAccount(uid);
}
function reservation(requestId = crypto.randomUUID(), operation = "queue.dispatch", units = 1) {
  const q = service.quote(operation, units);
  return {
    operation,
    units,
    requestId,
    approvedCredits: q.credits,
    pricingRevision: q.pricingRevision,
  };
}
async function reward(uid = "alice", eventId) {
  const session = await service.beginReward(uid);
  const proof = verifier.issue({
    userId: uid,
    sessionId: session.sessionId,
    eventId: eventId || crypto.randomUUID(),
    completedAt: time,
  });
  return { session, proof };
}
beforeEach(async () => {
  assertSandbox(process.env, db);
  const collections = await db.listCollections();
  for (const collection of collections) {
    assert.match(collection.id, /^credits_v2_/);
    await db.recursiveDelete(collection);
  }
  time = Date.UTC(2026, 9, 26, 12);
  service = make();
  await service.initialiseControl();
});
after(async () => {
  await db.terminate();
});

describe("isolation and server pricing", () => {
  it("does not assume ad revenue and detects unfunded reward exposure", () => {
    const input = require("../../config/unified-credits.economics.example.json");
    const result = analyseEconomics(input);
    assert.equal(result.maxRevenueFundedRewardCredits, 0);
    assert.equal(result.maximumMonthlyLiabilityMicros, 35000000);
    assert.equal(result.unfundedExposureMicros, 20000000);
    assert.equal(
      analyseEconomics({
        ...input,
        finalizedAdRevenueMicros: 100000,
        verifiedRewardCompletions: 10,
      }).maxRevenueFundedRewardCredits,
      5
    );
    assert.equal(
      analyseEconomics({ ...input, finalizedAdRevenueMicros: 100000, verifiedRewardCompletions: 0 })
        .maxRevenueFundedRewardCredits,
      0
    );
    assert.throws(() => analyseEconomics({ ...input, spendableBps: 10001 }));
  });
  it("prices CPU and GPU runtime separately with conservative rounding", () => {
    assert.equal(
      estimateComputeMicros({
        seconds: 60,
        vcpu: 4,
        memoryGiB: 4,
        cpuNanoUsdPerSecond: 24000,
        memoryNanoUsdPerSecond: 2500,
        gpuNanoUsdPerSecond: 0,
      }),
      6360
    );
    assert.equal(
      estimateComputeMicros({
        seconds: 60,
        vcpu: 20,
        memoryGiB: 80,
        cpuNanoUsdPerSecond: 18000,
        memoryNanoUsdPerSecond: 2000,
        gpuNanoUsdPerSecond: 365220,
      }),
      53114
    );
  });
  it("fails closed without every sandbox guard, even with production runtime markers", () => {
    for (const changes of [
      { UNIFIED_CREDITS_SANDBOX: "false" },
      { UNIFIED_CREDITS_PROJECT_ID: "autopromote-cc6d3" },
      { FIRESTORE_EMULATOR_HOST: "example.org:8080" },
      { FIRESTORE_EMULATOR_HOST: "127.0.0.1:0" },
      { NODE_ENV: "production" },
      { K_SERVICE: "worker" },
      { FUNCTION_TARGET: "handler" },
      { RENDER: "true" },
    ]) {
      assert.throws(() => assertSandbox({ ...process.env, ...changes }), code("SANDBOX_ONLY"));
    }
    assert.throws(
      () => assertSandbox(process.env, { projectId: "live", _settings: db._settings }),
      code("SANDBOX_ONLY")
    );
    assert.throws(
      () =>
        assertSandbox(process.env, {
          projectId: db.projectId,
          _settings: { servicePath: "remote", port: 443, ssl: true },
        }),
      code("SANDBOX_ONLY")
    );
  });
  it("rejects invalid pricing, unknown features and unsafe arithmetic", () => {
    for (const value of [-1, 0, NaN, Infinity, 1.5, "1"])
      assert.throws(() => validatePolicy({ ...example, microsPerCredit: value }));
    const policy = validatePolicy(example);
    for (const units of [-1, 0, NaN, Infinity, 1.5, "1", Number.MAX_SAFE_INTEGER])
      assert.throws(() => quoteOperation(policy, "studio.render", units));
    for (const operation of ["render-multicam", "cam-combiner", "__proto__", "unknown"])
      assert.throws(() => service.quote(operation, 1), code("UNSUPPORTED_OPERATION"));
    assert.throws(() =>
      validatePolicy({
        ...example,
        operations: {
          ...example.operations,
          "studio.render": {
            unit: "seconds",
            baseMicros: 1,
            microsPerUnit: Number.MAX_SAFE_INTEGER,
            maxUnits: 2,
          },
        },
      })
    );
    assert.ok(Object.isFrozen(service.policy.operations["studio.render"]));
  });
  it("provides resource prices for all four supported tools", () => {
    for (const op of Object.keys(example.operations)) {
      const q = service.quote(op, 2);
      assert.ok(q.credits > 0);
      assert.ok(q.credits * service.policy.microsPerCredit >= q.maxCostMicros);
    }
  });
  it("rejects stale price consent and client-supplied low credit costs", async () => {
    await enroll();
    const r = reservation();
    await assert.rejects(
      service.reserve("alice", { ...r, approvedCredits: 0 }),
      code("PRICE_CHANGED")
    );
    await assert.rejects(
      service.reserve("alice", { ...r, pricingRevision: "invented" }),
      code("PRICE_CHANGED")
    );
    assert.equal((await service.getAccount("alice")).balance, 15);
  });
});

describe("allowances and source accounting", () => {
  it("issues one monthly grant under concurrent renewals and never resets on enrollment", async () => {
    await service.enroll("alice");
    const accounts = await Promise.all([service.getAccount("alice"), service.getAccount("alice")]);
    assert.deepEqual(
      accounts.map(a => a.balance),
      [15, 15]
    );
    await service.enroll("alice", { tier: "enterprise", openingBalance: 500 });
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.tier, "free");
    assert.equal(
      (await db.collection("credits_v2_ledger").where("kind", "==", "monthly_grant").get()).size,
      1
    );
  });
  it("renews at UTC month boundaries, expires grants/rewards and preserves purchased credits", async () => {
    await enroll();
    await service.grantPurchased("alice", 10, "payment1");
    const { proof } = await reward();
    await service.completeReward(proof);
    time = Date.UTC(2026, 10, 1);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 25);
    assert.equal(a.totals.expired, 16);
    assert.equal(a.totals.granted, 30);
    assert.equal(a.totals.purchased, 10);
    assert.equal(a.totals.earned, 1);
    assert.equal(a.renewsAt, "2026-12-01T00:00:00.000Z");
  });
  it("does not accumulate grants for months spent inactive", async () => {
    await enroll();
    time = Date.UTC(2027, 0, 5);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.totals.granted, 30);
  });
  it("permits the entire monthly allowance in one day across tools", async () => {
    await enroll();
    for (let i = 0; i < 15; i++) {
      const op = await service.reserve("alice", reservation(String(i)));
      await service.start("alice", op.operationId);
      await service.settle("alice", op.operationId, "succeeded");
    }
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 0);
    assert.equal(a.totals.consumed, 15);
    await assert.rejects(service.reserve("alice", reservation()), code("INSUFFICIENT_CREDITS"));
  });
  it("binds purchase events globally to their owner and amount", async () => {
    await enroll();
    await enroll("bob");
    await Promise.all([
      service.grantPurchased("alice", 10, "paid"),
      service.grantPurchased("alice", 10, "paid"),
    ]);
    assert.equal((await service.getAccount("alice")).balance, 25);
    await assert.rejects(service.grantPurchased("bob", 10, "paid"), code("EVENT_CONFLICT"));
    await assert.rejects(service.grantPurchased("alice", 100, "paid"), code("EVENT_CONFLICT"));
    for (const amount of [-1, 0, NaN, 1.5, "10"])
      await assert.rejects(service.grantPurchased("alice", amount, "bad"));
  });
});

describe("atomic reservations, worker transitions and financial abuse", () => {
  it("prevents simultaneous overspending and negative balances", async () => {
    await enroll();
    const results = await Promise.allSettled([
      service.reserve("alice", reservation("r1", "studio.render", 100)),
      service.reserve("alice", reservation("r2", "studio.render", 100)),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "INSUFFICIENT_CREDITS");
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 3);
    assert.equal(a.reserved, 12);
  });
  it("deduplicates reservations and rejects request ID payload substitution", async () => {
    await enroll();
    const r = reservation("same");
    const results = await Promise.all([service.reserve("alice", r), service.reserve("alice", r)]);
    assert.equal(results[0].operationId, results[1].operationId);
    assert.equal((await service.getAccount("alice")).balance, 14);
    await assert.rejects(
      service.reserve("alice", reservation("same", "publisher.publish", 1)),
      code("IDEMPOTENCY_CONFLICT")
    );
  });
  it("allows only one dispatch and consumes exactly once under duplicate callbacks", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    const starts = await Promise.allSettled([
      service.start("alice", op.operationId),
      service.start("alice", op.operationId),
    ]);
    assert.equal(starts.filter(r => r.status === "fulfilled").length, 1);
    await Promise.all([
      service.settle("alice", op.operationId, "succeeded"),
      service.settle("alice", op.operationId, "succeeded"),
    ]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 14);
    assert.equal(a.reserved, 0);
    assert.equal(a.totals.consumed, 1);
    await assert.rejects(
      service.settle("alice", op.operationId, "failed"),
      code("SETTLEMENT_CONFLICT")
    );
  });
  it("releases queued cancellation without spend and prevents cross-user settlement", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await assert.rejects(
      service.settle("mallory", op.operationId, "failed"),
      code("OPERATION_NOT_FOUND")
    );
    await service.settle("alice", op.operationId, "cancelled");
    assert.equal((await service.getAccount("alice")).balance, 15);
    assert.equal((await budget().get()).data().spentMicros, 0);
  });
  it("refunds failure once but retains started infrastructure cost", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    await assert.rejects(
      service.settle("alice", op.operationId, "cancelled"),
      code("WORKER_TERMINATION_REQUIRED")
    );
    await Promise.all([
      service.settle("alice", op.operationId, "failed"),
      service.settle("alice", op.operationId, "failed"),
    ]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 15);
    assert.equal(a.totals.refunded, 1);
    assert.equal((await budget().get()).data().spentMicros, op.maxCostMicros);
  });
  it("keeps uncertain running work reserved across renewal and preserves a later refund", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    time = Date.UTC(2026, 10, 1);
    let a = await service.getAccount("alice");
    assert.equal(a.reserved, 1);
    assert.equal(a.balance, 15);
    await service.settle("alice", op.operationId, "failed");
    a = await service.getAccount("alice");
    assert.equal(a.balance, 16);
    assert.equal(a.reserved, 0);
    assert.equal((await budget("2026-10").get()).data().spentMicros, 1000);
    assert.equal((await budget("2026-11").get()).data().spentMicros, 0);
  });
  it("preserves a cross-month refund even before lazy renewal", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    await service.start("alice", op.operationId);
    time = Date.UTC(2026, 10, 1);
    await service.settle("alice", op.operationId, "failed");
    assert.equal((await service.getAccount("alice")).balance, 16);
  });
  it("prevents queued cancellation from laundering old allowances into rollover credits", async () => {
    await enroll("alice", { openingBalance: 10 });
    const op = await service.reserve("alice", reservation("cross-cycle", "studio.render", 180));
    assert.equal(op.fromExpiring, 15);
    assert.equal(op.fromPermanent, 6);
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    const released = await service.settle("alice", op.operationId, "cancelled");
    assert.equal(released.refunded, 6);
    assert.equal(released.expired, 15);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 25);
    assert.equal(a.totals.expired, 15);
    assert.equal(a.totals.refunded, 6);
  });
  it("prevents old queued reservations from starting in a new cycle", async () => {
    await enroll();
    const op = await service.reserve("alice", reservation());
    time = Date.UTC(2026, 10, 1);
    await assert.rejects(service.start("alice", op.operationId), code("RESERVATION_EXPIRED"));
    await service.settle("alice", op.operationId, "cancelled");
  });
  it("atomically enforces global and per-user spend budgets", async () => {
    service = make({ monthlySpendMicros: 1000, userMonthlySpendMicros: 1000 });
    await enroll();
    await enroll("bob");
    const results = await Promise.allSettled([
      service.reserve("alice", reservation()),
      service.reserve("bob", reservation()),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "SPEND_BUDGET_EXCEEDED");
    const held = results.find(r => r.status === "fulfilled").value;
    await service.start(held.userId, held.operationId);
    await service.settle(held.userId, held.operationId, "failed");
    await assert.rejects(
      service.reserve(held.userId, reservation()),
      code("SPEND_BUDGET_EXCEEDED")
    );
  });
  it("applies user budgets independently of global capacity", async () => {
    service = make({ userMonthlySpendMicros: 1000 });
    await enroll();
    await enroll("bob");
    await service.reserve("alice", reservation());
    await assert.rejects(service.reserve("alice", reservation()), code("SPEND_BUDGET_EXCEEDED"));
    await service.reserve("bob", reservation());
  });
  it("enforces concurrency caps across month boundaries and honours kill switches", async () => {
    service = make({ maxActiveGlobal: 1 });
    await enroll();
    await enroll("bob");
    const op = await service.reserve("alice", reservation());
    time = Date.UTC(2026, 10, 1);
    await assert.rejects(service.reserve("bob", reservation()), code("CAPACITY_LIMIT"));
    await service.settle("alice", op.operationId, "cancelled");
    await control().update({ spendingEnabled: false });
    await assert.rejects(service.reserve("bob", reservation()), code("SPENDING_PAUSED"));
    assert.ok((await service.getAccount("alice")).balance >= 0);
  });
  it("limits grant liability globally against account farming", async () => {
    service = make({ monthlyIssuanceMicros: 15000 });
    await enroll();
    await service.enroll("bob");
    await assert.rejects(service.getAccount("bob"), code("ISSUANCE_BUDGET_EXCEEDED"));
    await assert.rejects(service.beginReward("alice"), code("ISSUANCE_BUDGET_EXCEEDED"));
    assert.equal((await wallet("bob").get()).data().balance, 0);
  });
});

describe("reward authenticity, caps and replay", () => {
  it("rejects browser flags, tampered proofs and another verifier's signature", async () => {
    await enroll();
    const { proof } = await reward();
    for (const bad of [
      { completed: true },
      { ...proof, payload: proof.payload.replace("alice", "bob") },
      { ...proof, signature: "0".repeat(64) },
      createMockVerifier("another-test-secret-00000000000000").issue({
        userId: "alice",
        sessionId: "fake",
        eventId: "fake",
        completedAt: time,
      }),
    ]) {
      await assert.rejects(service.completeReward(bad), code("UNVERIFIED_REWARD"));
    }
    assert.equal((await service.getAccount("alice")).balance, 15);
  });
  it("awards a completed session exactly once under replay and concurrency", async () => {
    await enroll();
    const { proof } = await reward();
    await Promise.all([service.completeReward(proof), service.completeReward(proof)]);
    const a = await service.getAccount("alice");
    assert.equal(a.balance, 16);
    assert.equal(a.totals.earned, 1);
    assert.equal(a.adsRemaining, 19);
  });
  it("rejects session ownership substitution and reused provider event IDs", async () => {
    await enroll();
    await enroll("bob");
    const a = await reward("alice", "shared");
    const forgedOwner = verifier.issue({
      userId: "bob",
      sessionId: a.session.sessionId,
      eventId: "another",
      completedAt: time,
    });
    await assert.rejects(service.completeReward(forgedOwner), code("REWARD_NOT_FOUND"));
    await service.completeReward(a.proof);
    const b = await reward("bob", "shared");
    await assert.rejects(service.completeReward(b.proof), code("EVENT_CONFLICT"));
  });
  it("enforces one in-flight ad and the monthly cap server-side", async () => {
    service = make({ rewardMonthlyCap: 1 });
    await enroll();
    const { proof } = await reward();
    await assert.rejects(service.beginReward("alice"), code("REWARD_IN_PROGRESS"));
    await service.completeReward(proof);
    await assert.rejects(service.beginReward("alice"), code("MONTHLY_AD_CAP"));
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    await service.beginReward("alice");
  });
  it("gives no reward for skip, expiry, old cycle or fabricated future time", async () => {
    await enroll();
    let r = await reward();
    await service.closeReward("alice", r.session.sessionId);
    await assert.rejects(service.completeReward(r.proof), code("REWARD_ALREADY_CLOSED"));
    r = await reward();
    time += (example.rewardTtlSeconds + 1) * 1000;
    await assert.rejects(service.completeReward(r.proof), code("REWARD_EXPIRED"));
    await service.closeReward("alice", r.session.sessionId);
    r = await reward();
    const future = verifier.issue({
      userId: "alice",
      sessionId: r.session.sessionId,
      eventId: "future",
      completedAt: time + 1,
    });
    await assert.rejects(service.completeReward(future), code("REWARD_EXPIRED"));
    time = Date.UTC(2026, 10, 1);
    await service.getAccount("alice");
    await assert.rejects(service.completeReward(r.proof), code("REWARD_EXPIRED"));
    await service.closeReward("alice", r.session.sessionId);
    assert.equal((await service.getAccount("alice")).totals.earned, 0);
  });
  it("reserves reward liability and wallet space before promising the reward", async () => {
    service = make({ monthlyIssuanceMicros: 16000 });
    await enroll();
    const r = await reward();
    assert.equal((await budget().get()).data().pendingRewardMicros, 1000);
    await assert.rejects(
      service.grantPurchased("alice", 1, "topup"),
      code("ISSUANCE_BUDGET_EXCEEDED")
    );
    await control().update({ rewardsEnabled: false, issuanceEnabled: false });
    await service.completeReward(r.proof); // Honour the already promised reward.
    assert.equal((await service.getAccount("alice")).balance, 16);
    assert.equal((await budget().get()).data().pendingRewardMicros, 0);
  });
  it("does not overfill a wallet with purchases while a reward is pending", async () => {
    service = make({ maxBalance: 2000 });
    await enroll();
    const r = await reward();
    await assert.rejects(service.grantPurchased("alice", 1985, "too-full"), code("WALLET_CAP"));
    await service.completeReward(r.proof);
    assert.equal((await service.getAccount("alice")).balance, 16);
  });
  it("keeps paid subscribers ad-free with their larger monthly grants", async () => {
    const a = await enroll("paid", { tier: "premium" });
    assert.equal(a.balance, 150);
    assert.equal(a.adFree, true);
    await assert.rejects(service.beginReward("paid"), code("SUBSCRIBER_AD_FREE"));
  });
});

describe("sandbox HTTP boundaries", () => {
  let app;
  beforeEach(async () => {
    await enroll("demo-free");
    await enroll("demo-premium", { tier: "premium" });
    app = createSandboxApp({ service, verifier, origin: "http://127.0.0.1:8190", now });
  });
  const client = () => request(app);
  const auth = req =>
    req.set("X-Credits-Sandbox", "local").set("X-Credits-Sandbox-User", "demo-free");
  it("requires explicit demo identity and rejects cross-origin requests", async () => {
    await client().get("/api/account").expect(401);
    await auth(client().get("/api/account")).set("Origin", "https://attacker.example").expect(403);
    await auth(client().get("/api/account")).expect(200);
  });
  it("requires ad opt-in and does not expose live callback or purchase endpoints", async () => {
    await auth(client().post("/api/rewards")).send({}).expect(400);
    await auth(client().post("/api/reward-callback")).send({ completed: true }).expect(404);
    await auth(client().post("/api/purchase")).send({ amount: 100 }).expect(404);
    const r = await auth(client().post("/api/rewards")).send({ consent: true }).expect(200);
    await auth(client().post(`/api/rewards/${r.body.sessionId}/mock-completion`))
      .send({})
      .expect(200);
    assert.equal((await service.getAccount("demo-free")).balance, 16);
  });
  it("keeps preview and saving assets accessible with exhausted credits", async () => {
    await wallet("demo-free").update({ balance: 0, expiring: 0, permanent: 0 });
    const q = await auth(client().post("/api/quote"))
      .send({ operation: "studio.render", units: 1 })
      .expect(200);
    assert.equal(q.body.canAfford, false);
    await client()
      .get("/")
      .expect(200)
      .expect(/Save notes on this device/);
    await client()
      .get("/app.js")
      .expect(200)
      .expect(/localStorage.setItem/);
  });
});

describe("Firestore client security rules", () => {
  let environment;
  before(async () => {
    const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    environment = await initializeTestEnvironment({
      projectId: "demo-autopromote-credits",
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8"),
      },
    });
  });
  after(async () => {
    await environment?.cleanup();
  });
  it("denies financial writes, forged admin roles, cross-user reads and anonymous reads", async () => {
    const { assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
    const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
    await enroll();
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob", { role: "admin", admin: true }).firestore();
    const anon = environment.unauthenticatedContext().firestore();
    const p = `credits_v2_wallets/${hash("alice")}`;
    await assertSucceeds(getDoc(doc(alice, p)));
    await assertFails(updateDoc(doc(alice, p), { balance: 1000000, tier: "enterprise" }));
    await assertFails(setDoc(doc(alice, "users/alice"), { role: "admin", credits: 1000000 }));
    await assertFails(getDoc(doc(bob, p)));
    await assertFails(getDoc(doc(anon, p)));
    for (const collection of [
      "ledger",
      "operations",
      "events",
      "reward_sessions",
      "budgets",
      "user_budgets",
      "control",
    ]) {
      await assertFails(setDoc(doc(bob, `credits_v2_${collection}/forged`), { amount: 1000 }));
    }
  });
});
```

## Appendix B. Proposed security repair patch and test source

This is the local review snapshot; it has not been pushed, merged or deployed.
The diff is against the checked-out base commit, excluding the earlier foundation's
separate package changes. Client rules are the existing deployment source, modified
locally only. No data migration or provider-setting change is part of the patch.

### B1. Rules and API repair diff

```diff
diff --git a/firestore.rules b/firestore.rules
index df7c4306..b0f15ed8 100644
--- a/firestore.rules
+++ b/firestore.rules
@@ -3,8 +3,27 @@ service cloud.firestore {
   match /databases/{database}/documents {
     function isAdmin() {
       return request.auth != null &&
-        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
-        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
+        (request.auth.token.get('admin', false) == true ||
+         request.auth.token.get('isAdmin', false) == true ||
+         request.auth.token.get('role', '') == 'admin' ||
+         exists(/databases/$(database)/documents/admins/$(request.auth.uid)));
+    }
+
+    function isOwner(userId) {
+      return request.auth != null && request.auth.uid == userId;
+    }
+
+    function editableProfileFields() {
+      // Financial, identity, entitlement and authority fields are server managed.
+      // New fields are denied until explicitly reviewed; deleting a field is a change.
+      return ['name', 'displayName', 'photoURL', 'avatarUrl', 'thumbnailUrl', 'bio',
+              'timezone', 'notifications', 'schedulingDefaults', 'defaultPlatforms',
+              'defaultFrequency', 'autoRepostEnabled', 'paypalEmail', 'updatedAt'];
+    }
+
+    function serverManagedContentFields() {
+      // Reward inputs and redemption markers must not be supplied or reset by clients.
+      return ['views', 'metrics', 'revenue', 'claimedBonuses', 'earnings'];
     }

     function isServiceAccount() {
@@ -41,9 +60,16 @@ service cloud.firestore {
       }
     }

-    // Users can read/write their own user document
+    // Owners may edit profile preferences, never financial state or access controls.
     match /users/{userId} {
-      allow read, write: if isAdmin() || isServiceAccount() || request.auth.uid == userId;
+      allow read: if isAdmin() || isServiceAccount() || isOwner(userId);
+      allow create: if isOwner(userId) &&
+        request.resource.data.keys().hasOnly(editableProfileFields().concat(['createdAt'])) &&
+        (!request.resource.data.keys().hasAny(['createdAt']) || request.resource.data.createdAt == request.time);
+      allow update: if isOwner(userId) &&
+        request.resource.data.diff(resource.data).affectedKeys().hasOnly(editableProfileFields());
+      // A profile delete would also delete protected financial and subscription fields.
+      allow delete: if isAdmin() || isServiceAccount();
     }

     // Users can read/write their own content
@@ -53,14 +79,24 @@ service cloud.firestore {
           (request.resource.data.keys().hasAny(['userId']) && request.resource.data.userId == request.auth.uid) ||
           (request.resource.data.keys().hasAny(['user_id']) && request.resource.data.user_id == request.auth.uid) ||
           (request.resource.data.keys().hasAny(['workspace_id']) && canEditWorkspace(request.resource.data.workspace_id))
-        ));
+        ) && !request.resource.data.keys().hasAny(serverManagedContentFields()) &&
+          (!request.resource.data.keys().hasAny(['userId']) || request.resource.data.userId == request.auth.uid) &&
+          (!request.resource.data.keys().hasAny(['user_id']) || request.resource.data.user_id == request.auth.uid));

-      allow update, delete, get, list: if isAdmin() || isServiceAccount() ||
+      allow get, list, delete: if isAdmin() || isServiceAccount() ||
         (request.auth != null && resource != null && (
           (resource.data.keys().hasAny(['userId']) && resource.data.userId == request.auth.uid) ||
           (resource.data.keys().hasAny(['user_id']) && resource.data.user_id == request.auth.uid) ||
           (resource.data.keys().hasAny(['workspace_id']) && isActiveWorkspaceMember(resource.data.workspace_id))
         ));
+      allow update: if isAdmin() || isServiceAccount() ||
+        (request.auth != null && resource != null &&
+         !request.resource.data.diff(resource.data).affectedKeys()
+           .hasAny(serverManagedContentFields().concat(['userId', 'user_id', 'workspace_id'])) && (
+          (resource.data.keys().hasAny(['userId']) && resource.data.userId == request.auth.uid) ||
+          (resource.data.keys().hasAny(['user_id']) && resource.data.user_id == request.auth.uid) ||
+          (resource.data.keys().hasAny(['workspace_id']) && isActiveWorkspaceMember(resource.data.workspace_id))
+        ));
     }

     match /promotion_schedules/{scheduleId} {
@@ -136,21 +172,13 @@ service cloud.firestore {
         get(/databases/$(database)/documents/chat_conversations/$(resource.data.conversationId)).data.userId == request.auth.uid;
     }

-    // Ads - users can read/write their own ads, admins can read/write all
+    // Ad billing/approval state is written by the existing backend API, not clients.
     match /ads/{adId} {
       allow read: if request.auth != null && (
         resource.data.userId == request.auth.uid ||
         isAdmin()
       );
-      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
-      allow update: if request.auth != null && (
-        resource.data.userId == request.auth.uid ||
-        isAdmin()
-      );
-      allow delete: if request.auth != null && (
-        resource.data.userId == request.auth.uid ||
-        isAdmin()
-      );
+      allow write: if isAdmin() || isServiceAccount();
     }

     // Ad analytics - users can read their own, admins can read all
@@ -174,12 +202,10 @@ service cloud.firestore {
       allow read: if request.auth != null && resource.data.userId == request.auth.uid;
     }

-    // Paid Boosts (Missions) - users can read/write their own
+    // Paid boost state is written only after the existing backend/payment checks.
     match /paid_boosts/{boostId} {
       allow read: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
-      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
-      allow update: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
-      allow delete: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
+      allow write: if isAdmin() || isServiceAccount();
     }

     // All other collections: only admins, service account, or backend
diff --git a/src/authMiddleware.js b/src/authMiddleware.js
index bcd651c8..70565cd4 100644
--- a/src/authMiddleware.js
+++ b/src/authMiddleware.js
@@ -3,6 +3,11 @@ const crypto = require("crypto");
 const { tokenInfo } = require("./utils/logSanitizer");
 const diag = require("./diagnostics");
 const { withCache } = require("./utils/simpleCache");
+const {
+  isHostedRuntime,
+  hasAdminClaim,
+  authorityFromVerifiedIdentity,
+} = require("./utils/authAuthority");

 const AUTH_TOKEN_CACHE_TTL_MS = parseInt(process.env.AUTH_TOKEN_CACHE_TTL_MS || "15000", 10);

@@ -58,11 +63,7 @@ const authMiddleware = async (req, res, next) => {
     // E2E bypass: when Playwright sets the x-playwright-e2e header, treat the request as an admin test user
     // This keeps E2E tests deterministic and avoids hard 401s when using short/mocked tokens.
     // SECURITY: Only available in non-production environments
-    if (
-      process.env.NODE_ENV !== "production" &&
-      req.headers &&
-      req.headers["x-playwright-e2e"] === "1"
-    ) {
+    if (!isHostedRuntime() && req.headers && req.headers["x-playwright-e2e"] === "1") {
       req.userId = "adminUser";
       req.user = {
         uid: "adminUser",
@@ -84,7 +85,7 @@ const authMiddleware = async (req, res, next) => {
     // Allow integration test bypass with test tokens of the form 'test-token-for-{uid}'
     // SECURITY: Strictly gated to non-production environments only
     if (
-      process.env.NODE_ENV !== "production" &&
+      !isHostedRuntime() &&
       (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") &&
       typeof token === "string" &&
       token.startsWith("test-token-for-")
@@ -109,10 +110,6 @@ const authMiddleware = async (req, res, next) => {
       }
       return next();
     }
-    // If another upstream middleware already attached a user object, skip heavy work
-    if (req.user && req.user.uid) {
-      return next();
-    }
     const debugAuth = process.env.DEBUG_AUTH === "true";
     if (debugAuth)
       console.log(
@@ -179,7 +176,7 @@ const authMiddleware = async (req, res, next) => {
     let decodedToken;
     try {
       const verified = await withCache(getTokenCacheKey(token), AUTH_TOKEN_CACHE_TTL_MS, () =>
-        admin.auth().verifyIdToken(token)
+        admin.auth().verifyIdToken(token, true)
       );
       const { _cached, ...verifiedToken } = verified || {};
       decodedToken = verifiedToken;
@@ -247,7 +244,7 @@ const authMiddleware = async (req, res, next) => {
       );

     // Extract any custom claims (legacy allowances: admin or isAdmin)
-    const isAdminFromClaims = decodedToken.admin === true || decodedToken.isAdmin === true;
+    const isAdminFromClaims = hasAdminClaim(decodedToken);
     const roleFromClaims = isAdminFromClaims ? "admin" : decodedToken.role || "user";

     // Set the user ID on the request for later use
@@ -326,11 +323,8 @@ const authMiddleware = async (req, res, next) => {
       if (isAdminInCollection) {
         if (debugAuth) console.log("User found in admins collection: uid=%s", decodedToken.uid);
         req.user = {
-          uid: decodedToken.uid,
-          email: decodedToken.email,
           ...adminData,
-          isAdmin: true,
-          role: "admin",
+          ...authorityFromVerifiedIdentity(decodedToken, true),
           fromCollection: "admins",
         };
         req.user.token = token;
@@ -340,9 +334,8 @@ const authMiddleware = async (req, res, next) => {

       // Attach full user data to request
       req.user = {
-        uid: decodedToken.uid,
-        email: decodedToken.email,
         ...userData,
+        ...authorityFromVerifiedIdentity(decodedToken, isAdminInCollection),
       };
       // Attach the raw token for request-scoped usage in HTML templates
       req.user.token = token;
@@ -367,10 +360,7 @@ const authMiddleware = async (req, res, next) => {

       // Even if Firestore fails, still allow the request to proceed with basic user info
       req.user = {
-        uid: decodedToken.uid,
-        email: decodedToken.email,
-        role: roleFromClaims,
-        isAdmin: isAdminFromClaims,
+        ...authorityFromVerifiedIdentity(decodedToken),
       };
       req.user.token = token;

diff --git a/src/authRoutes.js b/src/authRoutes.js
index bf775585..8d93bf72 100644
--- a/src/authRoutes.js
+++ b/src/authRoutes.js
@@ -6,6 +6,7 @@ const { sendVerificationEmail, sendPasswordResetEmail } = require("./services/em
 const { strictLimiter } = require("./middleware/rateLimiter");
 const rateLimitBasic = require("./middlewares/rateLimitBasic");
 const authMiddleware = require("./authMiddleware");
+const { hasAdminClaim, authorityFromVerifiedIdentity } = require("./utils/authAuthority");

 const PASSWORD_RESET_WINDOW_MINUTES = 15;
 const SAFE_PASSWORD_RESET_RESPONSE = "If an account exists, a password reset email has been sent.";
@@ -72,7 +73,7 @@ const _verifyFirebaseToken = async (req, res, next) => {
       return res.status(401).json({ error: "No token provided" });
     }

-    const decodedToken = await admin.auth().verifyIdToken(idToken);
+    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
     req.user = decodedToken;
     next();
   } catch (error) {
@@ -92,10 +93,10 @@ router.post("/register", async (req, res) => {
     let uid;
     if (idToken) {
       try {
-        const decoded = await admin.auth().verifyIdToken(idToken);
+        const decoded = await admin.auth().verifyIdToken(idToken, true);
         uid = decoded.uid;
       } catch (e) {
-        console.warn("Invalid idToken passed to /register", e.message);
+        return res.status(401).json({ error: "Invalid registration ID token" });
       }
     }

@@ -118,9 +119,9 @@ router.post("/register", async (req, res) => {
           displayName: name,
         });
       } catch (e) {
-        // If user already exists, fall back to fetching it.
+        // An email address and an arbitrary password do not prove account ownership.
         if (e.code === "auth/email-already-exists") {
-          userRecord = await admin.auth().getUserByEmail(email);
+          return res.status(409).json({ error: "Account already exists. Sign in to continue." });
         } else {
           throw e;
         }
@@ -128,42 +129,50 @@ router.post("/register", async (req, res) => {
       uid = userRecord.uid;
     }

-    // Update displayName / email if needed
+    // Identity email changes belong to the verified Firebase Auth flow.
+    if (idToken && email && normalizeEmail(email) !== normalizeEmail(userRecord.email)) {
+      return res
+        .status(400)
+        .json({ error: "Registration email must match the authenticated account" });
+    }
+    // A verified owner can update their display name without resetting account state.
     const updates = {};
     if (name && userRecord.displayName !== name) updates.displayName = name;
-    if (email && userRecord.email !== email) updates.email = email;
     if (Object.keys(updates).length) {
       userRecord = await admin.auth().updateUser(userRecord.uid, updates);
     }

-    // Set custom claims for role (preserve existing admin role)
+    // Registration never grants, replaces or removes custom claims.
     const existingClaims = userRecord.customClaims || {};
-    const finalRole = existingClaims.role === "admin" ? "admin" : "user";
-    await admin.auth().setCustomUserClaims(userRecord.uid, { role: finalRole });
+    const finalRole = hasAdminClaim(existingClaims) ? "admin" : "user";

     // Store additional user data in Firestore
     const userDocRef = admin.firestore().collection("users").doc(userRecord.uid);
     const userSnap = await userDocRef.get();
-    const currentData = userSnap.exists ? userSnap.data() : {};
-    const docRole = currentData.role === "admin" ? "admin" : finalRole;
-    const docIsAdmin = currentData.role === "admin" ? true : false;
-    await userDocRef.set({
-      name,
-      email,
-      role: docRole,
-      isAdmin: docIsAdmin,
-      createdAt: admin.firestore.FieldValue.serverTimestamp(),
-    });
+    await userDocRef.set(
+      {
+        name: name || userRecord.displayName || "",
+        email: userRecord.email,
+        ...(userSnap.exists
+          ? {}
+          : {
+              role: finalRole,
+              isAdmin: finalRole === "admin",
+              createdAt: admin.firestore.FieldValue.serverTimestamp(),
+            }),
+      },
+      { merge: true }
+    );

     // Generate a branded verification email. Delivery is reported truthfully so
     // the client can fall back to Firebase's mail service when needed.
     let verificationEmailSent = false;
     let verificationProvider = null;
     try {
-      const verifyLink = await admin.auth().generateEmailVerificationLink(email, {
+      const verifyLink = await admin.auth().generateEmailVerificationLink(userRecord.email, {
         url: getVerificationRedirectUrl(),
       });
-      const delivery = await sendVerificationEmail({ email, link: verifyLink });
+      const delivery = await sendVerificationEmail({ email: userRecord.email, link: verifyLink });
       verificationProvider = delivery?.provider || null;
       verificationEmailSent = delivery?.ok === true && verificationProvider !== "console";
       if (!verificationEmailSent) {
@@ -427,7 +436,7 @@ router.post("/login", async (req, res) => {
     if (idToken) {
       console.log("Verifying Firebase ID token...");
       // Verify the Firebase ID token
-      decodedToken = await admin.auth().verifyIdToken(idToken);
+      decodedToken = await admin.auth().verifyIdToken(idToken, true);
       console.log("Token verified for uid=%s", decodedToken.uid);
     } else if (email && password) {
       console.log("Using email/password authentication...");
@@ -459,7 +468,7 @@ router.post("/login", async (req, res) => {
           return res.status(401).json({ error: "Invalid email or password" });
         }
         // Password verified — now verify the returned idToken with Admin SDK
-        decodedToken = await admin.auth().verifyIdToken(authJson.idToken);
+        decodedToken = await admin.auth().verifyIdToken(authJson.idToken, true);
         console.log("Email/password auth verified for uid=%s", decodedToken.uid);
       } catch (error) {
         console.error("Email/password authentication failed:", error);
@@ -472,8 +481,8 @@ router.post("/login", async (req, res) => {

     // Variables to store user data
     let userData = null;
-    let role = "user";
-    let isAdmin = false;
+    let role = authorityFromVerifiedIdentity(decodedToken).role;
+    let isAdmin = hasAdminClaim(decodedToken);
     let fromCollection = "users";

     // Check admins collection first for admin logins
@@ -504,9 +513,7 @@ router.post("/login", async (req, res) => {
             userData && userData.email,
             decodedToken.uid
           );
-          // Always use Firestore values for role and isAdmin if present
-          if (userData.role) role = userData.role;
-          if (typeof userData.isAdmin !== "undefined") isAdmin = userData.isAdmin;
+          // Profile fields are display data, never sources of authority or token claims.
         }
       }
     } catch (firestoreError) {
@@ -677,7 +684,7 @@ router.post("/admin-login", async (req, res) => {
     }
     console.log("Verifying Firebase ID token for admin login... (truncated token)");
     // Verify the Firebase ID token
-    const decodedToken = await admin.auth().verifyIdToken(idToken);
+    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
     console.log("Admin token verified for uid=%s", decodedToken.uid);

     // Variables to store user data
@@ -697,7 +704,7 @@ router.post("/admin-login", async (req, res) => {
       console.log("Admin email present in token=%s", !!decodedToken.email);

       // Check if user has admin claims in the token
-      if (decodedToken.admin === true || decodedToken.role === "admin") {
+      if (hasAdminClaim(decodedToken)) {
         console.log("User has admin claims in token");

         // Try to get admin data from admins collection if it exists
@@ -838,81 +845,27 @@ router.get("/verify", async (req, res) => {
     }

     // Verify the Firebase token
-    const decodedToken = await admin.auth().verifyIdToken(token);
-
-    // Check if user has admin claims in token
-    if (decodedToken.admin === true || decodedToken.role === "admin") {
-      console.log("Token verification: User has admin claims");
-
-      // Try to get admin data from Firestore
-      try {
-        const adminDoc = await admin.firestore().collection("admins").doc(decodedToken.uid).get();
-        if (adminDoc.exists) {
-          const adminData = adminDoc.data();
-          return res.json({
-            valid: true,
-            user: {
-              uid: decodedToken.uid,
-              email: decodedToken.email,
-              name: adminData.name || decodedToken.name,
-              role: "admin",
-              isAdmin: true,
-              fromCollection: "admins",
-            },
-          });
-        }
-      } catch (firestoreError) {
-        console.log(
-          "Firestore error in token verification, using token claims:",
-          firestoreError.message
-        );
-      }
-
-      // Fall back to token claims
-      return res.json({
-        valid: true,
-        user: {
-          uid: decodedToken.uid,
-          email: decodedToken.email,
-          name: decodedToken.name || decodedToken.email.split("@")[0],
-          role: "admin",
-          isAdmin: true,
-          fromCollection: "token_claims",
-        },
-      });
-    }
+    const decodedToken = await admin.auth().verifyIdToken(token, true);

-    // For regular users, try Firestore first
+    // Profiles provide display fields only. Verify authority independently for both
+    // claim-based admins and legacy server-managed admins collection members.
+    let profile = null;
+    let adminExists = false;
     try {
-      const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
-      if (userDoc.exists) {
-        const userData = userDoc.data();
-        return res.json({
-          valid: true,
-          user: {
-            uid: decodedToken.uid,
-            email: decodedToken.email,
-            name: userData.name || decodedToken.name,
-            role: userData.role || "user",
-            isAdmin: userData.isAdmin === true || userData.role === "admin",
-            fromCollection: "users",
-          },
-        });
-      }
-    } catch (firestoreError) {
-      console.log("Firestore error for regular user, using token claims:", firestoreError.message);
+      const [userDoc, adminDoc] = await Promise.all([
+        admin.firestore().collection("users").doc(decodedToken.uid).get(),
+        admin.firestore().collection("admins").doc(decodedToken.uid).get(),
+      ]);
+      adminExists = adminDoc.exists;
+      profile = adminExists ? adminDoc.data() : userDoc.exists ? userDoc.data() : null;
+    } catch (_) {
+      // Database failure cannot promote a profile; verified claims still work.
     }
-
-    // Fall back to token claims for regular users
-    res.json({
+    return res.json({
       valid: true,
       user: {
-        uid: decodedToken.uid,
-        email: decodedToken.email,
-        name: decodedToken.name || decodedToken.email.split("@")[0],
-        role: "user",
-        isAdmin: false,
-        fromCollection: "token_claims",
+        name: profile?.name || decodedToken.name || decodedToken.email?.split("@")[0] || "",
+        ...authorityFromVerifiedIdentity(decodedToken, adminExists),
       },
     });
   } catch (error) {
diff --git a/src/server.js b/src/server.js
index 087f1e3b..403af714 100644
--- a/src/server.js
+++ b/src/server.js
@@ -1395,8 +1395,9 @@ try {
   } catch (e) {
     console.warn("aggregateStatusRoutes mount failed:", e.message);
   }
-  // Only mount admin test routes in non-production environments
-  if (process.env.NODE_ENV !== "production") {
+  // Cloud Run/Functions/Render must never expose local admin setup routes,
+  // even when NODE_ENV is accidentally unset or configured as development.
+  if (!require("./utils/authAuthority").isHostedRuntime()) {
     try {
       app.use("/api", adminTestRoutes);
     } catch (e) {
diff --git a/src/userController.js b/src/userController.js
index 054a7879..246882f6 100644
--- a/src/userController.js
+++ b/src/userController.js
@@ -6,7 +6,7 @@ const { auth, db } = require("./firebaseAdmin");
 // @route   POST /api/users/register
 // @access  Public
 const registerUser = async (req, res) => {
-  const { name, email, password, role } = req.body;
+  const { name, email, password } = req.body;
   try {
     // Create user in Firebase Auth
     const userRecord = await auth.createUser({
@@ -19,25 +19,22 @@ const registerUser = async (req, res) => {
     const initialCredits = parseInt(process.env.INITIAL_FREE_CREDITS || "50", 10);

     // Store user profile in Firestore
-    await db
-      .collection("users")
-      .doc(userRecord.uid)
-      .set({
-        name,
-        email,
-        role: role || "creator",
-        credits: initialCredits,
-        // optional flag to easily recognize early testers
-        promoGranted: true,
-        created_at: new Date().toISOString(),
-        updated_at: new Date().toISOString(),
-      });
+    await db.collection("users").doc(userRecord.uid).set({
+      name,
+      email,
+      role: "creator",
+      credits: initialCredits,
+      // optional flag to easily recognize early testers
+      promoGranted: true,
+      created_at: new Date().toISOString(),
+      updated_at: new Date().toISOString(),
+    });

     res.status(201).json({
       id: userRecord.uid,
       name,
       email,
-      role: role || "creator",
+      role: "creator",
     });
   } catch (error) {
     res.status(500).json({ message: error.message });
@@ -74,21 +71,12 @@ const getUserProfile = async (req, res) => {
 const updateUserProfile = async (req, res) => {
   try {
     const userRef = db.collection("users").doc(req.user.uid);
-    const currentSnap = await userRef.get();
-    const currentData = currentSnap.exists ? currentSnap.data() : {};
     let updateData = {
       name: req.body.name,
       email: req.body.email,
       updated_at: new Date().toISOString(),
       // ...rest of code...
     };
-    // Prevent downgrading admin role or isAdmin
-    if (currentData.role === "admin" || currentData.isAdmin === true) {
-      updateData.role = "admin";
-      updateData.isAdmin = true;
-    } else if (req.body.role) {
-      updateData.role = req.body.role;
-    }
     await userRef.update(updateData);
     res.json({ message: "Profile updated" });
   } catch (error) {
diff --git a/src/userRoutes.js b/src/userRoutes.js
index e11d18dd..ca731db9 100644
--- a/src/userRoutes.js
+++ b/src/userRoutes.js
@@ -60,7 +60,7 @@ const kycLimiter = rateLimiter({
 const userDefaultsCache = new Map();
 const USER_DEFAULTS_TTL_MS = parseInt(process.env.USER_DEFAULTS_TTL_MS || "15000", 10);

-function buildUserDefaultsPayload(snap) {
+function buildUserDefaultsPayload(snap, authority = {}) {
   const data = snap.data() || {};
   return {
     user: {
@@ -83,8 +83,8 @@ function buildUserDefaultsPayload(snap) {
           : typeof data.automation?.autoRepostEnabled === "boolean"
             ? data.automation.autoRepostEnabled
             : true,
-      role: data.role || "user",
-      isAdmin: data.isAdmin || false,
+      role: authority.role || "user",
+      isAdmin: authority.isAdmin === true,
     },
   };
 }
@@ -107,9 +107,7 @@ async function buildSubscriptionProfilePayload(userId, user) {
     userId,
     planId: normalizedPlanId,
     planName: tierSnapshot.testerAccess ? "Founding Tester" : plan.name,
-    tierName: tierSnapshot.testerAccess
-      ? "Founding Tester"
-      : capabilities.planName || plan.name,
+    tierName: tierSnapshot.testerAccess ? "Founding Tester" : capabilities.planName || plan.name,
     price: tierSnapshot.testerAccess ? 0 : plan.price,
     monthlyCredits: {
       allocation: credits.monthlyAllocation,
@@ -159,7 +157,7 @@ router.get("/me", authMiddleware, writeLimiter, async (req, res) => {
     const ref = db.collection("users").doc(req.userId);
     const snap = await ref.get();
     if (!snap.exists) return res.status(404).json({ error: "User not found" });
-    const payload = buildUserDefaultsPayload(snap);
+    const payload = buildUserDefaultsPayload(snap, req.user);
     userDefaultsCache.set(req.userId, { ts: Date.now(), payload });
     res.json(payload);
   } catch (err) {
@@ -206,14 +204,9 @@ router.put("/me", authMiddleware, writeLimiter, async (req, res) => {
         autoRepostEnabled,
       };
     }
-    // Prevent downgrading admin role or isAdmin
-    if (currentData.role === "admin" || currentData.isAdmin === true) {
-      updates.role = "admin";
-      updates.isAdmin = true;
-    }
     await ref.set(updates, { merge: true });
     const snap = await ref.get();
-    const payload = buildUserDefaultsPayload(snap);
+    const payload = buildUserDefaultsPayload(snap, req.user);
     userDefaultsCache.set(req.userId, { ts: Date.now(), payload });
     res.json(payload);
   } catch (err) {
@@ -232,8 +225,8 @@ router.get("/profile", authMiddleware, publicLimiter, async (req, res) => {
       user = {
         id: userDoc.id,
         ...userDoc.data(),
-        role: userDoc.data().role || "user",
-        isAdmin: userDoc.data().isAdmin || false,
+        role: req.user.role || "user",
+        isAdmin: req.user.isAdmin === true,
       };

       // AUTO-UNBLOCK LOGIC: Check if quota reset (new month) is needed
@@ -717,28 +710,11 @@ router.get("/me/plan", authMiddleware, async (req, res) => {
   }
 });

-// Assign / change my plan (temporary pseudo billing)
+// Plan changes require the existing verified billing flow; no self-assignment.
 router.post("/me/plan", authMiddleware, async (req, res) => {
-  try {
-    const { tier } = req.body || {};
-    if (!tier) return res.status(400).json({ ok: false, error: "tier required" });
-    const { getPlans } = require("./services/planService");
-    const plans = getPlans();
-    const found = plans.find(p => p.tier === tier);
-    if (!found) return res.status(400).json({ ok: false, error: "unknown tier" });
-    const ref = db.collection("users").doc(req.userId);
-    await ref.set(
-      {
-        plan: {
-          tier,
-          assignedAt: new Date().toISOString(),
-          pricing: { monthly: found.monthly || null },
-        },
-      },
-      { merge: true }
-    );
-    return res.json({ ok: true, plan: { tier, assignedAt: new Date().toISOString() } });
-  } catch (e) {
-    return res.status(500).json({ ok: false, error: e.message });
-  }
+  return res.status(410).json({
+    ok: false,
+    error: "self_service_plan_assignment_disabled",
+    recommendedEndpoint: "/api/paypal-subscriptions/create-subscription",
+  });
 });
```

### B2. Additional npm script

Merge this property into the existing scripts object; do not replace package.json.

```json
{
  "scripts": {
    "test:security:profile": "node scripts/test-profile-security.cjs"
  }
}
```

### B3. src/utils/authAuthority.js

```javascript
// Accept only verified Firebase claims or the server-managed admins collection.
// A users/{uid} profile is not an authority, including pre-existing forged fields.
function isHostedRuntime(env = process.env) {
  return (
    env.NODE_ENV === "production" ||
    Boolean(
      env.K_SERVICE || env.FUNCTION_TARGET || env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_HOSTNAME
    ) ||
    String(env.RENDER || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function hasAdminClaim(claims = {}) {
  return claims.admin === true || claims.isAdmin === true || claims.role === "admin";
}

function authorityFromVerifiedIdentity(claims, adminExists = false) {
  const isAdmin = hasAdminClaim(claims) || adminExists === true;
  return {
    uid: claims.uid,
    id: claims.uid,
    userId: claims.uid,
    email: claims.email,
    role: isAdmin ? "admin" : claims.role || "user",
    isAdmin,
    admin: isAdmin,
    fromCollection: adminExists ? "admins" : isAdmin ? "token_claims" : "users",
    test: false,
    customClaims: {
      ...claims,
      admin: isAdmin,
      isAdmin,
      role: isAdmin ? "admin" : claims.role || "user",
    },
    claims: { ...claims, admin: isAdmin, isAdmin, role: isAdmin ? "admin" : claims.role || "user" },
  };
}

module.exports = { isHostedRuntime, hasAdminClaim, authorityFromVerifiedIdentity };
```

### B4. scripts/test-profile-security.cjs

```javascript
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { once } = require("events");
const DEMO_PROJECT = "demo-autopromote-security";
function assertSandbox(env) {
  if (
    env.SECURITY_TEST_PROJECT !== DEMO_PROJECT ||
    !/^127\.0\.0\.1:[0-9]+$/.test(env.FIRESTORE_EMULATOR_HOST || "") ||
    env.NODE_ENV === "production" ||
    env.K_SERVICE ||
    env.FUNCTION_TARGET ||
    env.RENDER === "true"
  ) {
    throw new Error("Security tests require a local demo emulator");
  }
}

async function main() {
  // Own a fresh ephemeral emulator; never delete data from a pre-existing emulator.
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "test",
    SECURITY_TEST_PROJECT: DEMO_PROJECT,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  assertSandbox(env);
  const jar =
    process.env.CREDITS_FIRESTORE_JAR ||
    path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar");
  if (!fs.existsSync(jar))
    throw new Error("Install the Firestore emulator first: npx firebase setup:emulators:firestore");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-security-tests-"));
  const emulator = spawn(
    process.env.CREDITS_JAVA_BIN || "java",
    [
      "-jar",
      jar,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--project_id",
      DEMO_PROJECT,
      "--rules",
      path.resolve(__dirname, "../firestore.rules"),
    ],
    { env, cwd: scratch }
  );
  let log = "",
    exited = false;
  emulator.on("exit", () => {
    exited = true;
  });
  emulator.on("error", error => {
    log += error.message;
    exited = true;
  });
  for (const stream of [emulator.stdout, emulator.stderr])
    stream.on("data", data => {
      log = (log + data).slice(-12000);
    });
  let tests;
  const stop = () => {
    tests?.kill("SIGTERM");
    emulator.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150 && !exited; attempt++) {
      try {
        const response = await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/`, {
          signal: AbortSignal.timeout(500),
        });
        ready = response.ok;
      } catch {
        /* Starting. */
      }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Firestore emulator did not start. Java 21+ is required.\n${log}`);
    tests = spawn(process.execPath, ["--test", "test/security/profile-security.test.cjs"], {
      cwd: path.resolve(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    const [code] = await once(tests, "exit");
    process.exitCode = Number.isInteger(code) ? code : 1;
  } finally {
    stop();
    if (!exited) await once(emulator, "exit");
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
```

### B5. scripts/audit-profile-security.cjs

```javascript
// Static inventory only: reads source files, never initialises Firebase or a provider.
const fs = require("fs");
const { execFileSync } = require("child_process");
const { parse } = require("@babel/parser");
const discovered = execFileSync(
  "rg",
  [
    "--files",
    "src",
    "frontend/src",
    "autopromote-functions",
    "scripts",
    "-g",
    "*.{js,cjs}",
    "-g",
    "!**/__tests__/**",
    "-g",
    "!**/*.test.js",
    "-g",
    "!**/node_modules/**",
    "-g",
    "!**/_server/**",
    "-g",
    "!src/services/unifiedCredits/**",
  ],
  { encoding: "utf8" }
)
  .trim()
  .split("\n");
const files = [
  ...new Set([
    ...discovered,
    ...fs
      .readdirSync(".")
      .filter(file => /\.(js|cjs)$/.test(file) && !/^(test[-_]|.*\.test\.)/.test(file)),
  ]),
].sort();
const inventory = {
  scope:
    "Repository source; static references are not proof that every path is deployed or reachable.",
  filesScanned: files.length,
  parseErrors: [],
  collections: [],
  dynamicCollections: [],
  authorityReferences: [],
  financialWriteCandidates: [],
  identityOperations: [],
};
const financialKey =
  /credit|balance|subscription|tier|testerAccess|earnings|revenue|payout|payment|role|isAdmin|claimedBonuses|uploadBlocked/i;
const property = n =>
  n?.type === "Identifier" ? n.name : n?.type === "StringLiteral" ? n.value : null;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx"] });
  } catch (error) {
    inventory.parseErrors.push({ file, line: error.loc?.line, reason: error.reasonCode });
    continue;
  }
  function walk(node, callback) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, callback));
      return;
    }
    if (node.type) callback(node);
    for (const [key, child] of Object.entries(node)) {
      if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key))
        walk(child, callback);
    }
  }
  const seenAuthLines = new Set();
  walk(ast, node => {
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
      const method = property(node.callee.property);
      const location = { file, line: node.loc.start.line };
      if (method === "collection") {
        const arg = node.arguments[0];
        if (arg?.type === "StringLiteral")
          inventory.collections.push({ ...location, collection: arg.value });
        else
          inventory.dynamicCollections.push({
            ...location,
            expression: source.slice(arg?.start, arg?.end).slice(0, 160),
          });
      }
      if (
        [
          "verifyIdToken",
          "createCustomToken",
          "setCustomUserClaims",
          "revokeRefreshTokens",
        ].includes(method)
      ) {
        inventory.identityOperations.push({ ...location, operation: method });
      }
      if (["set", "update", "create", "add"].includes(method)) {
        const keys = new Set();
        for (const arg of node.arguments)
          walk(arg, child => {
            if (child.type === "ObjectProperty" && financialKey.test(property(child.key) || ""))
              keys.add(property(child.key));
          });
        const target = source
          .slice(node.callee.object.start, node.callee.object.end)
          .replace(/\s+/g, " ")
          .slice(0, 180);
        const reference = node.arguments[0]?.type === "Identifier" ? node.arguments[0].name : null;
        if (
          keys.size ||
          /credit|balance|payment|billing|subscription|user|reward|earn|payout|transaction/i.test(
            target + (reference || "")
          )
        ) {
          inventory.financialWriteCandidates.push({
            ...location,
            method,
            target,
            reference,
            fields: [...keys].sort(),
          });
        }
      }
    }
    if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
      const field = property(node.property);
      const target = source.slice(node.object.start, node.object.end);
      if (
        ["role", "isAdmin", "admin", "fromCollection", "claims", "customClaims"].includes(field) &&
        /user|claim|token|auth/i.test(target) &&
        !seenAuthLines.has(node.loc.start.line)
      ) {
        seenAuthLines.add(node.loc.start.line);
        inventory.authorityReferences.push({
          file,
          line: node.loc.start.line,
          field,
          target: target.slice(0, 120),
        });
      }
    }
  });
}
process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
```

### B6. test/security/profile-security.test.cjs

```javascript
const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  increment,
  serverTimestamp,
  writeBatch,
} = require("firebase/firestore");
const { Firestore, FieldValue } = require("firebase-admin/firestore");
const express = require("express");
const request = require("supertest");

const PROJECT = "demo-autopromote-security";
assert.equal(process.env.SECURITY_TEST_PROJECT, PROJECT);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:[0-9]+$/);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const db = new Firestore({
  projectId: PROJECT,
  host: process.env.FIRESTORE_EMULATOR_HOST,
  ssl: false,
});
let environment;
const root = path.resolve(__dirname, "../..");
const seed = async (collection, id, data) => db.collection(collection).doc(id).set(data);
const owner = () =>
  environment.authenticatedContext("alice", { email: "alice@example.test" }).firestore();
const financial = {
  credits: 31,
  balance: 12,
  aiCredits: 7,
  growth_credits: 8,
  subscriptionTier: "pro",
  subscriptionStatus: "active",
  plan: { tier: "pro" },
  testerAccess: { status: "active", creditsUsed: 3 },
  role: "user",
  isAdmin: false,
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
    },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed("users", "alice", { name: "Alice", email: "alice@example.test", ...financial });
});
after(async () => {
  await environment?.cleanup();
  await db.terminate();
});

describe("before-repair reproduction, only inside the demo emulator", () => {
  it("reproduces credit/tier tampering and cross-collection admin escalation with the old rules", async () => {
    await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(__dirname, "fixtures/firestore.before.rules"), "utf8"),
      },
    }).then(async baseline => {
      try {
        const alice = baseline.authenticatedContext("alice").firestore();
        await assertSucceeds(
          updateDoc(doc(alice, "users/alice"), {
            credits: 999999,
            subscriptionTier: "enterprise",
            role: "admin",
          })
        );
        await assertSucceeds(setDoc(doc(alice, "admins/alice"), { role: "admin" }));
        await assertSucceeds(setDoc(doc(alice, "user_credits/bob"), { balance: 999999 }));
        assert.equal((await db.collection("user_credits").doc("bob").get()).data().balance, 999999);
      } finally {
        await baseline.cleanup();
        await initializeTestEnvironment({
          projectId: PROJECT,
          firestore: {
            host,
            port: Number(port),
            rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
          },
        }).then(env => env.cleanup());
      }
    });
  });
});

describe("repaired user-profile rules", () => {
  it("preserves legitimate profile preferences and every financial field", async () => {
    await assertSucceeds(
      updateDoc(doc(owner(), "users/alice"), {
        name: "New name",
        timezone: "Africa/Johannesburg",
        notifications: { email: { weeklyDigest: true } },
        schedulingDefaults: { platforms: ["youtube"] },
        autoRepostEnabled: false,
        paypalEmail: "payout@example.test",
        avatarUrl: "https://example.test/avatar.png",
        updatedAt: serverTimestamp(),
      })
    );
    const stored = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(stored[key], value);
    assert.equal(stored.name, "New name");
  });
  for (const [field, value] of Object.entries({
    ...financial,
    credits: 999,
    balance: 999,
    aiCredits: 999,
    growth_credits: 999,
    subscriptionTier: "enterprise",
    subscriptionStatus: "cancelled",
    plan: { tier: "enterprise" },
    testerAccess: { status: "active", creditsUsed: 0 },
    role: "admin",
    isAdmin: true,
    admin: true,
    claims: { admin: true },
    customClaims: { admin: true },
    fromCollection: "admins",
    uid: "bob",
    uploadBlocked: false,
    emailVerified: true,
    kycStatus: "approved",
    aiSubscriptionEnd: 9999999999999,
  })) {
    it(`rejects owner modification of ${field}`, async () => {
      await assertFails(updateDoc(doc(owner(), "users/alice"), { [field]: value }));
    });
  }
  it("rejects numeric transforms, protected-field removal, document replacement and deletion", async () => {
    const ref = doc(owner(), "users/alice");
    await assertFails(updateDoc(ref, { credits: increment(1) }));
    await assertFails(updateDoc(ref, { credits: deleteField() }));
    await assertFails(setDoc(ref, { name: "Erased account" }));
    await assertFails(deleteDoc(ref));
  });
  it("rejects nested entitlement changes and a mixed profile/privilege update atomically", async () => {
    await assertFails(updateDoc(doc(owner(), "users/alice"), { "testerAccess.creditsUsed": 0 }));
    await assertFails(updateDoc(doc(owner(), "users/alice"), { name: "Forged", role: "admin" }));
    assert.equal((await db.collection("users").doc("alice").get()).data().name, "Alice");
  });
  it("allows safe profile creation but rejects initial financial fields and backdated creation", async () => {
    const client = environment.authenticatedContext("new-user").firestore();
    await assertFails(setDoc(doc(client, "users/new-user"), { role: "admin", credits: 100 }));
    await assertFails(
      setDoc(doc(client, "users/new-user"), { name: "Name", createdAt: new Date("2000-01-01") })
    );
    await assertSucceeds(
      setDoc(doc(client, "users/new-user"), { name: "Name", createdAt: serverTimestamp() })
    );
    await assertFails(
      updateDoc(doc(client, "users/new-user"), { createdAt: new Date("2000-01-01") })
    );
  });
  it("denies anonymous and cross-account access", async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users/alice")));
    await assertFails(
      updateDoc(doc(environment.authenticatedContext("bob").firestore(), "users/alice"), {
        name: "Forged",
      })
    );
  });
  it("does not trust existing forged admin flags or a batch creating an admin record", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true, admin: true });
    await assertFails(setDoc(doc(owner(), "admins/alice"), { role: "admin" }));
    await assertFails(setDoc(doc(owner(), "user_credits/alice"), { balance: 999 }));
    const client = owner(),
      batch = writeBatch(client);
    batch.set(doc(client, "admins/alice"), { role: "admin" });
    batch.set(doc(client, "payments/fake"), { status: "COMPLETE" });
    await assertFails(batch.commit());
  });
  it("preserves legitimate signed-claim and server-managed collection admins", async () => {
    for (const claims of [{ admin: true }, { isAdmin: true }, { role: "admin" }]) {
      await assertSucceeds(
        setDoc(
          doc(environment.authenticatedContext("trusted", claims).firestore(), "analytics/test"),
          { ok: true }
        )
      );
    }
    await seed("admins", "legacy-admin", { role: "admin" });
    await assertSucceeds(
      getDoc(doc(environment.authenticatedContext("legacy-admin").firestore(), "users/alice"))
    );
    await assertFails(
      getDoc(
        doc(
          environment.authenticatedContext("impostor", { admin: "true" }).firestore(),
          "analytics/test"
        )
      )
    );
  });
  it("preserves existing server payment/subscription writes without changing client authority", async () => {
    // Admin SDK uses IAM and bypasses client rules; these are only demo fixture writes.
    await db.runTransaction(async tx => {
      tx.update(db.collection("users").doc("alice"), { credits: 81, subscriptionTier: "pro" });
      tx.set(db.collection("transactions").doc("paid-demo"), {
        userId: "alice",
        amount: "4.99",
        status: "COMPLETED",
      });
    });
    await assertSucceeds(getDoc(doc(owner(), "transactions/paid-demo")));
    await assertFails(updateDoc(doc(owner(), "transactions/paid-demo"), { amount: "0" }));
  });
  it("preserves owned content creation used by Clip Studio", async () => {
    await assertSucceeds(
      setDoc(doc(owner(), "content/clip-demo"), {
        userId: "alice",
        user_id: "alice",
        title: "My clip",
        sourceContext: "clip_studio",
      })
    );
  });
  it("rejects conflicting owner aliases when creating content", async () => {
    await assertFails(
      setDoc(doc(owner(), "content/conflict"), {
        userId: "victim",
        user_id: "alice",
        title: "Forged owner",
      })
    );
    await assertFails(
      setDoc(doc(owner(), "content/conflict"), {
        userId: "alice",
        user_id: "victim",
        title: "Forged owner",
      })
    );
  });
  it("prevents client-forged reward metrics, repeated bonus claims and ownership transfer", async () => {
    await assertFails(setDoc(doc(owner(), "content/forged"), { userId: "alice", views: 500000 }));
    await seed("content", "reward-source", {
      userId: "alice",
      user_id: "alice",
      title: "Clip",
      views: 500000,
      claimedBonuses: ["viral_tier_1"],
      metrics: { views: 500000 },
      revenue: 20,
    });
    for (const update of [
      { views: 999999 },
      { claimedBonuses: [] },
      { "metrics.views": 999999 },
      { revenue: 9999 },
      { userId: "bob" },
      { user_id: "bob" },
      { workspace_id: "other" },
    ]) {
      await assertFails(updateDoc(doc(owner(), "content/reward-source"), update));
    }
    await assertSucceeds(
      updateDoc(doc(owner(), "content/reward-source"), { title: "Edited title" })
    );
  });
  for (const collection of ["ads", "paid_boosts"]) {
    it(`preserves ${collection} owner reads but prevents forged paid state through direct client writes`, async () => {
      await seed(collection, "paid-demo", { userId: "alice", status: "pending", budget: 10 });
      await assertSucceeds(getDoc(doc(owner(), `${collection}/paid-demo`)));
      await assertFails(
        updateDoc(doc(owner(), `${collection}/paid-demo`), { status: "paid", budget: 999999 })
      );
      await assertFails(
        setDoc(doc(owner(), `${collection}/forged`), { userId: "alice", status: "paid" })
      );
      await assertFails(deleteDoc(doc(owner(), `${collection}/paid-demo`)));
    });
  }
  for (const collection of [
    "user_credits",
    "user_billing",
    "user_subscriptions",
    "credit_usage",
    "credit_charges",
    "credit_refunds",
    "credit_ledger",
    "payments",
    "payment_events",
    "paypal_webhook_events",
    "subscription_intents",
    "subscription_events",
    "subscription_refunds",
    "transactions",
    "usage_ledger",
    "payouts",
    "withdrawals",
    "reward_history",
    "redemption_history",
    "earnings_events",
    "referrals",
    "referral_invitations",
    "admins",
    "credits_v2_wallets",
    "future_financial_collection",
  ]) {
    it(`denies direct financial/authority writes to ${collection}`, async () => {
      await assertFails(
        setDoc(doc(owner(), `${collection}/alice`), { userId: "alice", balance: 999 })
      );
    });
  }
});

// Mock only identity verification/provider delivery; the real Express handlers and
// real demo Firestore are exercised. Never import the application's production Admin app.
const revokedTokens = new Set();
const tokens = new Map(),
  accounts = new Map(),
  tokenMints = [],
  claimWrites = [];
const auth = {
  async verifyIdToken(token, checkRevoked) {
    assert.equal(checkRevoked, true, "authentication must enforce revocation");
    if (revokedTokens.has(token))
      throw Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" });
    if (!tokens.has(token)) throw new Error("invalid token");
    return tokens.get(token);
  },
  async getUser(uid) {
    if (!accounts.has(uid)) throw new Error("missing auth user");
    return accounts.get(uid);
  },
  async createUser(input) {
    if ([...accounts.values()].some(a => a.email === input.email))
      throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
    const user = {
      uid: `new-${accounts.size}`,
      email: input.email,
      displayName: input.displayName,
      customClaims: {},
    };
    accounts.set(user.uid, user);
    return user;
  },
  async getUserByEmail(email) {
    return [...accounts.values()].find(a => a.email === email);
  },
  async updateUser(uid, changes) {
    const account = await this.getUser(uid);
    Object.assign(account, changes);
    return account;
  },
  async setCustomUserClaims(uid, claims) {
    claimWrites.push({ uid, claims });
  },
  async createCustomToken(uid, claims) {
    tokenMints.push({ uid, claims });
    return "mock-custom-token";
  },
  async generateEmailVerificationLink() {
    return "https://example.test/verification";
  },
};
function stub(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
const firestore = Object.assign(() => db, { FieldValue });
const admin = { firestore, auth: () => auth };
stub("firebase-admin", admin);
stub("../../src/firebaseAdmin", { db, admin, auth });
stub("../../src/services/emailService", {
  sendVerificationEmail: async () => ({ ok: true, provider: "fixture" }),
  sendPasswordResetEmail: async () => ({ ok: true }),
});
stub("../../src/utils/simpleCache", { withCache: async (_key, _ttl, fn) => fn() });
stub("../../src/diagnostics", {
  isBlocked: () => false,
  incAuthFail: () => {},
  getIpCount: () => 0,
});
const authMiddleware = require("../../src/authMiddleware");
const authRoutes = require("../../src/authRoutes");
const userRoutes = require("../../src/userRoutes");
const adminOnly = require("../../src/middlewares/adminOnly");
const app = express();
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.get("/identity", authMiddleware, (req, res) => res.json(req.user));
app.get("/admin", authMiddleware, adminOnly, (req, res) => res.json({ ok: true }));
const ordinaryToken = "eyJ" + "x".repeat(150);
const claimsToken = "eyJ" + "a".repeat(150);
const memberToken = "eyJ" + "b".repeat(150);
function bearer(req, token = ordinaryToken) {
  return req.set("Authorization", `Bearer ${token}`);
}

describe("real authentication and registration handlers with isolated identity fixtures", () => {
  beforeEach(() => {
    tokens.clear();
    revokedTokens.clear();
    accounts.clear();
    tokenMints.length = 0;
    claimWrites.length = 0;
    tokens.set(ordinaryToken, { uid: "alice", email: "alice@example.test", role: "user" });
    tokens.set(claimsToken, { uid: "claim-admin", email: "admin@example.test", role: "admin" });
    tokens.set(memberToken, { uid: "member-admin", email: "member@example.test" });
    accounts.set("alice", {
      uid: "alice",
      email: "alice@example.test",
      displayName: "Alice",
      emailVerified: true,
      customClaims: { feature: "preserve" },
    });
  });
  it("blocks existing forged profile flags, nested claims and identity substitution", async () => {
    await seed("users", "alice", {
      ...financial,
      uid: "victim",
      id: "victim",
      userId: "victim",
      email: "victim@example.test",
      role: "user",
      isAdmin: true,
      admin: true,
      claims: { admin: true },
      customClaims: { admin: true },
      fromCollection: "admins",
      test: true,
    });
    const result = await bearer(request(app).get("/identity")).expect(200);
    assert.equal(result.body.uid, "alice");
    assert.equal(result.body.id, "alice");
    assert.equal(result.body.userId, "alice");
    assert.equal(result.body.email, "alice@example.test");
    assert.equal(result.body.isAdmin, false);
    assert.equal(result.body.admin, false);
    assert.equal(result.body.claims.admin, false);
    assert.equal(result.body.customClaims.admin, false);
    assert.equal(result.body.fromCollection, "users");
    assert.equal(result.body.test, false);
    await bearer(request(app).get("/admin")).expect(403);
  });
  it("does not promote a pre-existing role=admin profile", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    await bearer(request(app).get("/admin")).expect(403);
    const result = await bearer(request(app).get("/auth/verify")).expect(200);
    assert.equal(result.body.user.isAdmin, false);
  });
  it("keeps claim and legacy collection admins authenticated", async () => {
    await bearer(request(app).get("/admin"), claimsToken).expect(200);
    await seed("admins", "member-admin", { name: "Legacy admin", uid: "victim", role: "user" });
    await bearer(request(app).get("/admin"), memberToken).expect(200);
    const result = await bearer(request(app).get("/auth/verify"), memberToken).expect(200);
    assert.equal(result.body.user.uid, "member-admin");
    assert.equal(result.body.user.isAdmin, true);
  });
  it("rejects revoked privileged sessions through both authentication entry points", async () => {
    revokedTokens.add(claimsToken);
    await bearer(request(app).get("/admin"), claimsToken).expect(401);
    await bearer(request(app).get("/auth/verify"), claimsToken).expect(401);
  });
  it("rejects absent and invalid tokens", async () => {
    await request(app).get("/admin").expect(401);
    await bearer(request(app).get("/admin"), "eyJ" + "z".repeat(150)).expect(401);
  });
  it("keeps claimed admin access while a database lookup fails and denies unprivileged claims", async () => {
    const original = db.collection;
    db.collection = () => {
      throw new Error("fixture database unavailable");
    };
    try {
      await bearer(request(app).get("/admin")).expect(403);
      await bearer(request(app).get("/admin"), claimsToken).expect(200);
    } finally {
      db.collection = original;
    }
  });
  it("does not return forged authority from ID-token login", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    const response = await request(app)
      .post("/auth/login")
      .send({ idToken: ordinaryToken })
      .expect(200);
    assert.equal(response.body.user.isAdmin, false);
    assert.equal(response.body.user.role, "user");
    assert.equal(tokenMints.length, 0);
  });
  it("never mints privileged custom claims from a forged profile after password verification", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    const fetch = globalThis.fetch,
      key = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "fixture-public-api-key";
    globalThis.fetch = async url => {
      assert.match(
        url,
        /^https:\/\/identitytoolkit.googleapis.com\/v1\/accounts:signInWithPassword/
      );
      return { ok: true, json: async () => ({ idToken: ordinaryToken }) };
    };
    try {
      await request(app)
        .post("/auth/login")
        .send({ email: "alice@example.test", password: "fixture" })
        .expect(200);
      assert.deepEqual(tokenMints, [{ uid: "alice", claims: { role: "user", isAdmin: false } }]);
    } finally {
      globalThis.fetch = fetch;
      if (key === undefined) delete process.env.FIREBASE_API_KEY;
      else process.env.FIREBASE_API_KEY = key;
    }
  });
  it("rejects wrong passwords before issuing any token", async () => {
    const fetch = globalThis.fetch,
      key = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "fixture-public-api-key";
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }),
    });
    try {
      await request(app)
        .post("/auth/login")
        .send({ email: "alice@example.test", password: "wrong" })
        .expect(401);
      assert.equal(tokenMints.length, 0);
    } finally {
      globalThis.fetch = fetch;
      if (key === undefined) delete process.env.FIREBASE_API_KEY;
      else process.env.FIREBASE_API_KEY = key;
    }
  });
  it("disables test-token and E2E bypasses on hosted runtimes even without NODE_ENV=production", async () => {
    const old = process.env.K_SERVICE;
    process.env.K_SERVICE = "fixture-cloud-run";
    try {
      await request(app).get("/admin").set("x-playwright-e2e", "1").expect(401);
      await bearer(request(app).get("/admin"), "test-token-for-admin").expect(401);
    } finally {
      if (old === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = old;
    }
  });
  it("rejects unverified existing-email registration without changing claims or stored finances", async () => {
    const before = (await db.collection("users").doc("alice").get()).data();
    await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.test", password: "arbitrary", name: "Attacker" })
      .expect(409);
    assert.deepEqual((await db.collection("users").doc("alice").get()).data(), before);
    assert.deepEqual(claimWrites, []);
    assert.equal(accounts.get("alice").displayName, "Alice");
  });
  it("does not fall back from an invalid registration token to an email lookup", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: "invalid", email: "alice@example.test", password: "arbitrary" })
      .expect(401);
    assert.deepEqual(claimWrites, []);
  });
  it("preserves existing balances, tiers, tester access and claims on verified re-registration", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: ordinaryToken, name: "Updated name", email: "alice@example.test" })
      .expect(201);
    const saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.name, "Updated name");
    assert.deepEqual(claimWrites, []);
  });
  it("rejects an authenticated registration email switch", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: ordinaryToken, email: "other@example.test" })
      .expect(400);
    assert.equal(accounts.get("alice").email, "alice@example.test");
  });
  it("creates a regular account while ignoring supplied admin and financial fields", async () => {
    await request(app)
      .post("/auth/register")
      .send({
        email: "new@example.test",
        password: "fixture-password",
        name: "New",
        role: "admin",
        isAdmin: true,
        credits: 999,
        subscriptionTier: "enterprise",
      })
      .expect(201);
    const account = [...accounts.values()].find(a => a.email === "new@example.test");
    const stored = (await db.collection("users").doc(account.uid).get()).data();
    assert.equal(stored.role, "user");
    assert.equal(stored.isAdmin, false);
    assert.equal(stored.credits, undefined);
  });
  it("preserves profile API editing and ignores injected financial or authority fields", async () => {
    await bearer(request(app).put("/users/me"))
      .send({
        name: "Preference edit",
        timezone: "Africa/Johannesburg",
        notifications: { email: { weeklyDigest: true } },
        defaultPlatforms: ["youtube"],
        autoRepostEnabled: false,
        credits: 99999,
        role: "admin",
        subscriptionTier: "enterprise",
      })
      .expect(200);
    let saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.name, "Preference edit");
    assert.equal(saved.timezone, "Africa/Johannesburg");
    await bearer(request(app).put("/users/profile"))
      .send({
        name: "Profile edit",
        email: "alice@example.test",
        paypalEmail: "payout@example.test",
        role: "admin",
        credits: 999,
      })
      .expect(200);
    saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.paypalEmail, "payout@example.test");
  });
  it("does not allow plan self-assignment through the legacy pseudo-billing endpoint", async () => {
    const before = (await db.collection("users").doc("alice").get()).data();
    await bearer(request(app).post("/users/me/plan")).send({ tier: "enterprise" }).expect(410);
    assert.deepEqual((await db.collection("users").doc("alice").get()).data(), before);
  });
});
```

### B7. src/**tests**/server.hostedAdminRoutes.test.js

```javascript
const request = require("supertest");

describe("hosted runtime admin setup isolation", () => {
  let app;
  const previous = process.env.K_SERVICE;
  beforeAll(() => {
    process.env.K_SERVICE = "isolated-hosted-fixture";
    process.env.FIREBASE_ADMIN_BYPASS = "1";
    process.env.CI_ROUTE_IMPORTS = "1";
    app = require("../server");
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = previous;
  });
  it("does not mount the unauthenticated admin provisioning endpoint", async () => {
    const result = await request(app).post("/api/setup-admin").send({});
    expect(result.status).toBe(404);
  });
});
```

### B8. test/security/fixtures/firestore.before.rules

This vulnerable ruleset is a **test-only before-repair fixture**. Never deploy it.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isServiceAccount() {
      return request.auth != null &&
        request.auth.token.firebase != null &&
        request.auth.token.firebase.sign_in_provider == 'service_account';
    }

    function isActiveWorkspaceMember(workspaceId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)).data.status == 'active';
    }

    function canEditWorkspace(workspaceId) {
      return isActiveWorkspaceMember(workspaceId) &&
        get(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)).data.role in ['owner', 'admin', 'editor'];
    }

    match /workspaces/{workspaceId} {
      allow read: if isAdmin() || isServiceAccount() || isActiveWorkspaceMember(workspaceId);
      allow create: if request.auth != null && request.resource.data.ownerUid == request.auth.uid;
      allow update, delete: if isAdmin() || isServiceAccount() ||
        (isActiveWorkspaceMember(workspaceId) &&
          get(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)).data.role in ['owner', 'admin']);

      match /members/{memberId} {
        allow read: if isAdmin() || isServiceAccount() || isActiveWorkspaceMember(workspaceId);
        allow write: if isAdmin() || isServiceAccount();
      }

      match /invites/{inviteId} {
        allow read, write: if isAdmin() || isServiceAccount();
      }
    }

    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if isAdmin() || isServiceAccount() || request.auth.uid == userId;
    }

    // Users can read/write their own content
    match /content/{contentId} {
      allow create: if isAdmin() || isServiceAccount() ||
        (request.auth != null && (
          (request.resource.data.keys().hasAny(['userId']) && request.resource.data.userId == request.auth.uid) ||
          (request.resource.data.keys().hasAny(['user_id']) && request.resource.data.user_id == request.auth.uid) ||
          (request.resource.data.keys().hasAny(['workspace_id']) && canEditWorkspace(request.resource.data.workspace_id))
        ));

      allow update, delete, get, list: if isAdmin() || isServiceAccount() ||
        (request.auth != null && resource != null && (
          (resource.data.keys().hasAny(['userId']) && resource.data.userId == request.auth.uid) ||
          (resource.data.keys().hasAny(['user_id']) && resource.data.user_id == request.auth.uid) ||
          (resource.data.keys().hasAny(['workspace_id']) && isActiveWorkspaceMember(resource.data.workspace_id))
        ));
    }

    match /promotion_schedules/{scheduleId} {
      allow read: if isAdmin() || isServiceAccount() ||
        (request.auth != null && resource != null && (
          resource.data.user_id == request.auth.uid ||
          (resource.data.keys().hasAny(['workspace_id']) && isActiveWorkspaceMember(resource.data.workspace_id))
        ));
      allow create: if isAdmin() || isServiceAccount() ||
        (request.auth != null && (
          request.resource.data.user_id == request.auth.uid ||
          (request.resource.data.keys().hasAny(['workspace_id']) && canEditWorkspace(request.resource.data.workspace_id))
        ));
      allow update, delete: if isAdmin() || isServiceAccount() ||
        (request.auth != null && resource != null && (
          resource.data.user_id == request.auth.uid ||
          (resource.data.keys().hasAny(['workspace_id']) && canEditWorkspace(resource.data.workspace_id))
        ));
    }

    // Only admins, service account, or backend can access analytics, promotions, activities
    match /analytics/{docId} {
      allow read, write: if isAdmin() || isServiceAccount();
    }
    match /promotions/{docId} {
      allow read, write: if isAdmin() || isServiceAccount();
    }
    match /activities/{docId} {
      allow read, write: if isAdmin() || isServiceAccount();
    }

    // Community posts - authenticated users can read all, create their own, and update their own
    match /community_posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.authorId == request.auth.uid;
      allow update: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         request.resource.data.diff(resource.data).affectedKeys().hasOnly(['replies', 'likes', 'helpful', 'views']));
      allow delete: if request.auth != null && resource.data.authorId == request.auth.uid;
    }

    // AI Clip analyses - users can read/write their own analyses
    match /clip_analyses/{analysisId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Generated clips - users can read/write their own clips
    match /generated_clips/{clipId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Chat conversations - users can read/write their own conversations
    match /chat_conversations/{conversationId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Chat messages - users can read/write messages in their conversations
    match /chat_messages/{messageId} {
      allow read: if request.auth != null &&
        exists(/databases/$(database)/documents/chat_conversations/$(resource.data.conversationId)) &&
        get(/databases/$(database)/documents/chat_conversations/$(resource.data.conversationId)).data.userId == request.auth.uid;
      allow create: if request.auth != null &&
        exists(/databases/$(database)/documents/chat_conversations/$(request.resource.data.conversationId)) &&
        get(/databases/$(database)/documents/chat_conversations/$(request.resource.data.conversationId)).data.userId == request.auth.uid;
      allow update, delete: if request.auth != null &&
        exists(/databases/$(database)/documents/chat_conversations/$(resource.data.conversationId)) &&
        get(/databases/$(database)/documents/chat_conversations/$(resource.data.conversationId)).data.userId == request.auth.uid;
    }

    // Ads - users can read/write their own ads, admins can read/write all
    match /ads/{adId} {
      allow read: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        isAdmin()
      );
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        isAdmin()
      );
      allow delete: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        isAdmin()
      );
    }

    // Ad analytics - users can read their own, admins can read all
    match /ad_analytics/{adId} {
      allow read: if request.auth != null && (
        get(/databases/$(database)/documents/ads/$(adId)).data.userId == request.auth.uid ||
        isAdmin()
      );
      allow write: if isAdmin() || isServiceAccount();
    }

    // Notifications - users can read/write their own
    match /notifications/{notificationId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }

    // Transactions - users can read their own (read-only usually)
    match /transactions/{transactionId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Paid Boosts (Missions) - users can read/write their own
    match /paid_boosts/{boostId} {
      allow read: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
      allow delete: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
    }

    // All other collections: only admins, service account, or backend
    match /{document=**} {
      allow read, write: if isAdmin() || isServiceAccount();
    }
  }
}
```
