# Studio backend lease and result integrity — October 4, 2026

**Local verification passed:** 147 Jest tests across 14 complete related suites,
plus 66 Python tests and 28 subtests. No tests in these runs failed or skipped.
This pass repairs the existing CPU analysis queue; it does not add creative
planning, autonomous editing or a new analysis producer. No cloud service,
GPU, billing or IAM operation was performed, and nothing was deployed.

Branch: `agent/director-analysis-staging-browser-v1`.
Starting commit: `9a7fbfc706c2961067c8e14261e5abf6c63ba16c`.

## Repairs

- Lease ownership now requires the current token **and** a deadline strictly
  later than the transaction's current time. Expired and malformed leases
  cannot be renewed, bind a newly computed source hash, queue retries, publish
  failure or mark completion. Live heartbeat renewal remains supported.
- Authority is rechecked after artifact writing and at transactional completion
  after result upload. A late worker leaves its temporary source available for
  a replacement worker. An old worker's success or failure cannot overwrite a
  replacement lease.
- Both publication and authenticated result reads validate owner, job, purpose
  and a positive integer byte count. They stream with the existing 20 MiB cap,
  reject overlong or truncated streams, and verify the exact SHA-256. An existing
  create-only result object must pass the byte check before the job completes;
  matching metadata alone is insufficient. A corrupt result fails terminally
  with `STUDIO_ANALYSIS_RESULT_INVALID`, while a Storage transport error remains
  retryable.
- Completion timestamps and cleanup deadlines use the same injected clock as
  lease checks, making expiry and recovery tests deterministic.

The job API and receipt schema remain compatible. The repaired browser client
suite still polls, resumes, handles cancellation/failure and reads completed
results. Source ownership, generation pinning, source hashes, immutable artifact
identities, human review and canonical project checks are exercised by the
complete related server suites.

The new byte verification adds one bounded Storage read before completion. If
a lease expires during an already-started artifact write or object upload, an
immutable artifact or result object may exist without a completed job receipt.
The result cannot be published by that expired lease; existing delayed cleanup
handles orphan result objects. This pass does not cancel an analyzer HTTP request
that is already in progress or introduce artifact garbage collection.

## Evidence

- [54-test baseline against the starting implementation](baseline.json)
- [Negative control: 12 failures and one valid-object pass](negative-control.json)
- [Final Jest regression: 147 passing tests](regression.json)
- [Python JUnit receipt](python-regression.xml)
- [Python result and warnings](python-regression.log)
- [Lint: zero errors and warnings](lint.json)
- [Source and evidence verification](delivery-verification.json)
- [SHA-256 manifest](files.json)

Sixteen new queue checks cover exact expiry, late expiry, malformed deadlines,
inference returning after expiry, expiry during source hashing, artifact writing
and upload, expired worker failures, live heartbeat extension, a reclaimed lease,
valid and corrupt pre-existing results, malformed byte counts, and an oversized
stream. The original 13 queue checks are also executed in full.

The negative control runs 13 of the new checks against the original service:
12 reproduce failures, while the identical pre-existing result correctly passes.
Three additional heartbeat/reclaim checks were added after repair. The oversized
stream check was strengthened after the first repair run to assert rejection,
stream destruction and generator cleanup. Its initial assertion disallowing
Node's next-chunk prefetch was too strict; that did not represent a service
failure. Final evidence records the corrected test and all 29 queue checks pass.

Firestore transactions, Storage and remote worker calls are simulated in Jest;
the artifact, project-intelligence, revision, review and replay services have
their own complete suites. Python tests exercise the actual local detector on
an available short podcast range and bounded local FFmpeg render fixtures, with
external services mocked. The Python JUnit total is 94 because it includes the
28 subtests alongside the 66 parent tests.

Jest reports the existing `autopromote-server` package-name collision between
the root and Functions snapshot. Python reports two existing protobuf
deprecation warnings. Neither causes a failure. Direct lint uses the legacy
recommended rules; an explicit local rule exception documents the existing
intentional control-character rejection regex.

## Reproduction commands

Run from the repository root with its installed dependencies. In this workspace,
the dependency resolver was set to the main checkout's `node_modules`, and a
temporary frontend dependency symlink was removed after verification. No
dependency manifest or lockfile was changed.

```sh
node node_modules/jest/bin/jest.js --runInBand --silent --runTestsByPath \
  test/studioAnalysisJob.jest.test.js \
  test/studioAnalysisJobRoutes.jest.test.js \
  test/studioAnalysisArtifact.jest.test.js \
  test/studioAnalysisArtifactRoutes.jest.test.js \
  test/studioSourceShotArtifact.jest.test.js \
  test/studioDirectorProjectBinding.jest.test.js \
  test/studioProjectRevisionRoutes.jest.test.js \
  test/studioProjectIntelligenceService.jest.test.js \
  test/studioProjectIntelligence.jest.test.js \
  test/studioDirectorReplayService.jest.test.js \
  test/studioDirectorReviewRoutes.jest.test.js \
  test/mediaRenderMulticam.jest.test.js \
  src/__tests__/mediaRoutes.studioSources.test.js \
  frontend/src/components/__tests__/studioAnalysisJobClient.test.js \
  --json --outputFile=artifacts/studio-backend-integrity-20261004/regression.json

PYTHONPATH=python_media_worker python_media_worker/.venv/bin/python -m pytest -q \
  python_media_worker/test_studio_analysis_analyzer.py \
  python_media_worker/test_studio_face_tracking.py \
  python_media_worker/test_viral_render_contract.py \
  --junitxml=artifacts/studio-backend-integrity-20261004/python-regression.xml

ESLINT_USE_FLAT_CONFIG=false node node_modules/eslint/bin/eslint.js \
  -c .eslintrc.js --no-eslintrc \
  src/services/studioAnalysisJobService.js test/studioAnalysisJob.jest.test.js \
  -f json -o artifacts/studio-backend-integrity-20261004/lint.json
node --check src/services/studioAnalysisJobService.js
node --check test/studioAnalysisJob.jest.test.js
git diff --check
```

The full monorepo test command, a fresh frontend production build, cloud
staging executions and public deployment were not run in this backend pass.
The frontend product source and dependencies are unchanged. The complete
related queue/service/client suites and Python analysis/render-contract suites
were run; unrelated product suites were outside this repair.
