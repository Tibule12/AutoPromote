# Analytics, diagnosis deployment and rejected publishing review — 28 October 2026

The backend runs locally on `127.0.0.1:5128`, with ordinary Firebase authentication and background posting disabled. The existing API/worker/App were preserved. This review used the retained normal signed-in account, actual owned publishing receipts and read-only provider statistics requests. No new video, platform post, paid compute or financial adjustment was made.

## Confirmed faults and repairs

- Render diagnosis build at `1dc32037` failed before execution: root `postinstall` requires `scripts/patch-security-dependencies.js`, which was absent before Docker's `npm ci`. Copy both the entry point and its Functions guard implementation before installation. Node 22 also matches the frontend's declared >=22.22.0 engine. The exact dependency-install phase passed in a local Alpine container. The complete production image and a successful Render cron execution are not established by that check.
- The account Analytics reader silently stopped at 400 arbitrarily ordered post records. It now paginates each owner-scoped query, deduplicates aliases, and returns 503 rather than presenting partial history as complete if a query fails or exceeds 10,000 records per alias. No global collection scan is used. A live bounded owner-only read found 460 distinct post records across two pages; the old 400-record limit omitted 60.
- Facebook Video node IDs were queried using Page-post-only `/insights` and `attachments`. Video statistics now use `/video_insights`, with engagement fetched separately. Unavailable views remain null, and real zero likes/comments remain measured zero.
- TikTok accepted uploads could have no public ID yet. The old poller skipped them forever. Resolve the existing publish reference through the read-only status operation, preserve the 64-bit decimal ID losslessly, and query its actual statistics. Persist only that verified public ID; never resubmit the post. Batched queries contain at most 20 IDs.
- Instagram now requests view/reach insights separately from basic engagement. A failed insight request preserves genuine likes/comments. LinkedIn uses the current versioned REST socialMetadata endpoint. Provider refusals and partial collection are shown, rather than converted to zero.
- Local browser-test tokens could be sent from localhost toward a production API. Both page and API must now be loopback before any synthetic auth is returned. Production token validation is unchanged.
- A disabled diagnosis cron no longer exits successfully without doing work. It logs the exact disabled condition and returns failure. Structured run logs include deployed revision and whether recovery is blocked. No production recovery switch was enabled or cron invoked here.

## Actual provider observations

| Platform | Observed result | Remaining requirement |
| --- | --- | --- |
| TikTok | Existing public post `7701756990720052501`: 24 views, 1 like in the normal Analytics sync; earlier direct check returned 15/1. | Counts are time-specific observations, not forecasts. Future connections request `video.list`. |
| YouTube | Existing video `68R_DU-z31g`: 8 views from its real authenticated API. One earlier bounded refresh expired; stored measurements were retained. | New refresh timeout identifies the timeout and preserves older measurements. |
| Facebook | Real basic engagement returned zero; video insights returned HTTP 403, code 200, `read_insights permission missing`. | Review app/connection analytics access and reauthorize. Code cannot manufacture a provider grant. |
| Instagram | Basic engagement worked; insights returned code 10, `Application does not have permission for this action`. | Review the app's approved analytics permissions and connected account access, then reauthorize. |
| LinkedIn | Old endpoint returned 404. Correct REST endpoint returned 403, `partnerApiSocialMetadata.GET.20261001` access denied. | Restricted member/organization reading access must be available to this app and token. |
| Reddit | Score/comments available; no video view count supplied. | Do not label score as views or likes. |

Follow-up after the owner supplied Meta screenshots: read-only `/debug_token` checks for both saved user and Page tokens returned valid tokens for the exact screenshot app `1403342434818994`. Both had Page reading/publishing and Instagram basic/publishing grants, but neither had `read_insights` or `instagram_manage_insights`. `/me/permissions` independently confirmed that grant list. See `meta-permission-grants.json`; it contains no tokens. The screenshots confirm several advanced permissions but do not establish these two analytics grants.

The Meta OAuth request now includes analytics scopes; existing grants and app approval are not changed by source edits. No account setting or support request was submitted. API availability and permission on an individual token are separate facts.

Official contracts: [TikTok query, scope and twenty-ID limit](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query); [LinkedIn REST social metadata and restricted read permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api?view=li-lms-2026-01). Meta's specific permission refusals above were observed directly; its documentation fetch was rate-limited during this review.

## Owner rejection and publication hold

The inspected 28 October films are text-and-shape instructional demonstrations with small Studio inserts. Export/queue verification overstated their creative qualification. The owner's rejection is recorded; no new creative acceptance is implied.

The remaining release is `make-the-current-revision-obvious`, content `T3Nju7P2dAJr3iW6nA1F`. Five schedules were paused through ordinary signed-in Queue controls and verified after a cold reload:

| Destination | Existing schedule ID |
| --- | --- |
| Reddit | `DXojMkzP9V6CtIiQfcfH` |
| YouTube | `O0jBCmaGAkAiKEpGkkIK` |
| TikTok | `zA41mNnsZNnRrftBBgqw` |
| Facebook | `4eEquTtUYXaySfrXDzZQ` |
| Instagram | `Abb930a4t4mC1y8DBmOv` |

The LinkedIn copy had already published before the hold: `urn:li:ugcPost:7521258578125537280`, verified from its successful platform receipt. Existing published copies were neither deleted nor edited. Preserve all source projects, movies, recordings and queue/publication history. Do not resume or requeue the rejected 28 October batch during automatic continuation. This hold concerns that batch; it is not a global scheduler configuration change.

## Validation and boundaries

The real signed-in candidate App loaded Analytics and performed its native sync with zero page errors; it recovered real TikTok statistics and exposed permission failures. Fresh Queue reload verified all five pauses. Provider reads do not establish unavailable permissions or creative approval.

The focused suites cover endpoint selection, genuine zeros versus unavailable values, partial failures, lossless public IDs, request limits, owner isolation, alias deduplication, history pagination/cap failure, timeout preservation, safe local test-auth routing and disabled cron behavior. Existing billing/subscription/scheduling/diagnosis regressions and strict React build pass. Exact final counts are recorded in `validation.json`. Local container validation covers dependency installation and lifecycle execution, not a complete Render deployment. No manual cloud deployment or diagnosis/recovery run occurred.

Private logs/screenshots, raw owned post documents and retained authentication state stay outside version control under `/tmp/autopromote-analytics-review-20261028`. Production provider credentials are never embedded in committed evidence.

Studio formal counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY. No renderer, parity threshold or readiness promotion was made. Shared S02 picture/sound/latency, S04 depth and S03 ownership remain the next engineering work.
