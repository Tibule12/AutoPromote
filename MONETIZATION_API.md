# Monetization & Earnings API

All routes are prefixed with `/api/monetization` unless stated otherwise.
Authentication required unless explicitly noted; admin-only routes require admin claims/role.

## Summary Fields
- `pendingEarnings`: Amount accrued but not yet paid out.
- `totalEarnings`: Lifetime paid out amount.
- `minPayoutAmount`: Configured minimum required to trigger a self payout (`MIN_PAYOUT_AMOUNT`).
- `payoutEligible`: Boolean combining revenue eligibility + threshold check.

## Routes

### GET /earnings/summary
Returns the user earnings snapshot.
Response:
```
{
  ok: true,
  pendingEarnings: number,
  totalEarnings: number,
  revenueEligible: boolean,
  contentCount: number,
  minPayoutAmount: number,
  payoutEligible: boolean
}
```

### GET /earnings/payouts
List recent (max 25) payout records for the authenticated user.
```
{ ok: true, payouts: [ { id, amount, createdAt, status } ] }
```

### POST /earnings/payout/self
Initiates a self payout moving `pendingEarnings` to `totalEarnings` if:
- User is `revenueEligible`
- `pendingEarnings >= MIN_PAYOUT_AMOUNT`
Body: none
Response:
```
{ ok: true, amount }
```
Errors: `not_revenue_eligible`, `nothing_to_payout`, `below_min_payout`.

### POST /earnings/event (admin)
Record an earnings event.
Body:
```
{ userId: string, amount: number (>0), source: string, contentId?: string }
```
Response: `{ ok: true, id }`

### POST /earnings/aggregate (admin)
Aggregates up to 500 unprocessed events into user `pendingEarnings` (atomic increments). Marks events processed.
Response:
```
{ ok: true, processedEvents, usersUpdated }
```

## Admin Security Routes (Separate Prefix)
Prefixed with `/api/admin/security`.

### GET /plaintext-token-scan (admin)
Returns heuristic findings of possible plaintext tokens still stored.
```
{ ok: true, usersScanned, plaintextFindings: [ { userId, field, length } ], encryptionEnabled }
```

### POST /encrypt-migrate (admin)
Encrypts discovered plaintext token fields into `encrypted_<field>` when an encryption key is configured.
```
{ ok: true, usersProcessed, usersMigrated }
```

## Notifications
Payout completion triggers a `payout_completed` notification document (best-effort).

## Environment Variables
- `MIN_PAYOUT_AMOUNT` (number, default 0)
- `MIN_CONTENT_FOR_REVENUE` (content threshold for revenue eligibility, default 100)

## Future Suggestions
Add provider abstraction (PayPal) for real payouts.
- Sign earnings events with `createdBy` & `sourceRef`.
- Add webhooks & audit trail for payout status transitions.
- Scheduled aggregation job (background worker) for continual processing.

