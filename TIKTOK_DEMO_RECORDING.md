# TikTok Sandbox / Demo Recording Guide

Goal: Produce a demo video for the TikTok Developer App Review showing the end-to-end flow for connecting a TikTok account and uploading content. The app supports two modes:

- Sandbox mode (real sandbox endpoints + sandbox credentials)
- Demo mode (simulated upload response; useful while video.upload/video.publish scopes are not approved)

Use demo mode if production scopes are not yet approved — it returns a deterministic success response that is safe to record for review.

Quick checklist (what to set):

- `TIKTOK_ENV=sandbox` or leave to auto-detect sandbox if production credentials missing
- `TIKTOK_SANDBOX_CLIENT_KEY` and `TIKTOK_SANDBOX_CLIENT_SECRET` and `TIKTOK_SANDBOX_REDIRECT_URI` on your backend (or use legacy `TIKTOK_CLIENT_KEY/SECRET`)
- `TIKTOK_DEMO_MODE=true` (on local or Render) to simulate upload responses
- Ensure Terms/Privacy pages are visible from homepage for reviewer (already updated in repo)

Important endpoints (backend):

- Construct-only public preflight (no secrets, useful to show in reviewer notes):
  GET /api/tiktok/auth/preflight/public

- Prepare (authenticated - frontend uses this):
  POST /api/tiktok/auth/prepare (returns `{ authUrl }`)

- OAuth click-to-continue page (for UI flow):
  GET /api/tiktok/auth

- Demo upload endpoint (simulated when `TIKTOK_DEMO_MODE=true`):
  POST /api/tiktok/upload -> returns a demo success JSON

Demo recording recommended steps

1. Deploy/Run backend with demo config
   - Locally: add these to your env (PowerShell example):

```powershell
$env:TIKTOK_ENV = 'sandbox'
$env:TIKTOK_SANDBOX_CLIENT_KEY = '<your-sandbox-client-key>'
$env:TIKTOK_SANDBOX_CLIENT_SECRET = '<your-sandbox-client-secret>'
$env:TIKTOK_SANDBOX_REDIRECT_URI = 'https://your-redirect.example.com/api/tiktok/auth/callback'
$env:TIKTOK_DEMO_MODE = 'true'
npm run start
```

- On Render/staging: set `TIKTOK_ENV=sandbox` and `TIKTOK_DEMO_MODE=true`; also set sandbox client key/secret and redirect URI.

2. Optional: show `GET /api/tiktok/auth/preflight/public` in browser to demonstrate constructed auth URL (no secrets returned).

3. Demonstrate connecting account from the dashboard:
   - Login to the app (show Firebase authenticated user on-screen).
   - Open the TikTok connect flow in the dashboard; click the Connect button so the backend renders the click-to-continue page and the reviewer sees the OAuth interaction (sandbox domain or mock page).

4. Complete OAuth (you may use a sandbox test account). The page will redirect to the callback which stores connection tokens under `users/{uid}/connections/tiktok` in Firestore (demo flow will still allow UX to continue).

5. Demonstrate uploading content
   - In the dashboard use the content upload UI and select a sample MP4 (or use the demo script below to POST to `/api/tiktok/upload`).
   - With `TIKTOK_DEMO_MODE=true` the server will return a demo success JSON with `shareUrl` and `videoId`. Capture this response in your recording.

6. Capture additional artifacts for review
   - HAR of the OAuth flow and upload request (if permitted).
   - Screenshots showing the Terms/Privacy links visible on the homepage.
   - A short voiceover or text box explaining that the upload was simulated (if scopes are not yet approved) and that the endpoint will perform a real upload once `video.upload` and `video.publish` scopes are granted.

What to include in the video (concise):

- Login (Firebase) -> Connect TikTok -> Click Continue on provider page -> Approve access -> Return to app
- Select or prepare content -> Click Upload -> Show server response (demo success JSON with shareUrl)
- Show Terms/Privacy from the homepage (visible) and support contact `thulani@autopromote.org`

When to use real sandbox uploads vs demo mode

- If you have `video.upload` and `video.publish` approved in Sandbox and valid sandbox client credentials, you can disable `TIKTOK_DEMO_MODE` and perform real uploads to the TikTok sandbox API. Otherwise, use `TIKTOK_DEMO_MODE=true` for the recording.

Troubleshooting

- If OAuth fails with `tiktok_config_missing`, confirm `TIKTOK_SANDBOX_CLIENT_KEY` and `TIKTOK_SANDBOX_REDIRECT_URI` are set and redirect URIs in the TikTok Developer Portal match.
- Use `/api/tiktok/config` (if available) or `/api/diagnostics/env` to confirm env presence on a deployed instance.

---

Below is a tiny PowerShell helper to POST to the demo upload endpoint and print the JSON response. Save it as `tools/tiktok_demo_upload.ps1` and run from PowerShell.
