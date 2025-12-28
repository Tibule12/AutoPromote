# Promoted Posts + Tipping (PayPal) Spec

This document outlines API endpoints, payloads, DB interactions and webhook flows for the Tipping MVP and Promoted Posts features (PayPal-based).

Overview
- Payments use PayPal Orders (intent=CAPTURE).
- Orders are created with internalId set to tipId or promotionId so webhooks and captures can be correlated.
- `payments` collection stores providerOrderId and status; `earnings_events` store credits; user pending balances tracked in `users.pendingBalanceCents`.

Collections
- `tips`, `promotions`, `payouts`, `payments`, `earnings_events` (see DB schema doc).

APIs

1) Tipping
- POST /api/tips/create-order
  - Auth required
  - Body: { recipientId, contentId, amount: number (dollars), currency? }
  - Creates `tips` doc (status: created) with id `tip_<uuid>` and returns { ok, tipId, orderId, approveLinks }

- POST /api/tips/capture-order/:orderId
  - Auth required
  - Calls PayPal capture, then atomically finalizes tip: compute feeCents (if PayPal break-down available use that), set tip.status='succeeded', write `earnings_event` (tip_received), increment `users.pendingBalanceCents`
  - Returns { ok, tipId, netCents }

- GET /api/tips/:id
  - Public, returns tip doc

2) Promotions
- POST /api/promotions/create
  - Auth required
  - Body: { contentId, budget: number (dollars), currency, startAt?, endAt? }
  - Creates promotions doc status: pending

- POST /api/promotions/pay/:promotionId
  - Auth required
  - Creates PayPal order for budget amount and returns { orderId, approveLinks }

- POST /api/promotions/capture/:orderId
  - Auth required
  - Capture order and mark promotion as active -> scheduler picks it up

Webhooks & Idempotency
- Use existing /api/paypal/webhook verification.
- On PAYMENT.CAPTURE.COMPLETED, look up `payments` doc by orderId and route to tip or promotion handlers based on internalId prefix.
- Ensure idempotency by checking target doc status.

Fees & payouts
- Record PayPal fee when provided in capture result. Otherwise apply fallback platform fee percentage.
- Net is credited to `users.pendingBalanceCents`.
- Payouts are scheduled and executed with `paypalPayoutService.executePayout` on `payouts` docs.
- Minimum payout threshold and retries recommended.

Testing & sandbox
- Add unit tests for tip creation, idempotent capture finalization, and net accounting.
- Use existing PayPal sandbox helpers and `test/paypal-webhook.test.js` for webhook simulations.

Security
- Client may create intent docs but must not set status to succeeded.
- All finalization actions are performed server-side by secure endpoints and webhook handlers.

Operational Notes
- Track metrics: tips_total_gross, tips_total_net, promotions_spend, payouts_processed, payout_failures
- Record all PayPal webhook events and persistence for audits.


