# Publishing

Development documentation • product 1.2.0 • knowledge 1.0.4 • 2026-10-13

Readiness is scoped to each entry. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

## Connected publishing platforms

ID: `publishing.connections` • **PARTIAL** • DETERMINISTIC

Connects supported platform accounts through existing permissions. Displayed platform names are not proof every provider is qualified end-to-end.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open Connections while signed in and connect the intended platform account.
2. Open Publisher and review the account, Page or posting destination returned by the provider.
3. Resolve a provider reconnect or permission error before publishing.

**Preview:** Publisher shows the selected media with current account and destination information. A connected label alone does not confirm current posting permission.

**Final render:** Connection checks do not render or generate media.

**Limits**

- Provider permissions, token health, account allowance and destination access apply.
- The current provider must verify the posting identity; a stored connection alone is insufficient.
- Six-platform external delivery has not been qualified by the connection checks.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Scheduling

ID: `publishing.schedule` • **PARTIAL** • DETERMINISTIC

Schedules or reposts eligible content through the existing account-linked pipeline. External delivery depends on current connection and platform constraints.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Select an owned completed movie in Publisher and set the title and description.
2. Choose connected destinations, review platform-specific options and set a future date and time.
3. Review the exact destinations and timing, then choose Schedule posts.
4. Open Schedule and verify each requested platform has the intended pending schedule.
5. Use Queue period to review the next seven days or all schedules. Load another page when more entries remain.

**Preview:** Publisher previews the selected movie and review details; Queue displays pending owned schedules.

**Final render:** Scheduling uses the selected completed movie. It does not rerender or allocate a generation worker.

**Limits**

- Provider permissions, destination access and account allowance apply.
- An upload acknowledgement does not prove every schedule was created.
- A pending schedule needs an operating scheduler and posting worker. Only a successful provider result confirms publication.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** [Queue period](../control-reference/index.md#publishing-queue-period), [Load more schedules](../control-reference/index.md#publishing-queue-load_more)

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Prepare an owned publishable export

ID: `publishing.export` • **PARTIAL** • DETERMINISTIC

Selects an owned completed movie as the publishing input; a private review candidate does not automatically gain public release permission.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Inspect the complete exported movie and soundtrack.
2. For a Studio edit, retain the editable project and a real recording showing its timeline and final playback.
3. Select the completed movie or matching Studio recording through Publisher and review the media preview.

**Preview:** Publisher previews the actual selected media. A Studio recording shows the editor and its timeline; the separate final movie preserves the exported picture quality.

**Final render:** The shared Studio renderer produces the movie. Publisher accepts that completed media rather than creating a separate marketing render.

**Limits**

- Verify source rights and permission to share the selected output.
- Private diagnostics and projects do not automatically become public demonstrations.
- A screen recording of a finished movie does not establish predictive preview/render parity.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Publishing

ID: `publishing.publish` • **PARTIAL** • DETERMINISTIC

Submits selected owned content to eligible connected platforms under the existing publishing checks. A queued request is not confirmed external publication.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Select the finished media in Publisher and choose the intended connected platforms.
2. Customize titles, copy, destination and required disclosures for each platform.
3. Review timing and destinations, then submit through the normal account checks.
4. Inspect the queue and final provider result; do not treat accepted uploads as posted videos.

**Preview:** Publisher shows a platform preview and final media/destination/timing review.

**Final render:** Posting uses the owned uploaded movie. Selected Reddit video media carries a native video submission type rather than a text-only post.

**Limits**

- Current connection health, platform permissions, destination access and account allowance apply.
- Queue acceptance and pending schedules do not confirm external publication.
- Broad six-platform delivery remains unqualified until actual provider results exist.
- Own-business promotion and paid partnerships use different disclosures. Describe the actual relationship before selecting the platform fields.
- A created Reddit post can lack playable video. Publication requires a completed attachment and accessible media; a link or upload acknowledgement is insufficient.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.
- unsupported_platform: The publisher has no handler for the reported platform. Use a supported connected destination; do not treat a queued item as a completed platform publication.
- disabled_by_feature_flag: The reported TikTok dispatch was skipped because publishing is disabled in this environment. An account connection or schedule alone does not establish dispatch availability. The help panel cannot change this setting.
- LinkedIn reports an expired access token: Reconnect LinkedIn in Connections and retry the failed post. A refresh is possible only when the provider supplied a refresh token.
- Reddit creates a post that only shows a video link: Check the actual video attachment and playback. A video poster should come from the selected movie; an incomplete attachment is not a successful video publication.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.

## Analytics

ID: `publishing.analytics` • **PARTIAL** • DETERMINISTIC

Loads account-scoped performance and workflow data with range/entitlement restrictions. Missing platform metrics must not be invented.

**Available to:** signed-in users with owned project and applicable entitlement

**Media:** video

**Requires:** system.account (FUNCTIONAL)

**Optional:** None recorded.

**Workflow**

1. Open the relevant workspace with an owned source.
2. Review the result and its limitations before saving or exporting.

**Preview:** Uses the existing project preview. Broad picture and sound agreement with final export remains unqualified.

**Final render:** Uses the existing render path where supported. Inspect the actual exported movie; the status does not certify every combination.

**Limits**

- Provider permissions, connection health and account allowance apply.
- No external platform publication was performed or qualified in this documentation session.

**Common errors**

- Feature unavailable or output stale: Check source ownership, required features and current processing state. Review and regenerate only through the existing workflow.

**Controls:** No source-qualified editable control is recorded.

**Guides:** No task guide in V1.

**Templates:** No pinned shared-template binding recorded.
