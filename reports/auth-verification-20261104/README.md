# Mandatory email verification and automatic return — 4 November 2026

Branch `fix/auth-verification-domain-20261104`, based on deployed `2b8ff6a4`.

The production Firebase Auth configuration was inspected through Google's API. It authorized `autopromote.org` but omitted `www.autopromote.org`; the backend's local configuration used the latter. At 09:43 SAST, only `www.autopromote.org` was appended. A before/after comparison confirmed every other Auth setting unchanged. No account, claim, session, balance or subscription was modified, and no production email was sent by this investigation. The screenshot's separate Firebase throttling is real; no exact provider reset time is promised.

## Changes

- Canonicalize AutoPromote verification return links to `https://autopromote.org`. If Firebase rejects an optional continue URL, request its signed hosted verification action without that optional URL, once. Other errors, including throttling, are never retried automatically.
- Resend tries the existing branded server delivery first. Firebase fallback requires the matching authenticated owner; backend rate limits do not trigger a fallback. Show plain-language errors and a resend cooldown.
- Remove **I verified — go to sign in**. Keep the signed-in but unverified account on a blocking verification screen across reloads. On focus/return or a visible-tab 15-second check, reload Firebase identity and refresh its token. Restore the normal backend session only after actual verification. Account changes/logout cannot resurrect an old session.
- Make login verification mandatory; remove the legacy environment and grandfather bypass. Require the signed `email_verified` claim for protected API access, including admin identity verification. Add the same requirement to private Firestore/Storage access while preserving owner restrictions, reviewed administrator UIDs and protected financial fields. Existing public assets remain public.
- Ignore `CORS_ALLOW_ALL` on hosted/production runtimes; retain the canonical site and explicit origin allowlist.

Automatic restoration requires the original browser's retained Firebase session. An email action link is not a login credential for another browser/device. Existing terms acceptance and MFA remain required. Previously unverified accounts, including administrators, must now verify; balances, historical projects and subscriptions are retained. Background publishing through Admin SDK/IAM remains independent of client Rules.

## Verification

- **98** real Firestore-emulator profile/authority/registration/packaging checks passed.
- **11** coordinated Firestore/Storage checks passed, including denied unverified reads, writes and media deletion; verified owner access retained.
- **53** existing payment/subscription/scheduling/upload/Studio billing checks passed; provider boundaries mocked.
- **15** link/mandatory-claim unit checks, **3** CORS tests, **12** frontend flow tests and **4** guarded Rules-publisher tests passed.
- Actual production-optimized React build and all **47** public entry pages built in separate scratch storage. A headless muted browser used real Auth/Firestore emulators and the real registration/login/profile/content routers: signup → locked screen → reload still locked → genuine emulator email action → automatic session → reload still signed in. Desktop 1280 and mobile 390 were captured. No session injection, fake completion flag, production requests, paid workloads or external emails. Delivery itself was captured locally, not tested against a customer's inbox.
- Native rendering, production billing/payment configuration and trusted-admin policy are unchanged. Historical balance/session and seven-document incident follow-up remain open.

Private evidence (including action links, credentials for the demo and logs) stays outside Git in `/tmp/autopromote-auth-verification-20261104`. The aggregate browser summary is safe to share; native projects/media and other active local builds were preserved. Earlier harness setup failures were corrected before the successful browser run; they are not application test passes.

## Release

The domain allowlist correction is live. Application changes and the stricter Rules must pass PR checks before the normal production release. Publish Rules only after both API origins report the exact merged revision and existing `security-owner-bootstrap-20261027` policy. The guarded publisher pins the inspected, already repaired Rules releases and verifies exact source hashes; it stops if another operator changes them. No user-data migration or session revocation is required. Do not roll back to historically vulnerable Rules or introduce an unverified-login bypass.

[Google verification-link documentation](https://firebase.google.com/docs/auth/admin/email-action-links) documents the optional action settings; [authorized-domain requirements](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions) apply to continue URLs.
