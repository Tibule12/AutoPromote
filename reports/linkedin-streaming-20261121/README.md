# Media memory and publishing recovery — 21 November 2026

A real 50,337,351-byte LinkedIn upload coincided with two Render 512 MB out-of-memory crashes. The former implementation downloaded the entire video into a Buffer, allowing media-sized allocations and transport copies to add to the live API baseline. The owner asked whether this also affects other work. This follow-up covers the other public media transfer paths and competing publishing runners, rather than treating the incident as an upload-only problem.

## Changes

| Path | Correction |
| --- | --- |
| LinkedIn video and images | Stream known-length sources with backpressure; stage unknown lengths to owned scratch; enforce byte limits, deadline and cleanup. Poll with the opaque asset ID rather than the full URN. |
| Publisher source-file fallback | Stream raw requests directly to resumable Storage uploads. Preserve ownership, MIME/name validation, exact byte counts and HTTP validation responses; delete failed partial objects. |
| Content download | Pipeline both Node and Web response streams; remove the Web-stream whole-body fallback. |
| Studio analysis, face tracking and transcription uploads | Multer stores bounded files in owned temporary directories; streaming hashes and Storage writes replace request-sized Buffers. Response completion/disconnect removes scratch. Durable job identity and source ownership checks remain. |
| Caption transcription | Disk-backed multipart input with original filename/MIME metadata passed through to the provider. |
| Reddit native media | Stage and stream multipart video/poster uploads; generate an optional poster while the staged source still exists. Publication verification reads only the MP4 signature even when a CDN ignores Range. |
| Legacy direct TikTok upload | Stage the actual source before initialization; use the actual size for init/range/length; stream the PUT and remove scratch. |
| X native media upload | Stage once and stream sequential APPEND segments of at most 5 MiB. Private Google Storage fallback uses the SDK stream. |
| Media transforms | Replace the Web-stream whole-body download fallback with a pipeline to disk. |
| Paused source frames, speech preview and 3D video textures | Hash staged source files incrementally instead of reading the full source movie into RAM. Existing bounds and canonical rendering stay. |
| Admission | A shared process budget limits simultaneous media transfers, reserves memory for admitted work and rejects overload with HTTP503 / Retry-After15. Large structured request parsing and speech preview have explicit reservations. The extended health diagnostic reports the budget and RSS. |
| Publishing queue | Transactionally re-read and claim queued/stale tasks before dispatch. Two runners cannot claim the same ready task. The API reentrancy guard now covers queue checks and lease acquisition too. |
| LinkedIn recovery | Persist a submission intent before the public POST, then the actual provider post ID. A confirmed receipt is reused without another POST; an ambiguous submission is held for profile review. An ambiguous network/5xx result retains its intent. Do not delete the source merely because the upload is AVAILABLE. |

The connected-account recovery already published the owner-approved festival film with actual provider HTTP201: [public post](https://www.linkedin.com/feed/update/urn:li:ugcPost:7529815857808461824). The interrupted task was cancelled before that direct provider request, then reconciled with its real receipt. This branch does not publish anything else.

## Evidence and limits

`media-memory-check.cjs` exercises the actual new staging utility in an isolated Node process with a128MiB V8 heap limit. It stages two concurrent128MiB sources, consumes256MiB, rejects a third transfer with503 and finishes with zero occupied slots. Exact measured RSS and timing are retained in `media-memory-check.json`. This is synthetic local evidence, not a claim that the live API has the same baseline or supports a particular user count. All200 focused tests in29 suites pass; results are retained in `verification.json`. The synthetic transfer process peaks at79.4MiB RSS (33.7MiB growth). Studio contract and documentation build/check pass; eight existing undocumented-surface warnings remain. Provider responses and Storage in these tests are fixtures; no new paid processing, social posts or production load test occur.

## Release and scaling work still required

The expanded fix is prepared in PR552 and is **not deployed**. No instance, memory tier, GPU allocation or billing setting is changed.

1. Merge/release the tested code, then measure the actual API and worker RSS under representative concurrent imports, previews, publishing and render requests. Check memory, latency, error rates, queue age and recovery during restart. Choose worker/API limits from those measurements; do not treat a512MB process as qualified for many users.
2. Publishing can be isolated using the existing `npm run start:worker` entrypoint. Start and verify the dedicated worker with the existing production credentials/network access first. Only then set `API_PROCESS_PUBLISHING_TASKS=false` on the API. Keep scheduler/cleanup enabled. This switch affects platform/YouTube publication, not media transforms; those tasks remain serviced. Set the API switch back to true for rollback if the worker is unavailable. The switch is opt-in and has not been changed live.
3. Legacy local FFmpeg transforms and caption burn-in still need process/worker isolation and child-process memory qualification before broad production load. Paused-frame/speech preview also have bounded local subprocesses; their existing per-owner limits are not a fleet throughput proof. Local3D/content-factory execution and artifact handling have separate process/resource requirements and are not qualified by these transfer tests. The canonical CPU/GPU rendering workers are separate services already; source workflow settings are not proof of their current live capacity.
4. Configure production memory/error/queue-age alerts and rehearse recovery. The shared budget is per process; it does not replace distributed quotas, autoscaling or load testing.
5. LinkedIn's write-only permission cannot identify a post after a crash exactly at the submission boundary. Such a receipt now stops blind resends and requires review. No exactly-once provider guarantee is claimed.

Formal Studio readiness remains17 FUNCTIONAL /9 PARTIAL /1 BROKEN /2 UNIMPLEMENTED /0 PRO /0 PRODUCTION. Shared S02 picture/audio/throughput, S04 motion depth and S03 ownership remain open. No source movie, account snapshot or existing held publication is modified by this fix. No secrets, private tokens or signed media URLs are committed.

## Actions follow-through

The initial expanded branch failed the CI integration workflow because the lightweight database adapter lacks transactions. Its fixture now serializes read/commit, models atomic create-if-absent and server timestamps, and deletes the actual document refs between tests. The cooldown mock is installed before the queue imports its function reference. The concurrency assertion now requires exactly one dispatch. The exact integration selection passes locally:23 passed,1 pre-existing skipped. CodeQL path findings are addressed with a constrained reconstruction of the server-generated scratch-directory component and a constant source filename; adversarial paths are rejected before filesystem access. Fixture host matching uses parsed hostname equality and the scratch-file test has an explicit request limiter. Remote security/replacement workflow conclusions are pending until the corrected commit completes.
