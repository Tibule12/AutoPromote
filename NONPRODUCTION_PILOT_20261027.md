# Shared-credit application integration and pilot readiness

27 October 2026 · `feat/rewarded-credits-continuation-20261027`

**The existing wallet is now connected to ordinary application handlers in isolated API tests. A cloud/free-user pilot remains blocked.** Media, Storage, Auth and publication boundaries in these tests are fixtures. No new credit authority, production balance migration, live advertisement, push, merge, deployment, session revocation or billing-setting change was performed. Cam Combiner is excluded.

## Preserved work and release boundary

The complete preceding continuation is preserved in **local commit `51c3980e3272ef9d205901db0bc68a830ebea8e9`**. A private archive was verified file-by-file: `credits-before-integration-20261027T161300Z.tar.gz`, SHA-256 `5155c3cc4d521541ffc20d1c4e4af01e5e23b0420eccfde7d6d3ab1546b3afb4`, under `~/.local/share/autopromote-monetization/`. Commit hooks were disabled for that local checkpoint; no remote ref, PR or workflow was created. No cloud-seeding script ran. The deployed demo-only Playwright workflow is preserved.

The earlier [continuation report](MONETIZATION_CONTINUATION_20261027.md) records the original 59-test checkpoint. This report supersedes its statement that no application handlers have bindings. Production remains on the separately deployed security/verification release; this branch's guarded code has not been deployed. Firestore/Storage rules, authentication authority, payment routers, subscription prices/configuration and Cam Combiner service/job implementations are unchanged.

[Current review manifest](docs/monetization/evidence/20261027/pilot-review-manifest.json) · [source preservation](docs/monetization/evidence/20261027/pilot-source-preservation.json) · [public API revision check](docs/monetization/evidence/20261027/pilot-public-release-check.json). Both public API origins returned `593bbcdf` and `security-owner-bootstrap-20261027` at 18:59 SAST.

## Application integration completed locally

[Application adapter](src/services/unifiedCredits/application.js) uses request-scoped asynchronous context. Only an explicitly configured demo cohort on the guarded loopback emulator can enter it. There is no public setup/enrolment endpoint. The isolated app installs a route allowlist before the ordinary routers, blocking Cam Combiner and other unqualified processing paths. Authenticated quote/account/operation/reconcile endpoints expose no worker-receipt writer. Database identity and loopback transport checks prevent accidentally using a captured production service client. A missing configuration fails closed; a production/hosted marker rejects the integration. Ordinary requests outside that context retain their existing credit and billing paths.

| Existing application path                             | Local binding and result                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publisher `POST /api/content/upload`                  | The ordinary controller, content validation, content record and platform entitlement check run. Shared admission replaces the old monthly upload/credit counters for the local cohort. Unpriced viral optimisation, automatic distribution and bounty/boost requests are excluded. |
| Queue `POST /api/promotion-tasks/platform/enqueue`    | The ordinary task service writes its normal test-mode task. Publisher hands over its operation ID; Queue does not reserve twice. Settlement waits for every approved destination. No external platform publication occurs.                                                         |
| Studio `POST /api/media/process`                      | The normal source-ownership checks, `startProcessingJob`, job record and background lifecycle run. Legacy deductions/refunds use the existing shared hold. The expensive media transport is a fixture. Cam Combiner endpoints are not enrolled.                                    |
| Find Viral Clips `/api/clips/analyze` and `/generate` | The normal controllers/services create analysis, generated clip and content records in the emulator. Worker responses and private local Storage are fixtures. The local path avoids making an object public.                                                                       |

Quotes bind an owner, source version, approved request body and price revision. Substitution is rejected before reserving. Durable stage receipts prevent re-entering a controller on request replay. Jobs bind to server-owned step records and an execution anchor. A bounded `reconcilePending()` can resume reconciliation after the API adapter restarts; it never resubmits an uncertain job.

**A legacy job's `failed` field or HTTP error alone cannot release a hold.** Terminal settlement requires an immutable local worker fixture receipt bound to user/operation/job/execution, or a trusted guard explicitly confirming no dispatch occurred. No client receipt endpoint exists. These fixtures are not Google verification or a production worker verifier. A real adapter still needs authenticated worker evidence, immutable source generation/hash enforcement, enforced runtime/retry bounds and crash-before-dispatch recovery. Unknown work retains credits.

Actual production subscribers, wallets and payments were not read or rewritten by these tests. The existing local preview still demonstrates voluntary mock ads, quotes and zero-credit note recovery. These API tests do not qualify the complete signed-in Studio browser, every project recovery case, all composition options or real provider settlement. No renderer, template, selected film or preview/final parity logic changed.

## Google verification outcome and manual actions

The owner confirmed **no Ad Manager network exists yet** and **no billing export/invoice is available**. The connected mailbox contains AdSense onboarding messages, but no applicable support answer.

Rechecked Google's current web help, GPT reference and official support options. The web article still exposes an SSV navigation heading without an implementable signed callback/key contract in its accessible body; GPT documents browser reward events/payloads. No account-supported authenticated GPT web completion protocol was established. This is unresolved, not a claim that Google can never support it. Mobile SDK SSV cannot be assumed to apply to web. [Web help](https://support.google.com/admanager/answer/9116812?hl=en), [GPT payload](https://developers.google.com/publisher-tag/reference#googletag.RewardedPayload), [mobile SSV](https://developers.google.com/admob/android/ssv).

The official support contact flow redirects to Google sign-in. Available publisher support depends on the signed-in network and service level. No authenticated GAM network session or case ID is available, so no support case was submitted; no email recipient or web protocol was guessed. [Support eligibility/options](https://support.google.com/admanager/answer/3059042?hl=en), [official contact flow](https://support.google.com/admanager/gethelp).

Manual steps remaining:

1. Create the Ad Manager network using the existing AdSense-linked identity, if Google permits the current account to complete signup. Confirm currency/timezone and record the **network code**, which is different from the publisher ID. Do not open a duplicate AdSense publisher account. [Signup requirements](https://support.google.com/admanager/answer/7084151?hl=en).
2. From that signed-in network, open the official support flow. Submit the [prepared verification question](docs/monetization/GOOGLE_SETUP_20261027.md#request-for-google-support-or-the-account-representative) and obtain a case ID, applicable signed protocol, key/replay rules and fixtures. If support cannot offer one, keep Google-funded wallet rewards disabled.
3. Await the site's requested review, verify eligible demand and reward-policy suitability, then review account-specific ads.txt, certified CMP and serving-origin headers before proposing any live ad unit. These settings remain unconfigured by this work.

**The proposed free pilot does not need ads or Google approval.** It uses a reviewed subsidy and disables all reward issuance. Google's pending approval and verification block the advertising track, not local API testing. Browser grants, our HMAC and App Check remain insufficient proof of a paid Google ad.

## Measured financial evidence

No paid execution was started. Resource observations are kept separate from complete invoice-backed operation costs; the commercial calculator still has no complete samples and leaves all five operation-price recommendations unset.

| Evidence                                              | Actual observation                                                                                                                                              | Pricing limit                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Local CPU render smoke, existing worker clock helpers | 3-second synthetic output; **0.2688 s wall / 0.2887 CPU-s**, 663,511 output bytes                                                                               | Workstation resource timing, not a full Studio job or cloud invoice.                                         |
| Local CPU clip smoke                                  | 1-second output; **0.1546 s wall / 0.1751 CPU-s**, 215,002 output bytes                                                                                         | No cloud startup, Storage, network or provider costs included.                                               |
| Injected local failure                                | Invalid encoder; **0.0634 s wall / 0.0600 CPU-s**, no output                                                                                                    | Early failure only; not a measured late-render or GPU failure.                                               |
| Retained real GPU qualification, 6 October            | One 20-vCPU/80-GiB/RTX PRO 6000 execution; **59.5254 billable instance seconds**; 8.7667 s process time; 0.6431 s transcode; 29,533 input / 62,029 output bytes | A two-second NVDEC/NVENC qualification, not GPU inference or a typical Studio render. No GPU failure sample. |
| Existing 20–27 October aggregate monitoring           | 285.9625 media-service billable seconds; about 7.83 GiB retained bucket bytes                                                                                   | Still not attributable to individual operations or monthly storage byte-time.                                |

[CPU observations](docs/monetization/evidence/20261027/local-cpu-measurements.json), [GPU evidence with retained-source hashes](docs/monetization/evidence/20261027/historical-gpu-operation.json), [aggregate telemetry](docs/monetization/evidence/20261027/cost-observations.json).

The retained GPU report applies a 60-second minimum and reference compute estimate of **$0.0531132**. That is a tariff calculation, not a measured invoice; taxes, discounts, storage, network and other services are excluded. API execution wall time, task duration, process duration and billable instance time differ materially. [Cloud Run pricing](https://cloud.google.com/run/pricing).

Still missing: matched billing SKUs/discounts, CPU/GPU cold starts and realistic late failures/retries by workload class, output/storage byte-time and operations, egress/downloads, Firestore/Tasks, external AI and publishing fees. The Billing API returned `SERVICE_DISABLED`; it was not enabled. No export was created and no query job or IAM change ran. An owner-provided existing export/invoice or a separately approved export/instrumentation setup is required. Do not convert these partial measurements into final operation prices or higher free allowances.

## Controlled pilot proposal

[Draft configuration](config/unified-credits.pilot.draft.json): **maximum $5 USD total proposed all-in funding**, up to 10 explicitly named participants, one active job globally/per user, CPU-only scope, no external AI, no Cam Combiner, no ads, no ad rewards and at most one day of output retention. The local fixture cohort contains only `demo-pilot-*` identities. Draft closing time: **3 November 2026, 14:00 SAST**; a later real pilot needs a reviewed window. Funding is **not approved**, production is disabled, and existing allowances remain unapproved demo inputs.

The wallet now atomically enforces **lifetime reserved + spent exposure**, across all users and calendar months, independently of monthly budgets. Once work starts, a credit refund does not recycle its infrastructure budget. Queued cancellation can release an unused hold. Policy replacement cannot silently remove/reset the stored ceiling; expiry stops new spending while allowing settlement and balance access.

**This is a hard application admission limit for correctly bounded estimates. It is not yet a verified $5 cloud-invoice cap.** Unpriced storage, HTTP traffic, provider calls or bypass workers could exceed it. The draft cannot authorise real spending merely by changing a flag. A safe funded cohort requires all of the following:

- A named isolated nonproduction project and approved participants/funding/window. A historical report names `autopromote-staging-2026`; the [current CLI check](docs/monetization/evidence/20261027/staging-target-check.json) returned no usable project metadata, so target/access remain unverified. No deployment occurred.
- Complete enough cost attribution and enforced worst-case worker/input/retry/storage limits, plus bounded HTTP/quote traffic. GPU and external AI remain excluded until separately measured.
- A real provider outcome adapter and recovery for uncertain dispatch, private worker IAM, no direct bypass, and end-to-end failure/restart tests. Local fixture receipts must never be promoted as provider proof.
- Normal Auth/browser/project save/reopen qualification for the participating tools, keeping saving/recovery independent of credits. A pilot must not take over production users' existing balances or entitlements.
- Normal application frontend quote/consent headers and the trusted source-registry population still need wiring. The new endpoints are exercised by the API harness; the existing credit preview is separate. A human pilot cannot yet use all normal screens through this adapter.
- Any eventual production cutover additionally needs legacy balance/all-writer reconciliation and payment order owner/package/amount/currency fixes. Historical incident balances/sessions and seven tracked test documents remain separate, unresolved work.
- Explicit approval for the exact deployment revision, target, funding, cohort and restrictive rollback. No vulnerable Rules rollback or switch to a stale legacy mirror.

Rollback before rollout is leaving the integration flag unset and the code undeployed. In a future cohort, pause admission first, retain holds for uncertain jobs, reconcile trusted terminal outcomes, preserve the ledger and never replay grants or restore stale balances. Google live ads and any production migration each remain separately gated.

## Validation and reproduction

The [validation evidence](docs/monetization/evidence/20261027/pilot-validation.json) records **69 passing tests across 10 suites** (including 10 new application cases), desktop/mobile preview checks and **21 passing existing server/payment/subscription regression tests**. There were no failed, skipped or cancelled cases in the combined suite. Application test Auth, media execution, Storage and publication are controlled fixtures; the database uses real Firestore transactions in a fresh owned emulator. An outbound-network guard blocks non-loopback connections; dependency metadata probes were blocked and no cloud service or production record was contacted by that harness.

```sh
CREDITS_JAVA_BIN=/path/to/java21/bin/java npm run test:credits:application
CREDITS_JAVA_BIN=/path/to/java21/bin/java npm run test:credits:browser
npm run credits:readiness
python3 scripts/monetization/measure-local-cpu.py --output /path/to/a/new-observation.json
```

The benchmark creates/removes synthetic scratch media locally and measures successful and injected-failure child processes with CPU/file-size/time bounds. It launches no GPU or cloud job. The original 59 tests and wallet were extended, not rebuilt.
