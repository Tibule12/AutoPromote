# Proposed USD4.99 Plus configuration — no activation

The [product draft](../../config/free-first-release/paypal-product.draft.json)
and [plan draft](../../config/free-first-release/paypal-plus-plan.draft.json) are
local JSON payloads. The plan specifies `CREATED`, one regular monthly cycle,
USD4.99, no trial, no setup fee and no automatic collection of arrears. Its
product ID is deliberately unresolved. No PayPal object was created or changed.

`node scripts/monetization/validate-plus-draft.cjs` validates the offline shape.
The PayPal API defaults/merchant capabilities still require a separately
authorized sandbox exercise; passing this validator is not merchant verification.
[PayPal Subscriptions API](https://developer.paypal.com/api/subscriptions/v1).

The migration order is:

1. Confirm merchant country, actual USD settlement/FX/payment fees and tax
   treatment. Do not change the USD4.99 proposal or silently add setup charges.
2. With specific authorization, create the sandbox product and inactive plan
   using idempotency request IDs; verify the returned status is `CREATED` and
   the terms exactly match the draft. If creation returns an active plan, stop
   and reconcile that state before enabling any purchase path.
3. Qualify approval-only/missing payment refusal, owner/custom-ID/plan binding,
   correct currency/period/amount, payment-pending retry, duplicate/reordered
   webhooks, renewal, cancellation through the paid period, suspension/expiry,
   refunds/reversals and failed collections. ACTIVE plus an old payment is not
   proof of a newly paid Plus billing period. No anonymous callback may grant
   Plus; the server reads current provider state.
4. Complete production adapters and meaningful Free operations before enabling
   checkout. Publish truthful allowance percentages, reset timestamps, rolling
   exhaustion and unfinished-job reservations. Keep local editing available.
5. Create and read back the matching inactive live product/plan only after its
   own approval. Configure the exact `PAYPAL_PLUS_PLAN_ID`, live webhook ID and
   return/cancel origin allowlist in the intended environment. Keep
   `PLUS_PURCHASES_ENABLED=false` and renewable activation off at this stage.
6. Inventory existing agreements and balances without rewriting them. Retain
   legacy IDs/prices/discounts/paid periods and verified administrative grants.
   Retire the old offerings from new purchases in the same reviewed release
   that enables the two-plan catalog; never revise or cancel existing agreements
   to force conversion. Purchased/promotional credits do not become tokens.
7. After the explicit activation decision and all release gates, activate the
   one approved live plan, read its exact active terms, then enable Plus checkout
   for the approved cohort. Verify a funded merchant payment/renewal and the
   increased authoritative usage allowance. This step is not executed by this
   preparation or by the infrastructure/payment-security deployment.

Rollback closes new checkout/admission and preserves active agreements, durable
settlement, event receipts, legacy balances and paid entitlements. Never reopen
unverified upgrade routes or reset outstanding liabilities to recover service.
