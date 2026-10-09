#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-film-20261008
film_remaining=$(python3 -c 'import json,time;print(int(json.load(open("/data/autopromote-founder-film-20261008/scene-request.json"))["deadlineEpoch"]-time.time()-120))')
if [ "$film_remaining" -lt 300 ]; then exit 72; fi
flock -n /data/autopromote-l40s-20261006/content-factory-gpu.lock timeout --signal=TERM --kill-after=20s "$film_remaining" docker run --rm --name autopromote-founder-film-scenes --label autopromote.gpu.exclusive=true --gpus all --runtime nvidia --network none -e STUDIO_3D_DEVICE=optix -e NVIDIA_DRIVER_CAPABILITIES=compute,utility -e OMP_NUM_THREADS=2 -v "$film_root:/film" --entrypoint bash autopromote-studio-3d:20261006-final /film/run-assets-container.sh > "$film_root/scenes.log" 2>&1
