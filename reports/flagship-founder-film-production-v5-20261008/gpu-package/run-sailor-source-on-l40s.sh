#!/usr/bin/env bash
# One reviewed SDXL source still for the human action shot; timed video is still only.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
root=${1:?Pass the staged private package path}
[[ "$root" == /data/* && -f "$root/sailor-source-request-template.json" ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 180 )) || { echo 'Less than three minutes remain' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
docker image inspect autopromote-wan-cuda:20261006 >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);request=json.loads((root/'sailor-source-request-template.json').read_text())
if request['deadlineEpoch']!=0 or len(request['images'])!=1 or request['images'][0]['id']!='sailor-connected-sheet':
    raise SystemExit('Unexpected bounded sailor request')
request['deadlineEpoch']=int(sys.argv[2])
(root/'sailor-source-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-20))
(( remaining >= 120 )) || exit 76
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v5-sailor-source --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 4g \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/sdxl:/models:ro \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-image.py \
  --models /models --request /work/sailor-source-request.json --output /work/output/sailor-source
