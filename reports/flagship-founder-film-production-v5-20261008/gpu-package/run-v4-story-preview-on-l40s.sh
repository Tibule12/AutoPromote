#!/usr/bin/env bash
# Render a selected raw story preview on the already-authorized L40S only.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
work_root=${1:?Pass staged v4 gpu-package directory on the L40S}
shot=${2:?Pass cascade or capacity-turn}
[[ "$shot" == cascade || "$shot" == capacity-turn ]] || { echo 'Unknown story shot' >&2; exit 70; }
[[ "$work_root" == /data/* && -f "$work_root/story-relief-v4.py" ]] || { echo 'Missing staged story package' >&2; exit 70; }
python3 "$work_root/verify-v4-package.py" "$work_root"
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || { echo 'Invalid GPU cutoff' >&2; exit 70; }
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 300 )) || { echo 'Insufficient authorized time for preview' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || { echo 'Exact NVIDIA L40S required' >&2; exit 72; }
docker image inspect autopromote-studio-3d:20261006-final >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || { echo 'GPU compute job already running' >&2; exit 75; }
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || { echo 'Another AutoPromote GPU container is running' >&2; exit 75; }
python3 - "$work_root" "$shot" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);shot=sys.argv[2]
request=json.loads((root/f'{shot}-preview-request-template.json').read_text())
if request.get('shot')!=shot or request.get('mode')!='preview' or request.get('deadlineEpoch')!=0:
    raise SystemExit('Unexpected story preview request')
request['deadlineEpoch']=int(sys.argv[3])
(root/f'{shot}-preview-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-20))
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name "autopromote-founder-v4-$shot-preview" --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 \
  -e STUDIO_3D_DEVICE=optix -e NVIDIA_DRIVER_CAPABILITIES=compute,utility \
  -e OMP_NUM_THREADS=2 -v "$work_root:/work" \
  --entrypoint blender autopromote-studio-3d:20261006-final \
  -b -t 2 --python /work/story-relief-v4.py -- \
  "/work/$shot-preview-request.json" "/work/output/$shot-preview"
