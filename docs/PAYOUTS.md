# PayPal Payouts

This document explains how PayPal payouts are processed and how to enable them.

Requirements
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` set in environment
- `PAYOUTS_ENABLED=true` to enable live processing (otherwise scripts run in dry-run)
- Firebase Admin credentials available to run scripts (e.g. `GOOGLE_APPLICATION_CREDENTIALS`)

User setup
- Creators must set their `paypalEmail` in their profile (via `PUT /api/users/me` or `PUT /api/users/profile`) before requesting a payout.


How payouts work
- Creators earn rewards which accumulate in `users.pendingEarnings` and `earnings_events`.
- Creators call `POST /api/monetization/earnings/payout/self` to request a payout. This creates a `payouts` document with status `pending`.
- The operator runs the payout processor which calls PayPal Payouts API and marks payouts as `completed` or `failed`.

Scheduled processing
- You can enable scheduled automatic processing of pending payouts by setting:
	- `ENABLE_BACKGROUND_JOBS=true`
	- `PAYOUTS_ENABLED=true`
	- `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` for production or sandbox credentials.
	- Optionally tune frequency with `PAYOUTS_PROCESS_INTERVAL_MS` (defaults to 3600000ms = 1 hour).

The background worker is leader-elected and will only be active on a single instance to avoid duplicates.

Scripts
- Manual: `node scripts/process-pending-payouts.js` (reads pending payouts and attempts to send them)
 - Manual: `node scripts/process-pending-payouts.js` (reads pending payouts and attempts to send them)
 - Background: Enable `ENABLE_BACKGROUND_JOBS=true` plus `PAYOUTS_ENABLED=true` to activate automatic processing.
Admin operations
- List pending payouts: `GET /api/monetization/admin/payouts?status=pending&limit=50` (admin only)
- Get payout details: `GET /api/monetization/admin/payouts/:id` (admin only)
- Trigger manual processing (admin): `POST /api/monetization/admin/payouts/process` with optional `{ limit }`

Testing
- Use PayPal sandbox credentials and set `PAYOUTS_ENABLED=true` to process real sandbox payouts.

KYC / Fraud configuration
- To require identity verification for large withdrawals, set `REQUIRE_KYC_FOR_PAYOUTS=true` and adjust `PAYOUTS_KYC_THRESHOLD` to the dollar amount (default `500`).
