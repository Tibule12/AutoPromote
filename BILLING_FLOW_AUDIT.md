# Billing Flow Audit

## Where Users Are Billed Today

AutoPromote currently bills subscription users through the PayPal subscription flow.

### Frontend entry points

- `frontend/src/Pricing.js`
- `frontend/src/components/PayPalSubscriptionPanel.js`
- `frontend/src/UserDashboardTabs/ProfilePanel.js` via the billing button

### Backend billing endpoints

- `GET /api/paypal-subscriptions/plans`
- `POST /api/paypal-subscriptions/create-subscription`
- `POST /api/paypal-subscriptions/activate`
- `POST /api/paypal-subscriptions/cancel`
- `GET /api/paypal-subscriptions/status`
- `GET /api/paypal-subscriptions/usage`

### Billing flow

1. The UI loads plans from `/api/paypal-subscriptions/plans`.
2. A signed-in user clicks upgrade in `PayPalSubscriptionPanel`.
3. The frontend calls `/api/paypal-subscriptions/create-subscription`.
4. The backend creates a PayPal subscription intent and stores it in `subscription_intents`.
5. The user approves the subscription in PayPal.
6. The frontend returns with a success parameter and calls `/api/paypal-subscriptions/activate`.
7. The backend verifies the PayPal subscription status, updates the user record, creates a `user_subscriptions` record, and logs a `subscription_events` entry.

## What Users Are Actually Paying For

The strongest value exchange is not generic automation.

Users are paying for:

- More monthly upload capacity
- More connected publishing destinations
- Better analytics visibility
- Higher operational throughput for repeat publishing
- Better support for teams or power users

## Current Weaknesses

- Older reward and community language still leaks into plan metadata and parts of the UI.
- The subscription UI previously implied PayFast support even though this plan flow is PayPal-driven.
- The value story was under-explained compared with the actual workflow benefits.

## Recommended Enhancements

### Immediate

- Keep plan naming consistent across main and mirrored backends.
- Explain that subscription upgrades pay for publishing scale and workflow visibility.
- Keep the billing footer explicit about monthly auto-renewal and end-of-period cancellation.

### Next

- Add a plan comparison row for "best for" user types.
- Show connected-platform limits and upload usage more prominently in the dashboard.
- Add a small billing FAQ covering activation, cancellation timing, and refund handling.

### Later

- Unify any non-subscription payment providers under a separate billing surface instead of mixing them into subscription messaging.
- Add a billing events timeline in the user dashboard.
