#!/usr/bin/env bash
set -euo pipefail
# Reuses the already-authorized, already-running instance. Never starts Brev.
# No cloud credentials are sent to the GPU. Call only between completed jobs.
mode=${1:?media or vfx}
qa_host=${STUDIO_QA_SSH_HOST:-autopromote-l40s-staging}
qa_deadline=${STUDIO_QA_GPU_DEADLINE_EPOCH:?Set the deadline of the currently authorized GPU window}
[[ "$qa_deadline" =~ ^[0-9]+$ ]] || { echo 'Invalid GPU deadline' >&2; exit 2; }
qa_remaining=$((qa_deadline-$(date +%s)))
((qa_remaining >= 60)) || { echo 'Authorized GPU window expired' >&2; exit 2; }
case "$mode" in
  media)
    ssh -T -o BatchMode=yes "$qa_host" "flock -n /data/autopromote-l40s-20261006/content-factory-gpu.lock timeout --signal=TERM --kill-after=15s ${qa_remaining}s docker run --rm --name autopromote-studio-qa-media --gpus all --runtime nvidia -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e FASTER_WHISPER_MODEL=/models/studio-whisper -e VIRAL_CAPTION_WHISPER_MODEL=/models/studio-whisper -e MULTICAM_CAPTION_WHISPER_MODEL=/models/studio-whisper -e VIRAL_CAPTION_TRANSCRIPTION_PROVIDER=local -e FASTER_WHISPER_DEVICE=auto -e FASTER_WHISPER_COMPUTE_TYPE=float16 -e FASTER_WHISPER_STRICT=true -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e ALLOW_RUNTIME_DEPENDENCY_INSTALL=false -e ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true -e LOCAL_MEDIA_OUTPUT_ONLY=true -e FIREBASE_STATUS_UPDATES_ENABLED=false -e MEDIA_WORKER_ALLOWED_ORIGINS=http://localhost:5000 -e LOCAL_MEDIA_OUTPUT_BASE_URL=http://localhost:8008 -e PORT=8080 -p127.0.0.1:8080:8080 -v /data/autopromote-studio-qa-20261007/worker:/app:ro -v /data/autopromote-studio-qa-20261007/evidence:/evidence -v /data/autopromote-l40s-20261006/models:/models:ro -v /data/autopromote-studio-qa-20261007/outputs:/tmp/worker_outputs autopromote-media-gpu:20261006-final"
    ;;
  vfx)
    ssh -T -o BatchMode=yes "$qa_host" "flock -n /data/autopromote-l40s-20261006/content-factory-gpu.lock timeout --signal=TERM --kill-after=15s ${qa_remaining}s docker run --rm --name autopromote-studio-qa-vfx --gpus all --runtime nvidia --env-file /data/autopromote-studio-qa-20261007/vfx-worker.env -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e STUDIO_VFX_MODEL_DIR=/models/sam2.1-hiera-tiny -e STUDIO_VFX_JOB_ROOT=/qa-vfx -e STUDIO_VFX_EXPECTED_GPU='NVIDIA L40S' -e NVIDIA_SERVICE_DEADLINE_EPOCH=${qa_deadline} -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -p127.0.0.1:8081:8081 -v /data/autopromote-studio-qa-20261007/worker:/app:ro -v /data/autopromote-l40s-20261006/models:/models:ro -v /data/autopromote-studio-qa-20261007/vfx:/qa-vfx autopromote-studio-qa-vfx:20261007 python -m uvicorn studio_subject_vfx_server:app --host 0.0.0.0 --port 8081"
    ;;
  *) exit 2 ;;
esac
