# Studio analysis staging proof — October 3, 2026

The isolated project `autopromote-staging-2026` was created and linked to the
existing AutoPromote billing account. It has Firebase enabled, a Firestore
Native `(default)` database in `us-central1` with deletion protection, and the
default `autopromote-staging-2026.firebasestorage.app` bucket in `US-CENTRAL1`.
The repository's Firestore and Storage rules were deployed to this project.
All four `studio_analysis_jobs` composite indexes were `READY` before the
Cloud Run job test.

The staging worker image was built from
[`Dockerfile.studio-analysis-worker`](../Dockerfile.studio-analysis-worker) with
[`cloudbuild.studio-analysis-worker.yaml`](../cloudbuild.studio-analysis-worker.yaml).
Cloud Build `f138104a-4841-46e7-9d60-f12ea9ff83f8` finished `SUCCESS`; the
image digest is
`sha256:0b31db10eacaf41a97d8d5a0c6db1f7b4476181b17fc653a34760cc196822f3a`.
The initial `studio-analysis-once` Cloud Run Job used a staging-only service
account, one task, zero retries, a ten-minute task timeout and one pass. It is
manually triggered; no scheduler or live frontend is attached.

Cloud Run execution `studio-analysis-once-sgppt` completed successfully. Its
container logged `One pass processed` and exited 0. It consumed synthetic
owned-source job
`42c14093632fdefbb38763ca845d293dd5c7e1248c9e53cebc18ada3f50a5c99`
from staging Firestore. An independent owner-scoped result read confirmed:

| Receipt              | Value                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Status               | `completed`                                                        |
| Source SHA-256       | `52cd512d9fb8bbe0ee76b09564a599ef2b447fb300ecc50650dfe6ec311eae04` |
| Result SHA-256       | `a301d158540c2699406b03a48ba64b90ba06dc25186f640ec2186549abb4c935` |
| Source-shot artifact | `c4c147a62f43760b2bc05e1a7e607def3991d34f7ff45aeba3c4ac071e007f1d` |
| Analysis artifact    | `85c2d6a9494590f27d9db4de74da41aec1b4dade4252732e9e904024fc06bd75` |

The 3-second generated test pattern contains no human face, so coverage is 0
and this is an infrastructure and artifact-integrity proof, not a tracking
quality or ten-minute throughput result. A first locally driven job against
the same staging Firestore and bucket also completed, with job ID
`1c5bf4d28044747682a563142080dfc39da1eea4661d756bd59efceea139c90f`.
Both jobs kept their owned source objects as designed.

The first proof used the existing production `media-worker-v1` CPU analyzer
through a signed staging-object URL. No production data or Firestore/Storage
resource was modified. No GPU was requested or used.

## Dedicated staging analyzer

The staging project now runs a separate private `studio-face-analyzer` Cloud
Run service from
[`Dockerfile.studio-analysis`](../python_media_worker/Dockerfile.studio-analysis).
It exposes only `/health` and `/track-studio-faces`, reuses the existing
`studio_face_tracking.py` implementation and bundled YuNet model, and accepts
only signed `storage.googleapis.com` reads under the staging bucket's Studio
source prefixes. Cloud Build `32233d56-3bf5-4547-8fe7-4d364945210b` built
image digest
`sha256:1dfb96aa5c8e35ac270139621c3492fe764ee089f6efc668b083b5c85c73cecd`.
Only the staging worker service account has `roles/run.invoker` on this service;
an anonymous health request returned HTTP 403.

The worker job now points to this private service with OIDC authentication.
Its bounded mode processes up to four due items per execution so an older
cleanup item cannot consume an entire invocation. It stops starting new items
after two minutes, leaving the twelve-minute analyzer request budget inside
the sixteen-minute task timeout. The deployed bounded worker image is
`sha256:d0bde70ef153b0684dd405de6ce48cad129cd73947261dd0909706bdecd8de61`
from Cloud Build `38416576-6a8f-4ac7-bbed-356e3ea3dfcb`. The first
private-analyzer request returned HTTP 422 because the
storage client issues V2 signed URLs by default and the adapter initially
accepted only V4. The adapter now accepts both signed formats, restricted to
the staging project's signer domain and object prefixes. That first job
failed terminally with `ERR_BAD_REQUEST`; the replacement job completed.

Cloud Run execution `studio-analysis-once-vr47d` completed successfully. Its
worker logged `Bounded batch processed 1 due items`, and the private analyzer
returned HTTP 200. The new queued job
`2967ccbfdbdf741a4264b0b85fc1a42d7e76486a4f393cd3361db0547b0f5e6e`
completed in one attempt. An independent Firestore and Storage read found the
same source hash, result hash and two artifact hashes shown above. The stored
result was 932 bytes and recalculated to its recorded SHA-256. Its engine was
`opencv-yunet-source-shot-follow`; the synthetic clip again had zero cuts and
zero face coverage. This proves the staging queue, worker, private analyzer and
artifact path without any production analyzer call. It does not measure face
tracking quality or ten-minute throughput.

The final bounded worker image received a separate verification run:
`studio-analysis-once-45ht6` completed successfully, logging `Bounded batch
processed 2 due items`. It cleared an older cleanup marker and completed job
`fd0cd6bddb62d731d89a0b2123f503be5156419510a0e836de8085f1686f9af8`
in one attempt through the private analyzer. An independent read again matched
the 932-byte result to
`a301d158540c2699406b03a48ba64b90ba06dc25186f640ec2186549abb4c935`
and found both artifact receipts. The temporary fixture-queue Cloud Run Job was
removed after this check.

A separate local run of the same `studio_face_tracking.py` source-shot engine
on the available 60-second podcast fixture found four source cuts, produced
121 keyframes and reported `coverage=1.0`. This local measurement does not
measure Cloud Run startup, transfer or ten-minute throughput.

The temporary local service-account key used to submit and verify the smoke
jobs was revoked in Google Cloud and removed from disk; the service account
has no user-managed keys. The Cloud Run Job continues to use its short-lived
runtime identity. To invoke the staged worker manually:

```sh
gcloud run jobs execute studio-analysis-once \
  --project=autopromote-staging-2026 --region=us-central1 --wait
```

The synthetic test helper is
[`scripts/smoke-studio-analysis-staging.js`](../scripts/smoke-studio-analysis-staging.js).
It refuses credentials from another project and can queue a job without
processing it (`STUDIO_ANALYSIS_SMOKE_QUEUE_ONLY=true`) or verify an existing
job (`STUDIO_ANALYSIS_SMOKE_VERIFY_JOB_ID=<jobId>`). It requires an explicitly
supplied staging credential and CPU worker URL; neither is stored in the repo.
