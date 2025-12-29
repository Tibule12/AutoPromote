# Deploying the Provider Feeds Importer (Scheduled)

This repository includes two options to schedule regular imports of trending provider feeds (Spotify, TikTok):

1. GitHub Actions (recommended for small-to-medium setups)

- The workflow `.github/workflows/fetch-provider-feeds.yml` runs `npm run fetch:providers` every 6 hours (configurable).
- To enable provider API access, add the following repository secrets in GitHub:
  - `SPOTIFY_API_KEY` (optional)
  - `TIKTOK_API_KEY` (optional)

2. Google Cloud Functions + Cloud Scheduler (production-ready)

- Deploy the HTTP Cloud Function in `cloud-functions/fetch-provider-feeds` (or copy `src/workers/fetchProviderFeedsWorker.js` into your functions codebase):

  gcloud functions deploy fetchProviderFeeds \
   --runtime=nodejs20 \
   --trigger-http \
   --allow-unauthenticated=false \
   --region=YOUR_REGION

- Secure the function behind IAM or an Authenticated scheduler. Create a Cloud Scheduler job to call the function via an OIDC-authenticated HTTP request.

Example Cloud Scheduler (using gcloud and a service account with invoker role):

gcloud scheduler jobs create http fetch-provider-feeds \
 --schedule="0 _/6 _ \* \*" \
 --uri="https://REGION-PROJECT.cloudfunctions.net/fetchProviderFeeds" \
 --http-method=POST \
 --oidc-service-account-email=YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com

Notes:

- The worker uses env vars `SPOTIFY_API_KEY` and `TIKTOK_API_KEY` if present to call provider APIs.
- Ensure the Cloud Function runs in an environment that has credentials (e.g., service account) with Firestore write permissions.

Security

- For GitHub Actions, use repository secrets.
- For Cloud Functions + Scheduler, use an authenticated scheduler and add IAM restrictions to the function (allow only the scheduler service account to invoke the function).
