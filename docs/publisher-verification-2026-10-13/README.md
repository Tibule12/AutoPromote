# Publisher verification — 13 October 2026

**Verdict: NOT READY FOR MERGE.** The local redesign verification passes. Required live-account verification is unavailable in this session, and the retained platform-specific photo tools have the pre-existing limitations listed below. No merge or production deployment was performed.

## Branch and scope

- Branch: `agent/schedule-polish-publisher-audit`.
- Resumed checkpoint: `7388ff725ae68e1cee9ba0ca3eb910524c277549`.
- The final audit commit contains this report; its exact head is supplied in the completion reply.
- Kept the existing five steps, six provider forms, publishing handlers, backend services, Schedule records, Studio and Cam Combiner engines.
- Browser execution uses the actual optimized frontend App/dashboard/Publisher bundle. Components are not mocked. API responses and delivery endpoints are intercepted fixtures. All external traffic and unrecognized writes are blocked. Screenshots are verification fixtures, not a production account snapshot.

## Visual comparison and screenshots

The screen matches the approved structure described in the checkpoint handoff: dark workspace, purple accent, selected content/destinations on the left, the full active platform form in the center, and preview/readiness on the right. On smaller available widths it stacks without overlap. The original approved image is not in this checkout, so this is a comparison with the approved requirements, not a pixel comparison with that image.

- [Desktop: six connected, Reddit incomplete](desktop-reddit-blocked.png)
- [1280 px](reddit-blocked-1280.png), [1024 px](reddit-blocked-1024.png), [768 px](reddit-blocked-768.png), [390 px mobile](reddit-blocked-390.png)
- [Publish Now delivery](delivery-now.png), [Publish Now review](review-now.png)
- [Schedule delivery](delivery-schedule.png), [Schedule review](review-schedule.png)
- [Owned image reuse](owned-image-reuse.png), [account blockers](account-readiness-blocked.png), [submission rejected](submission-readiness-error.png)
- [Studio error](studio-media-error.png), [Studio → Publisher handoff](studio-publisher-handoff.png)

Measured page/workspace overflow is zero at 1600, 1280, 1024, 768 and 390 px. Each of the six real forms was also checked at 1280 and 390 px. Mobile Continue/Back navigation passed. Preview titles/body text and retained permission/compliance controls have readable contrast after scoped fixes.

## Six platform forms

| Platform | Verified in the real browser form | Evidence |
| --- | --- | --- |
| Facebook | Page 101 → 202 selection, missing Page/disconnected blockers, own copy/preview, Page preserved by master copy and tab/step switches | [Form](facebook-form.png) |
| Instagram | Linked Page/business account selection, location/caption preservation, direct IG connection without Facebook Pages, owned-image preview/reuse | [Form](instagram-form.png) |
| LinkedIn | Profile/company target, empty and invalid numeric ID blockers, master copy preserving incomplete company selection, correct target label, commentary/settings preserved | [Form](linkedin-form.png) |
| Reddit | Missing subreddit blocks Delivery even with six connected destinations; title/copy/media; link URL validation; text requirement; video/link/text switching; master copy preserves subreddit/type/link | [Form](reddit-form.png) |
| TikTok | Privacy required/available options, declaration, commercial disclosure, branded/private restriction, permissions and quota blockers, preserved caption | [Form](tiktok-form.png) |
| YouTube | Required title, description, owned media, visibility/tags and preserved edits | [Form](youtube-form.png) |

All six edits survive destination and workflow-step changes. Delivery is enabled only after every selected form is complete. No per-form publish endpoint was invoked.

## Delivery through the actual App adapter

| Scenario | Captured mocked upload JSON / review result |
| --- | --- |
| Schedule | `2030-10-21`, `16:00`, `America/New_York` → `scheduled_promotion_time: 2030-10-21T20:00:00.000Z`; `schedule_hint.timezone: America/New_York`; recurrence `weekly` |
| Custom Reddit time | `17:30` in the same timezone → `platform_schedule_times.reddit: 2030-10-21T21:30:00.000Z`; YouTube falls back to the shared instant |
| Review | Displays `America/New_York (UTC-04)` and CTA `Schedule 2 posts` |
| Switch Schedule → Publish Now | No scheduled instant, custom-time map or schedule date in the upload JSON; hint mode is `publish_now`; CTA `Publish to 2 destinations` |
| Readiness rejection | Visible failure, no content upload request and no optimistic submission-success message |

The configured account timezone fixture is Africa/Johannesburg. A separate regression test proved that account defaults arriving after Publisher mount now update the untouched timezone; a timezone explicitly chosen by the user survives later default changes. Owned URLs are reused without a source re-upload, and genuine supplied source/template fields reach the adapter.

Submission acceptance is not proof of provider delivery. No real provider submission was performed.

## Backend load-failure diagnosis

Both scheduling suites load and pass in the fresh, complete checkout after `npm ci`. The backend source tree, `lib`, dependency manifests/lockfile, Jest configuration and both test files are identical to the fetched main revision. `boostChainEngine.js` imports the tracked `lib/uuid-compat.js`, whose normal path uses Node's `crypto.randomUUID()`; that helper is present and identical on both revisions.

This rules out a dependency change introduced by the Publisher branch. The old failure does not reproduce in the clean environment. The handoff did not retain its original stack trace, so the exact historical missing/stale module cannot be established; an incomplete checkout or earlier test environment is the remaining explanation. No backend/product code or dependency versions were changed to suppress it.

## Checks

- Focused frontend: **16/16 passed**, three suites, using the frontend's standard CRA test command. The fixture now restores its auth mock for CRA's per-test mock reset; root Jest had already passed the earlier 15-test version.
- Backend: **4/4 passed**, `contentRoutes.schedulingBehavior.jest.test.js` and `viralOptimizationService.scheduling.jest.test.js`.
- Browser: **28 checks passed**, zero page errors, zero requests to mutate existing schedules. See [browser evidence](browser-evidence.json) and [audit log](browser-audit.log).
- Optimized frontend build: **passed** with isolated dummy Firebase configuration and local API URL. See [build log](frontend-build.log).
- Direct touched-file ESLint: **zero errors, five existing unused-prop warnings** in Facebook/Instagram. `git diff --check` passed. The frontend's placeholder lint script was not used as proof.
- Existing React test `act(...)` warnings and the backend Haste package-name collision warning remain non-fatal. See [frontend test log](frontend-tests.log), [backend test log](backend-tests.log), [lint log](lint.log).

Reproduce the browser audit after building the frontend with local/dummy settings:

```sh
PUBLISHER_CHROMIUM_PATH=/path/to/chrome node test/e2e/playwright/publisher-release.audit.js
```

Use `PUBLISHER_AUDIT_CASE=studio` (or `forms`, `schedule`, `now`, `images`, `connections`, `rejected`, `media`, `crop`) for a focused run. Chromium and ffmpeg are required. Static build files are fulfilled locally by the harness, so no backend or publishing worker needs to start.

## Media controls and fixes

Fixed verified layout/contrast collisions, the owned-image Blob URL crash in Instagram/TikTok, editor input compatibility for owned URL objects, global crop-dialog props/output, LinkedIn master-copy target preservation/labeling, direct Instagram identity display, known Studio handoff provenance and late account-timezone defaults. No provider publishing contract was rewritten.

The advanced trim, rotation, horizontal/vertical flip, filter, alternate hook, bounty and viral-optimization fields remain visible and reach the real App adapter under their existing JSON keys. Owned media loads in the editor. Global image crop loads, cancels and applies an actual image Blob. Actual Studio export failure/retry and Use in Publisher navigation passed with mocked processing. Metadata-free assets show no invented Studio/template labels.

This verifies controls and payload preservation, not physical application of every transform by production providers or workers.

## Remaining defects and verification gaps

1. **Live-account smoke check remains unverified.** The browser inventory contains only an about:blank tab; no authenticated review environment or production account data was available. Account defaults, connection states and ownership handoffs were exercised with API-shaped fixtures. Do not present that as a read of the founder's actual connected accounts.
2. **Retained photo-tool limitations are pre-existing.** Instagram's form-specific Crop Image opens the cropper without an `onChangeCrop` callback, so it does not save a platform image. Instagram/TikTok photo FilterEffects callbacks only log the selected filter. These are distinct from the now-working global Publisher crop and the advanced metadata controls; they were not rewritten in this audit. Their callbacks are unchanged from the pre-redesign revision. They require a separate scoped fix or an explicit acceptance of the existing limitation before claiming all exposed photo tools work.
3. **The original backend failure trace is unavailable.** Current tests pass and the branch cause is ruled out; the historical environment problem cannot be named more precisely from the retained handoff.

The previously documented backend limitations remain unchanged: simulated provider responses can be finalized as success; acceptance is not delivery; future schedule creation can be asynchronous; provider formatting may differ; automatic reposting is separate. Auto Publish is not a third production-ready delivery choice.

## Live-data and deployment safety

No live posts were published, rescheduled, paused, cancelled, duplicated or deleted. No production publishing backend or worker was started. All browser requests were intercepted before transport. The founder's six grouped releases / 36 scheduled platform posts were outside every mutation path and were not changed by this session. No live recount was performed.

Main was neither pushed nor merged. Work and evidence remain on the audit branch. The founder should not merge on the strength of these fixture checks as though the outstanding live-account and photo-tool checks had passed.
