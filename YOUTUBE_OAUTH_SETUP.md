# YouTube OAuth setup (server-side web app)

Fixes for `invalid_client: Unauthorized` and the "Google hasn’t verified this app" screen.

## 1) Create the correct OAuth client

In Google Cloud Console (APIs & Services → Credentials):

- Create Credentials → OAuth client ID
- Application type: Web application
- Name: AutoPromote (prod)
- Authorized redirect URIs: add exactly
  - https://www.autopromote.org/api/youtube/callback

You do NOT need JavaScript origins for this server flow.

Download the JSON or copy the values:

- client_id: xxxxxxxxxxxx-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com
- client_secret: yyyyyyyyyyyyyyyyyyyyyyyyyy

Important: The client_id and client_secret must be from the SAME OAuth client in the SAME GCP project as your OAuth consent screen.

## 2) Enable the API in the same project

APIs & Services → Library → enable “YouTube Data API v3”.

## 3) Consent screen (test mode is fine)

APIs & Services → OAuth consent screen:

- Publishing status can be Testing.
- Add the Google account you’ll sign in with as a Test user.
- The unverified screen is expected in Testing; click Advanced → Continue.

## 4) Set Render environment variables (exact names)

On your backend service (Render or your hosting provider):

- YT_CLIENT_ID = <client_id from step 1>
- YT_CLIENT_SECRET = <client_secret from step 1>
- YT_REDIRECT_URI = https://www.autopromote.org/api/youtube/callback
- DASHBOARD_URL = https://www.autopromote.org

Avoid leading/trailing spaces. After updating, redeploy the service.

## 5) Verify from the server

Health check (should be true/true/true):

- https://www.autopromote.org/api/youtube/health → { ok:true, hasClientId:true, hasClientSecret:true, hasRedirect:true }

The server logs will also show masked values when you start auth:

- [YouTube][prepare] Using client/redirect { clientId: '34149803….com', redirect: 'https://www.autopromote.org/api/youtube/callback' }

## 6) Retry the flow

From the dashboard, click Connect YouTube → sign in → allow scopes.

If the token exchange still fails, you’ll now be redirected back to the dashboard with `?youtube=error&reason=invalid_client`.

That almost always means one of:

- Secret doesn’t belong to this client_id (regenerated or copied from a different client).
- The auth code was issued for a different client_id (browser hit a different project’s client).
- The redirect URI on the client doesn’t exactly match the one used in the request.

Common quick fix: create a fresh Web OAuth client (step 1), then paste both new values into Render and redeploy.

---

Troubleshooting tips:

- If you have multiple OAuth Client IDs, delete the unused ones to avoid confusion.
- Compare the client_id you see masked in logs with the one in GCP (first 8 and last 4 chars).
- Ensure YouTube Data API v3 is enabled in the SAME project as the OAuth client and consent screen.
