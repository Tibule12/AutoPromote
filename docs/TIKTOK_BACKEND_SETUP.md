# TikTok Backend Setup (AutoPromote)

This guide describes the backend configuration required for TikTok OAuth on the custom domain.

## Canonical domain
- Use a single canonical host for OAuth and cookies.
  - Recommended: https://www.autopromote.org
- Optional (recommended) server settings:
  - ENFORCE_CANONICAL_HOST=true
  - CANONICAL_HOST=www.autopromote.org

## Required environment variables
Set these in your backend environment (Render, etc.):

- TIKTOK_ENV=sandbox or production
- TIKTOK_SANDBOX_CLIENT_KEY=... (for sandbox)
- TIKTOK_SANDBOX_CLIENT_SECRET=...
- TIKTOK_SANDBOX_REDIRECT_URI=https://www.autopromote.org/api/tiktok/callback
- TIKTOK_PROD_CLIENT_KEY=... (for production)
- TIKTOK_PROD_CLIENT_SECRET=...
- TIKTOK_PROD_REDIRECT_URI=https://www.autopromote.org/api/tiktok/callback
- DASHBOARD_URL=https://www.autopromote.org (optional; used for postMessage origin and redirects)

Optional (for demo/testing):
- TIKTOK_USE_MOCK=true (forces using /mock/tiktok_oauth_frontend.html for the authorize step)
- DEBUG_TIKTOK_OAUTH=true (verbose logging)
- TIKTOK_DEBUG_ALLOW=true (exposes debug endpoints)
- TIKTOK_VERIFICATION_TOKEN=... (serves /tiktok{TOKEN}.txt if static file missing)

## Routes overview
- OAuth start (prepare):
  - POST/GET /api/tiktok/auth/prepare (returns TikTok authorize URL)
- OAuth callback:
  - GET /api/tiktok/callback (exchanges code → token, stores under users/{uid}/connections/tiktok)
- Connection status:
  - GET /api/tiktok/status (requires Authorization)
- Video upload (server-to-server, requires tokens):
  - POST /api/tiktok/upload
- Analytics fetch:
  - GET /api/tiktok/analytics
- Mock OAuth page (for demo if sandbox domain is blocked):
  - GET /mock/tiktok_oauth_frontend.html

## TikTok Developer Portal settings
- Website URL: https://www.autopromote.org
- Redirect URI(s): https://www.autopromote.org/api/tiktok/callback
  - TikTok requires exact match; add both if you use multiple variants.

## Validation checklist
- [ ] /tiktok-demo renders at https://www.autopromote.org/tiktok-demo
- [ ] /mock/tiktok_oauth_frontend.html opens and can auto-simulate with `auto=1`
- [ ] /api/tiktok/status returns `{ ok: true, ... }` once env vars are set
- [ ] CORS allows https://www.autopromote.org (legacy onrender domains optional during transition)
- [ ] Canonical host redirect enabled (optional) and points to www.autopromote.org

## Notes
- Keep legacy Render domains in CORS only if you still have clients hitting them during migration; you can remove later.
- The backend already mounts TikTok routes at /api/tiktok and serves verification tokens from /.well-known or env.
