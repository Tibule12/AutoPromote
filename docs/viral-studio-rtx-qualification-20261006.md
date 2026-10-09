# RTX PRO 6000 qualification — October 6, 2026

**QUALIFIED.** Google automatically granted 3000 milliGPU in `autopromote-cc6d3`, `us-central1`. One authenticated Cloud Run Job, `viral-studio-rtx-qualification`, completed one bounded execution on an actual NVIDIA RTX PRO 6000 Blackwell Server Edition. CUDA access and real FFmpeg NVDEC/NVENC execution passed.

The existing renderer image and service account were reused. The private two-second AutoPromote artifact is preserved locally. No production routing, CPU path, Director contract, Cam Combiner or region changed. The completed job keeps no idle GPU running.

See the [full deployment report, artifact, cost and before/after evidence](../reports/rtx-pro-6000-qualification-20261006/README.md). The September 16 L4 denial remains historical evidence; this qualification used Google's automatic RTX grant, without a new quota request.
