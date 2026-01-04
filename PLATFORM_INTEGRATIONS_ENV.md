# Platform Integrations Environment Variables (Phase D)

Provide these in your deployment environment to enable real cross-platform posting. Missing values automatically trigger simulated posts.

## Facebook

```
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAAB... (long-lived)
```

- Requires a Facebook Page and proper permissions (pages_show_list, pages_read_engagement, pages_manage_posts).

## Twitter (X)

```
TWITTER_BEARER_TOKEN=AAAAAAAA... (App Bearer Token with write access)
```

- Endpoint used: POST https://api.twitter.com/2/tweets
- Must have Elevated access or new write permission per X API tiers.

## Instagram

Add publishing support (image + simple video) via Graph API.

```
IG_USER_ID=1784xxxxxxxxxxxx   # Instagram Business Account ID
FACEBOOK_PAGE_ACCESS_TOKEN=EAAB...  # Must include instagram_basic, instagram_content_publish
```

Limitations:

- Minimal video processing polling (2 attempts)
- No carousel / reels-specific tuning yet
- Media must be a public URL (FB fetchable)

## TikTok

Still placeholder; add developer app + upload endpoints later.

## Snapchat

```
SNAPCHAT_CLIENT_ID=your_snapchat_client_id
SNAPCHAT_CLIENT_SECRET=your_snapchat_client_secret
SNAPCHAT_REDIRECT_URI=https://www.autopromote.org/api/snapchat/auth/callback
```

### Important Notes for Snapchat

- **Snapchat does not have a sandbox environment** - all development/testing happens in production
- Be extremely careful with API calls as they affect real Snapchat accounts
- Test with minimal data and monitor API usage closely
- Consider using Snapchat's test accounts for development

## Optional Background Job Flags

```
ENABLE_BACKGROUND_JOBS=true
STATS_POLL_INTERVAL_MS=180000
TASK_PROCESS_INTERVAL_MS=60000
VELOCITY_THRESHOLD=800
```

## Pinterest

```
PINTEREST_CLIENT_ID=your_pinterest_client_id
PINTEREST_CLIENT_SECRET=your_pinterest_client_secret
PINTEREST_SCOPES=pins:read,pins:write,boards:read
PINTEREST_REDIRECT_URI=https://www.autopromote.org/api/pinterest/auth/callback
```

Notes:

- Add `PINTEREST_REDIRECT_URI` and any other allowed redirect URIs to your Pinterest developer app settings.
- Ensure your domain (e.g., autopromote.org) is registered in Pinterest's app settings and your Cloudflare DNS or Zoho email verification doesn't block redirects.
- Pinterest may require app review for write scopes depending on the counts & endpoints you plan to use.

## Safety Notes

- Do NOT commit real access tokens.
- Rotate tokens periodically.
- For production, consider central secret management (e.g., GCP Secret Manager, AWS Secrets Manager, Vault).

## Next Steps Roadmap

1. Implement Instagram Graph media container + publish flow.
2. Integrate TikTok Content Posting API.
3. Add retry/backoff with platform-specific error classification.
4. Introduce rate-limit observability (log headers: x-app-usage, x-business-use-case-usage for FB).
