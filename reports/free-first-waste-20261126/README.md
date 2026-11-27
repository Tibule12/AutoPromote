27 November release continuation: [actual independent production deployment and remaining Free/Plus gates](../free-first-release-20261127/README.md). Earlier no-deployment statements below describe their original sessions.

# Infrastructure waste reduction — 26–27 November 2026

Implemented locally on `feat/free-first-subscriptions-20261126`, continuing the [processing and operating-environment work](../free-first-optimization-20261126/README.md). The $4.99 Plus proposal, six-day Free reset, shared creative capabilities and existing financial protections are unchanged. Allowance amounts remain provisional. **No deployment, production deletion, infrastructure/billing change, paid processing, production balance change, new schedule or provider publication occurred.**

The main finding is a background retention loop, independent of interactive users. It repeatedly queries four dependency collections and writes unchanged retention fields back to content. Every such write delivers an event to four content-update Functions. The branch now avoids unchanged writes, batches safe preflight queries, reduces diagnostic polling and joins, coalesces nonfinancial counters and removes a redundant media re-upload. Production savings have not yet been observed because these changes are not deployed.

## Production evidence and attribution limits

The earlier 30-day observations remain 32,255,320 Firestore reads, 831,804 writes and 1,984,647 Function executions; current Artifact Registry footprint was approximately 160 GiB. They are provider consumption observations, not invoices or user-level costs.

New bounded, authenticated, read-only collection used metadata GETs and Cloud Logging `entries:list` POSTs (read-only search). No media layers or customer source media were downloaded from production. Raw logs remain private outside the repository. [Sanitized query attribution](query-attribution.json), [historical sample summary](historical-attribution-samples.json) and the [static source navigation inventory](firestore-access-inventory.json) retain the evidence without document identities, filter values or credentials.

- **60 of the latest 100 sampled Firestore requests** have the four distinct `contentId == … / limit 200` query signatures in `publishedVideoRetention.js`: 15 each against `platform_posts`, `promotion_tasks`, `promotion_schedules` and `media_transform_tasks`.
- **All 100 sampled content Commit entries** write precisely `sourceDeleteAfter`, `sourceRetentionDays`, `sourceRetentionStatus`, `sourceRetentionUpdatedAt` and `storagePath`. This matches `storageCleanupService.reconcileRetentionState`, which previously wrote unchanged held/pending outcomes every cleanup pass. It establishes a concrete source of content-trigger activity, not the percentage of all historical writes caused by that source.
- The remaining sample contains 25 Listen requests, six Commit, six BatchGet and three other queries. A Listen request count is not its billable document-read count.
- The four old content-update functions each receive approximately 496,000 deliveries because they subscribe to the same content collection, regardless of whether their own handler needs the changed fields. Handler guards prevent some downstream work; they do not prevent the invocation itself.
- Shared Node gRPC service-account traffic cannot distinguish every Render, workstation/operator or other application retrospectively. These small recent samples **cannot allocate all 32 million reads or extrapolate a monthly percentage saving**. Browser/Python clients, rules/index reads, retries and other applications require separate observation.

| Source / endpoint | Cost-producing behavior | Change / remaining work |
| --- | --- | --- |
| `src/server.js` storage timer → `storageCleanupService` | Cleanup runs when users are inactive; retention scans and source-status writes wake Functions. | Skip unchanged states; preserve genuine status changes/deletions. No retention deadline or publishing hold is shortened. |
| `publishedVideoRetention` | Four queries per content item, including records with no eligible publishing copy. | Skip those ineligible records; use groups of ten content IDs for preflight. A full group falls back to original per-content queries, and deletion still performs fresh transactional dependency checks. |
| `/api/admin/system/activity` | Twenty activity rows each looked up their user; concurrent views duplicated the same work. | Reuse each user lookup within a response; authenticated per-UID/path/query ten-second cache and shared in-flight request. |
| `/api/admin/system/errors`, `/api-metrics`, `/firebase-usage` | Duplicate diagnostic history/aggregate reads. | Same bounded cache; errors are not cached. Financial decisions and processing admission do not use it. |
| `SystemHealthPanel` | Five GETs and an integration scan every ten seconds. | Visible, serial, abortable polling; scan only initially and on explicit action. An interrupted initial scan retries when visible. |
| `LiveLogViewer`, `PlatformHealthPanel` | Two-second log / sixty-second health polling while hidden; overlap possible. | Visibility-aware serial polling and cancellation; manual refresh preserved. |
| `UserLiveLogViewer` | Three Firestore listeners remained active in hidden tabs and replayed entries after reconnection. | Release after a thirty-second hidden grace; reconnect once, deduplicate entries, clean up on owner change. Very short tab switches avoid reconnect billing. |
| `metricsRecorder` | Each concurrent system-counter increment committed separately. | Coalesce queued increments while preserving totals and awaited completion. Only operational counters; no wallet, allowance or financial ledger aggregation. |
| `autopromote-functions/index.js` | Four update triggers per source write; replayed approvals could add schedules. | Opt-in single selected-handler router and deterministic approval-event schedule identity. Default exports retain the old update triggers until an approved coordinated migration. |
| Queue/scheduling and background activity | Scheduled work must run when users close the UI; treating polling as demand keeps optional analysis alive. | Previous event-driven due-work watchers and demand expiry remain. No schedule is disabled or gated on UI visibility. |
| `contentRecoveryService`, OAuth/lock/clip cleanup, platform stats and separate apps | Other idle cron/timer/query sources remain. | Inventory and opt-in attribution are supplied; no unmeasured savings or blanket timer shutdown is claimed. |

## Measured local before / after

[Machine-readable measurements](local-before-after.json) come from the actual Node Firestore SDK, a fresh local Firestore emulator and real loopback HTTP. Auth/admin rejection is checked before the diagnostic cache; HTTP performance fixtures use controlled authentication, not a claim of production identity/load testing. Both versions use the same fixture. Baseline modules come from the retained Git HEAD, with new code loaded separately. Read figures are returned documents plus minimum empty-query reads, not a bill or complete index/rules attribution.

| Workload | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Twenty sparse retention dependency checks | 80 queries / 80 read estimates | 8 queries / 26 read estimates | 90% queries / 67.5% reads |
| One hundred unchanged held-source cleanup passes | 100 content writes | 0 writes | 100% of these redundant writes |
| One hundred concurrent metric increments | 100 commits | 2 commits; all 100 increments retained | 98% commits |
| Twenty concurrent identical admin activity views | 420 SDK calls / 800 reads | 2 SDK calls / 21 reads; identical response | 99.5% calls / 97.4% reads |
| Same content-update fixture, 1,004 updates | 4,016 legacy deliveries | 1,004 routed deliveries; four relevant handlers | 75% delivery count, local simulation |
| Twenty replayed approval events | Duplicate risk with random IDs | Exactly one schedule; distinct new event accepted | One successful create |
| Retained actual 60s native movie adoption | 26,797,595 bytes backend re-upload | 0 backend media re-upload | 100% of this outbound leg |

The test also invokes the **actual Firebase Functions SDK consolidated export** twice and confirms one emulator schedule. Simulated delivery counts are not actual Cloud Function invocations. Nonvideo/non-owned-copy retention fixtures perform zero dependency queries and zero storage operations. Unchanged source status does not write; a changed status writes immediately. Existing pending publication/source ownership/generation guards remain.

Measured CPU/RSS/HTTP latency and wall times are in the JSON, including a peak of twenty concurrent HTTP requests. These are local process measurements, not a production Render capacity test. Repeated emulator timings vary; request/read/write and delivered-byte counts are the meaningful before/after outcomes.

| Local fixture | Wall time before → after | Node CPU before → after |
| --- | ---: | ---: |
| Sparse retention preflight | 254.8 → 46.3 ms | 216.3 → 32.4 ms |
| Unchanged retention outcome, 100 passes | 501.4 → 0.76 ms | 221.1 → 0.86 ms |
| Counter burst | 256.0 → 9.0 ms | 141.5 → 4.4 ms |
| Twenty simultaneous activity requests | 1,837.2 → 33.9 ms | 1,393.9 → 31.1 ms |

The HTTP burst's p95 is 1,807.1 → 30.4 ms. End-of-fixture Node RSS is 198.5 MiB; process peak RSS is 215.6 MiB. Node CPU/RSS excludes the separate emulator JVM and is not the media worker's footprint. This run includes test/SDK overhead and is not a production throughput forecast.

## Media transfer and output quality

[Media transfer evidence](media-transfer-before-after.json) uses the actual retained [60-second Studio movie](../free-first-optimization-20261126/actual-studio60-verified/studio-free-output.mp4), the real GCS Node SDK and a local Firebase Storage emulator. Before and after deliver exactly 26,797,595 bytes with SHA-256 `632606ea5293c2e14e8dda2ef52b504585213c50d05cb41fe0e5f1fe4c441931`. It is the previous normally authored/exported movie, not a new creative render or new authoring qualification.

Worker-bucket adoption still hashes the complete, generation-bound source and validates size/ownership/job/hash. It now uses a generation-bound server-side GCS rewrite with create-only destination instead of a temporary backend file and a full backend re-upload. Existing target replay is identity-checked. Source media is not re-encoded or deleted. One complete GCS→backend read remains for SHA-256 verification; transient HTTP worker output and platform publishers retain their separate transfer paths. This is not a claim that every media byte now avoids Render.

The installed emulator mounts rewrite at `/b/...`, while the SDK sends `/storage/v1/b/...`; the final test adapts **only that local URL prefix**, retaining SDK rewrite protocol. Earlier 501 failures and logs are preserved. The emulator does not qualify cloud IAM, generation race semantics, retries, large multi-request rewrites or hosted network charges. Existing unit checks cover hash mismatch, conflicting ownership, immutable generation, create-only/replay and MOV handling. Actual GCS qualification requires an approved controlled production integration check. [GCS rewrite semantics](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/rewrite).

Browser media uploads, canonical output signed URLs and existing stream-based publishers remain. Moving an entire publisher into a same-region worker requires its own bounded financial/provider adapter and publication proof; no such deployment is inferred.

## Render measurement and sizing

`COST_TELEMETRY_ENABLED=true` enables bounded per-process in-memory attribution of Firestore SDK calls, collections/filter-field shapes, application, route and source code location. It records no filter values or document IDs and performs **zero Firestore telemetry writes**. Express timing also records process CPU/RSS, peak concurrency, p50/p95/max latency and available cgroup CPU/memory limits. The authenticated admin-only `/api/admin/system/runtime-profile` returns this snapshot with private/no-store headers. The flag is off by default; the Functions source mirror contains the same implementation.

The real local SDK tested is Firestore 7.11.6. The stream observer preserves existing emit/return/error behavior without attaching a new flowing-data consumer. This opt-in SDK interception needs version-specific rollout qualification. Counters are per-process estimates, not billing; browser/Python/other-app instrumentation and a representative production observation window remain necessary.

Current hosted Render CPU, memory, latency, concurrency, exact instance/replicas, bandwidth and disks remain unavailable. The Render plugin was discovered and suggested, but no authenticated connection became available. The [historical plan/reference estimate](../free-first-optimization-20261126/OPERATING-ENVIRONMENT.md) remains the baseline, not a verified current bill. **No instance upgrade is recommended.** Capture hosted normal/peak load after waste reduction and separate API work from media before making a sizing decision. No paid load test or infrastructure change was run.

## Artifact Registry cleanup inventory

[JSON](artifact-cleanup-inventory.json) and [CSV](artifact-cleanup-inventory.csv) enumerate **216 images**, compared against **318 service revision/job/recent execution references**. **110 are unreferenced in the inspected Cloud Run metadata** and marked for manual ownership review. This does not establish that they are unused: tags, current/rollback history and other consumers matter.

All 216 currently have a keep reason under the conservative policy: observed references, tags, newest five versions per package, images younger than thirty days, or protected Functions/source-deploy repositories. **Zero images are deletion-qualified; zero deletion commands were executed.** Protecting every tag deliberately requires manual owner review before releasing old tagged builds.

Before any deletion: complete the truncated revision/execution pagination, resolve 45 Gen1 Function runtime-image references unavailable in returned metadata, inspect Render/external consumers, and resolve OCI index/attestation relationships and shared layers. Per-image `imageSizeBytes` cannot be summed as verified reclaimable space. The old Monitoring figure and current repository footprint discrepancy remains explicit. Owner approval is required for production cleanup. An inventory is supplied; a safe GiB-reclaim claim is not yet possible.

## Complete economics: measured counts versus reference estimates

The [full five-class operating model](../free-first-optimization-20261126/OPERATING-ENVIRONMENT.md), [39-component inputs](../../config/free-first-operating-economics.example.json), [population scenarios](../free-first-optimization-20261126/operating-economics.json) and [per-workflow economics/capacity](../free-first-optimization-20261126/workflow-economics.json) remain the baseline. This patch supplies measured reductions to specific waste paths; it does not invent a lower historical invoice or apply the sampled percentages to the whole bill.

| Cost class | Treatment after this implementation |
| --- | --- |
| Fixed monthly | Render rent/build/cron, registry retained footprint and other standing costs remain until actual service/cleanup changes. No extra instance, disk or workspace plan is assumed. |
| Per registered user | Metadata/index storage and onboarding remain; inactive registrations do not incur fictitious media processing. |
| Per active Free user | Diagnostic/read/listener traffic can fall with these changes, but most listed admin panels are operator overhead, not a per-Free-user tariff. Production session attribution is needed. |
| Per paying user | Same efficiencies and creative tools as Free; existing payment fees, entitlement security and renewal accounting preserved. |
| Per processing operation | Avoided re-upload/disk work belongs to the affected bucket-adoption operation only. Do not subtract it again as generic Render hosting or append old aggregate consumption to token costs. |

Illustrative marginal savings, using the earlier us-central1 references of $0.03/100,000 reads and $0.09/100,000 writes: 779 avoided admin reads save **$0.0002337** per measured twenty-request burst; 100 avoided retention writes save **$0.00009**, plus avoided trigger compute/network; 98 avoided counter writes save **$0.0000882**. These are gross rate estimates before shared grants. The largest benefit can be released API capacity and prevented trigger fan-out rather than a large document-operation discount. [Firestore pricing and daily grants](https://cloud.google.com/firestore/pricing).

The approximately 160 GiB registry footprint held for a month is around **$16/month gross** at $0.10/GiB-month, before the shared 0.5 GiB grant; **no registry savings are booked** until a safe approved cleanup changes actual retained bytes. A 26,797,595-byte avoided Render outbound leg is approximately **$0.0040/export** at the earlier $0.15/decimal-GB overage reference **only after any workspace grant is exhausted**. It is not a measured invoice credit. [Registry pricing](https://cloud.google.com/artifact-registry/pricing), [Render pricing](https://render.com/pricing).

Consolidating four update triggers reduces their delivery count by 75% for an unchanged source-update volume. Preventing no-op writes can reduce that volume further. Do not add overlapping percentages. Function invocation grants may already cover the observed count; compute, network and billing-account sharing still matter. No paid Function execution or invoice saving was measured here. The previous rough **$55.31–$59.17 mixed consumption/footprint subtotal** is neither fixed rent nor an amount to add to future token expenditure.

No numerical allowance is finalized by these tests. Free 100/six days with its rolling 500 ceiling and Plus 500/24-hour usage window with a rolling 2,000 ceiling remain provisional, with the existing conditional per-workflow capacities and reservation constraints. The $4.99 price and six-day reset are unchanged. Independent-camera drift/active speaker/reaction workflows, first-use background/3D, complete six-provider publication and funded production adapters still need their own complete-workflow evidence. No quality setting or feature-based paywall was introduced.

## Rollout, accounting and next gates

All local changes are reviewable; production activation remains pending owner approval.

1. Review retention query/write optimizations and run existing publication/source-deletion guards. Observe actual source-update volume and DB/query latency after an approved release; local rates are not a 30-day forecast.
2. Qualify the opt-in telemetry against each deployed SDK and label each application. Observe hosted Render CPU/RSS/p95/concurrency, route/query/listener shape, idle versus active traffic and retries over a representative interval. Never cache or aggregate financial admission/ledger decisions.
3. `CONTENT_UPDATE_ROUTER_ENABLED=true` exports the new `contentUpdated` function and omits the four old update exports **from the local package**. A coordinated approved release must retire the deployed old triggers. Deploying the router alongside them increases fan-out. Keep create triggers and all retained promotion/page/link/reward behavior. Review replay semantics of page/link/reward handlers before changing retry policy; the new router does not grant universal exactly-once execution.
4. Preserve verified PayPal plan/currency/period checks, webhook verification, retired unverified upgrade path, server-owned financial rules, legacy balances, immutable liabilities, reservation idempotency and anchored reset/rolling windows. Complete qualification of production dispatchers listed in the [existing migration/bypass report](../free-first-optimization-20261126/MIGRATION.md). Opt-in routing is not financial admission authority; unqualified adapters continue to fail closed.
5. Complete safe registry ownership/reachability review, then present exact digest/rollback/unique-byte evidence before requesting any destructive cleanup. Do not enlarge hosting to hide idle waste.

Current regression evidence: [56 emulator/native/economics/security cases](free-first-regression-final.log), [retention/output/background guards](retention-output-background-final.log), [dispatcher/publishing/financial regression](dispatcher-publishing-financial-final.log), [visibility/listener/component checks](frontend-polling-tests-final.log), and [strict frontend build](frontend-build.log). Final browser/contract/check results are linked in the handoff below. Historical failed diagnostic logs are retained and superseded only by the specifically named passing final checks.

Final validation also passes: 40 retention/output/background cases, 168 dispatcher/publishing/financial cases (overlapping background coverage), eight frontend polling/subscription/component cases and 17 knowledge cases. The [eight-layout anonymous comparison](welcome/verification.json) preserves the prior welcome content with zero browser errors. The [actual signed-in candidate workspace/help check](client/verification.json) opens the retained 60s movie, shows the Free allowance page and receives the real contextual caption-help response, without mocked API responses. [Headless/muted recordings](client/recordings) and screenshots are retained. The first check selected a dashboard help button behind the full-screen editor; that selector failure is retained in `client-initial`, and the passing check uses the editor's actual Captions help control.

[Studio record contract](studio-contract-final.log), [knowledge generated-file check](knowledge-check-final.log), [packaged Functions exports](functions-exports-final.log) and [critical-file preflight](preflight-final.log) are separate from deployed-runtime/creative approval. Formal counts remain 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO-READY / 0 PRODUCTION-READY; historical typography 13/16 failures and S02/S04/S03 remain. Existing source/output/owner-review and scheduling holds are preserved.

Reproduce locally with `node scripts/test-free-first.cjs` (Java 21 and the already installed SDK/worker dependencies), `node scripts/monetization/classify-waste-evidence.cjs` (requires retained private audit inputs) and `node scripts/monetization/inventory-firestore-access.cjs`. `observe-waste.py` performs only bounded authenticated read-only metadata/log searches; do not enable deployment/paid workload paths. No complete historical billing export or current Render/PayPal merchant statement is available.

The [private local checkpoint summary](local-checkpoint.json) preserves native Firestore, Auth, Storage and idle signed-worker state for this fresh demo before closing its services. Two local test users, four documents and the media evidence are retained outside the repository; complete fresh-emulator replay is not independently qualified. Prior builds, original workstation services and the separate Education runtime are preserved. [Source hashes](source-hashes.json) bind the final local implementation and checks; they do not establish deployment.
