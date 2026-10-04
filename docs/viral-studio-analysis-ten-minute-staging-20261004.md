# Ten-minute Studio analysis staging gate — October 4, 2026

Open the [actual evidence bundle](../reports/studio-analysis-ten-minute-20261004/README.md),
[stored analysis JSON](../reports/studio-analysis-ten-minute-20261004/repaired-analysis-result.json),
[Cloud Run execution receipt](../reports/studio-analysis-ten-minute-20261004/repaired-execution.json),
and [35-check cloud verification](../reports/studio-analysis-ten-minute-20261004/cloud-verification.json).
The successful execution is also visible directly in
[Google Cloud Console](https://console.cloud.google.com/run/jobs/executions/details/us-central1/studio-analysis-once-nsnlf?project=autopromote-staging-2026).
The [fresh local/cloud comparison receipt](../reports/studio-analysis-ten-minute-20261004/local-cloud-comparison.json)
also retains the complete baseline output and proves full JSON equality using
the same source bytes.
The subsequent evidence capture preserves the [full Jest result](../reports/studio-analysis-ten-minute-20261004/frontend-tests.json)
with 90 passing tests and one podcast-audio timeout, plus the
[passing isolated retry](../reports/studio-analysis-ten-minute-20261004/frontend-retry-tests.json).
This fresh capture is distinct from the earlier 91/91 run described below.

**Status: ten-minute staging gate passed after media-runtime repair.** This gate uses the isolated
`autopromote-staging-2026` project, its private CPU analyzer and a manually
triggered Cloud Run worker. Production analysis jobs and the Studio frontend
flag remain off. The source is a 601.002-second excerpt of an existing podcast
video, and the requested analysis range is `[0, 600]` seconds. It is an owned
Studio source object in the staging bucket, pinned to generation
`1791107066573616`; the source is 726,725,520 bytes with SHA-256
`4a6efc07f90860a22d4fcbebd0ff77ae6bc72907491631e3e217099a2bddeb8c`.
The object path is
`studio/sources/staging-smoke/ten-minute-20261004-4a6efc07.mp4`.

The local source-shot engine, using OpenCV 4.11 and FFmpeg 6.1.1, finished in
720.12 seconds on this host. It found 143 source cuts, produced 1,277 face
keyframes, missed three sampled faces, reported sampled coverage 0.99765625,
and passed the edit-plan preflight. This local run was concurrent with a large
upload and video encoding attempt, so its elapsed time is not an isolated CPU
benchmark.

## First cloud run exposed a media-runtime regression

Cloud Run execution `studio-analysis-once-bl74l` completed job
`dd9573d0a99fdfd5df5079a5ade31fe03d4276688cecdfe3872eeb0578188aec`
on its first attempt. The private analyzer returned HTTP 200 in 453.506
seconds. The job published a 109,296-byte JSON result whose recalculated
SHA-256 matched its receipt:
`25c20ddd7df8eacf78d393f7e354f60410055318b2d2e2ad43f30de335347f5a`.
The source-shot artifact hash was
`47b22fabbea4a711512da1f60808c46b5f6426286d87459a634bb108fe313316`;
the analysis artifact hash was
`462713a5036b403186c9f6d54d2d55f994a0b871a3ed701fac236abac4f6b210`.
Its analysis artifact's content hash matched the stored result. The source
SHA-256 also matched the locally hashed bytes.

The first cloud output found only **18 cuts**, with 1,068 face keyframes, 142
missing samples and coverage 0.882644628. Its edit-plan preflight passed, but
that does not make the camera-cut count acceptable. The exact deployed image
used FFmpeg 7.1.5; running `detect_source_cuts` in that same image on the same
source reproduced 18 cuts. FFmpeg 6.1.1 and a separate Debian Bookworm FFmpeg
5.1.9 run both found 143. A visual check of frames around 53.5 seconds
confirmed a hard change between speakers that FFmpeg 7.1.5 omitted. This is a
version-dependent cut detector regression, not a queue or hash failure.

The private analyzer Dockerfile now uses `python:3.10-slim-bookworm`, which
keeps the Python major/minor version and provides FFmpeg 5.1.9 in the current
build. Cloud Build `6c7f7ab3-dc37-46d5-ad4d-3d4782cbd445` completed the
new image, digest
`sha256:7e5246ca5fbfdcb6280e52ed89f011dee03a90229c8aae500fe293ca5b4d50f3`.
Private revision `studio-face-analyzer-00005-67p` now serves that image with
4 vCPU, 4 GiB memory, one concurrent request and a 900-second service timeout.
Only the staging worker service account retains `roles/run.invoker`.

## Pinned-image recheck

Cloud Run execution `studio-analysis-once-nsnlf` completed job
`ebb46e963c64c8eab4b9b56c828857e0c87f237b0c732991930dffced8fd0964`
on its first attempt. It points to the same pinned source generation and uses
a fresh request ID, leaving the first result available for comparison. The
worker claimed it at `2026-10-04T10:46:22.929Z` and published completion at
`2026-10-04T10:52:37.433Z`, about 6 minutes 15 seconds later. The private
analyzer returned HTTP 200 in 364.547 seconds. The Cloud Run execution as a
whole took 8 minutes 19 seconds, including task startup. The job had been
queued at 10:34:32 UTC and manually triggered later; that waiting interval is
not analyzer time or a production queue-latency measurement.

An independent Firestore and private Storage read recalculated the 152,536-byte
result object's SHA-256 as
`e8c725943577c7bbc9b275443efa9e2a074a7abd814e391d4dc9ab06c33ae98c`.
It matched both the job receipt and analysis artifact content hash. The
source-shot artifact hash is
`085681fb226b9844d24104b45889fa5e57119259a1bda4c650d111d2ed3ad877`;
the analysis artifact hash is
`e8e17321d2cf753d263b7a64f1238b92bd8c8d1ff9e6c19f8f0874a02920851f`.
The analysis artifact names that source-shot hash as its dependency. The source
SHA-256 matches the local bytes and the first run.

The pinned cloud output has **143 cuts, 1,277 face keyframes, three missing
samples and 0.99765625 sampled face coverage**. Its 144 timeline-cut entries
and edit-plan preflight are present. The full decoded JSON result, including
every cut timestamp, keyframe and edit-plan field, equals the local result.
The plan found no synchronized two-speaker view and offers no live split;
its four temporal cutaway candidates remain editor-review suggestions. The
high sampled coverage is not a claim of continuous face visibility or a
finished edit.

The existing frontend analysis client and Studio suites passed **91/91** tests
after a background-audio test's 15-second timeout, measured at 14.4 seconds
when isolated, was raised to 30 seconds. The first full run had passed 90/91
and timed out only that test under load. This change affects the test budget,
not Studio behavior. The staging worker is still manually triggered, and the
production worker, frontend flag and GPU path remain off. These results prove
this representative source and runtime configuration; they do not set a
permanent latency bound or establish general editing quality.
