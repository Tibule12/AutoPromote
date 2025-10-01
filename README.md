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

1) Wire landing page + smart link generation into upload/approval and save to content doc
2) Add notifications MVP (Firestore collection, optional email)
3) Add user profile defaults API and use for better schedule_hint generation
4) Minimal admin UI screens for moderation and analytics
5) Promotion service naming cleanup (remove legacy artifacts)

---

For admin details, see [README-ADMIN.md](README-ADMIN.md).
