#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-production-v3-20261008
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -w 30 9
if [ -n "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)" ]; then exit 75; fi
for film_id in one-edit-hero one-edit-cutdown one-edit-teaser; do
  film_remaining=$((1791464069-$(date +%s)))
  if [ "$film_remaining" -le 0 ]; then exit 76; fi
  timeout --signal=TERM --kill-after=10s "$film_remaining" docker run --rm --name autopromote-founder-production-v3 --label autopromote.gpu.exclusive=true --gpus all --runtime nvidia --network none --cpus 4 -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e VIRAL_EXPORT_ENCODER=nvenc -e FIREBASE_STATUS_UPDATES_ENABLED=false -e LOCAL_MEDIA_OUTPUT_ONLY=true -e ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true -e ALLOW_RUNTIME_DEPENDENCY_INSTALL=false -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OPENBLAS_NUM_THREADS=2 -e OMP_NUM_THREADS=2 -v "$film_root:/film" --entrypoint python3 autopromote-media-gpu:20261006-final /film/render-existing-studio.py --root /film --worker /film/worker --request "/film/outputs/$film_id/render-request.json" --output "/film/outputs/$film_id" > "$film_root/render-$film_id.log" 2>&1
 done
