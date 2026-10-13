# AutoPromote RTX PRO 6000 qualification — October 6, 2026

**Status: QUALIFIED.** One Cloud Run Job was created and one execution completed successfully. Google automatically granted the regional RTX quota. The existing AutoPromote renderer image detected the real Blackwell GPU and completed an NVDEC → NVENC transcode. **25/25 delivery checks pass. No GPU task remains running.**

[Verification summary](verification-summary.json) · [GPU receipt](gpu-receipt.json) · [Rendered video](output.mp4) · [Artifact manifest](files.json)

## PROJECT

| Setting | Verified value |
| --- | --- |
| Project | `autopromote-cc6d3` |
| Region | `us-central1` |
| Correct architectural fit | Bounded Cloud Run Job, matching the existing 3D dispatcher |
| Staging project | `autopromote-staging-2026`; its CPU analysis job and face analyzer are unchanged |

The renderer image, renderer service account and private 3D bucket already exist in `autopromote-cc6d3`. The qualification uses a distinct job name so the existing product dispatcher cannot select it through its default job name. No Director, Firestore job contract, Cam Combiner or region migration was introduced. [Inspection and protected hashes](inspection-before.json).

## AUTO QUOTA

| Setting | Verified value |
| --- | --- |
| Automatic grant triggered | **YES** |
| Previous regional quota | **0 milliGPU** |
| Resulting regional quota | **3000 milliGPU** |
| Required for this job | **1000 milliGPU**, one GPU |
| Quota ID | `NvidiaRtxPro6000GpuAllocNoZonalRedundancyPerProjectRegion` |
| Metric | `run.googleapis.com/nvidia_rtx_pro_6000_gpu_allocation_no_zonal_redundancy` |

The before response omitted the zero-valued protobuf scalar (`details: {}`). After the successful creation, the API returned an explicit `us-central1` value of `3000`. There was one creation attempt and no quota preference/request, billing change, region switch or alternative accelerator deployment. Google's documented automatic grant matches this observed transition. [Google GPU documentation](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu).

[Exact creation command](creation-command.txt) · [Creation response, exit 0](creation-attempt.json) · [Raw quota before](autopromote-cc6d3-quota-before-raw.json) · [Raw quota after](quota-after-create.json).

## DEPLOYMENT

| Setting | Effective value |
| --- | --- |
| Resource | Cloud Run Job `viral-studio-rtx-qualification` |
| Accelerator / count | `nvidia-rtx-pro-6000` / **1** |
| CPU / memory | **20 vCPU / 80 GiB** |
| Environment | **Gen2** |
| Zonal redundancy | **OFF** |
| Tasks / parallelism | **1 / 1** |
| Task retries / timeout | **0 / 300 seconds** |
| Minimum warm instances | **None**; a Job has no warm service instances |
| Authentication | Authenticated Cloud Run Jobs API invocation; no public HTTP endpoint or public IAM binding |
| Service account | `viral-studio-3d-renderer@autopromote-cc6d3.iam.gserviceaccount.com` |
| Trigger | One manual invocation; no scheduler or product routing |
| Execution | `viral-studio-rtx-qualification-n6wjc` |

The image was reused by immutable digest, without rebuilding or retagging:

```text
us-central1-docker.pkg.dev/autopromote-cc6d3/thulani-repo/viral-studio-3d-renderer@sha256:6b97198c6770c8f211caf8b018be7dc85290035ba5a3922580a4a324179ed522
```

Creation did not execute the job. After the quota grant, the same job received the [qualification script](../../studio_3d_renderer/qualify_gpu.py) as a SHA-256 verified command payload. Its input was pinned by object generation and hash. This bypassed the production renderer entrypoint and never accessed Firestore. Existing service-account permissions were reused without IAM changes.

Tasks and parallelism bound an individual execution. Cloud Run Jobs do not provide a global cross-execution lock through those settings. This qualification created exactly one execution and has no automated invoker. Production integration would need to retain the existing capacity-lease contract.

[Effective final job](job-final.json) · [Configuration checks](pre-execution-verification.json) · [Authentication proof](authentication-verification.json) · [Successful terminal execution](execution-v2-final.json) · [Successful terminal task](tasks-final.json) · [Final execution list](execution-list-final.json).

## GPU PROOF

| Check | Observed result |
| --- | --- |
| GPU model | **NVIDIA RTX PRO 6000 Blackwell Server Edition** |
| Driver | **580.126.20** |
| CUDA driver API / NVIDIA-SMI | **13.0** |
| NVIDIA-SMI VRAM total / free | **97,887 / 97,250 MiB** at the identity sample |
| Python CUDA total / free | **101,973,950,464 / 101,388,648,448 bytes** after context creation |
| Container GPU access | Direct CUDA driver API initialization, one device, name and memory queries passed |
| PyTorch | Absent in the existing image; no PyTorch or model installation performed |
| FFmpeg | Version **6.1.1**; NVENC, CUVID/NVDEC and CUDA advertised and executed |

NVIDIA-SMI and CUDA memory figures use different accounting and were sampled separately. Their original measurements are preserved. FFmpeg logs show `h264_cuvid` decoding CUDA frames into `h264_nvenc`, NVENC initialization, 48 frames encoded and zero decode errors. A second forced hardware decode of the output also completed with 48 frames and zero decode errors. No CPU codec fallback was used.

[Full NVIDIA-SMI](nvidia-smi.txt) · [Untruncated GPU identity](nvidia-smi-identity.csv) · [Python CUDA proof](cuda-proof.json) · [Encode/decode log](ffmpeg-transcode.txt) · [Output hardware-decode log](ffmpeg-hardware-decode.txt) · [Cloud execution logs](execution-logs.json).

## AUTOPROMOTE PROOF

The workload used the first two seconds of the existing AutoPromote product-tour video, showing the actual application with sample workspace data. A local CPU preparation step resized it to 640×360 / 24 fps. The Cloud Run GPU decoded and encoded all 48 frames, checked the result with FFprobe, decoded it again on the GPU, and uploaded the private artifact and receipt.

| Measurement | Result |
| --- | --- |
| Qualification steps | **8.7667 seconds** |
| GPU transcode | **0.6431 seconds** |
| Cloud task start → completion | **22.16219 seconds** |
| Cloud execution start → completion | **156.658313 seconds**, including platform scheduling/completion overhead |
| Qualification started / finished | `2026-10-06T16:06:22.198938Z` / `2026-10-06T16:06:30.965618Z` |
| Execution completed | `2026-10-06T16:07:37.466514Z` |
| Output | **62,029 bytes**, H.264, 640×360, 24 fps, 48 frames, 2.000 seconds |
| Local artifact validation | Downloaded hash matches; independent FFprobe and frame extraction completed |

```text
Qualification source SHA-256:
4334b75628bd307f0a08881cbe15d10350abe0a8363b724b4580c5cc709d4cc6

Input SHA-256:
807f0f361f03c0a4936733c8c69d1232e6f4620791d3af12b0998978d008473b

GPU output SHA-256:
d50237bacfd706eedfa2c03112bf3b1ccb699b9ddc4a183e14fe6d8a16ada6c2

Private output:
gs://autopromote-cc6d3-viral-studio-3d/temp_studio_3d/qualification/rtx-20261006-160331/output.mp4
```

[Fixture provenance and original source hash](fixture-manifest.json) · [Input](input.mp4) · [GPU output](output.mp4) · [Output frame](output-frame.png) · [Independent output probe](output-probe.json).

The existing bucket is private, with enforced public-access prevention. Its unchanged one-day `temp_studio_3d/` cleanup rule covers these qualification objects; its existing seven-day soft-delete retention can retain deleted bytes. Local evidence remains in this report directory.

## COST

| Resource at us-central1 on-demand rates | Active USD/hour |
| --- | ---: |
| One RTX PRO 6000, no zonal redundancy | 1.314792 |
| 20 vCPU | 1.296000 |
| 80 GiB RAM | 0.576000 |
| **Total** | **3.186792** |

Google's metric reports **59.5253608 billable instance-seconds** for this isolated job. Applying the Jobs one-minute minimum gives an approximate compute charge of **$0.0531132**, about **five US cents**. This is a rate estimate, not an invoice; storage/logs/network/taxes and discounts or free tiers are excluded. CPU, memory and GPU are included. [Google pricing](https://cloud.google.com/run/pricing) · [Measured billable time](billable-instance-time.json) · [Calculation](cost-estimate.json).

**Confirmed no idle GPU kept running: YES.** The only execution and its only task reached successful terminal states. The final list contains one execution and zero running tasks. The persistent resource is a Job definition, with no warm instance setting or automatic trigger. No GPU service was created.

## PRODUCTION

- Production user traffic changed: **NO**.
- Cam Combiner changed: **NO**.
- Existing CPU paths changed: **NO**.
- Firebase/Firestore/Storage regions changed: **NO**.
- Existing GPU/product feature flags or job routing changed: **NO**.
- Existing nine Cloud Run resource specifications and seven protected source files: **unchanged by SHA-256 comparison**.

[Before/after protection receipt](production-protection.json).

## Next workload candidates

| Existing workload area | Readiness after this qualification |
| --- | --- |
| FFmpeg NVENC/NVDEC | Short H.264 hardware path is proven. Larger compositions, audio, alpha and other codecs need their own bounded parity/performance checks before routing changes. |
| Segmentation/matting, tracking, optical flow, depth and heavy vision inference | Candidates for measured GPU acceleration; no model/framework was installed or qualified here. Keep current CPU-compatible paths and validate a Blackwell-compatible runtime plus model quality first. |
| Blender / OptiX / Cycles | Existing scene/ownership/artifact contracts can be reused. Blender kernel/backend and headless rendering compatibility require a separate tiny device-backed render qualification. This media test does not establish those results. |
| Director orchestration and ordinary analysis | Existing contracts stay in place. Select only measured compute bottlenecks for GPU execution; orchestration continues on CPU. |

## GIT

- Branch: `agent/director-analysis-staging-browser-v1`.
- HEAD remains `7f7530ad746050c094bfc78d0921190da98d2098`.
- New task files: `studio_3d_renderer/qualify_gpu.py`, `docs/viral-studio-rtx-qualification-20261006.md`, and this report directory.
- Commits created: **none**. Pushed: **NO**. Main modified: **NO**.
- The pre-existing homepage/product-tour working-tree changes were preserved; no unrelated production changes were deployed.
