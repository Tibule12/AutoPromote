#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?Usage: bash render_viral_smoke.sh <image>}"
SMOKE_HOST_DIR=$(mktemp -d /tmp/media-worker-render-smoke.XXXXXX)
CONTAINER_NAME="media-worker-render-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
SMOKE_CONTAINER_DIR="/tmp/viral-render-smoke"
SHOW_LOGS=true

cleanup() {
  if ${SHOW_LOGS}; then
    docker logs "${CONTAINER_NAME}" || true
  fi
  docker rm --force "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${SMOKE_HOST_DIR}"
}
trap cleanup EXIT

ffmpeg -v error \
  -f lavfi -i "color=c=blue:s=360x640:d=2:r=24" \
  -f lavfi -i "sine=frequency=880:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  -movflags +faststart -y "${SMOKE_HOST_DIR}/source.mp4"

docker run --detach --rm \
  --name "${CONTAINER_NAME}" \
  --publish 18080:8080 \
  --volume "${SMOKE_HOST_DIR}:${SMOKE_CONTAINER_DIR}:ro" \
  --env NODE_ENV=development \
  --env ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true \
  --env FIREBASE_STORAGE_BUCKET=autopromote-cc6d3.firebasestorage.app \
  "${IMAGE}"

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:18080/status" > "${SMOKE_HOST_DIR}/status.json"; then
    break
  fi
  if [[ "${attempt}" = "60" ]]; then
    echo "Local media-worker container never became healthy."
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error --max-time 300 \
  --header "Content-Type: application/json" \
  --data "{
    \"video_url\": \"${SMOKE_CONTAINER_DIR}/source.mp4\",
    \"start_time\": 0,
    \"end_time\": 2,
    \"auto_captions\": false,
    \"smart_crop\": false,
    \"brand_watermark\": false,
    \"overlays\": [],
    \"async_mode\": false
  }" \
  "http://127.0.0.1:18080/render-viral-clip" \
  > "${SMOKE_HOST_DIR}/result.json"

OUTPUT_PATH=$(python - "${SMOKE_HOST_DIR}/result.json" <<'PY'
import json
from pathlib import Path
import sys

result = json.loads(Path(sys.argv[1]).read_text())
if result.get("status") != "completed":
    raise SystemExit(f"Real Viral Clip render did not complete: {result}")
if int(result.get("progress") or 0) != 100:
    raise SystemExit(f"Real Viral Clip render did not reach 100%: {result}")
output_path = str(result.get("output_path") or "")
if not output_path:
    raise SystemExit(f"Real Viral Clip render returned no output path: {result}")
print(output_path)
PY
)

docker exec "${CONTAINER_NAME}" test -s "${OUTPUT_PATH}"
SHOW_LOGS=false
docker stop "${CONTAINER_NAME}" >/dev/null
echo "Real Viral Clip Docker render completed at 100% with a non-empty output file."
