# Schedule polish and Publisher audit

Audited repository: Tibule12/AutoPromote, main commit e06f43d1b4b71c4b039c288706c38bf540976b12.

## Scope and deployment

The approved grouped Schedule screen is preserved. The release grouping code and all backend code are unchanged. No production API was called, no publishing services were started, and no existing schedule or provider connection was modified. Verification used local fixtures, including the six-release / 36-destination fixture.

Changes to main can deploy production: `.github/workflows/deploy.yml` calls the Render deploy hook after its backend test; `.github/workflows/github-pages.yml` builds and deploys the frontend on main pushes. Cloud Run worker workflows also watch main, with worker-specific path filters. Credentials, enabled repository workflows and current deployed settings were not independently inspected, so this is the configured deployment behaviour, not a claim that every deployment currently succeeds. Work is isolated on `agent/schedule-polish-publisher-audit`.

## Schedule changes

- Verified the dashboard already renders “Create once. Publish everywhere.” beneath Schedule; retained it.
- New release opens the existing `upload` navigation target, which hosts UnifiedPublisher. Removed the alternative Schedule creation form and unused dashboard creation callback. Schedule no longer offers a second creation workflow.
- Origin badges use explicit stored source/template metadata only. Template metadata under `meta.template.name` is also recognized. Release names are never used to infer Studio origin.
- Added a display-only timezone selector. It starts from a valid account timezone, otherwise the browser timezone. Existing UTC publish instants are formatted in the selected zone without writing or changing their meaning. The stored timezone is separately identified when different; absent metadata is not invented.
- Timezone labels include the UTC offset at the scheduled instant, including DST and fractional-hour offsets.
- Expanded destinations show stored title, full copy, media/poster and formatted date/time/timezone. Shared media is shown for every destination rather than hidden. Facebook `message`, LinkedIn `commentary`, Reddit `text`, and both persisted platform-options naming conventions are supported.
- Individual controls require a real callback and a schedule that identifies exactly one destination. A multi-destination schedule ID cannot safely support an action labelled “only this destination”; those controls are hidden. Release controls retain existing behaviour.
- Media preview prefers the persisted source URL ahead of a legacy processed fallback, matching the provider context hydration preference. Destination media overrides are shown when stored.

## Publish Now: actual flow

`frontend/src/features/publishing/UnifiedPublisher.js::publish` requires media and at least one platform, obtains a Firebase auth token and checks `/api/content/upload/readiness`. A local Blob is uploaded using the existing backend source-upload path. A string URL is reused directly. Platform-specific uploads and transformations can occur through `frontend/src/App.js::handleContentUpload` before the content request.

The content upload request includes selected platforms and platform options. Without an explicit future schedule, `src/contentRoutes.js` creates the content record and starts `distributionManager.distributeContent` in the background. The manager builds platform payloads and calls `enqueuePlatformPostTask` once per selected platform with reason `immediate_distribution`. Provider jobs later dispatch through `platformPoster` and provider services.

The HTTP success response and “started successfully” feedback mean the submission was accepted, not that all selected platforms have delivered the post. Queue processing, credential refresh, provider processing and retries can delay or fail delivery. “Publish now” should say it sends immediately to the queue and show delivery status separately. No universal founder approval step was found in this mode; sponsor-specific approval guards do exist.

## Schedule: actual flow

The same Publisher submission accepts a default future time and optional per-platform times. The frontend validates future dates and converts them to ISO instants. `App.js` passes `scheduled_promotion_time`, `platform_schedule_times` and `schedule_hint` to the content endpoint. Presence of a future schedule suppresses the immediate distribution path.

Background `viralOptimizationService.performViralOptimization` creates one active pending `promotion_schedules` record for each selected platform with an explicit future time. It stores platform settings, startTime, frequency and a timezone label. Schedule creation occurs after the optimization work; an accepted upload alone does not prove those records were created successfully.

`promotionService.processDueSchedules` locks due active pending records and enqueues provider tasks with reason `scheduled_event`. It marks the schedule `executed` after task enqueue, which is not provider-delivery confirmation. The Schedule model already maps executed to Publishing. Recurring schedules create the next recurrence when enabled.

The server scheduler defaults to a 60-second interval outside tests unless `SCHEDULER_ENABLED=false`; background leader/job settings also affect execution. Current production environment values were not queried. Scheduling is not a guarantee of exact-to-the-second delivery.

## Auto Publish: readiness and meaning

The current UnifiedPublisher exposes only now and schedule timing state/radio choices. No separate Auto Publish delivery mode, mode-specific endpoint, rule configuration, content-generation trigger or founder-approval workflow is connected to that component.

“Auto-publish slots” appears in Publisher quota errors and billing text. These refer to automated platform-post tasks used by both immediate and scheduled delivery, not a third way of preparing a release. The content schema accepts and persists legacy `auto_promote`, but the audited Publisher does not send it as a third mode and these delivery paths do not branch on it.

There is separate automated reposting: `repostSchedulerService.analyzeAndScheduleReposts` analyzes existing content and may queue/schedule another attempt, construct a creative plan and use transformations. The server invokes it every 30 minutes when background jobs are enabled and this instance is the leader. Plan attempt caps and explicit user opt-outs apply. The current policy defaults to enabled in the absence of an explicit opt-out; it is not equivalent to a user choosing Auto Publish in Publisher. Autopilot experiments are another separate service, not evidence of a third Publisher delivery mode.

Recommendation: the proposed Publisher has only Publish Now and Schedule. Name automated-post quotas consistently as publishing/post allowances. Explain and configure repost automation separately rather than implying the release delivery selector owns it.

## Account and provider requirements found in code

All submissions need authenticated account/workspace context and sufficient upload, destination and automated-post allowances. Configured normal plan destination limits are Starter 1, Creator 5, Studio 6, Agency 6; tester access can override limits. Quotas are checked at readiness and again by task enqueue; an initial readiness result is not a reservation or guarantee of eventual delivery.

| Destination | Requirements and constraints implemented in the current code |
| --- | --- |
| Facebook | Valid connection/page token and a resolvable target Page. Service posts feed/video/photo according to media. A legacy server-token fallback exists. |
| Instagram | Resolvable Instagram business-account ID and access token; provider-accessible media URL; container creation/publishing and video processing. Missing credentials/media can produce simulated results. |
| LinkedIn | Valid OAuth token and a resolvable personal posting identity; an explicitly supplied numeric company ID switches the target to an organization. Media uploads and provider authorization still govern success. |
| Reddit | Valid OAuth token, subreddit and title; self/link/video types have different required text/URL fields. Subreddit policies and provider errors can reject a submission. |
| TikTok | Valid access token; upload/publish authorization, creator privacy/options and posting limits; commercial/sponsor fields can add approval requirements. Multiple upload methods and privacy fallbacks exist. |
| YouTube | Valid stored OAuth connection with the upload and readonly scopes checked by the service; reachable video source, upload processing and configured privacy/options. Provider quotas/errors apply. |

These are code-observed requirements, not certification that the founder's live connections are currently valid or that every media type is supported by all destinations.

## Product and wording inconsistencies to resolve after approval

1. **False confirmation risk:** Facebook/Instagram fallback paths can return `{simulated: true, reason: ...}` without `success: false`. The task runner rejects absent results or explicit `success === false`, and otherwise can complete/finalize a successful post without a provider ID. This needs a backend correctness fix and regression coverage before trusting production success labels; it was not changed in this Schedule-only task.
2. **Timezone mismatch:** Publisher date/time controls use browser-local parsing, while App stores `userDefaults.timezone || UTC` as schedule metadata. Those can disagree. The redesign should have an explicit selected zone and consistent conversion, validated before writing new schedules. Historical instants must be preserved.
3. **Repeated delivery inputs:** timing controls appear in queue/customize/review areas. Review also says leave the date empty for immediate publishing. One clear Delivery step should govern the final CTA.
4. **Submission vs delivery:** current success copy and upload notification can say uploaded/scheduled before future schedules or provider deliveries are confirmed. Separate accepted, queued, processing, delivered and failed.
5. **Asset reuse is incomplete:** Studio/Smart Promo callbacks already pass initial media to Publisher, and a URL can avoid a source re-upload. The current screen has no general existing project/library/generated asset picker; Blob handoffs can still upload again. The proposed asset chooser is a design requirement, not a feature already implemented.
6. **Platform copy parity:** providers may append hashtags/links, hydrate context, or apply other payload rules. The current review does not show every exact outgoing field. Redesign implementation must reconcile preview with the actual destination payload; the mockup cannot establish that parity.
7. **Auto Publish wording:** quotas and background reposting must not be advertised as a third production-ready release mode.

## Verification and approval boundary

15 focused frontend tests pass across ScheduleReleaseView, SchedulePolish and SchedulesPanel.create. The existing backend scheduling suite passes both tests using mocked Firestore/services. Touched-file ESLint and the frontend production build pass. No full suite, live delivery or current provider-account check was performed.

One desktop Publisher image is the design proposal. Its media, copy, connection statuses and date are illustrative, not a live account snapshot. It proposes Content → Destinations → Customize → Delivery → Review, reusing owned assets, clear two-mode delivery and a destination-count CTA. No Publisher component, publishing backend, Studio or Cam Combiner code was changed. Stop for founder approval before implementing the redesign or merging/deploying this branch.
