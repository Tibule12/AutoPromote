# Media-worker candidate duration correction — 22 October 2026

The deployment of main commit de82363b failed its actual Cloud Run render,
not its build or health check. The fixed two-second request used the pinned
Big Buck Bunny source, finish grade, wave visualizer, dialogue cleanup and a
built-in impact. It returned HTTP500: picture ends0.04s away from delivery.

Local reproduction with the same pinned source/request fails unchanged:
48picture frames at24fps,2.000s picture,2.043s AAC/container. The intermediate
stream-copy trim retains an AAC packet beyond the authored cut. Its container
duration was incorrectly supplied to the speed map, extending the final mix.

The shared render handler now derives pre-speed programme length from the
retained timeline segments or explicit trim interval. It does not use codec
packet padding as edit time. The original one-frame picture/delivery gate and
black/audio gates are unchanged. The same actual source/request then renders
48frames with2.000s picture, audio and container and passes both quality/audio
proofs. Uploads are redirected to a local retained test file; source/timeline
rendering, grading, cleanup, visualizer, SFX and final checks execute normally.
This CPU regression is distinct from a native user-editing qualification.

Regression coverage also renders synthetic22.05kHz AAC at the implicit source
clock and explicit60fps, plus a30fps sequence at1.25speed. The deployment image
runs these tests before it can be pushed/promoted. Earlier hidden-tail rejection
tests remain intact. Raw media, logs and reproduction scripts stay local under
/tmp/autopromote-worker-delivery-20261022.

The11 timing tests pass, including three real handler renders; two actual
FFmpeg audio-clock tests pass. Knowledge and all five Studio authority records
validate. Deployment verification is recorded after the repaired run completes. Whole picture/sound, native workflow and creative/PRO/production
qualification remain separate; shared S02/S03/S04 priorities are unchanged.

The first repaired workflow (`39716521973`) stops before candidate creation:
the added real-handler regression tries to allocate scratch under `/workspace`,
which the image test mounts read-only. Its original125-test failure is retained.
The regression now relocates only the worker scratch root to its own temporary
fixture directory, as other handler tests already do; all output/media checks
remain intact. The source checkout stays read-only. The correction is tested
inside bubblewrap with the entire host filesystem read-only, only `/tmp`
writable, and networking disabled before the workflow is retried.

The corrected11-test timing suite passes in30.953s under the read-only, network-disabled bubblewrap run, including all three real handler renders.

## Production verification

[Run39717028880](https://github.com/Tibule12/AutoPromote/actions/runs/39717028880) passed immutable image regression tests, zero-traffic candidate health and real render, promotion, and production health verification. Revision `media-worker-v1-00115-cus` receives100%production traffic. This records worker deployment verification; native Studio/creative readiness is unchanged.
