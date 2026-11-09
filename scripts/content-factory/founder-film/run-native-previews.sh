#!/usr/bin/env bash
set -euo pipefail
film_root=/data/autopromote-founder-production-v3-20261008
phase=${1:?vessel or idents}
case "$phase" in vessel|idents) ;; *) exit 73;; esac
gpu_active=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)
if [ -n "$gpu_active" ]; then exit 75; fi
if [ "$phase" = vessel ]; then
  docker run --rm --name autopromote-founder-production-v3 --label autopromote.gpu.exclusive=true \
    --gpus all --runtime nvidia --network none --cpus 2 \
    -e NVIDIA_DRIVER_CAPABILITIES=compute,utility -e STUDIO_3D_DEVICE=optix \
    -e STUDIO_3D_SAMPLES=40 -e OMP_NUM_THREADS=2 -v "$film_root:/film" \
    --entrypoint /opt/blender/blender autopromote-studio-3d:20261006-final \
    -b -t 2 --python-exit-code 1 --python /film/cinematic-vessel.py -- \
    /film/vessel-request.json /film/vessel-preview
else
  for direction in cinematic compute minimal; do
    docker run --rm --name autopromote-founder-production-v3 --label autopromote.gpu.exclusive=true \
      --gpus all --runtime nvidia --network none --cpus 2 \
      -e NVIDIA_DRIVER_CAPABILITIES=compute,utility -e STUDIO_3D_DEVICE=optix \
      -e STUDIO_3D_SAMPLES=40 -e OMP_NUM_THREADS=2 -v "$film_root:/film" \
      --entrypoint /opt/blender/blender autopromote-studio-3d:20261006-final \
      -b -t 2 --python-exit-code 1 --python /film/cinematic-ident.py -- \
      "/film/ident-$direction-request.json" "/film/ident-$direction-preview"
  done
fi
