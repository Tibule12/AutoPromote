# Studio analysis artifacts V1

Branch: `agent/director-analysis-artifacts-v1`. This is the first CPU analysis
artifact slice after Project Intelligence V1. It uses the existing source-shot
worker; it does not add a model, background queue, planning, editing or a GPU
dependency.

The authenticated `/api/media/track-studio-faces` source-shot path now returns
two receipts. `sourceShotArtifact` retains the existing Director review contract.
`analysisArtifact` identifies a new immutable server-owned projection under
`users/{uid}/studioAnalysisArtifacts/{artifactHash}`. The browser cannot create
one through an artifact endpoint. The only artifact route is an authenticated,
owner-scoped read at `/api/studio/director/analysis-artifacts/:artifactHash`.

The writer verifies the user/project/source-byte binding and re-reads the
existing immutable source-shot artifact. The source-shot hash must match the
worker output being projected. It also checks that the worker's range matches
the request range. A duplicate attempt returns the original receipt; changed
worker output or request settings generates a different hash. A corrupt stored
record fails closed. Source-shot analysis remains CPU compatible and existing
manual Studio behavior is unchanged.

The record separates `analysisType`, producer, engine, model revision, config
hash, source byte hash, optional stream identity, source tick range, dependency
hashes, content hash, and covered and failed intervals. V1 supports only
`source_shots` and whole-source `streamId: null`; it is a typed boundary for
future producers, not a public arbitrary JSON writer. The config hash includes
the exact request range and anchor coordinates. The content hash identifies
the observed worker result; the dependency hash identifies the existing
source-shot record. The stored projection is bounded to scene-cut ticks,
sampled face coverage, decode-failure count, and review/preflight flags.

The worker's face coverage is a fraction of sampled observations. Therefore
`coveredIntervals` is empty: it would be false to claim continuous observation
of the full source range. A tail decode failure creates a `failedIntervals`
entry from the earliest failed sample to the request end. The raw worker result
is not copied into the project document or generic artifact.

Project Intelligence V1 can now include an `analysis_artifact` evidence reference.
Registration checks the exact owner-scoped stored artifact, source binding,
project, type, model revision, config hash and dependency hashes, then checks
that the referenced source-shot artifact matches the same source bytes and
worker-result hash. Human assertions remain human declarations; attaching an
analysis reference does not convert them into verified model conclusions.
Existing `source_shot_artifact` references continue to work.

This slice does not yet schedule analysis, index artifacts for cache lookup,
store full raw worker output in immutable object storage, infer scene/take
relationships, populate Project Intelligence automatically, or produce edits.
It is not evidence of L4 access: a one-GPU Cloud Run job was still rejected for
insufficient non-zonal L4 quota in `us-central1` on 2026-10-03.
