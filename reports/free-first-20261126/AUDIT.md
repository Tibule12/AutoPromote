# Existing subscription and security audit

The audit used the complete tracked source tree of the latest locally available main, including Firebase package source, frontend, worker configuration, payment routes/webhooks, Firestore/Storage rules and the existing unified-credit pilot. `entitlement-search.txt` retains the feature/plan search for review; generated bundles, fixtures and historical financial records are not rewritten as marketing.

| Surface | Finding before this branch | Change / remaining boundary |
| --- | --- | --- |
| `src/config/subscriptionPlans.js` | Starter 15 / Creator 150 / Studio 500 / Agency 2,000; paid-only `getPlanCapabilities()` | Public Free/Plus; shared tools; legacy resolution separate |
| `src/services/billingService.js` | Free single-platform/multicam/distribution restrictions; expired billing tier could remain paid | Six destinations; shared multicam/distribution; expiration checked; new Plus requires verified payment or server grant |
| `src/config/testerProgram.js` | Tester allowlist disabled creative features | Tools shared; original tester balance, expiry and non-renewing grant remain |
| `src/userRoutes.js`, `src/routes/userRoutes.js`, `src/creditSystem.js` | Duplicate profile projections; separate tester/top-up/monthly logic; default local unlimited editor credits | Legacy plan projection retained; new accounting is separate; unlimited local default removed; renewable dispatch never debits the old wallet |
| `src/mediaRoutes.js`, Studio/Director frontend | Plan gates and old pricing messages | Shared capability checks; existing experimental/founder/IAM gates remain readiness controls, not additional paid tiers |
| `src/middlewares/usageLimitMiddleware.js` | Client UA, E2E headers and token text bypassed checks; errors failed open | Those bypasses removed; failed checks return 503; paid status does not bypass caps |
| `src/middlewares/costControlMiddleware.js` | Free forced 720p/aggressive compression | Shared quality and supported per-file cap |
| `/api/usage/upgrade` | Authenticated placeholder wrote active paid state without verified payment | Permanent HTTP 410 after authentication; no entitlement writes |
| PayPal activation | Optional ownership, browser-requested plan fallback, APPROVED accepted; non-atomic writes and repeated grants | Configured remote plan, ownership, payment, expiry and atomic claim/event |
| PayPal webhook | Development HMAC/SHA256 path did not implement PayPal's live protocol; ad hoc activation; fire-and-forget cancellation | PayPal verification endpoint; re-read current state; shared transactional lifecycle and idempotent payment receipt |
| Rules | Canonical owner profile allowlist protects financial fields; broad admin rule could forge new accounting; obsolete `firestore-production.rules` allowed all authenticated writes | Token/claim collections deny client writes including admin clients; obsolete alternate replaced with canonical rules. No live rules deployed |
| Unified credits | Strong sandbox-only reservations, signed outcomes, source binding and economics foundation; monthly/ad-oriented policy | Reused validation, signatures, canonical worker, cost observer and demo harness. Sandbox restriction retained; no production use by removing its guard |
| Frontend pricing/landing/support | Four offers and paid creative-lock copy | Free/Plus only; old customer/admin transaction records remain historical |
| Worker dispatch | Multiple API, Cloud Run, model, 3D, publisher and external AI paths | Opt-in deny-before-dispatch guards at main API and key shared boundaries. Complete dispatcher coverage and production proof remain a rollout gate |
| Storage | Per-file/monthly controls; existing retention lifecycle; no aggregate measured account baseline | Atomic storage reservations and server metadata reconciliation; optional rule gate; complete upload adapter coverage pending |

## Production accessibility of the vulnerable usage module

The main server mounts `usageRoutes` under `/api/usage`; this is not an unmounted example. A bounded public GET to `https://api.autopromote.org/api/usage/pricing` on 26 November 2026 returned HTTP 200 and the four legacy tier IDs, retained in `live-public-pricing.json`. An OPTIONS probe to `/api/usage/upgrade` is retained separately. The public GET establishes that the usage router is accessible on production; it does not prove the deployed POST implementation's exact commit. No authenticated upgrade or entitlement mutation was attempted. The source exploit is reproduced locally with a test identity and fixed on the isolated branch. Production remains unchanged until a separately approved deployment.

## Purchased and promotional credits

No bulk migration or conversion runs. `users.credits`, tester grant/used/expiry, administrative grants, financial history, provider agreement IDs and existing legacy monthly allocations remain stored under their original systems. The new token ledger uses `processing_*` collections and has no customer-facing monetary balance. How legacy purchased capacity participates in the eventual production budget envelope needs explicit financial treatment; silently treating one purchased credit as one token would be wrong.

## Local-first inventory

The existing Studio timeline, transforms/keyframes, text/shapes/vector layers, browser canvas/WebGL previews, supported compositing, audio playback and motion authoring do not call the token ledger. Server source-frame reads, AI transcription, cloud renders, API planning, background/Blender/model processing, persistent storage and external downloads are separate resource-consuming operations. Existing browser export/backup paths are retained; support differs by project feature and browser. There is no claim that every native export is browser-local. Existing worker/WASM/WebCodecs/GPU experiments are not substituted for production code or preview/export parity.
