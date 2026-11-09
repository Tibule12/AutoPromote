#!/usr/bin/env bash
# Run ONLY on the already-running authorized L40S, with the staged v4 package.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
work_root=${1:?Pass staged v4 gpu-package directory on the L40S}
model_root=/data/autopromote-content-factory-20261007/models
encoder_root=/data/autopromote-l40s-20261006/models/wan-ti2v-5b/text_encoder
lock=/data/autopromote-l40s-20261006/content-factory-gpu.lock
image=autopromote-wan-cuda:20261006
[[ "$work_root" == /data/* && -f "$work_root/request-template.json" && -f "$work_root/generate-controlled-video.py" ]] || { echo 'Missing staged private package' >&2; exit 70; }
python3 "$work_root/verify-v4-package.py" "$work_root"
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || { echo 'Invalid GPU cutoff' >&2; exit 70; }
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 900 )) || { echo 'Less than 15 minutes remain in authorized window' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || { echo 'Exact NVIDIA L40S required' >&2; exit 72; }
docker image inspect "$image" >/dev/null
exec 9>"$lock"
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || { echo 'GPU compute job already running' >&2; exit 75; }
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || { echo 'Another AutoPromote GPU container is running' >&2; exit 75; }
model_dir=$(python3 - "$model_root" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
matches=[]
for receipt in root.glob('*/model-receipt.json'):
    try: value=json.loads(receipt.read_text())
    except (OSError,ValueError): continue
    if value.get('model')=='Wan-AI/Wan2.1-VACE-1.3B-diffusers' and value.get('revision')=='ec4d2cb062b548996b179d493fdd05340de702a1':
        matches.append(receipt.parent)
if len(matches)!=1: raise SystemExit(f'Expected one pinned VACE cache, found {len(matches)}')
print(matches[0].name)
PY
)
[[ -f "$encoder_root/config.json" ]] || { echo 'Pinned retained text encoder missing' >&2; exit 72; }
python3 - "$work_root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);request=json.loads((root/'request-template.json').read_text())
if request.get('deadlineEpoch')!=0 or request.get('referenceMode')!='endpoints_only':
    raise SystemExit('Unexpected v4 request template')
for name in ('controlVideo','firstImage','lastImage'):
    path=root/'assets'/Path(request[name]).name
    if hashlib.sha256(path.read_bytes()).hexdigest()!=request[name+'Sha256']:
        raise SystemExit('Input hash mismatch: '+name)
request['deadlineEpoch']=int(sys.argv[2])
(root/'request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= 750 )) || { echo 'Insufficient time after preflight' >&2; exit 76; }
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v4-vace --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$work_root:/work" -v "$model_root:/models:ro" -v "$encoder_root:/encoder:ro" \
  --entrypoint python3 "$image" /work/generate-controlled-video.py \
  --root /work --models "/models/$model_dir" --text-encoder /encoder \
  --request /work/request.json --output /work/output/v4-transform
