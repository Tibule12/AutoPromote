# Inspectable ten-minute staging evidence

These files were read from the existing Google Cloud resources with authenticated
CLI and REST requests. The two analysis JSON files preserve the exact Cloud
Storage bytes, so their SHA-256 values can be independently recalculated.
Authentication tokens and signed URLs are excluded. Account-email annotations
were removed from the Cloud Run execution snapshots.

- [Offline cloud verification: 35 checks](cloud-verification.json).
- [Repaired analysis: every cut, keyframe and edit-plan field](repaired-analysis-result.json).
- [Original analysis: 18 cuts](first-run-analysis-result.json).
- [Completed Cloud Run execution receipt](repaired-execution.json).
- [Firestore job record](repaired-job-document.json) and [decoded job](repaired-job.json).
- [Stored source-shot artifact](repaired-source-shot-artifact.json).
- [Stored analysis artifact](repaired-analysis-artifact.json).
- [Cloud analyzer request logs](analyzer-request-logs.json): HTTP 200 and 364.546700886 seconds.
- [Source object metadata](source-object.json) and [result object metadata](repaired-result-object.json).
- [Image build receipt](analyzer-build.json), [deployed revision](repaired-analyzer-revision.json), and [invocation IAM](analyzer-iam.json).
- [Fresh local/cloud comparison](local-cloud-comparison.json), [complete local result](local-analysis-result.json), and [local run receipt](local-analysis-run.json).

Open the live [Cloud Run execution](https://console.cloud.google.com/run/jobs/executions/details/us-central1/studio-analysis-once-nsnlf?project=autopromote-staging-2026),
[Cloud Build](https://console.cloud.google.com/cloud-build/builds/6c7f7ab3-dc37-46d5-ad4d-3d4782cbd445?project=autopromote-staging-2026),
or [source object](https://console.cloud.google.com/storage/browser/_details/autopromote-staging-2026.firebasestorage.app/studio/sources/staging-smoke/ten-minute-20261004-4a6efc07.mp4?project=autopromote-staging-2026)
while signed in to the Google Cloud account for an independent check.

From the repository root, verify the downloaded cloud snapshots without cloud
credentials:

```sh
node scripts/verify-studio-analysis-ten-minute-proof.js --cloud-only
```

The verifier recalculates the exact result hash, both immutable artifact hashes,
their dependency, source identity, projected cut timestamps and sampled face
coverage. It checks the successful execution, image digest, HTTP request timing,
and private invocation scope against the saved cloud receipts. The restored
53.5-second camera cut is present in the repaired JSON and absent in the original.

The fresh local baseline used the exact downloaded source generation and verified
its byte hash before analysis. It completed in 310.279 seconds. Canonical hashing
of its full JSON and the cloud JSON produced the same
`e8c725943577c7bbc9b275443efa9e2a074a7abd814e391d4dc9ab06c33ae98c`
digest. Every cut, keyframe and edit-plan field is therefore retained for comparison.

The local source-frame audit image is
`artifacts/studio-analysis-ten-minute-20261004/camera-cut-proof.png`.
[Its audit metadata](visual-audit.json) records the exact frame times and stored
tracking points. The image is available locally, and the source video remains
in the private staging bucket. Source media is excluded from the repository
evidence bundle.

This is evidence of the staging analysis execution and its published artifacts.
The authenticated Studio browser workflow still requires the staging API and
frontend gate described in the [report](../../docs/viral-studio-analysis-ten-minute-staging-20261004.md).
