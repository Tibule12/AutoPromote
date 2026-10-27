> Historical foundation snapshot — 26 October 2026. Current security, account status, implementation and test evidence are in the [27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md). This file does not describe the current deployed security state or an approved commercial credit policy.

# Rewarded advertising and unified credits: research and audit

Research date: 26 October 2026. Branch: `feat/unified-credits-foundation-20261026`.
This is a staged foundation, not permission to change production monetisation.

## Google product and implementation decision

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

### Critical verification uncertainty

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

## Eligibility, accounts, demand and payments

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

## Reward and consent policy

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

## Repository audit before implementation

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

## Read-only infrastructure evidence

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
