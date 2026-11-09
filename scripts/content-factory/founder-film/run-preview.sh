#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-film-20261008
cd "$film_root"
tar -xzf source-v2.tar.gz
# The exclusive lease covers every NVIDIA scene; never silently share it.
nvidia-smi --query-gpu=name,memory.used,utilization.gpu --format=csv,noheader > gpu-before.csv
if [ -n "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' -q)" ]; then exit 71; fi
flock -n /data/autopromote-l40s-20261006/content-factory-gpu.lock timeout --signal=TERM --kill-after=20s 300s docker run --rm --name autopromote-founder-film-preview --label autopromote.gpu.exclusive=true --gpus all --runtime nvidia --network none -e STUDIO_3D_DEVICE=optix -e NVIDIA_DRIVER_CAPABILITIES=compute,utility -e OMP_NUM_THREADS=2 -v "$film_root:/film" --entrypoint blender autopromote-studio-3d:20261006-final -b -t 2 --python /film/scene.py -- /film/scene-request.json /film preview > preview.log 2>&1
