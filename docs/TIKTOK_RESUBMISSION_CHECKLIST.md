TikTok Resubmission Checklist for AutoPromote

Purpose
This checklist helps you record a sandbox demo and resubmit your TikTok production review with a clear video and supporting evidence.

Before recording

1. Verify environment and deploy
- Confirm Render deployment is using the latest commit from `main`.
- Confirm Render environment variable `TIKTOK_SANDBOX_CLIENT_KEY` is set.
- Visit: https://www.autopromote.org/tiktok-demo and verify the "Sandbox Client ID" shows your client ID. If it shows "NOT SET", re-check the env var name and redeploy.

2. Verify app settings in TikTok Developer Portal
- App mode: Sandbox (for demo)
- Website URL: https://www.autopromote.org
- Redirect URI(s): https://www.autopromote.org/api/tiktok/callback (and any variations you use)
- Scopes enabled: user.info.profile, video.upload, video.publish, video.data (only include scopes demonstrated in the video)

3. Mock backend (optional, for local recording)
- If you want to simulate a token exchange or share responses locally, run the mock backend:
  - node src/mock/tiktok_share_backend.js
- For the local OAuth helper, open:
  - src/mock/tiktok_oauth_frontend.html

Recording the video (2-4 minutes recommended)

Follow the timestamps exactly, showing each step clearly. Narrate or annotate when helpful.

0:00-0:08 — Title card
- Show a short title: "AutoPromote — TikTok Production Review (Sandbox demo)"

0:08-0:18 — TikTok Developer Portal
- Show the app page in the TikTok Developer portal; highlight that it is in Sandbox mode and show the app name.

0:18-0:28 — Website URL & Redirect URIs
- Show the App settings screen that contains Website URL and Redirect URIs configured to https://www.autopromote.org.

0:28-0:45 — Privacy & Terms pages
- Open https://www.autopromote.org/privacy and /terms pages to show the content and that they exist on the same domain.

0:45-1:10 — Start OAuth flow on AutoPromote site
- Navigate to https://www.autopromote.org and click "Sign in with TikTok".
- If using the mock frontend, paste the generated authorize URL into the browser to display the consent screen.

1:10-1:30 — TikTok consent screen
- Show the TikTok consent UI with the requested scopes visible (user.info.profile, video.upload, video.publish, video.data).
- Highlight the scopes in the screen recording.

1:30-1:45 — Accept consent and capture auth code
- Accept the consent. Show the redirect back to https://www.autopromote.org/api/tiktok/callback and the auth code visible in the URL (or show the application logging receiving the code).

1:45-2:10 — Exchange code for token and read profile
- Show the server or network request exchanging code for token (sandbox exchange). If using the mock backend, show the mock response.
- Show the app calling user profile endpoint and display returned profile data.

2:10-2:40 — Upload sandbox video
- Use the app to upload or create a sandbox video.
- Show the request/response to the sandbox endpoint and the returned sandbox video id.

2:40-2:50 — Fetch analytics
- Show the app requesting analytics for the sandbox video and display sample metrics.

2:50-3:00 — Closing
- Show closing slide with contact details: support@autopromote.org

Submission notes (copy/paste into TikTok review)

Thank you for reviewing AutoPromote. We have configured Website URL and Redirect URI on the same domain (https://www.autopromote.org). This submission uses TikTok Sandbox for demonstration. The video shows:
- OAuth consent screen listing requested scopes (user.info.profile, video.upload, video.publish, video.data)
- Code-to-token exchange and an example user profile call
- Uploading a sandbox video and showing the sandbox video id
- Fetching analytics for the sandbox video

If you require additional clips or an extended recording, please let us know.

Troubleshooting
- If https://www.autopromote.org/tiktok-demo shows "NOT SET": ensure Render env var name is exactly `TIKTOK_SANDBOX_CLIENT_KEY` and redeploy.
- If Redirect URIs differ, update them in the TikTok developer console and include the exact URIs in the video.

