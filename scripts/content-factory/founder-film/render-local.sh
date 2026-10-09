#!/usr/bin/env bash
set -euo pipefail
film_repo=$(cd "$(dirname "$0")/../../.." && pwd)
film_root="$film_repo/reports/flagship-founder-film-20261008"
film_worker=/tmp/autopromote-founder-film-worker-20261008
film_python=/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/.venv/bin/python
cd "$film_worker"
for film_id in one-edit-hero one-edit-cutdown one-edit-teaser; do
 PYTHONUNBUFFERED=1 FIREBASE_STATUS_UPDATES_ENABLED=false LOCAL_MEDIA_OUTPUT_ONLY=true ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=true ALLOW_RUNTIME_DEPENDENCY_INSTALL=false VIRAL_EXPORT_ENCODER=cpu "$film_python" "$film_repo/scripts/content-factory/render-existing-studio.py" --root "$film_root" --worker "$film_worker" --request "$film_root/outputs/final-v2/$film_id/render-request.json" --output "$film_root/outputs/final-v2/$film_id" > "$film_root/render-$film_id-private.log" 2>&1
 done
