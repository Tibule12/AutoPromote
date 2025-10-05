# AutoPromote

AutoPromote is a free, automated content promotion platform that helps creators distribute content across major platforms, drive traffic to monetized landing pages, and generate daily revenue. Phase 1 is built entirely with free and open‑source tools; premium features (VFX‑style enhancements, auto‑tune, realistic background replacement) will be phased in later as the platform scales.

## Vision

- Promote creator content for free across multiple platforms
- Route traffic to monetized landing pages you own (you keep 100% of AutoPromote revenue)
- Users retain 100% of any revenue they earn directly from external platforms (TikTok, YouTube, Instagram, etc.)

## MVP Features (Current Status)

- Auth & Profiles
	- [x] Firebase Auth with token verification and Firestore user provisioning (`src/authMiddleware.js`)
	- [ ] Profile defaults API (timezone, preferred windows, default platforms/frequency)

- Upload & Quality Check
	- [x] Upload API with schedule_hint support and safe URL handling (`src/contentRoutes.js`)
	- [x] Dry‑run preview to see derived schedule without saving
	- [x] FFmpeg‑based content quality check with auto‑enhance fallback (`src/contentQualityCheck.js`)

- Scheduling & Promotion
	- [x] Schedule derivation from `schedule_hint` or explicit time
	- [x] Firestore promotion schedules and simulated execution (`src/promotionService.js`)
	- [x] Admin endpoints for listing active promotions and managing schedules
	- [ ] Clean up naming and remove legacy artifacts in `promotionService`

- Monetized Landing Pages & Smart Links
	- [~] Cloud Functions exported: `generateMonetizedLandingPage`, `generateSmartLink` (`autopromote-functions/index.js`)
	- [~] Server marks intents on content (`landingPageRequestedAt`, `smartLinkRequestedAt`) to integrate generation

- Analytics & Optimization
	- [x] Basic content analytics and simulated platform breakdowns
	- [x] Optimization recommendations and platform timing suggestions (`src/optimizationService.js`)
	- [x] Shortlink-based variant attribution (auto-generated per post)
	- [x] Denormalized click counters (content + platform post)
	- [x] Wilson-scored variant ranking & champion selection
	- [x] Performance dashboards & per-content performance APIs

- Admin
	- [x] Admin routes mounted; moderation via status updates; active promotions listing
	- [ ] Minimal admin UI screens for approve/flag/boost/pause and global counters

- Notifications & Rewards
	- [ ] Notifications writer (Firestore collection + optional email)
	- [ ] Gamified rewards engine (badges, streaks, unlocks)

## Firebase Functions (Free Tier)

Located in `autopromote-functions/` and exported by `index.js`:

- Landing Page Generator: `generateMonetizedLandingPage`
- Smart Link Tracker: `generateSmartLink`, `smartLinkRedirect`
- Social Media Auto‑Promotion Engine: `autoPromoteContent`
- Revenue Attribution: `logMonetizationEvent`, `getRevenueSummary`
- Referral System: `addReferrerToContent`, `getReferralStats`
- Promotion Templates: create/list/attach
- Firestore triggers: create schedule on content create/approval

## Firestore Collections

- `users`: Profile data, roles, defaults
- `content`: Media metadata, quality scores, landingPageUrl, schedule_hint
- `promotion_schedules`, `promotion_executions`
- `analytics`: Views, clicks, CTR, conversions
- `revenue`: Earnings per content/user (via functions)
- `referrals`: Invite tracking and bonuses (via functions)
- `templates`: Captions, hashtags, thumbnails (via functions)
- `notifications` (planned), `rewards` (planned)

## Tech Stack

- Frontend: React (SPA served from `frontend/build`)
- Backend: Node.js + Express (`src/server.js`)
- Firebase: Firestore, Auth, Storage, Cloud Functions (free tier)
- Media: FFmpeg via `fluent-ffmpeg` for quality checks

## Legal & Compliance

- Privacy Policy: https://Tibule12.github.io/AutoPromote/docs/privacy.html
- Terms of Service: https://Tibule12.github.io/AutoPromote/docs/terms.html
- Data Deletion: https://Tibule12.github.io/AutoPromote/docs/data-deletion.html

### TikTok Developer Setup

Use these values in the TikTok Developer Console (App > Basic Info / OAuth):

- Official Website URL: https://Tibule12.github.io/AutoPromote
- Privacy Policy URL: https://Tibule12.github.io/AutoPromote/docs/privacy.html
- Terms of Service URL: https://Tibule12.github.io/AutoPromote/docs/terms.html
- Data Deletion URL: https://Tibule12.github.io/AutoPromote/docs/data-deletion.html
- Platform: Web
- Redirect URI: https://autopromote.onrender.com/api/tiktok/callback
- Scopes (initial): user.info.basic

Server env required (Render):

```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://autopromote.onrender.com/api/tiktok/callback
DASHBOARD_URL=https://Tibule12.github.io/AutoPromote
```

Test login flow:

1. Sign in to the dashboard, then visit: https://autopromote.onrender.com/api/tiktok/auth
2. Approve on TikTok, you’ll be redirected back to the dashboard with `?tiktok=connected`.
3. Tokens are stored at Firestore: `users/{uid}/connections/tiktok`.

Property verification (if requested):

- TikTok may provide one of two file names and token formats:
	1) `tiktok-verify.txt` with content like `tiktok-site-verification=xxxx`
	2) `tiktok-developers-site-verification.txt` with content like `tiktok-developers-site-verification=xxxx`
- If using GitHub Pages, place the file under: `docs/.well-known/` so it serves at:
	- `https://Tibule12.github.io/AutoPromote/.well-known/<file>`
- If using Render as your live domain, place the file under `public/.well-known/` (already mounted), so it serves at:
	- `https://<your-render-domain>/.well-known/<file>`
- Wait ~1–3 minutes after pushing, then click Verify in the TikTok console.

## Roadmap (near‑term)

## Key Analytics & Billing Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/metrics/dashboard/performance` | GET | Aggregate impressions, clicks, CTR, variant winners |
| `/api/metrics/content/:id/performance` | GET | Detailed variant performance & Wilson scores |
| `/api/metrics/content/:id/champion` | GET | Current champion variant + significance flag |
| `/api/metrics/usage/current` | GET | User monthly usage vs quota & overage |
| `/api/metrics/usage/summary` | GET | Aggregated ledger totals (tasks, subscription, overage) |
| `/api/metrics/variants/prune` | POST | Prunes underperforming variants |

## Backfill Script

Rebuild denormalized click counters from historical shortlink events:

```
node scripts/backfillClickCounters.js --dry   # preview
node scripts/backfillClickCounters.js         # apply
```

## Variant Ranking Method

Wilson lower bound (95% confidence) applied to CTR stabilizes rankings with low impressions.

Champion criteria:
- Minimum impressions threshold (default 30, override `?minImpressions=`)
- Champion lower bound strictly greater than runner-up lower bound OR large impression multiple.

## Overage Billing Flow

1. Enqueue checks plan quota.
2. Worker samples monthly tasks and computes overage.
3. Idempotent overage ledger insertion (ensures at most one record per excess task).

## Future Enhancements

- Daily rollup snapshots for long-range analytics
- Bayesian variant selection
- Stripe metered usage for overage events
- Websocket push for champion changes

## Payments Architecture (In-Review Mode)
While Stripe / PayPal accounts are still under review, the app exposes a unified status endpoint:

`GET /api/payments/status` -> `{ paymentsEnabled, payoutsEnabled, providers: { stripe:{...}, paypal:{...}, manual?:{...} } }`

Environment flags:
```
PAYMENTS_ENABLED=false      # master feature gate for subscription flows
PAYOUTS_ENABLED=false       # master gate for creator payouts
ALLOW_PAYMENTS_DEV_MOCK=false  # enable mock subscription/payout endpoints for local testing
ENABLE_MANUAL_PROVIDER=false   # adds a always-on dev provider
```

Dev mocks (when ALLOW_PAYMENTS_DEV_MOCK=true):
 - POST `/api/payments/dev/mock/subscription` { plan, amount }
 - POST `/api/payments/dev/mock/payout` { amount }

Provider abstraction lives under `src/services/payments/` (stripe, paypal placeholder, manual). This lets you finalize UI & balance logic before real credentials are active.

### Balance & Financial Endpoints (New)
 - `GET /api/payments/balance` (auth) provisional vs available (hold days) vs lifetime.
 - `GET /api/payments/plans` public plan catalog derived from env.
 - `GET /api/payments/admin/overview` (admin) 30-day revenue & payouts summary.
 - `POST /api/paypal/webhook` placeholder logging endpoint.
 - Reconciliation script: `node scripts/reconcilePayouts.js` marks stale processing payouts failed after `RECONCILE_PAYOUT_STALE_HOURS`.
 - Worker now periodically snapshots balances (probabilistic) to status docs.

Additional env:
```
ALLOW_LIVE_PAYMENTS=false
PAYOUT_HOLD_DAYS=7
STRIPE_PRICE_PRO=price_12345
STRIPE_PRICE_SCALE=price_67890
FREE_PLAN_QUOTA=50
PRO_PLAN_QUOTA=500
SCALE_PLAN_QUOTA=5000
RECONCILE_PAYOUT_STALE_HOURS=24
```

### Audit Logging & Request Tracing (New)

Each incoming request is assigned a `requestId` (middleware `requestContext`). Selected responses now include this ID so client errors can be correlated with backend events. Structured audit entries are written to `audit_logs` with compact payloads:

Events emitted:
- `stripe.onboard.started`, `stripe.account.status`, `stripe.login_link.created`
- `dev.subscription_fee.mocked`, `dev.payout.mocked`
- `balance.viewed`, `admin.overview.viewed`
- `overage.recorded`, `balance.snapshot`
- `payout.reconciled.failed`, `payout.reconciliation.summary`
- `server.error`

To inspect recent audit entries:
```
firestore collection: audit_logs (order by at desc)
```
Disable temporarily by wrapping calls or setting a guard in `auditLogger.js`.

### Simple Rate Limiting (Dev Convenience)

An in-memory limiter (`simpleRateLimit`) protects a few sensitive endpoints (values per process, reset on restart):

| Endpoint | Limit/hour |
|----------|-----------:|
| POST /api/stripe/onboard | 5 |
| POST /api/stripe/account/login-link | 10 |
| POST /api/payments/dev/mock/subscription | 10 |
| POST /api/payments/dev/mock/payout | 10 |

For production, replace with a shared store (Redis / Firestore counter). The middleware is isolated in `src/middlewares/simpleRateLimit.js` for easy swap.

## Daily Rollups (New)
Daily aggregated metrics are stored in `content_daily_metrics` documents with id format `<contentId>_<YYYYMMDD>` capturing:

- posts: number of platform posts sampled that day
- impressions: sum of sampled impressions
- clicks: total shortlink resolves attributed that day
- variants: per variant string breakdown `{ posts, impressions, clicks }`
- variantClicks: per variantIndex click counts from events

The background worker performs a rollup shortly after UTC midnight (probabilistically to avoid contention) or when `FORCE_DAILY_ROLLUP=true`.

## Variant Selection Strategies
 
Environment variable `VARIANT_SELECTION_STRATEGY` controls how the next variant is chosen when multiple message variants are present:

- `rotation` (default): round-robin by historical post count
- `bandit`: UCB1 multi-armed bandit using clicks/post as reward, with exploration bonus `sqrt((2 * ln(totalPosts)) / posts)`

Overrides:
- Per-content: set `variant_strategy` field on the content document (e.g. `rotation` or `bandit`).
- User default: POST `/api/profile/defaults` with `{"variantStrategy":"bandit"}`; applied automatically on upload if content lacks `variant_strategy`.

Set in `.env`:

```
VARIANT_SELECTION_STRATEGY=bandit
```

Untried variants are forced early by assigning them a very high sentinel score ensuring initial exploration.

## Firebase Credential Diagnostic
Run the script to verify service account detection and perform a lightweight Firestore read:

```
node scripts/checkFirebaseCredentials.js
```

Supports JSON path, raw JSON, base64 JSON, or individual FIREBASE_* key fields.

## Notifications API (MVP)

Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List recent notifications (default 50, `?limit=` up to 100) |
| POST | `/api/notifications/:id/read` | Mark a single notification read |
| POST | `/api/notifications/read-all` | Mark all unread (≤200) notifications as read |

Notification documents (`notifications` collection) store: `user_id`, `type`, `title`, `message`, `created_at`, `read`.

## Profile Defaults API

Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile/defaults` | Fetch the user's current defaults |
| POST | `/api/profile/defaults` | Merge provided defaults |

Accepted fields (all optional):
`timezone` (e.g. `UTC`), `preferredPlatforms` (string[]), `postingWindow` ({ start:"HH:MM", end:"HH:MM", timezone? }), `maxDailyUploads` (number), `variantStrategy` (e.g. `bandit` / `rotation`).

Upload Auto-Enrichment:
- If no `schedule_hint` sent and a `postingWindow.start` exists, server sets next occurrence as a one-off schedule hint.
- If `variantStrategy` stored and content upload lacks `variant_strategy`, it is applied to the content document.

Schedule Preview:
`POST /api/profile/preview-schedule` -> `{ schedule: { when, frequency, timezone } }` (derives next run using stored postingWindow without creating content).

### Variant Strategy Stats (Admin)
`GET /api/admin/variants/strategy-stats` -> distribution of `variant_strategy` values over latest 1000 content documents.

### User Defaults Caching
Server caches `user_defaults` per user for `USER_DEFAULTS_CACHE_TTL_MS` (default 30000 ms) to reduce Firestore reads on heavy upload bursts.



1) Wire landing page + smart link generation into upload/approval and save to content doc
2) Add notifications MVP (Firestore collection, optional email) ✅ basic API
3) Add user profile defaults API and use for better schedule_hint generation ✅ initial implementation
4) Minimal admin UI screens for moderation and analytics
5) Promotion service naming cleanup (remove legacy artifacts)

---

For admin details, see [README-ADMIN.md](README-ADMIN.md).
