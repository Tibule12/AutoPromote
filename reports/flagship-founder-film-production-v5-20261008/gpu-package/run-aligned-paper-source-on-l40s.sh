#!/usr/bin/env bash
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Current paid GPU cutoff required}"
root=${1:?Staged package root required}
[[ "$root" == /data/* && "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
(( AUTHORIZED_DEADLINE_EPOCH-$(date +%s) >= 180 )) || exit 76
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || exit 75
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);request=json.loads((root/'aligned-paper-source-request-template.json').read_text())
assert request['deadlineEpoch']==0 and len(request['images'])==1
assert request['images'][0]['id']=='paper-yacht-aligned-source'
assert not (root/'output/aligned-paper-source/paper-yacht-aligned-source/receipt.json').exists()
request['deadlineEpoch']=int(sys.argv[2])
(root/'aligned-paper-source-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-20))
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v5-paper-origin --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 4g \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/sdxl:/models:ro \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-reference-image.py \
  --root /work --models /models --request /work/aligned-paper-source-request.json --output /work/output/aligned-paper-source
