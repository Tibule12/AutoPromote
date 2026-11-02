# Google Cloud cost cleanup — 31 October 2026

Executed against `autopromote-cc6d3` (project number `341498038874`) using the verified active Google Cloud account. Work is isolated on `feat/gcp-cost-cleanup-20261031`; no merge or application deployment.

## Executed changes

- Deleted **8 exact image versions**: seven unused full Cam Combiner worker builds from August and one superseded, untagged repair build. All eight deletion operations completed successfully. Inventory: **91 → 83** versions.
- Protected every existing image referenced by 229 retained service revisions, seven jobs and 33 retained executions, resolving digest and tag aliases and checking manifests. Also inspected Compute instances/templates, Cloud Functions, Vertex models/endpoints and active builds. There were no active executions/builds. Five newer full-worker builds remain, including the current job release. Recent model images, CPU processing images, GPU images and uncertain/rollback images remain.
- Narrowed `gcr.io` automatic deletion to the verified Kaniko build-cache package `cam-combiner-worker/cache`, older than 14 days. Removed its broad three-day untagged-image rule and increased recent-version retention from three to five. The cache-only rule was checked in preview against inventory/references before activation; it currently matches zero images.
- Put `thulani-repo` runtime-image cleanup in **dry-run**: its old age/untagged policy cannot guarantee preservation of all retained revision digests. Rules were preserved for review. The two empty repositories and their policies were unchanged. Ordinary runtime/test image deletion needs reference-aware review; age alone is insufficient.
- Enabled the Budget API and added a **100% forecast** alert to the existing **$20/month** project budget. Existing actual-spend alerts at 50%, 90%, 100%, recipients/default notifications, project scope and budget amount remain unchanged. No Pub/Sub topic, shutdown action or spend cap was introduced.

## Storage and billing

| Measurement | Bytes | GiB |
|---|---:|---:|
| Registry baseline (all four repos) | 90,108,914,670 | 83.920466 |
| Final reported registry storage | 90,108,892,180 | 83.920445 |
| **Confirmed counter reduction so far** | **22,490** | **0.00002095** |
| Deleted images' logical total (shared layers included) | 6,656,134,860 | 6.199 |
| Estimated blobs exclusive to removed images | 6,007,945,554 | 5.595 |

The image versions are gone, but the storage counter has not yet reflected the estimated layer reclamation. **Do not count the estimated 5.60 GiB as measured reclaimed storage.** Layer sharing was checked across all 91 inspected image manifests; registry garbage collection and accounting can affect the eventual result.

Projected storage savings are approximately **$0.56/month**, conditional on those exclusive blobs being reclaimed, 730 hours/month, unchanged usage and the USD [Artifact Registry rate](https://cloud.google.com/artifact-registry/pricing) of $0.000136986/GiB-hour above the billing-account free allowance. No invoice saving has been measured yet. The engineer's ~$23 October / ~$2 compute figures are supplied context, not independently verified invoice totals: this project exposes no BigQuery billing-export dataset. No paid query/export or storage backup was created.

Monitoring returned **24,680,426 Firestore document reads** for the October 1–31 query window, including a partial final day. This is aggregate usage, not attribution of waste or billed reads. Legitimate testing/scheduling remains included. Dollar savings from local Firestore fixes are not yet measurable because they are not deployed.

## Local application fixes

1. Dashboard notifications pause while hidden, resume when refresh is due, avoid overlapping requests, and abort on unmount. Brief focus changes cannot generate extra polls. Visible refresh remains once per minute. This also fixes the previous visibility handler, whose timer guard prevented catch-up.
2. `withCache` shares a pending lookup for the same key. Concurrent auth/profile/terms/notification requests no longer issue duplicate underlying lookups while the first query is unresolved. Existing TTLs, user/query key separation, failures and retry behaviour remain intact.

Publisher, Queue and Calendar source paths were reviewed; legitimate explicit refreshes and post-action queries were preserved. Their platform and schedule tests pass. Studio polling/preview/render loops were inspected for context and left unchanged as requested. No scheduling data, histories, projects, credits, subscriptions or Firestore rules were changed. No production SDK fixtures or automated test reads were run; integration fixtures used a fresh loopback **demo** emulator, then the emulator and temporary files were removed.

Validation: **31 distinct Jest tests passed**, plus an actual Firestore emulator integration check proving ten concurrent requests issue one query, cached repeats issue none, and separate users remain isolated. The first wider Publisher run had one 5-second deadline timeout; its isolated 30-second-deadline rerun passed all nine cases. Existing React act warnings remain. Syntax, formatting and `git diff --check` passed. Details: `checks/summary.json`.

## Rendering and live verification

- All seven jobs have **zero retries**, **one task**, **parallelism one**. CPU render deadlines remain 14,400 seconds. GPU deadlines remain 300/600/3,300 seconds as configured; tracking CPU remains 120 seconds. RTX PRO 6000 allocations and CPU/memory limits were unchanged.
- Worker retry-budget environment values already agree with Cloud Run's zero-retry setting. Reviewed terminal-failure handling, idempotent refund/capacity release and existing cancellation records. The API dispatcher does not expose a complete cancellation-to-execution path; no speculative cancellation changes or execution deletion was made.
- All five service configurations, traffic and Ready revisions remain unchanged; all **229 retained revisions** remain. Both CPU and all GPU job configurations match baseline. All previously existing resource-referenced image versions remain. Some historical revision source digests were already absent from registry inventory before this task; no restoration/rollback availability is claimed for those pre-existing gaps.
- Live production API and media worker health returned HTTP 200/OK; frontend returned HTTP 200. Protected API/Cam endpoints reject anonymous health requests (403); worker `/health` is not exposed (404). Control-plane state for all five services remains Ready. Production diagnostics confirmed **backgroundJobsEnabled=true**, a current worker heartbeat and no pending tasks in the bounded sample. No posts were published, rescheduled, paused, cancelled or deleted during verification.
- Cloud Run and Firestore quotas were inspected and left unchanged. The project has no Cloud Monitoring alert policies/notification channels; existing billing-budget notifications remain the cost safeguard, now with forecast coverage. No automatic shutdowns were added.

## Review requiring approval

- Deploy the local application fixes after review; no merge/deployment has occurred.
- Optional CPU timeout proposal: **4h → 2h** for the two Cam Combiner jobs, only after testing the longest supported workload. The 15 retained CPU executions peaked at 2,782.2 seconds, which is insufficient to establish all customer workloads. Exact commands and preconditions are in `cloud-run-proposal.json`; **not applied**. No GPU changes are proposed.
- Runtime-image cleanup stays in preview where safe dependency/rollback retention cannot be guaranteed. Activating broader image deletion requires that technical protection first, rather than deleting by age.

## Removed digests

| Image/digest | Uploaded UTC |
|---|---|
| `cam-combiner-worker@sha256:a4186a6a89a3cf44725b414d738c0ffbadc0d0c8c359ff27d1906b0edffea033` | 2026-08-22 |
| `cam-combiner-worker@sha256:79d2e76f1c3a3e1a299cd4bb3c2df8f77434eece2767c3e6a3c7456aac03a750` | 2026-08-22 |
| `cam-combiner-worker@sha256:278c9d3736cc026ee0e6188aa69b9d7e75c3ff23ea49ff9c3a4aadbc2ac15046` | 2026-08-22 |
| `cam-combiner-worker@sha256:b36fa75a10b68e8d077d8ad363bb81367a6ea738da36b889b494aa30dc011a2e` | 2026-08-13 |
| `cam-combiner-worker@sha256:f6f63c2f11f9e775ce3305d35ee3b3c7c1e6d95836bf3e23a3b806fc4481493f` | 2026-08-13 |
| `cam-combiner-worker@sha256:4f69bd169811dfab74438236359c28ed842242e3de453d9b5c4eaa64f8a8e759` | 2026-08-13 |
| `cam-combiner-worker@sha256:da1a17649da6cb9d27be337d259911a12a43ba4dc84f2715ce10e0fde4193732` | 2026-08-13 |
| `multicam-lipsync-repair@sha256:fb0ccc6696aa888af5a818dcce8d0a67c2efb7ff6f339be6b3b9460f5878d9a8` | 2026-08-22 |

Full image metadata/decisions: `image-inventory.csv`. Exact allowlist: `cleanup-plan.json`. Final assertions: `verification.json`. Raw cloud responses are kept locally under ignored, access-restricted `private/`; they contain configuration metadata and are not for publication.
