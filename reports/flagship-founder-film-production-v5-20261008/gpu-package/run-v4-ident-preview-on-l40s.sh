#!/usr/bin/env bash
# First render only five sampled ident frames. Human visual review precedes full render.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
work_root=${1:?Pass staged v4 gpu-package directory on the L40S}
lock=/data/autopromote-l40s-20261006/content-factory-gpu.lock
image=autopromote-studio-3d:20261006-final
[[ "$work_root" == /data/* && -f "$work_root/ident-preview-request-template.json" && -f "$work_root/cinematic-ident-v5.py" ]] || { echo 'Missing staged ident package' >&2; exit 70; }
python3 "$work_root/verify-v4-package.py" "$work_root"
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || { echo 'Invalid GPU cutoff' >&2; exit 70; }
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
(( remaining >= 300 )) || { echo 'Insufficient authorized time for preview' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || { echo 'Exact NVIDIA L40S required' >&2; exit 72; }
docker image inspect "$image" >/dev/null
exec 9>"$lock"
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || { echo 'GPU compute job already running' >&2; exit 75; }
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || { echo 'Another AutoPromote GPU container is running' >&2; exit 75; }
python3 - "$work_root" "$AUTHORIZED_DEADLINE_EPOCH" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);request=json.loads((root/'ident-preview-request-template.json').read_text())
if request.get('mode')!='preview' or request.get('deadlineEpoch')!=0:
    raise SystemExit('Unexpected ident preview request')
if hashlib.sha256((root/'logo-geometry.json').read_bytes()).hexdigest()!=request['logoGeometrySha256']:
    raise SystemExit('Logo geometry hash mismatch')
request['deadlineEpoch']=int(sys.argv[2])
(root/'ident-preview-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-20))
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v4-ident-preview --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 \
  -e STUDIO_3D_DEVICE=optix -e NVIDIA_DRIVER_CAPABILITIES=compute,utility \
  -e OMP_NUM_THREADS=2 -v "$work_root:/work" \
  --entrypoint blender "$image" -b -t 2 --python /work/cinematic-ident-v5.py -- \
  /work/ident-preview-request.json /work/output/ident-preview
