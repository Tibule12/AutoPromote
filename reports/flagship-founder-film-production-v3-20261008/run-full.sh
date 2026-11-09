#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-production-v3-20261008
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -w 30 9
film_remaining=$((1791464069-$(date +%s)))
if [ "$film_remaining" -le 0 ]; then exit 76; fi
if [ -n "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)" ]; then exit 75; fi
timeout --signal=TERM --kill-after=10s "$film_remaining" docker run --rm --name autopromote-founder-production-v3 --label autopromote.gpu.exclusive=true --gpus all --runtime nvidia --network none --cpus 2 -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e STUDIO_3D_DEVICE=optix -e STUDIO_3D_SAMPLES=40 -e OMP_NUM_THREADS=2 -v "$film_root:/film" --entrypoint bash autopromote-studio-3d:20261006-final /film/run-full-container.sh
