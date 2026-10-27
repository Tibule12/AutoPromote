> Historical foundation snapshot — 26 October 2026. Current security, account status, implementation and test evidence are in the [27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md). This file does not describe the current deployed security state or an approved commercial credit policy.

# Advertising economics and infrastructure exposure

The actual account's advertising revenue and per-operation invoices are unknown.
The implementation assumes **zero ad revenue** until there is a verified observation.
Credits represent processing capacity, not cash, and cannot be withdrawn or transferred.

## Verified unit prices and configured resources

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

## How to measure before approving a reward

Record operation ID, worker execution ID, resource shape, billed wall time, CPU/GPU
model, cold start, retries, output/retained bytes, download bytes, Firestore operations
and external API usage. Match to billing export SKUs, region, discounts and provider
invoices. Measure successful and failed work. Use a high percentile plus margin or
the enforced worst-case ceiling, not only the average successful render.

Until measured limits are available, keep GPU work outside the credit pilot. Retain
hard worker timeouts, low instance/task limits, bounded retries, lifecycle retention
and private dispatch. Existing live workers are not protected by this isolated demo's
budgets. A calendar reset must not erase outstanding work or already-incurred costs.

## Calculator and proposed pilot envelope

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

## Financial controls and their limits

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
