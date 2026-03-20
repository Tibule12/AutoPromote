# Billing Repair Report

Date: 2026-03-19

## Target User

- Email: `tmtshwelo21@gmail.com`
- UID: `bf04dPKELvVMivWoUyLsAVyw2sg2`

## Problem Found

- `users.subscriptionTier` was `premium`
- `user_billing.tier` was `pro`
- `users.subscriptionStatus` was missing
- `user_billing.status` was missing
- No expiry or next billing fields were present
- No `user_subscriptions` document existed
- Effective entitlement already resolved to `free`

## Repair Applied

- Normalized `users` to canonical free/cancelled state
- Normalized `user_billing` to canonical free/cancelled state
- Added a `subscription_events` repair audit record

## Root Cause Patched

- Admin upgrade route now writes a full canonical billing state across:
  - `users`
  - `user_billing`
  - `user_subscriptions`
  - `subscription_events`
- Manual usage upgrade route now also writes `user_subscriptions` and `expiresAt`

## Verification

- Target user effective tier after repair: `free`
- Canonical plan after repair: `Starter`
- Repo-wide stale paid-but-effectively-free scan result after repair: `0` users
