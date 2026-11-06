#!/usr/bin/env bash
# Shared pre-deployment gate. The PR job supplies no cloud identity or credentials.
set -euo pipefail
TASK_REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
GITHUB_WORKSPACE="${GITHUB_WORKSPACE:-$TASK_REPOSITORY_ROOT}"
IMAGE="${IMAGE:-autopromote-media-worker:verify}"
cd "$TASK_REPOSITORY_ROOT/python_media_worker"
docker build --tag "${IMAGE}" .

docker run --rm \
  --volume "${GITHUB_WORKSPACE}:/workspace:ro" \
  --workdir /workspace \
  --entrypoint python \
  "${IMAGE}" \
  -m unittest \
  python_media_worker.test_viral_render_contract \
  python_media_worker.test_studio_delivery_timing \
  python_media_worker.test_studio_finish \
  python_media_worker.test_studio_reframe_cuts \
  python_media_worker.test_studio_sequence_packet_clock \
  python_media_worker.test_studio_colour_contract \
  python_media_worker.test_studio_multicam_filters \
  python_media_worker.test_caption_quality \
  python_media_worker.test_content_aware_reality \
  python_media_worker.test_motion_sculpture \
  python_media_worker.test_viral_creative_effects \
  python_media_worker.test_viral_studio_plan

mkdir -p /tmp/viral-render-smoke
ffmpeg -v error \
  -f lavfi -i "color=c=blue:s=360x640:d=2:r=24" \
  -f lavfi -i "sine=frequency=880:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  -movflags +faststart -y /tmp/viral-render-smoke/source.mp4

docker run --detach --rm \
  --name media-worker-render-smoke \
  --publish 18080:8080 \
  --volume /tmp/viral-render-smoke:/tmp/viral-render-smoke:ro \
  --env NODE_ENV=development \
  --env ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true \
  --env FIREBASE_STORAGE_BUCKET=autopromote-cc6d3.firebasestorage.app \
  "${IMAGE}"
trap 'docker logs media-worker-render-smoke || true; docker stop media-worker-render-smoke || true' EXIT

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:18080/status" > /tmp/viral-render-smoke/status.json; then
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
  --data '{
    "video_url": "/tmp/viral-render-smoke/source.mp4",
    "start_time": 0,
    "end_time": 2,
    "timeline_segments": [{
      "id": "frontend-smoke-main",
      "url": "/tmp/viral-render-smoke/source.mp4",
      "start_time": 0,
      "end_time": 2,
      "duration": 2
    }],
    "auto_captions": false,
    "smart_crop": true,
    "smart_crop_mode": "ai_director",
    "export_destination": "tiktok",
    "professional_cleanup": true,
    "finish_plan": {
      "enabled": true,
      "color": {"contrast": 1.08, "saturation": 1.05},
      "texture": {"film_grain": 0.02, "chromatic_aberration": 0.02},
      "visualizer": {"enabled": true, "mode": "wave", "position": "top"}
    },
    "sound_effects": [{
      "id": "smoke-impact",
      "name": "Impact",
      "builtIn": true,
      "tone": "impact",
      "startTime": 0.5,
      "duration": 0.4,
      "volume": 0.2,
      "enabled": true
    }],
    "brand_watermark": false,
    "overlays": [],
    "async_mode": false
  }' \
  "http://127.0.0.1:18080/render-viral-clip" \
  > /tmp/viral-render-smoke/result.json

OUTPUT_PATH=$(python - <<'PY'
import json
from pathlib import Path

result = json.loads(Path("/tmp/viral-render-smoke/result.json").read_text())
if result.get("status") != "completed":
    raise SystemExit(f"Real Viral Clip render did not complete: {result}")
if int(result.get("progress") or 0) != 100:
    raise SystemExit(f"Real Viral Clip render did not reach 100%: {result}")
quality_gate = result.get("final_quality_gate") or {}
if quality_gate.get("status") != "passed":
    raise SystemExit(f"Real Viral Clip quality gate failed: {quality_gate}")
media = result.get("media_validation") or {}
video = media.get("video") or {}
audio = media.get("audio") or {}
if (video.get("width"), video.get("height")) != (1080, 1920):
    raise SystemExit(f"Vertical delivery dimensions are wrong: {video}")
if video.get("codec_name") != "h264" or audio.get("codec_name") != "aac":
    raise SystemExit(f"Browser delivery codecs are wrong: {media}")
output_path = str(result.get("output_path") or "")
if not output_path:
    raise SystemExit(f"Real Viral Clip render returned no output path: {result}")
print(output_path)
PY
)
docker exec media-worker-render-smoke test -s "${OUTPUT_PATH}"
docker stop media-worker-render-smoke
trap - EXIT


