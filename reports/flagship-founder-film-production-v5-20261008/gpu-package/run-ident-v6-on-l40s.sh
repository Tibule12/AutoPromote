#!/usr/bin/env bash
# Bounded private OptiX preview/full render; uses the shared exclusive GPU lock.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Current paid GPU cutoff required}"
root=${1:?Staged package root required}
mode=${2:-preview}
revision=${3:-v6}
[[ "$revision" == v6 || "$revision" == v7 || "$revision" == v8 ]] || exit 70
[[ "$root" == /data/* && ( "$mode" == preview || "$mode" == full ) ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
(( AUTHORIZED_DEADLINE_EPOCH-$(date +%s) >= 180 )) || exit 76
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
docker image inspect autopromote-studio-3d:20261006-final >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || exit 75
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$mode" "$AUTHORIZED_DEADLINE_EPOCH" "$revision" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);mode=sys.argv[2];deadline=int(sys.argv[3]);revision=sys.argv[4]
source=root/f'original-ident-{revision}-preview.json'
data=json.loads(source.read_text())
assert data['template']=='autopromote-folded-aperture-ident-v6'
assert data['mode']=='preview' and data['font']=='/work/font.ttf'
assert (root/'font.ttf').is_file() and (root/'original-ident-v6.py').is_file()
data['mode']=mode;data['deadlineEpoch']=deadline
(root/f'original-ident-{revision}-{mode}-stamped.json').write_text(json.dumps(data,indent=2))
print(json.dumps({'identMode':mode,'scriptSha256':hashlib.sha256((root/'original-ident-v6.py').read_bytes()).hexdigest()}))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-20))
(( remaining >= 120 )) || exit 76
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name "autopromote-founder-v6-ident-$mode" --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 \
  -e STUDIO_3D_DEVICE=optix -e NVIDIA_DRIVER_CAPABILITIES=compute,utility \
  -e OMP_NUM_THREADS=2 -v "$root:/work" \
  --entrypoint blender autopromote-studio-3d:20261006-final -b -t 2 \
  --python /work/original-ident-v6.py -- \
  "/work/original-ident-$revision-$mode-stamped.json" "/work/output/ident-$revision-$mode"
