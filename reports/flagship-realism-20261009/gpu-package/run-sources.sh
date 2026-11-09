#!/usr/bin/env bash
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Current authorized cutoff required}"
root=${1:?Staged package required}
attempt=${2:-1}
[[ "$attempt" == 1 || "$attempt" == 2 ]] || exit 70
request=source-request.json
output=source-images
if [[ "$attempt" == 2 ]]; then
 request=source-request-v2.json
 output=source-images-v2
fi
[[ "$root" == /data/autopromote-founder-realism-20261009/gpu-package ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= 180 )) || exit 76
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Existing GPU owner; no source generation submitted' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" "$request" "$output" <<'PY'
import hashlib,json,sys
from pathlib import Path
r=Path(sys.argv[1]);d=json.loads((r/sys.argv[3]).read_text())
if d['deadlineEpoch']!=int(sys.argv[2]) or len(d['images'])!=2:raise SystemExit('Unexpected source request')
for i in d['images']:
 if i.get('reference_image'):
  p=r/i['reference_image'].removeprefix('/work/')
  if hashlib.sha256(p.read_bytes()).hexdigest()!=i['reference_image_sha256']:raise SystemExit('Source changed')
 out=r/sys.argv[4]/i['id']
 if out.exists() and any(out.iterdir()):raise SystemExit('Existing source bytes; recover/review instead of duplicating generation')
PY
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
 --name "autopromote-founder-realism-sources-v${attempt}-20261009" --label autopromote.gpu.exclusive=true \
 --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
 -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
 -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/sdxl:/models:ro \
 --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-image.py \
 --root /work --models /models --request "/work/$request" --output "/work/$output"
