# Approved Publisher redesign: implementation checkpoint

Continue on `agent/schedule-polish-publisher-audit`. Base is the Schedule polish commit 88f5719514e1f24b0abecc6036d212a4b11746fb. The founder asked for this checkpoint to be pushed immediately so another account can finish verification. Do not restart or redesign the approved work.

## Implemented

- Five steps: Content → Destinations → Customize → Delivery → Review.
- Dark navy workspace with purple accent, left content/destination cards, center real platform form, and right preview/readiness cards.
- Existing Facebook, Instagram, LinkedIn, Reddit, TikTok and YouTube forms retained. Visited forms remain mounted while switching tabs and steps to preserve settings/copy.
- Connection status comes from the existing status API and is separate from required-field/form-review status. Delivery and Review are gated. TikTok declaration/privacy/publishing-readiness checks are included.
- Use master copy copies text while retaining the destination account, subreddit, media and other settings.
- Content uses available owned assets from the dashboard's existing content list or upload. Real source/template metadata is shown when present. Owned URL objects are accepted without source re-upload.
- Publish now and Schedule are distinct choices. Schedule has explicit date/time/timezone, recurrence and optional per-destination times. UTC instants are derived from the selected timezone; App now honors `schedule.timezone` instead of overriding it with account defaults.
- Review shows submitted platform copy, media/settings, destination count, timing and matching CTA. Per-form direct publish buttons were removed so they cannot skip the release review.
- Reddit now exposes backend-supported kind/text/link fields while retaining subreddit/title/disclosures; its existing media tools are collapsible. LinkedIn reports the selected posting target for validation.
- Existing publishing handlers, provider connections, backend services, Studio, Cam Combiner and Schedule records were not modified.

## Verification completed

- 14 focused frontend tests passed across `publisherWorkflow.test.js`, `UnifiedPublisher.release.test.js` and `UploadPanel.test.js`. Mounted tests use the real Reddit and YouTube forms; external services/media tools are mocked. They cover required fields, preserving copy across tab/step changes, master-copy behavior, owned-media URL reuse and exact scheduled payload/timezone.
- Touched-file lint passed before the last dashboard subtitle-only change.
- Production frontend build passed. A second isolated build with dummy Firebase settings for local browser testing also passed.
- The existing `viralOptimizationService.scheduling.jest.test.js` suite passed both tests.
- The broader `contentRoutes.schedulingBehavior.jest.test.js` suite failed during module loading on an existing dependency imported by `boostChainEngine.js`; this is unresolved at the checkpoint. Inspect its failure and confirm whether it is a checkout/dependency issue before changing product code.

## Still required before merge

1. Complete actual local browser verification and visual comparison. Screenshots are NOT yet accepted/delivered. A local Chromium was made available, but full dashboard verification had not completed when the founder requested immediate push.
2. Exercise all six real forms, particularly TikTok consent, Facebook/Instagram Page selection and LinkedIn organization target. Confirm no layout overflow on desktop/mobile, stable previews, preserved edits, understandable errors and accessible controls.
3. Verify the selected-zone handoff through the real App upload adapter with mocked delivery endpoints, including custom times and Publish now clearing any schedule.
4. Resolve the broader backend test loading failure and rerun the relevant checks; rerun build/lint after any fixes.
5. Verify media edit errors, source metadata, initial Studio handoffs and form validation against actual account data. Some provider forms still have legacy notices/options that may need presentation polish while preserving functionality.
6. Check the existing advanced media controls and their payloads for regressions after the workspace refactor.

## Safety and deployment

Main is configured to auto-deploy: GitHub Pages frontend on main push; Render backend deploy hook after its workflow tests; Cloud Run workers have main/path-triggered workflows. Do not merge or push main as a routine verification step. This checkpoint is a review branch only.

No live scheduled posts were published, rescheduled, paused, cancelled, duplicated or deleted. Local unit tests use fixtures. The browser attempt intercepted all network requests and blocked writes; it did not call a production publishing backend. The founder's six grouped releases / 36 platform posts remain outside the test's mutation scope. Do not claim a live data recount was performed.

## Existing backend limitations

See `schedule-polish-publisher-audit-2026-10-13.md` for the full audit. Provider simulated responses can be incorrectly finalized as successful by the existing runner; submission acceptance is not provider delivery; future schedules are created asynchronously after optimization; providers can alter captions/links/media. These backend issues are unchanged. Auto Publish is not exposed as a third ready release mode. Automatic reposting remains a separate system.

## Founder-approved visual target

The approved screen shows Content/Destinations on the left, a full Reddit form in the center, and Reddit preview plus Before delivery on the right. Six destinations can be Connected while Reddit is incomplete. Missing subreddit visibly blocks Continue to Delivery. The founder explicitly requires each destination's own form. Use master copy wording, real template metadata and exact Delivery timezone are refinements already authorized.
