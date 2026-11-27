# Production migration and rollback proposal

No step below has been executed against production. Deployment, provider plan activation, live balances, cancellation and paid qualification need separate explicit approval.

1. Ship/review the payment-security fixes independently if desired. Archive the serving source/rules/version and customer agreement snapshots. Never restore the unverified `/usage/upgrade` handler on rollback.
2. Snapshot server-owned user/billing/subscription state and credit/transaction ledgers with restricted access. Reconcile existing agreements against provider reads. Produce dry-run classifications; quarantine ambiguous entitlements for review instead of deleting balances or cancelling agreements. Keep premium/basic/pro/enterprise PayPal plan mappings for renewals.
3. Validate invoices, current worker resource shapes, native workload percentiles, startup/minimum overhead, failed attempts, storage, egress, DB and external APIs. For every operation establish an enforced all-in ceiling before admitting it. Test no-retry/uncertain-dispatch behavior and authenticated worker outcomes.
4. Approve final USD pricing, paid period/reset policy, funded global caps and subscriber margin. Create one Plus PayPal plan only after approval; keep `PLUS_PURCHASES_ENABLED` false until verified USD amount and interval match the approved offer. New legacy purchases stay retired. Existing agreements are not automatically revised, upgraded, cancelled or repriced.
5. Inventory storage, configure aggregate limits and qualify every SDK/server upload reservation adapter. Enable the `processing_control/storage.enforceReservations` switch only after inventory and clients are ready. Retention applies only to approved new generated/temp assets. Existing originals/projects retain their original policy.
6. Provision new processing control with explicit budgets, initially disabled. Register reviewed private adapters with fixed shape, source/generation binding, enforced runtime, output/storage/network/API bounds, no uncontrolled fallback and durable receipt reconciliation. Global and per-user outstanding liability survives all resets.
7. Run an explicitly funded isolated cohort: account verification, enrollment caps, quote/consent, complete native output, ledger comparison, failed/expired/cancelled payments, overrun suspension, API restart, worker loss, duplicate delivery, rolled calendar and exhausted allowances. Verify continued local editing and project access. Require actual provider receipts for all six publishing destinations separately; do not publish test media to real accounts without approval.
8. Enable `FREE_FIRST_USAGE_ENABLED` for a controlled cohort only after parity between UI, policy and worker enforcement is established. This branch's global feature flag is an initial migration guard, not a production cohort-management service. Monitor cap rejection/concurrency and cost reconciliation before expansion.

## Rollback

Suspend *new* processing admission using `processing_control/global.enabled=false`; stop new Plus checkout without cancelling existing agreements. Preserve `processing_jobs`, events, original-cycle references and every outstanding reservation. Continue signed outcome reconciliation for running work; never release liability simply because a timeout or reset occurred. Keep original projects, outputs and purchased/promotional balances readable.

If reverting the renewable rollout to the legacy dispatcher, first stop new jobs and verify all outstanding runs/worker generations and settled costs. Disabling the opt-in flag while legacy dispatch remains active bypasses the new budgets; it is not a safe emergency suspension. Retain security fixes and retired purchase routes independently. Restore the reviewed compatible frontend/backend/rules versions together. Restore server snapshots only through a separately reviewed corrective migration; never overwrite live financial history wholesale.

## Decisions still required

- Final Plus price and USD merchant/provider fees, reset interval and numerical allowances.
- Explicit operating subsidy/global spend envelope, enrollment controls and funded cohort size.
- Bounded CPU/GPU routing and which meaningful workflows pass the Free envelope at full quality.
- Legacy paid entitlements and purchased/promotional capacity under the new cost ceiling, without an invented conversion rate.
- Storage baseline, capacity/retention/download limits and complete upload migration.
- Approval for any paid workload qualification, PayPal plan activation or production deployment.

## Expanded processing and operating-environment gates

See [the continuation migration](../free-first-optimization-20261126/MIGRATION.md) for dispatch bypasses, measured deadlines, delivery-cost ownership and whole-environment qualification. No production action is implied.
