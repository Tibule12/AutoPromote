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

## Optional Background Job Flags
```
ENABLE_BACKGROUND_JOBS=true
STATS_POLL_INTERVAL_MS=180000
TASK_PROCESS_INTERVAL_MS=60000
VELOCITY_THRESHOLD=800
```

## Safety Notes
- Do NOT commit real access tokens.
- Rotate tokens periodically.
- For production, consider central secret management (e.g., GCP Secret Manager, AWS Secrets Manager, Vault).

## Next Steps Roadmap
1. Implement Instagram Graph media container + publish flow.
2. Integrate TikTok Content Posting API.
3. Add retry/backoff with platform-specific error classification.
4. Introduce rate-limit observability (log headers: x-app-usage, x-business-use-case-usage for FB).
