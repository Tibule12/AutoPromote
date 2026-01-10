# Snapchat Integration Troubleshooting

If you are experiencing issues with Snapchat connection ("redirect_uri mismatch" or OAuth errors), please follow these steps:

## 1. Check your Server Logs

We have added detailed logging to the backend. When you click "Connect Snapchat", check your server logs for a line like:

```text
[Snapchat] OAuth Prepare: client_id=... redirect_uri=https://api.autopromote.org/api/snapchat/auth/callback scope=...
```

The `redirect_uri` printed here is **EXACTLY** what Snapchat receives.

## 2. Verify Snapchat Portal Settings

1. Go to the [Snapchat Ads Manager / Business Details](https://ads.snapchat.com/).
2. Navigate to your App definition.
3. Look at the **Redirect URIs** section.
4. **CRITICAL:** You must whitelist the **exact full URL** shown in your logs.
   - ❌ Incorrect: `https://api.autopromote.org`
   - ✅ Correct: `https://api.autopromote.org/api/snapchat/auth/callback`

(Note: If you are using `www.autopromote.org` instead of `api.`, update the whitelist accordingly).

## 3. Environment Variables

Check your `.env` (or Render Environment Variables):

- `SNAPCHAT_REDIRECT_URI`: If set, ensure it matches your portal whitelist exactly.
- `SNAPCHAT_CLIENT_ID`: Ensure this matches your Confidential Client ID from Snapchat.
- `SNAPCHAT_CLIENT_SECRET`: Ensure this is set.

## 4. Scope Issues

If you see an error about scopes, ensure your app has approval for `snapchat-marketing-api`.
If not, try using the standard `display_name` scope for testing.
