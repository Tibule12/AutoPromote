# Billing and processing architecture

The isolated Free-first implementation exposes **AutoPromote Free** and **AutoPromote Plus** only. Both share existing creative tools and all six publishing destinations, subject to platform/readiness requirements. Subscription prices are USD. Plus at $4.99/month and all numerical allowances are provisional; checkout is disabled unless `PLUS_PURCHASES_ENABLED=true` and an approved `PAYPAL_PLUS_PLAN_ID` is configured. This document describes branch implementation, not a completed production rollout.

`src/config/subscriptionPlans.js` is the public catalog. `LEGACY_SUBSCRIPTION_PLANS` and `ALL_SUBSCRIPTION_PLANS` retain historical IDs, prices and monthly credit allocations for existing contracts. They must not be returned as new offers. Do not alter provider agreements to match a catalog edit.

## Separate accounts

- Existing purchased credits, tester credits, grants and their original terms remain in the legacy systems. No migration, deletion or token conversion is performed.
- Renewable `processing_*` accounting uses **1 token = $0.001 budgeted infrastructure expenditure**. It is an internal resource unit, not money or a purchased-credit exchange rate.
- Proposed Free: 100 every 144 hours, at most 500 tokens of modeled expenditure per exact rolling 30 days. Proposed Plus: 500 every 24 hours, at most 2,000 rolling tokens. Service plan policy is configurable; shared features do not depend on tier.
- Resource reservations and actual incurred expense are separate. Failed jobs may restore user allowance but retain incurred expense. Old-cycle refunds never increase a new allowance. Uncertain worker completion retains reservation/concurrency until signed evidence.

## Authority and dispatch

The server owns plans, balances, quotes and reservations. Firestore transactions serialize concurrent spends and duplicate requests. Native routes reuse a single asynchronous processing context; legacy credit calls within it defer settlement and never debit the purchased wallet. `processingBudgetMiddleware` and guarded worker/Cloud Run/model/3D/publisher/OpenAI boundaries are opt-in with `FREE_FIRST_USAGE_ENABLED=true`. Production adapters are not yet qualified; unbounded operations refuse admission. Supported browser-local edits require no cloud tokens.

The signed local-process adapter reuses `unifiedCredits/workerVerification`, its source-gateway and the existing canonical renderer. The old pilot retains its sandbox guard; it is not made production-safe by deleting that guard. Production requires private worker IAM, enforced upper bounds and durable receipt recovery.

Global daily/monthly/free/API budgets, outstanding liability, user rolling costs and concurrency are application-level controls. They are not a hard cap on the company's entire cloud bill: legacy jobs, downloads, ongoing storage and inaccurate estimates remain outside proven coverage. Storage reservation/reconciliation exists behind a separate rule switch pending trusted inventory and full upload-adapter integration.

## Payments

`/api/usage/upgrade` returns 410 and never grants entitlements. PayPal activation derives plan from configured remote plan IDs, requires authenticated ownership, ACTIVE state, verified USD payment and a future paid period. Atomic claim/payment events reject cross-account replay. Webhooks use PayPal's verification API, then re-read the current agreement. Cancellation retains paid-through access; suspension/expiry remove paid capacity. Administrative grants must be explicitly server-authorized.

No subscription change, customer balance write or provider plan activation has occurred during implementation. The [audit and evidence](reports/free-first-20261126/README.md) and [migration/rollback proposal](reports/free-first-20261126/MIGRATION.md) define the remaining launch gates.
