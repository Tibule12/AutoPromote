# Studio source-shot analysis jobs V1

Branch: `agent/director-analysis-source-recovery-v1`. This is an additive CPU
orchestration slice for the existing `opencv-yunet-source-shot-follow` worker.
The manual `/api/media/track-studio-faces` flow remains available. The Studio
frontend can submit and poll jobs with `REACT_APP_ENABLE_STUDIO_ANALYSIS_JOBS=true`
after the server prerequisites are deployed. The switch defaults off and uses
the existing synchronous path for sources without a durable Studio object that
exceed 100 MiB. No GPU, production worker, or autonomous edit is deployed by
this branch.

## API

All endpoints require the existing authenticated Studio tester feature gate.

- `POST /api/media/studio-analysis-jobs` accepts multipart `file`,
  `requestId` (8–128 URL-safe characters), `projectId`, `sourceAssetId`,
  `mode=source_shots`, `start`, `end`, and JSON `anchors` with one `solo` point.
  The source is limited to 100 MiB and the range to 15 minutes. The server
  hashes the uploaded bytes. It returns a job receipt, normally HTTP 202.
  Reusing a request ID with identical bytes and settings returns the same job;
  changing them returns HTTP 409.
- `POST /api/media/studio-analysis-jobs/from-source` accepts JSON with the same
  request settings and an owned `studio/sources/<uid>/...` object path. It
  verifies source metadata, pins its Cloud Storage generation, and queues up to
  2 GiB without a browser download or second upload. The worker streams and
  hashes that exact generation before signing a generation-specific read URL
  for the CPU analyzer. An unavailable pinned generation or hash-qualified
  asset mismatch fails closed. The durable source is never deleted by job cleanup.
- `GET /api/media/studio-analysis-jobs/:jobId` returns the owner-scoped status,
  attempts, failure code, and, on completion, immutable artifact receipts and
  the raw result SHA-256. It never returns the staged source URL or lease token.
- `GET /api/media/studio-analysis-jobs/:jobId/result` returns the exact JSON
  worker output only after completion. The server checks owner, object metadata,
  size and SHA-256 before returning it. The result is capped at 20 MiB and is
  stored privately in Cloud Storage rather than in a Firestore document. For an
  owned source, the result read also verifies the current source still has the
  pinned generation and owner, so a replaced video cannot receive old framing.
- `POST /api/media/studio-analysis-jobs/:jobId/cancel` makes staging, queued or
  running work terminal. A running worker may finish its current HTTP request,
  but its lease can no longer publish completion.

The backend stores `studio_analysis_jobs/{jobId}` using a SHA-256 ID derived
from owner UID and request ID. Upload staging uses create-only Cloud Storage
preconditions. Firestore transactions control `staging → queued → running →
completed`, retry, cancellation and failure. A worker polls due jobs, acquires
a 15-minute lease, renews it every 30 seconds, and calls the existing CPU
worker with a 12-minute request timeout. Transient failures retry once after
one minute. Worker 4xx and invalid source or result contracts fail terminally.
Expired second leases and staging records older than an hour fail terminally.
Terminal jobs remove the temporary uploaded video. Completed result objects
remain available for authenticated reads.

For an owned source, the editor keeps the request ID in session storage under
the exact project, asset, path, range, and anchor settings. Repeating the
analysis after a reload, when the same project is restored, uses that ID to
resume the same owner-scoped job. A
completed, failed, or cancelled job clears that resume entry; a changed object
generation yields a conflict and the next submission starts a new job.

Terminal jobs receive a delayed cleanup marker. After sixteen minutes, the
worker lists only that job's private result prefix, keeps the completed
receipt's exact SHA-256 object, removes any orphaned results and temporary
upload, and marks cleanup done in Firestore. Failed deletion leaves the marker
pending for a later poll. The delay lets cancelled in-flight workers finish
before the sweep. Jobs created by older versions without a cleanup marker are
not swept automatically.

The worker validates uploaded temporary sources by owner, job ID and byte-hash
metadata. It validates owned sources by owner, purpose, pinned generation and a
fresh streamed SHA-256, then reuses the existing source binding and immutable
source-shot/analysis artifact writers. It requires the result SHA-256 to match
the analysis artifact's content hash. Client-declared project and asset IDs
still have the same limited meaning documented in the source binding service; this job does
not independently prove the browser's full local project document.

## Running it

Deploy the four `studio_analysis_jobs` composite indexes in
`firestore.indexes.json` and the amended `storage.rules` before accepting jobs.
The existing catch-all Storage rule otherwise permits authenticated clients to
read or replace these server objects. A Storage and Firestore emulator test
verifies both new paths are denied to clients while an ordinary upload still
works:

```sh
npx firebase emulators:exec --only storage,firestore --project demo-studio-analysis-rules 'node test/storageStudioAnalysisRules.js'
```

Run a separately managed
process with `npm run start:studio-analysis-worker` and normal Firebase Admin
and media worker credentials. The script has an explicit
`ENABLE_STUDIO_ANALYSIS_WORKER=true` guard; it is not part of the promotion
worker and is not started by the web server. Configure the process supervisor
to restart it after a crash. Polling is one job at a time per process; multiple
processes can compete safely for claims.

This milestone has no deployment or end-to-end Cloud Run receipt. The tests
cover idempotency, competing claims, retry, cancellation fencing, abandoned
staging, exhausted leases, owner-scoped routes, result reads, client polling,
and application through the existing editor crop logic. It also covers owned
source submission, generation pinning, worker hashing, durable source retention,
and private result cleanup after a crash.
