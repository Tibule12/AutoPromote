#!/usr/bin/env bash
# One geometry-controlled 14B test; existing 1.3B/default paths stay available.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Current paid GPU cutoff required}"
root=${1:?Staged private package required}
models=/tmp/autopromote-wan-vace14b-20261008
retained=/data/autopromote-content-factory-20261007/models/wan-i2v-a14b
[[ "$root" == /data/* && "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
(( AUTHORIZED_DEADLINE_EPOCH-$(date +%s) >= 1200 )) || exit 76
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || exit 75
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$models" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);models=Path(sys.argv[2])
m=json.loads((models/'model-receipt.json').read_text())
assert (m['model'],m['revision'])==('Wan-AI/Wan2.1-VACE-14B-diffusers','db79b90c60bbb45ceec9e41b9d5a4df934538ac4')
r=json.loads((root/'vace14b-edge-request-template.json').read_text())
assert r['deadlineEpoch']==0 and r['steps']==30 and r['referenceMode']=='endpoints_only'
for field in ['controlVideo','firstImage','lastImage']:
    file=root/r[field].removeprefix('/work/')
    assert file.resolve().is_relative_to(root.resolve())
    assert hashlib.sha256(file.read_bytes()).hexdigest()==r[field+'Sha256']
assert not (root/'output/vace14b-edges/receipt.json').exists()
r['deadlineEpoch']=int(sys.argv[3])
(root/'vace14b-edge-request.json').write_text(json.dumps(r,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v4-vace --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v "$models:/models:ro" -v "$retained:/retained:ro" \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-controlled-video14b.py \
  --root /work --models /models --model-profile vace14b --retained-models /retained \
  --text-encoder /retained/text_encoder --request /work/vace14b-edge-request.json --output /work/output/vace14b-edges
