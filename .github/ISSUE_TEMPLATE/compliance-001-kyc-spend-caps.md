---
name: "Compliance: KYC & Spend Caps for Brand Accounts"
about: "Require brand verification and spend caps to reduce fraud risk and ensure accountability for purchases."
title: "[COMPLIANCE] KYC & Spend Caps for Brand Accounts"
labels: ["compliance","security","backend"]
assignees: ["eng-team","legal-team"]
---

## Summary

Require brand KYC (business verification, email domain check, or manual verification) for accounts making purchases above a threshold. Implement per-account and per-campaign spend caps and pre-authorization for large purchases.

## Implementation Notes

- Add `brand_accounts` fields: `{verified: boolean, verificationMeta: {...}, spendCapCents: number, dailyCapCents: number}`.
- Require verification for purchases above `BRAND_PURCHASE_KYC_THRESHOLD_CENTS` (configurable).
- Pre-authorize funds via payment provider for purchases > `PREAUTH_THRESHOLD_CENTS`.

## Acceptance Criteria

- [ ] Brand accounts accept verification flow and `brand_accounts.verified` set.
- [ ] Purchase APIs check `verified` and enforce `spendCap` and `dailyCap`.
- [ ] UI shows verification status and spending limits on brand dashboard.
- [ ] Unit/integration tests for enforcement and error responses.

## Tests

- Add unit tests for backend purchase gating.
- Add integration test for payment pre-auth flow (mocked gateway).

## Docs

- Update `docs/POLICY-MATRIX.md` and Billing docs with KYC & spend cap behavior.

## Rollout

- Feature flag `BRAND_KYC_ENFORCE=true` for staged rollout.

## Notes for Legal

- Legal to confirm acceptable verification level and threshold values.

---
