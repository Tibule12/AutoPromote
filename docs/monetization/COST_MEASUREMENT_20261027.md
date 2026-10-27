# Operation costs — evidence and measurement procedure

27 October 2026. The [current observation](evidence/20261027/cost-observations.json) is infrastructure telemetry, not a finalised invoice or per-operation cost. No paid job, generation, upload, publishing task or billing configuration was started to produce it.

## What is known

Seven days of `media-worker-v1` monitoring returned 285.962491 billable instance seconds, 2,028.012782 allocated CPU-seconds, 1,037.2 allocated GiB-seconds and 16 requests. Main-bucket retained bytes were about 7.83 GiB at the latest daily observation. These totals cannot be divided by request count to price a render: executions, startup, other routes and request outcomes are not correlated. Cam Combiner may share infrastructure but remains excluded from this rollout.

The selected video GPU job returned no time series in that window. Other GPU jobs/windows remain outside that observation. Resource metadata confirms RTX PRO 6000 jobs and their limits, not actual spend. A CPU speech engine is configured; that does not establish actual per-request model/API usage.

Reference prices are available for [Cloud Run](https://cloud.google.com/run/pricing), [Storage](https://cloud.google.com/storage/pricing), [Firestore](https://firebase.google.com/docs/firestore/pricing) and [Cloud Tasks](https://cloud.google.com/tasks/pricing). Region, SKU, free tier, discounts, minimum/startup billing, transfer destination and failure/retry costs matter. Rates must not be reported as measured operation invoices. Current reference CPU/GPU scenarios are in the [continuation report](../../MONETIZATION_CONTINUATION_20261027.md).

## Evidence/access still needed

- Billing account/project identity and an existing billing export dataset/table, even if it lives in another project; alternatively an owner-exported itemised invoice/usage report. This project's dataset listing returned none.
- Cloud Billing metadata returned 403 `SERVICE_DISABLED`. A billing owner can provide the export offline or separately approve the required API/access setup. This work did not enable an API, create an export, run a BigQuery query job or change IAM.
- Existing per-operation/job execution records joined to billed wall time, startup, resource shape, attempts, terminal outcome and region/SKUs. Use pseudonymous IDs for review; no customer media or arbitrary project text is needed.
- Retained/output byte-time, storage operations and download/egress bytes, including failed work and cleanup lag; Firestore/Tasks operations and external AI/publishing provider invoices/fees. An explicit zero is justified only by reviewed evidence that the component does not apply.
- A named nonproduction project and separate approval before any paid measurement run. Current authorization covers read-only research and local tests, not starting cloud jobs or paid generations.

If existing logs cannot provide correlation, prepare a separately reviewed instrumentation release. Record operation ID, worker execution ID, immutable source hash/generation, billable lifetime, CPU/GPU model, retry/failure, output/retention and provider usage. Do not log prompts, secrets, tokens or personal media. Review storage retention and provider usage visibility before enabling collection.

## Calculator input and limits

`config/unified-credits.costs.pending.json` intentionally contains **no samples**. `npm run credits:readiness /path/to/reviewed-cost-input.json` can evaluate a supplied file without applying it. Its structure is:

```json
{
  "microsPerCredit": 1000,
  "marginBps": 3000,
  "enforcedCeilingMicros": {},
  "samples": []
}
```

The liability and margin above are unapproved calculator examples. Each actual sample requires `operation`, globally unique `operationId`, `outcome` (`succeeded`/`failed`), `evidenceType` (`billing_export`/`provider_invoice`) and a `costMicros` object containing **every** key: `cpu`, `gpu`, `storage`, `egress`, `ai`, `publishing`, `firestore`, `tasks`, `overhead`. Values are nonnegative safe integers in USD microdollars. All invoices contributing to an operation must be reconciled into that one sample rather than duplicated as independent executions. The calculator checks structure and arithmetic; it cannot authenticate a claimed invoice label.

Only these operation names are supported: `queue.dispatch`, `publisher.publish`, `studio.render`, `clips.analyze`, `clips.render`. Sample collection must span bounded workload classes, successes, failures, cold starts and retries. Do not mix unbounded workloads into a flat price. A sample percentile alone is not a hard budget.

For each class, review p95 with margin and an enforced ceiling at least as large as the maximum observed complete cost. The calculator leaves `recommendedCredits` null until a ceiling is supplied and always leaves `commerciallyApproved` false. A supplied ceiling is an assertion needing worker/IAM/runtime proof, not an automatic safety guarantee. Resource-cost estimates must include every downstream stage before reserving.

## Commercial decision

Preserve subscriber prices/benefits. Keep new live rewards disabled; the demo's grants/reward/cap are test inputs. Reconcile observed final ad revenue separately, retain a reserve and enforce a globally funded subsidy/issuance envelope. Do not assume an ad finances a GPU render or treat estimated revenue as cash received. Account-level monthly caps cannot by themselves stop account farming.

Before approving numerical allowances, model subscription margin, the full-use free cohort, fraud, failure costs and funding runway against measured ceilings. Retain per-user/global admission limits, private workers and low runtime/concurrency/retry limits. The application budgets protect only paths actually using them; they do not cap the company's entire cloud bill.

## Repeatable read-only observation

The existing Cloud credential is used only in memory; never use the revoked Firebase CLI grant or paste credentials into arguments/reports. Raw service metadata can contain sensitive environment values, so the script creates a new private directory and exports a separate allowlisted summary.

```sh
python3 scripts/monetization/observe-costs.py \
  --project autopromote-cc6d3 \
  --output /path/to/a/new/private/evidence-directory
```

The observer uses bounded GET requests only. Review `summary.json` before sharing; keep raw JSON outside the repository. It does not read customer documents, invoke media workers, enable exports/services or mutate provider accounts. A missing or truncated metric must remain explicitly incomplete.
