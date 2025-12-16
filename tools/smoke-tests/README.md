Smoke tests for AutoPromote

Overview

- This folder contains a small Node script `runSmokeTests.js` and instructions for smoke-testing the AutoPromote API.
- Tests run unauthenticated checks (health, content listing) and authenticated checks if you provide an admin/test token.

Prerequisites

- Node >= 18 or Node 20 is recommended (global fetch available), or `npm install node-fetch` if running on older Node.
- Ensure the script is run from the environment with network access to the API (e.g., your local network or Render service URL).

Required environment variables

- API_BASE_URL - The base API URL (e.g. https://autopromote.onrender.com)
- AUTH_TOKEN - An admin/test user's bearer token for authenticated requests
- CONTENT_URL (optional) - A small public image/video file to attach to the smoke test content

Run the Node script

- Windows PowerShell:
  $env:API_BASE_URL = "https://autopromote.onrender.com"; $env:AUTH_TOKEN = "<token>"; node tools\smoke-tests\runSmokeTests.js

Manual (curl) smoke test examples

1. Health check (public):
   curl --location --request GET "${API_BASE_URL}/api/health"

2. Public list content (public):
   curl --location --request GET "${API_BASE_URL}/api/content"

3. Create content (authenticated):
   curl --location --request POST "${API_BASE_URL}/api/content/upload" \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer <TOKEN>" \
    --data-raw '{"title":"smoke test","type":"image","url":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/240px-Example.jpg","description":"smoke test upload - ignore"}'

4. List user's content (authenticated):
   curl --location --request GET "${API_BASE_URL}/api/content/my-content" \
    --header "Authorization: Bearer <TOKEN>"

5. Enqueue a YouTube upload task (authenticated):
   curl --location --request POST "${API_BASE_URL}/api/promotion-tasks/youtube/enqueue" \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer <TOKEN>" \
    --data-raw '{"contentId":"<CONTENT_ID>","fileUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/240px-Example.jpg"}'

6. Run the promotion task processor once (manual step) — this will process queued tasks:
   curl --location --request POST "${API_BASE_URL}/api/promotion-tasks/youtube/process-once"

Notes & Safety

- These scripts are safe to run against staging systems and use small public assets. Running against production may create real artifacts (content and schedules); use with caution.
- If you don't provide an AUTH_TOKEN the script will run only unauthenticated checks.
- Scheduling logic may try to create promotion entries. That will create records in Firestore. On production, you may prefer running smoke tests against staging.
- If a provider-specific platform task is enqueued, the enqueue endpoint will do validation; we intentionally omit target_platforms in the upload to avoid requiring platform-specific options.

Next Steps

- If you'd like, I can run these tests from my side if you provide API_BASE_URL and a safe test token with limited privileges.
- I can also add additional checks for:
  - verifying a promotion_task transitions to `processing` or `completed` (needs worker to be running)
  - verifying Firestore composite indices are READY (if you want to provide GCP project read-only access token or confirm manually)
  - running SSRF / streaming tests that exercise `videoClippingService` if you'd like deeper coverages

If you want me to run the tests for you automatically, please provide the API host and a short-lived test token (or add me a temporary user with minimal scoped token) and confirm you're OK with creating test content & scheduled promotion records in your environment.
