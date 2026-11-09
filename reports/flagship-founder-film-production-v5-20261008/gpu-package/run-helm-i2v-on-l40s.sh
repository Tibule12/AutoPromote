#!/usr/bin/env bash
# One bounded moving human test through the existing Wan provider.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
root=${1:?Pass the staged private package path}
revision=${2:-v1}
[[ "$revision" == v1 || "$revision" == v2 ]] || exit 70
request_name=helm-i2v
output_name=helm-i2v-720p
if [[ "$revision" == v2 ]]; then request_name=helm-response-i2v; output_name=helm-response-i2v-720p; fi
[[ "$root" == /data/* && -f "$root/$request_name-request-template.json" ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 1800 )) || { echo 'Less than 30 minutes remain for native 720p' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
docker image inspect autopromote-wan-cuda:20261006 >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" "$request_name" "$output_name" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);name=sys.argv[3];request=json.loads((root/f'{name}-request-template.json').read_text())
if request['deadlineEpoch']!=0 or request['settings']!={'width':1280,'height':720,'frames':49,'steps':30} or len(request['shots'])!=1:
    raise SystemExit('Unexpected bounded helm request')
source=root/request['shots'][0]['reference_image'].removeprefix('/work/')
if hashlib.sha256(source.read_bytes()).hexdigest()!=request['inputHash']:
    raise SystemExit('Helm source hash mismatch')
request['deadlineEpoch']=int(sys.argv[2])
if (root/'output'/sys.argv[4]/request['shots'][0]['name']/'receipt.json').exists():
    raise SystemExit('Completed human take exists; inspect its bytes instead of overwriting or duplicating it')
(root/f'{name}-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= 1650 )) || exit 76
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v5-i2v-sailor --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/wan-i2v-a14b:/models:ro \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-conditioned-video.py \
  --root /work --models /models --request "/work/$request_name-request.json" --output "/work/output/$output_name"
