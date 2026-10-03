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
The `studio-analysis-once` Cloud Run Job uses a staging-only service account,
one task, zero retries, a ten-minute task timeout and the worker's one-pass
mode. It is manually triggered; no scheduler or live frontend is attached.

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

The existing production `media-worker-v1` CPU analyzer handled inference on
the synthetic staging object through a signed read URL. No production data or
Firestore/Storage resource was modified. A dedicated staging analyzer would
remove this remaining compute dependency. No GPU was requested or used.

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
