#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-film-20261008
film_version=${1:?version}
film_id=${2:?output}
case "$film_version/$film_id" in rough-v1/one-edit-hero|final-v2/one-edit-hero|final-v2/one-edit-cutdown|final-v2/one-edit-teaser) ;; *) exit 73;; esac
flock -w 180 /data/autopromote-l40s-20261006/content-factory-gpu.lock timeout --signal=TERM --kill-after=20s 360s docker run --rm --name autopromote-founder-film-render --label autopromote.gpu.exclusive=true --gpus all --runtime nvidia --network none --cpus 4 -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e VIRAL_EXPORT_ENCODER=nvenc -e FIREBASE_STATUS_UPDATES_ENABLED=false -e LOCAL_MEDIA_OUTPUT_ONLY=true -e ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true -e ALLOW_RUNTIME_DEPENDENCY_INSTALL=false -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -v "$film_root:/film" --entrypoint python3 autopromote-media-gpu:20261006-final /film/render-existing-studio.py --root /film --worker /film/worker --request "/film/outputs/$film_version/$film_id/render-request.json" --output "/film/outputs/$film_version/$film_id" > "$film_root/render-$film_version-$film_id.log" 2>&1
