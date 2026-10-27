# AutoPromote rewarded ads and unified credits — continuation

27 October 2026 · Branch `feat/rewarded-credits-continuation-20261027` · Local, uncommitted work based on production revision `593bbcdf86e7ca6e3acc16eac5b52b168f3a45ca`.

**The existing foundation has been extended and tested. It is ready for local review, not production activation.** No merge, push, deployment, production credit issuance, balance migration, price change or advertising-account change was performed. Actual application routes still use their existing billing. Cam Combiner is excluded.

## 1. Existing implementation retained

This continues the original 26 October foundation and its `credits_v2_wallets` authority. It does not introduce another balance. The original checkout is preserved; [provenance](docs/monetization/evidence/20261027/foundation-provenance.json) records the copied source hashes.

Retained: transactional available/reserved credits, immutable ledger, UTC calendar-month renewal, expiring allowances and rewards, persistent purchased credits, expiring-credit-first spending, idempotent deductions/refunds, concurrent overspend prevention, integer credit/money validation, reward-session expiry/replay protection, monthly ad cap, global/per-user financial ceilings and kill switches. Paid accounts receive their configured larger allowance and cannot start rewarded sessions. There is no daily feature quota; the full balance can be spent in one day subject to resource/concurrency safety limits.

All entry points still require an explicitly enabled loopback Firestore emulator and project `demo-autopromote-credits`. Production, Cloud Run, Functions and Render runtimes are rejected. The local HMAC issuer remains a clearly labelled simulation; it is not evidence from Google.

## 2. Work completed in this continuation

| Change                     | Implemented and tested                                                                                                                                                                                     | Practical limit                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable dispatch intent    | Reservation, ledger entry and outbox intent commit together. One dispatcher acquires the operation; execution identity is bound once.                                                                      | No automatic outbox drainer or real cloud dispatcher is mounted.                                                                                                       |
| Failure recovery           | Reconciliation recovers an execution submitted before a connection loss without submitting twice. Missing/uncertain execution evidence retains the hold. Bound execution IDs are required for settlement.  | The worker is an emulator fixture. Real provider lookup, authenticated terminal outcomes and crash-before-submit recovery still require integration.                   |
| Trusted quotes             | Server-owned metadata determines workload, destinations and cost. Quotes expire, bind the source hash/object generation, reject substitution, and preserve the exact source descriptor in the reservation. | The source registry is an emulator contract. Actual workers must consume that generation/hash and enforce the resource ceiling. GPU work is rejected until calibrated. |
| Shared operations          | Queue, Publisher, Studio render, clip analysis and clip render consume the same wallet. Queue→Publisher can carry the existing operation ID without another reservation.                                   | Actual legacy handlers have not been switched. Multi-stage real jobs must include their full aggregate cost and avoid old deductions.                                  |
| No advertisement available | No-fill, unsupported device, blocker and timeout fixtures release the pending reward hold; no credit or monthly reward slot is consumed.                                                                   | Google availability varies; a monthly cap is a maximum, not guaranteed inventory.                                                                                      |
| Google test integration    | A separate loopback page requests only Google's official sample ad unit, after opt-in. Readiness, display, grant, close and timeout handling are implemented.                                              | No wallet import/API exists on this origin. A Google browser event always awards **zero** credits.                                                                     |
| Financial evidence         | A GET-only cost observer collects bounded infrastructure evidence. A separate calculator requires complete per-operation evidence and enforced cost ceilings before proposing prices.                      | It cannot validate an invoice or authorise policy. With current evidence, every production operation price remains unresolved.                                         |

Key source: [wallet](src/services/unifiedCredits/wallet.js), [dispatch/reconciliation](src/services/unifiedCredits/dispatch.js), [trusted admission](src/services/unifiedCredits/admission.js), [cost analysis](src/services/unifiedCredits/costEvidence.js), [Google lifecycle controller](sandbox/credits/google-test-controller.js).

The preview supports voluntary watch → mock reward → quoted spend → subscription information. Paid accounts hide the watch action. No-fill and zero balance leave saved notes available across reloads. This validates the preview's recovery behaviour; it does not qualify every real Studio project/save flow. No editor, export, media asset or production subscription checkout was modified.

## 3. Google setup and secure completion

The owner reports ownership verified, site review requested and AdSense **Getting ready / Awaiting approval** for `autopromote.org`, publisher `ca-pub-4802692424152812`. The ownership tag is already deployed. Approval, eligible demand and an Ad Manager network have not been independently established through account access.

Use the existing AdSense identity when creating/linking the separate Google Ad Manager network. A second AdSense publisher account is not required. A valid AdSense account is a signup prerequisite; active AdSense ad serving is not required. Review reporting currency/timezone before the first order. Ad Exchange demand and site eligibility require their own account checks. [Google signup requirements](https://support.google.com/admanager/answer/7084151?hl=en), [linked accounts](https://support.google.com/admanager/answer/188529?hl=en).

GPT requests an eligible rewarded slot, waits for readiness and displays only after affirmative opt-in. Unsupported slots, no-fill, blockers, expiry and early dismissal must return the user to ordinary work. Display as well as video demand may fill the slot. [Official GPT sample](https://developers.google.com/publisher-tag/samples/display-rewarded-ad), [web rewarded implementation](https://support.google.com/admanager/answer/9116812?hl=en).

**A trustworthy GPT web reward-completion protocol remains unresolved.** The documented browser payload provides reward amount/type, not an authenticated server settlement receipt. The web help page's SSV table-of-contents heading does not supply a verifiable signing/callback contract in the accessible body. Mobile Ads SSV documents signed callbacks for mobile inventory; it does not establish GPT web support. No supported account-specific web protocol was verified. [GPT payload](https://developers.google.com/publisher-tag/reference#googletag.RewardedPayload), [Mobile Ads SSV](https://developers.google.com/admob/android/ssv).

The implementation explicitly rejects Google client-completion claims and unreviewed provider adapters. Browser events, our HMAC, nonces, timers and App Check cannot establish a genuine paid Google advertisement. Even authenticated completion would not guarantee final revenue after adjustments. Keep production reward offers disabled until Google supplies an applicable protocol, signed fixtures, user/session/event binding, replay semantics and key rotation. Site approval alone will not resolve this blocker.

Manual steps, account-specific questions, reward policy, ads.txt, CMP and test instructions are in [Google setup — 27 October](docs/monetization/GOOGLE_SETUP_20261027.md). No signup, support message, ad unit, live request, CMP setting or Auto Ads setting was changed during this continuation.

## 4. Cost evidence and commercial recommendations

Read-only observations cover **20–27 October 2026**, ending `13:32:16 UTC`, project `autopromote-cc6d3`. [Whitelisted evidence](docs/monetization/evidence/20261027/cost-observations.json) contains no credentials or container environment values.

| Observation                              |                      Verified value | Meaning                                                                                |
| ---------------------------------------- | ----------------------------------: | -------------------------------------------------------------------------------------- |
| `media-worker-v1` billable instance time |                  285.962491 seconds | Aggregate monitoring metric, not a render duration/invoice.                            |
| Allocated CPU time                       |           2,028.012782 vCPU-seconds | Includes the service's observed allocation; not attributed to an operation.            |
| Allocated memory time                    |                 1,037.2 GiB-seconds | Same attribution limit.                                                                |
| HTTP requests                            |                                  16 | Not 16 completed renders; requests/workloads may differ.                               |
| Main bucket retained bytes               | 8,403,004,361 bytes, about 7.83 GiB | Latest reported byte gauge, not monthly byte-time or the whole project's storage bill. |
| Selected GPU video job telemetry         |                  No series returned | Does not establish zero GPU usage/cost across jobs or time windows.                    |

Current CPU service configuration is 4 vCPU/4 GiB, concurrency 1, timeout 3,600 seconds and maximum 3 instances. The video GPU job is 20 vCPU/80 GiB/one RTX PRO 6000, timeout 3,300 seconds, retries 0. Those settings are verified metadata, not measured costs per operation. No paid measurement job was started.

At Google's published reference rates, 60 active seconds of that CPU shape calculate to **$0.00636**; 60 billed seconds of the GPU shape calculate to **$0.0531132**, and 3,300 seconds to **$2.921226**, before other costs. These are illustrative resource calculations, not invoices or valid credit quotes. Include startup/minimum billing, retries/failures, storage operations/retention, downloads/egress, Firestore/Tasks and external services. [Cloud Run pricing](https://cloud.google.com/run/pricing), [Storage pricing](https://cloud.google.com/storage/pricing).

The existing project returned no BigQuery datasets; an export elsewhere is still possible. Cloud Billing metadata access returned HTTP 403 with `SERVICE_DISABLED`; the API was not enabled and IAM was not changed. [Access limitation](docs/monetization/evidence/20261027/billing-read-limit.json). CPU-based speech processing is configured, but actual AI/provider usage, publishing fees and end-to-end per-operation costs remain unverified.

**Recommendation:** preserve existing subscriber prices/benefits and balances. The existing 15 / 150 / 500 / 2,000 allowances are a legacy baseline reused by the demo, not a newly approved free-plan policy. The demo's 1-credit reward, 20-ad cap and $0.001 liability/credit remain unapproved examples. No new commercial allowance, operation price or live reward is finalised. Assume zero ad income until eligible, finalised revenue is observed; any pilot needs an explicit subsidy and global issuance ceiling.

Price a bounded operation only after matching successful and failed executions to complete billing/provider evidence. Use the greater of a reviewed high-percentile cost plus margin and an enforced worst-case cost bound, divided by the reviewed liability per credit, rounded up. Insufficient evidence must not silently become a zero-cost component. GPU jobs remain outside the proposed first cohort. The [measurement procedure](docs/monetization/COST_MEASUREMENT_20261027.md) defines evidence and access needs; `npm run credits:readiness` currently reports **NOT_READY_FOR_PRODUCTION** with every operation recommendation unset.

## 5. Security and tests

Before development, GET-only Rules API checks confirmed the repaired deployed Firestore and Storage source hashes. The worktree starts from the subsequent verification release. Production authority, Rules, application routes, billing and subscriptions retain their base source. [Deployed baseline](docs/monetization/evidence/20261027/deployed-security-baseline.json), [preservation checks](docs/monetization/evidence/20261027/source-preservation.json).

| Verification                                                                       | Result                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Real Firestore emulator, original and continuation suites                          | **59 passed**, 0 failed/skipped/cancelled; 9 suites.                                 |
| Concurrent deductions/replays, outbox, execution spoofing, refund/month boundaries | Passed. Unknown work keeps its hold.                                                 |
| Trusted metadata/quote substitution, all five operations in one day, Queue handoff | Passed.                                                                              |
| Forged Google browser completions, provider substitution, monthly cap and no-fill  | Passed; no Google event can issue a wallet reward.                                   |
| Firebase client financial writes                                                   | Denied, including new outbox/quote/input/execution collections.                      |
| Chromium preview, desktop 1280 and mobile 390                                      | Passed; no external requests, opt-in/skip/refund, saved notes at zero, paid ad-free. |
| Actual official Google sample in separate muted/headless page                      | Ad displayed; browser grant observed; **0 wallet requests / 0 credits awarded**.     |
| GET-only cost observer boundary                                                    | 1 unittest passed; no network or real credentials used by the test.                  |
| Targeted lint, syntax and whitespace                                               | Passed; detailed evidence and source manifest accompany this report.                 |

[Test evidence](docs/monetization/evidence/20261027/validation.json), [Google sample observation](docs/monetization/evidence/20261027/google-test-browser.json). The first Google browser cleanup attempt failed because a fullscreen test ad covered the page's dismiss control; the corrected run invokes only our own local dismiss handler and passed. No creative was clicked. No production account ad or advertising revenue was validated.

The local sandbox's notes test is not a real Studio browser regression. Live provider settlement, production Auth integration, load, migration, actual-origin CMP/CSP compatibility and every real project recovery path remain unqualified. Existing production security incident follow-up, historical balance/session risks and the seven tracked test documents remain separate; none was altered or marked resolved here. The previously revoked Firebase CLI grant was not reused.

## 6. Integration work remaining before a controlled rollout

| Existing path                                                                 | Required binding before cohort activation                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue/Publisher: `src/contentRoutes.js`, `src/services/promotionTaskQueue.js` | Bind owner-validated destinations, job identity and stage costs to one operation. Preserve platform API/plan constraints; remove redundant feature usage quotas only for an approved migrated cohort.                                                         |
| Studio/Find Viral Clips: `src/mediaRoutes.js`, `src/routes/clipRoutes.js`     | Replace participating legacy deductions/refunds with shared admission once, enforce source version/runtime and trusted terminal settlement. Saving/editing/recovery must remain available at zero. Do not include `/render-multicam` or Cam Combiner workers. |
| Purchases/subscriptions: payment routers, fulfilment and billing services     | Resolve mirror resurrection and order owner/package/amount/currency verification before choosing opening balances or granting into the wallet. Bind verified tier changes without changing paid prices/benefits.                                              |
| Cloud workers                                                                 | Private IAM, bounded retries/runtime/input/output retention, durable outbox drainer and provider execution lookup/reconciliation. A configuration quote alone cannot bound a cloud bill.                                                                      |
| Google rewards                                                                | Approved network/inventory, consent, applicable authenticated web completion adapter and independently budgeted offers. Aggregate reporting and browser grants cannot substitute for verified settlement.                                                     |

These are engineering and reconciliation gates in addition to Google's pending site approval. Existing financial writers must be inventoried and stopped/redirected for an enrolled cohort to prevent double grants/deductions. Historical balances must never be reconciled by summing mirrors or taking their maximum. No fallback to an old wallet on transient errors is safe.

Ready now: local wallet/admission/recovery review, emulator regressions, the isolated Google sample page and read-only cost evidence tooling. **A production cohort is not ready.** After the outstanding bindings, measured ceilings and provider verification pass in a named nonproduction project, present the exact cohort, funding limit, policy, worker IAM/limits, migration/reconciliation and rollback proposal for explicit approval. No live offer or rollout is authorised by changing a readiness flag.

## 7. Reproduce locally

Use existing Node dependencies, Java 21+ and the cached official Firestore emulator. No production Firebase credentials are needed for the credit tests.

```sh
CREDITS_JAVA_BIN=/path/to/java21/bin/java npm run test:credits:browser
python3 -m unittest discover -s test/unified-credits -p cost_observer_test.py -v
npm run credits:readiness
npm run credits:economics
```

For the mock wallet preview, follow [local emulator instructions](docs/monetization/README.md). Google's sample has its own origin and requires a separate explicit command:

```sh
GOOGLE_REWARDED_TEST_ONLY=true npm run credits:google-test
```

Open `http://127.0.0.1:8191`, consent to requesting the test sample and optionally display it. It never uses AutoPromote publisher inventory or awards credits. `npm run test:credits:google -- --display` runs the same sample with a headless, muted browser. It contacts Google and should not be included in an otherwise offline emulator run.
