#!/usr/bin/env bash
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Current authorized cutoff required}"
root=${1:?Private staged package required}
[[ "$root" == /data/autopromote-founder-realism-20261009/gpu-package ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= 2000 )) || { echo 'Insufficient window for bounded native720 take' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'GPU lock occupied; no job submitted' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);r=json.loads((root/'yacht-request.json').read_text())
if r['deadlineEpoch']!=int(sys.argv[2]) or len(r['shots'])!=1 or r['settings']!={'width':1280,'height':720,'frames':49,'steps':30,'referenceResize':'aspect_fit'}:
 raise SystemExit('Unexpected private bounded request')
s=r['shots'][0];source=root/s['reference_image'].removeprefix('/work/')
if hashlib.sha256(source.read_bytes()).hexdigest()!=s['reference_image_sha256']:raise SystemExit('Source changed')
out=root/'output'/s['name']
if out.exists() and any(out.iterdir()):raise SystemExit('Existing take: recover/review instead of duplicating it')
PY
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
 --name autopromote-founder-realism-yacht-20261009 --label autopromote.gpu.exclusive=true \
 --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
 -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
 -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/wan-i2v-a14b:/models:ro \
 --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-conditioned-video.py \
 --root /work --models /models --request /work/yacht-request.json --output /work/output
