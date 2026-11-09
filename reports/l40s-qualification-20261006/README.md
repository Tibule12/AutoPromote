# Existing NVIDIA/Brev L40S qualification — October 6, 2026

**PASS: 27/27 independent checks.** The existing `autopromote-l40s-staging` VM completed the exact AutoPromote fixture with actual CUDA/NVDEC decoding and NVIDIA NVENC encoding in **0.4905 seconds**. The output was decoded again on the GPU: **48 frames, zero decode errors**.

[GPU receipt](gpu-receipt.json) · [Independent verification](verification.json) · [Output video](output.mp4) · [Independent ffprobe](independent-ffprobe.json) · [Hardware inventory](environment.json)

## Instance and hardware

- Existing instance ID: `xgh6wcu74`; hostname `brev-xgh6wcu74`.
- Provider: Crusoe via NVIDIA Brev, Claude, TX, USA; VM mode, x86_64.
- GPU: **NVIDIA L40S**, **46,068 MiB** reported total VRAM.
- Driver: **565.57.01**; CUDA driver compatibility **12.7**, API version **12070**.
- CPU: **8 visible vCPUs**, AMD EPYC 9254 host model.
- Linux RAM: **155,047,088,128 bytes** (144.4 GiB); console advertises 147 GB.
- Console storage: **384 GiB**; separate root and `/data` volumes appear in the captured `df`. This differs from the brief's single 256 GiB figure.
- Host OS: Ubuntu 22.04.5 LTS. Docker 27.3.1 with NVIDIA runtime.
- FFmpeg was absent on the host. Qualification used a short-lived Ubuntu 24.04 container with **FFmpeg 6.1.1-3ubuntu5**, the exact package version used for the prior Google fixture.
- CUDA was accessed both on the host and in the Docker GPU container. PyTorch was absent in both; no models were installed. Blender and AI inference were not qualified.

[Host CUDA](host-cuda.json) · [Docker command and setup logs](docker-execution.json) · [Container image digest](docker-image.json)

## Exact AutoPromote workload

Input is the **unchanged 2-second product-tour fixture**, 640×360, 24 fps, 48 frames, 29,533 bytes.

- Input SHA-256: `807f0f361f03c0a4936733c8c69d1232e6f4620791d3af12b0998978d008473b`.
- Output: **56,127 bytes**; SHA-256 `e78e3f6b38359d39756202aa46d01ed18be8e795cd191808f3a82a55b69dd6a2`.
- Transcode: **0.4905 seconds**, including FFmpeg process startup.
- Qualification steps: **1.5245 seconds**; setup and Docker lifetime are recorded separately.
- Original helper source SHA-256: `4334b75628bd307f0a08881cbe15d10350abe0a8363b724b4580c5cc709d4cc6`.

The [VM adapter](qualify_l40s.py) imports the original [unchanged Google qualification helpers](qualify_gpu.py). It replaces only Google Storage input/output with local files and checks the L40S identity.

```sh
ffmpeg -nostdin -hide_banner -loglevel verbose -y \
  -hwaccel cuda -hwaccel_output_format cuda -c:v h264_cuvid \
  -i /qualification/input.mp4 -map 0:v:0 -frames:v 48 -t 2 \
  -c:v h264_nvenc -preset p4 -b:v 2M -an -movflags +faststart \
  /qualification/output.mp4
```

A second forced `h264_cuvid` decode with `hwdownload,format=nv12` validates the produced artifact. No CPU codec fallback is used.

## Historical comparison

This table reads the preserved local Google receipt; no new Google Cloud request or execution was made for the Brev qualification.

| Metric | Existing Brev L40S | Prior Google Cloud qualification |
|---|---|---|
| GPU | NVIDIA L40S, Ada Lovelace | RTX PRO 6000 Blackwell Server Edition |
| Reported VRAM | 46,068 MiB | 97,887 MiB |
| Driver / CUDA compatibility | 565.57.01 / 12.7 | 580.126.20 / 13.0 |
| Actual NVDEC / NVENC | PASS / PASS | PASS / PASS |
| Exact 2-second transcode | 0.4905 s | 0.6431 s |
| CPU / RAM | 8 vCPU / 144.4 GiB Linux-visible | 20 vCPU / 80 GiB configured |
| Active hourly price | $1.79 console-observed | $3.186792 documented configuration estimate |
| Stopped compute | $0 when stopped; storage remains | $0 after job completion; storage/logs excluded |
| Integration | External VM and authenticated SSH | Existing native bounded Cloud Run Job |

The L40S took **23.73% less elapsed time** in this one short fixture and has a lower advertised active hourly rate. This is a single tiny encode measurement with startup overhead, different drivers and CPU allocations; it does not establish a general GPU performance or AI quality ranking. The L40S is proven for this media pipeline. Heavy vision, segmentation and generation require their own model and fixture qualification.

[NVIDIA L40S specifications](https://www.nvidia.com/en-us/data-center/l40s/) identify its Ada Lovelace architecture. [NVIDIA Brev billing guidance](https://docs.nvidia.com/brev/concepts/gpu-instances) states stopped instances incur no compute charges while storage costs remain.

## Lifecycle and current authorization

The original brief requested a stop after qualification. The [stop request](stop-command.json) reached Brev and [the API confirmed STOPPED](instances-current.json). The CLI also reported an error for an unintended name `y` interpreted from stdin; this error did not prevent stopping the target.

The user then explicitly instructed **keep this GPU running**, **use NVIDIA only**, and supplied a three-hour work window for the welcome page followed by Viral Clip Studio. The [same VM was restarted](restart-command.json) for that authorized work. It is intentionally running during that work; this qualification report does **not** claim current compute billing is stopped.

Console active rate is **$1.79/hour**. The brief estimates stopped storage near $0.03/hour; that exact storage rate has **not** been independently verified. The [price observation](price-observation.json) distinguishes these values. Only [one organization](organizations.json) and [one GPU instance](instances-before.json) were visible. **No new instance was created and nothing was deleted.**

## Scope and Git

Branch: `agent/director-analysis-staging-browser-v1`. HEAD at qualification: `7f7530ad746050c094bfc78d0921190da98d2098`. All seven protected source/workflow hashes passed unchanged. Existing uncommitted work was retained. No production request, Cam Combiner change, model download, commit, push or main modification occurred.
