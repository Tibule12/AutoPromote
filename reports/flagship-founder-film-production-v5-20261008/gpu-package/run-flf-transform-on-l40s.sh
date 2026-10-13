#!/usr/bin/env bash
# Dedicated trained endpoint generation through the existing conditioned-video adapter.
set -euo pipefail
: "${AUTHORIZED_DEADLINE_EPOCH:?Set the current authorized GPU cutoff epoch}"
root=${1:?Pass the staged private package path}
mode=${2:-preview}
profile=${3:-original}
[[ "$profile" == original || "$profile" == aligned ]] || exit 70
prefix=flf-transform
[[ "$profile" == aligned ]] && prefix=flf-transform-aligned
[[ "$mode" == preview || "$mode" == full ]] || exit 70
models=/tmp/autopromote-wan-flf-20261008
retained=/data/autopromote-content-factory-20261007/models/wan-i2v-a14b
[[ "$root" == /data/* && -f "$root/$prefix-request-template.json" && -f "$models/model-receipt.json" ]] || exit 70
[[ "$AUTHORIZED_DEADLINE_EPOCH" =~ ^[0-9]+$ ]] || exit 70
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)))
minimum=1200
[[ "$mode" == full ]] && minimum=3000
(( remaining >= minimum )) || { echo 'Insufficient window for selected trained endpoint mode' >&2; exit 76; }
[[ "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)" == 'NVIDIA L40S' ]] || exit 72
docker image inspect autopromote-wan-cuda:20261006 >/dev/null
exec 9>/data/autopromote-l40s-20261006/content-factory-gpu.lock
flock -n 9 || { echo 'Shared GPU lock occupied' >&2; exit 75; }
[[ -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d '[:space:]')" ]] || exit 75
[[ -z "$(docker ps --filter 'label=autopromote.gpu.exclusive=true' --format '{{.ID}}')" ]] || exit 75
python3 - "$root" "$models" "$AUTHORIZED_DEADLINE_EPOCH" "$mode" "$prefix" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);models=Path(sys.argv[2]);prefix=sys.argv[5];request=json.loads((root/f'{prefix}-request-template.json').read_text())
receipt=json.loads((models/'model-receipt.json').read_text())
mode=sys.argv[4]
name=request['shots'][0]['name']
if not name.replace('-','').replace('_','').isalnum(): raise SystemExit('Invalid shot identity')
if (receipt['model'],receipt['revision'])!=('Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers','17c30769b1e0b5dcaa1799b117bf20a9c31f59d7'):
    raise SystemExit('Unpinned trained endpoint model')
if request['deadlineEpoch']!=0 or request['settings']!={'width':1280,'height':720,'frames':81,'steps':30} or len(request['shots'])!=1:
    raise SystemExit('Unexpected bounded endpoint request')
for field,key in [('reference_image','first'),('last_reference_image','last')]:
    source=root/request['shots'][0][field].removeprefix('/work/')
    if hashlib.sha256(source.read_bytes()).hexdigest()!=request['inputHashes'][key]:
        raise SystemExit('Endpoint source hash mismatch')
if mode=='preview':
    request['settings']={'width':832,'height':480,'frames':65,'steps':30}
else:
    parent=root/f'output/{prefix}-preview'/name
    review=json.loads((parent/'creative-verdict.json').read_text())
    if (review.get('accepted') is not True or not review.get('reason') or not review.get('reviewer')
        or not review.get('criteria') or any(c.get('passed') is not True for c in review['criteria'])
        or len(review.get('evidenceSha256',''))!=64
        or review.get('artifactSha256')!=hashlib.sha256((parent/'video.mp4').read_bytes()).hexdigest()):
        raise SystemExit('Accepted preview and its matching artifact hash required before full take')
    prior=json.loads((parent/'receipt.json').read_text())
    if (prior.get('model')!=receipt['model'] or prior.get('modelRevision')!=receipt['revision']
        or prior.get('referenceImageSha256')!=request['inputHashes']['first']
        or prior.get('lastReferenceImageSha256')!=request['inputHashes']['last']):
        raise SystemExit('Preview must use this exact pinned model and endpoint pair')
if (root/f'output/{prefix}-{mode}'/name/'receipt.json').exists():
    raise SystemExit('Completed artifact already exists; inspect it instead of duplicating or overwriting generation')
request['deadlineEpoch']=int(sys.argv[3]);request['mode']=mode
(root/f'{prefix}-{mode}-request.json').write_text(json.dumps(request,indent=2))
PY
remaining=$((AUTHORIZED_DEADLINE_EPOCH-$(date +%s)-30))
(( remaining >= minimum-60 )) || exit 76
timeout --signal=TERM --kill-after=20s "$remaining" docker run --rm \
  --name autopromote-founder-v5-flf-transform --label autopromote.gpu.exclusive=true \
  --gpus all --runtime nvidia --network none --cpus 2 --shm-size 8g \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e OMP_NUM_THREADS=2 \
  -v "$root:/work" -v "$models:/models:ro" -v "$retained:/retained:ro" \
  --entrypoint python3 autopromote-wan-cuda:20261006 /work/generate-flf-conditioned-video.py \
  --root /work --models /models --model-profile flf2v --retained-models /retained \
  --request "/work/$prefix-$mode-request.json" --output "/work/output/$prefix-$mode"
