#!/usr/bin/env bash
# First/last-frame Wan 14B experiment. No creative acceptance is implied.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
root=${1:?Pass the staged private package path}
[[ "$root" == /data/* && -f "$root/morph-i2v-request-template.json" ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 900 )) || { echo 'Less than 15 minutes remain' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
docker image inspect autopromote-wan-cuda:20261006 >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);request=json.loads((root/'morph-i2v-request-template.json').read_text())
if request['deadlineEpoch']!=0 or request['settings']!={'width':832,'height':480,'frames':65,'steps':30} or len(request['shots'])!=1:
    raise SystemExit('Unexpected bounded morph request')
shot=request['shots'][0]
for field,hash_key in [('reference_image','first'),('last_reference_image','last')]:
    file=root/shot[field].removeprefix('/work/')
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=request['inputHashes'][hash_key]:
        raise SystemExit('Source hash mismatch: '+field)
request['deadlineEpoch']=int(sys.argv[2])
(root/'morph-i2v-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= 750 )) || exit 76
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v5-i2v-transform --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v /data/autopromote-content-factory-20261007/models/wan-i2v-a14b:/models:ro \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-conditioned-video.py \
  --root /work --models /models --request /work/morph-i2v-request.json --output /work/output/morph-i2v-65f
