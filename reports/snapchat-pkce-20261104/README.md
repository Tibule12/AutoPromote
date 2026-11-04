# Snapchat PKCE connection repair — 4 November 2026

The owner's Snapchat Network response confirms the rejection: `invalid_request`, **Missing PKCE parameters**. The previous redirect-allowlist repair removed AutoPromote's navigation block but did not repair this provider rejection.

The existing connection flow now generates an S256 challenge and retains its private verifier in a server-only, owner-bound request. The callback atomically consumes that request within ten minutes and submits the verifier with the authorization code. Expired, anonymous, legacy and replayed requests cannot exchange a code. A fresh Connect attempt is required after this release; existing connections are not migrated or deleted.

Both OAuth steps now use the same client. Login Kit uses the configured public client, its documented token endpoint and the scoped Kit profile endpoint, rather than another client's secret and an Ads profile request. Confidential Login Kit and Marketing remain separate configurations; Marketing retains its documented literal scope and confidential client. Mixed products fail closed. No silent scope fallback or anonymous state is accepted. Public preflight is explicitly diagnostic and cannot complete a connection.

References: [Snap's current Login Kit OAuth/PKCE contract](https://developers.snap.com/snap-kit/login-kit/overview), [Marketing authentication](https://developers.snap.com/marketing-api/Ads-API/authentication), [Snap's official profile implementation](https://raw.githubusercontent.com/Snapchat/passport-snapchat/master/src/strategy.ts).

The callback retains encrypted token storage, blocks credential-bearing redirects, invalidates stale local aggregate status, and uses a nonce-restricted completion script. The App refreshes authenticated Snapchat status after completion or returning to the tab. An isolated opener may require returning to/reloading the original tab. Login Kit appears as **Identity connected**; its tokens cannot be used by AutoPromote's Marketing/publishing handlers. Connecting an identity does not establish organic posting or Ads permissions.

## Validation

| Check | Result |
| --- | --- |
| New owned Firestore emulator PKCE/route suite | **27 passed**: challenge/verifier correspondence, consistent clients, atomic replay/concurrency, expiry, denial/failure preservation, encrypted storage, private Rules and Marketing compatibility. Provider responses are controlled fixtures. |
| Existing Snapchat backend suites | **10 passed**, five suites. |
| Connections, redirect security and email/session frontend suites | **34 passed**, five suites. |
| Existing authority/registration/financial-write isolation suite | **99 passed**. |
| Existing payment/subscription regressions | **20 passed**, four suites; external payment providers mocked. |
| Actual App | Production build and 47 public pages passed. Fresh Auth/Firestore emulators, normal signup/email action/sign-in, real prepare/callback/status routers and native Connections controls verified PKCE, encrypted owned storage, popup refresh and cold reload. Snapchat consent/token/profile responses were explicitly simulated. |
| Static checks | Changed-code lint, syntax, knowledge review/validation and whitespace passed. |

The first browser run exposed stale aggregate status after callback; this was corrected. A stricter opener-isolation run did not receive a popup message; its corrected run verified recovery by normally reloading the original tab, without another code exchange or connection attempt. Automatic original-tab recovery is not claimed for that isolated-opener observation. Private logs retain the initial failures and corrected evidence. The private harness's unrelated media-list request lacks a Storage facade; it is not a media/export regression qualification. [Normal browser summary](evidence/browser-summary.json), [isolated-opener reload](evidence/browser-isolation-summary.json), [checks/source preservation](evidence/validation.json).

Reproduce the provider-contract tests with Java 21+ and the cached Firestore emulator: `npm run test:snapchat:oauth`. This runner always owns a fresh loopback demo emulator and cannot seed a running/cloud database. The normal backend release gate now runs it before deployment. Browser credentials, OAuth verifiers and keys remain outside Git; retained summaries contain no credentials.

Firestore/Storage Rules, verified-email enforcement, administrator authority, billing/subscription source and balances retain the repaired main baseline. No provider settings, existing user records/connections, production credits, advertisements or paid workloads were changed during testing. Historical balance/session risks and the seven production test documents remain open and untouched.

The owner explicitly authorized pushing this Snapchat fix directly to `main`; normal production release workflows apply. This report does not certify Snapchat app review, registered redirect configuration, real account consent or publishing. If Snapchat rejects a fresh request for a different reason, inspect that provider error and the app's registered callback/review status. Do not change credentials or downgrade security checks speculatively. Any rollback must keep the existing security repair and use a scoped code revision; no Rules rollback or data correction is required.
