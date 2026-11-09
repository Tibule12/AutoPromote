# One Edit · private v4 NVIDIA pass prepared, not rendered

**Later checkpoint, 8 October 2026, 18:37 SAST:** This preparation was executed on the NVIDIA L40S after a new bounded window was established. The [v4 VACE result](generated-v4-review/decoded-review.png) and [v5 guided follow-up](../flagship-founder-film-production-v5-20261008/generated-rgb-guide-review/decoded-review.png) were both creatively rejected. The first produced two boats; the second kept one shape but looked like CGI and jumped to the photographic yacht. The v5 ident, sailor concepts, GPU shutdown and remaining blocker are recorded in the [current checkpoint](../flagship-founder-film-production-v5-20261008/README.md). The rest of this file is the original pre-run preparation record.

**Status on 8 October 2026:** The existing 51-second v3 hero, 26.5-second cut and 10-second teaser are technically complete but rejected for public use. The new v4 source package is locally prepared and byte-verified. Brev `autopromote-l40s-staging` is **STOPPED** and the last restart was refused for exhausted credits. No v4 inference, 3D preview or paid GPU job has run. Nothing is published.

The [treatment](story-treatment.md) and [shot plan](shot-plan.json) retain the founder story and identify the specific repairs: photographic transformation with a readable paper origin, no early detached mast, visible hull material change, slow world transition, a checked yacht-continuation seam, a single documented quota turn, distinct build footage, and a physical logo reveal. The earlier v17 VACE output is only a private reference; it still has a premature mast, fast desk-to-sea change and partially hidden hull. The v3 yacht is recognisably CG and remains rejected.

## Ready on this workstation

- [GPU package](gpu-package/package-manifest.json): 20 SHA-256-bound files, including the corrected 81-frame structural guide, photographic endpoint images, pinned VACE generator, exact-logo Blender ident preview, separate cascade/capacity 3D preview, font/license and minimal redacted evidence. Its [preparation receipt](preparation-receipt.json) says `PREPARED_CPU_ONLY_PENDING_NVIDIA_GENERATION`.
- [Control contact sheet](control-contact-sheet.png): the paper geometry is held longer before the sail/mast expands. This is a conditioning signal, not finished footage.
- [Seam proof](review-helper-proof-v17/seam-review.png): previous VACE last frame and retained moving-yacht first frame differ by mean absolute pixel value 13.076. The seam looks close in stills but must be judged in motion after v4 inference. The [review helper](../../scripts/content-factory/review-founder-transform.py) generates a decoded contact sheet, seam sheet, motion-change diagnostics and pending-review receipt.
- `scripts/content-factory/generate-controlled-video.py` now allows `referenceMode=endpoints_only`, preserving the previous default extra yacht reference. The pinned installed Diffusers 0.36.0 pipeline accepts an omitted extra reference; both photographic endpoints remain. The change is an experiment aimed at the possible cause of early mast bias, not a proven fix.
- `scripts/content-factory/founder-film/cinematic-ident-v5.py` makes the editable logo layers more visibly separate before convergence and uses a closer side-to-front camera. It retains the exact geometry and a clean 5-second lockup. Only five sampled preview frames are authorized by the prepared request; a full render follows visual approval. Existing cinematic/compute/minimal v3 directions remain retained.
- `scripts/content-factory/founder-film/story-relief-v4.py` prepares two new editable raw takes: waveform/sound/render escalation without replaying the interview, and a physically connected 0-to-3000 milliGPU quota reveal tied to the historical RTX PRO 6000 qualification receipt. These are authored visualizations, not recordings of live product controls or current credit availability.

The no-extra-reference option is supported by the [pinned Diffusers 0.36.0 VACE implementation](https://github.com/huggingface/diffusers/blob/v0.36.0/src/diffusers/pipelines/wan/pipeline_wan_vace.py). It still needs NVIDIA inference and creative inspection to establish whether it helps.

## When credits and a current GPU window are available

Use only the existing L40S instance and establish a **current** cutoff epoch. Saved October 7 and earlier October 8 windows are expired. Recheck Brev state and running NVIDIA jobs before starting anything; if another operator has the GPU lock or a compute process, leave it alone. The prepared runners recheck the exact L40S, the exclusive shared lock and current compute/container jobs. They never start a VM themselves.

If this session starts the VM, launch the workstation-side `scripts/content-factory/founder-film/v4-gpu-watchdog.py` with that same cutoff and `--started-vm-here`. It stops only named v4 containers, checks for other GPU work, and requests a VM stop only when no such work remains. Record its receipt beside this report. Do not set `--started-vm-here` when another session owns the running instance.

```bash
# Workstation, only after starting the VM for this new authorized window:
nohup python3 scripts/content-factory/founder-film/v4-gpu-watchdog.py \
  --deadline-epoch "$AUTHORIZED_DEADLINE_EPOCH" --started-vm-here \
  --output reports/flagship-founder-film-production-v4-20261008/watchdog-receipt.json \
  > reports/flagship-founder-film-production-v4-20261008/watchdog.log 2>&1 &
```

From this repository, after the instance is running and SSH is healthy:

```bash
python3 scripts/content-factory/founder-film/verify-v4-package.py reports/flagship-founder-film-production-v4-20261008/gpu-package
ssh autopromote-l40s-staging 'mkdir -p /data/autopromote-founder-production-v4-20261008/gpu-package'
rsync -a reports/flagship-founder-film-production-v4-20261008/gpu-package/ autopromote-l40s-staging:/data/autopromote-founder-production-v4-20261008/gpu-package/
```

On the instance, with an explicitly current `AUTHORIZED_DEADLINE_EPOCH` in the environment, first run one bounded transformation. The shell runner discovers the retained pinned VACE model and its byte-identical retained text encoder; it refuses to run if they are absent. It writes a stamped request only at launch.

```bash
work=/data/autopromote-founder-production-v4-20261008/gpu-package
bash "$work/run-v4-vace-on-l40s.sh" "$work"
```

Copy `output/v4-transform/video.mp4` and its receipt to a **new** local review folder; run `review-founder-transform.py` against the retained `reports/content-factory-20261007/generated/real-voyage-v6.mp4`; inspect every important frame and the joined moving shot with sound. If its mast, hull, water or seam fails, reject it and revise the cause before another inference. Do not label a generated receipt “accepted” merely because 81 frames decoded.

```bash
# Workstation, after the bounded VACE job completes:
mkdir -p reports/flagship-founder-film-production-v4-20261008/generated-v4
rsync -a autopromote-l40s-staging:/data/autopromote-founder-production-v4-20261008/gpu-package/output/v4-transform/ \
  reports/flagship-founder-film-production-v4-20261008/generated-v4/
taskset -c 6,7 nice -n 10 python3 scripts/content-factory/review-founder-transform.py \
  --video reports/flagship-founder-film-production-v4-20261008/generated-v4/video.mp4 \
  --continuation reports/content-factory-20261007/generated/real-voyage-v6.mp4 \
  --output reports/flagship-founder-film-production-v4-20261008/generated-v4-review
```

Then, if the GPU window still permits, run preview-only takes one at a time, each under the same GPU lock:

```bash
bash "$work/run-v4-story-preview-on-l40s.sh" "$work" cascade
bash "$work/run-v4-story-preview-on-l40s.sh" "$work" capacity-turn
bash "$work/run-v4-ident-preview-on-l40s.sh" "$work"
```

The output still needs frame inspection. If the ident resembles an AP fade or a front-facing flat extrusion, reject and revise the camera/material geometry before a full 120-frame take. Confirm quota wording remains **milliGPU capacity**, not GPU count. Factual Studio/Director source capture and the final created-by shot are still pending until the accepted transformation and actual project exist. Those are creative dependencies, not a reason to substitute old UI montage.

For the eventual hero/cutdown/teaser, bind accepted source hashes and review receipts in the existing Content Factory asset library, run the existing Factory Studio adapter/Director project document compiler, and render through `RenderViralRequest → render_viral_clip_impl`. Keep original CPU fallback for final encoding if NVIDIA export is unavailable; raw neural generation and 3D scenes require the NVIDIA device. Watch and listen to the complete edit, reject weak work, then test and recommend the welcome-page placement. Do not call this private film an ordinary-customer Studio readiness qualification. The separate Studio product continuation remains S02 paired visual/audio parity.

No commit, push, public frontend change, external marketing deployment or new product surface is part of this v4 preparation.
