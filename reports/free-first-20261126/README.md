27 November release continuation: [actual independent production deployment and remaining Free/Plus gates](../free-first-release-20261127/README.md). Earlier no-deployment statements below describe their original sessions.

Current continuation: [real 60s workloads, cost reductions and the full operating-environment model](../free-first-optimization-20261126/README.md). The one-second proof below is historical; it is no longer the only workflow evidence. Prices/allowances remain provisional.

# Free-first implementation — isolated review branch

Branch: `feat/free-first-subscriptions-20261126`, based on locally available `origin/main` `d2d0d647d`. Worktree: `AutoPromote-free-first-20261126`. The open demo-studio worktree and its uncommitted deletion were not changed. No production deployment, PayPal plan activation, customer balance mutation, subscription cancellation or paid processing was performed.

This is a working local implementation with explicitly incomplete production qualification. It does **not** establish that every production creative workflow fits the proposed allowance or that all existing dispatchers can safely enter the new accounting model. Those conclusions require attributable costs and bounded production adapters.

## Delivered code and evidence

- Public Free/Plus catalog, two-card pricing interface, shared editing entitlements, six publishing destinations, no automatic quality degradation for Free, USD-only proposed pricing. Legacy IDs and credit allocations remain resolvable internally; new legacy purchases return HTTP 410. Plus checkout remains off unless explicitly configured.
- `src/services/processingTokens/`: transactional renewable allowances, exact reset anchors, configurable plan policies, rolling incurred-cost ceilings, global daily/monthly/free/API budgets, concurrency, one dispatch, idempotency, separate infrastructure expense and user consumption, emergency suspension, bounded storage reservation/reconciliation. Existing purchased/promotional/admin credit fields are never converted or written by this ledger.
- Opt-in HTTP and dispatcher guards; a real signed local-process adapter reuses the existing canonical renderer. Default production adapters are deliberately absent. Turning on `FREE_FIRST_USAGE_ENABLED` without validated adapters refuses cloud execution rather than silently spending outside the ledger.
- `/api/usage/upgrade` permanently retired; PayPal activation requires authenticated ownership, configured provider plan, ACTIVE agreement, actual USD payment and future paid period. Atomic agreement claims and payment events prevent replay. Provider-verified webhooks re-read current state; cancellation preserves the paid period; suspension/expiry revoke paid capacity.
- 91 unique test cases pass across the new accounting/security/emulator suite and focused backend, frontend and existing unified-credit regressions. The strict frontend build, generated Functions imports, source/knowledge checks and Studio record contract also pass. See [validation scope](VALIDATION.md).
- Actual signed-in Free App workflow: [browser checks](browser-evidence.json), [native 1080×1920 export](studio-free-output.mp4), [output hash/audio/full decode](studio-output-evidence.json), [complete finished playback](finished-playback.json) and actual headless recordings in `browser-recordings/`. Source upload, title editing, Undo/Redo, save and cold reopen leave the allowance at 100; the native export consumes 3 reference-cost tokens, leaving 97. The existing legacy wallet remains 20. This is a one-second synthetic technical workflow, not broad workflow affordability or creative approval.
- Actual local canonical CPU movie: [native-output.mp4](native-output.mp4), full decode and audio checks, signed worker outcome, allowance reconciliation and duplicate refusal in [native-render-evidence.json](native-render-evidence.json). Local wall/CPU/RSS are measured; infrastructure dollar deductions in that proof are reference estimates, with zero actual cloud expenditure.
- [Financial calculator inputs](../../config/free-first-economics.example.json), [30 scenarios JSON](financial-scenarios.json) and [CSV](financial-scenarios.csv). No advertising or investment in the baseline.
- [Fresh read-only infrastructure observations](infrastructure-observations.json), [15-operation cost inventory](operation-cost-inventory.json), [entitlement search](entitlement-search.txt), [audit](AUDIT.md), [migration and rollback](MIGRATION.md).

## Financial finding

The current media service is 4 vCPU / **8 GiB**, not the October 4-GiB shape. Current Cam Combiner GPU primary is 20 vCPU / 80 GiB with a 14,400-second timeout. At reference rates, that full timeout is **$12.747168 compute alone**; it is not a measured operation price and excludes startup, storage, network and APIs. The CPU fallback timeout is $2.4192 compute alone. Neither fits a 100-token Free window. The shorter native local CPU proof is meaningful for a bounded edit; it does not qualify arbitrary multicam, long-form, Blender or background processing.

Reduce cost first: reuse completed ingests, bound short CPU workflows with the same renderer, avoid repeated previews, reuse source assets at publication, measure cold starts and failures, use existing browser composition for editing, and qualify supported local exports before advertising them. WebCodecs, workers/WASM, WebGL and WebGPU remain opportunities; no experimental replacement renderer or reduced output quality was introduced.

Illustrative assumptions: $0.08 average Free infrastructure, $0.60 average Plus infrastructure, $0.55 maximum Free total including storage/network, $2.25 maximum Plus total, $150 fixed monthly, 4.4% + $0.30 assumed fee. These are **not merchant-verified or measured unit economics**. At 10,000 users, average break-even is about 2.40% conversion, maximum-exposure break-even about 20.39%. At one million users and zero conversion, the model needs $80,150/month average subsidy or $550,150 at modeled maximum exposure. Changing assumptions regenerates every result. The baseline is a 30-day model: a 31-day calendar month can admit one extra renewal window without violating the rolling ceiling. Separate `calendar31DayStress` results include that exposure; one million all-Free users reach $650,150 infrastructure at the illustrative maximum including fixed costs in that stress case.

## Local reproduction

Use Node 24, Java 21+ on PATH (or set `CREDITS_JAVA_BIN`), the cached Firestore emulator and repository dependencies:

```sh
npm run test:free-first
npm run free-first:economics
node scripts/free-first-cost-inventory.cjs
```

`FREE_FIRST_DEMO=true` with `scripts/monetization/application-demo.cjs` creates fresh owned Auth/Firestore/Storage emulators, a private build and real App routes. Its source credentials and browser state are kept in a private temporary directory, not committed. The demo cannot reach external providers and has no production billing writes. Bounded adapter tests reserve an estimate before dispatch and reconcile only signed terminal outcomes. Queued/uncertain responses retain reservations and concurrency until durable receipt reconciliation.

## Remaining qualification and approval boundaries

1. Obtain attributed billing exports/provider invoices and merchant-specific payment fees. Existing access to billingInfo returns 403; the project lists no BigQuery datasets. Bounded connected Drive searches found no matching AutoPromote billing exports. Telemetry is not an invoice and must not be divided by request count to invent a workload cost.
2. Qualify private production worker adapters, IAM denial of bypass dispatch, exact worker deadlines/resource shapes, restart/host-loss and GPU failover/retry liability. Default cloud guards refuse unbounded work during the migration.
3. Establish a trusted storage baseline, wire every SDK/server upload path to reservations, and approve retention for new generated media. The reservation rule switch stays off until this is complete. No existing project/original is deleted. Downloads/ongoing retention outside the new accounting remain financial exposure.
4. Extend the narrowly verified signed-in upload/edit/save/reopen/export to long-form/multicam/background/3D and all six actual provider publications. The local CPU and browser evidence have narrow scopes; connected destinations do not prove external publication.
5. Approve the final $4.99 USD price, allowances, storage/publishing capacities, funded pilot envelope and legacy contract treatment. No credit/token exchange rate is proposed. Only then create/activate a Plus PayPal plan and authorize a staged deployment separately.

No claim of broad Studio readiness, pixel parity, creative approval or production readiness is made. The existing shared S02/S04/S03 and historical typography limitations remain.
