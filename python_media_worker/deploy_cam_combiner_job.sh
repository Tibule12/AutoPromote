#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-autopromote-cc6d3}"
REGION="${REGION:-us-central1}"
JOB_NAME="${MULTICAM_RENDER_JOB_NAME:-cam-combiner-render-job}"
JOB_SERVICE_ACCOUNT="${MULTICAM_JOB_SERVICE_ACCOUNT:-cam-combiner-job@${PROJECT_ID}.iam.gserviceaccount.com}"
IMAGE="${MULTICAM_WORKER_IMAGE:-gcr.io/${PROJECT_ID}/cam-combiner-worker:latest}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-autopromote-cc6d3.firebasestorage.app}"
QA_SECRET_NAME="${MULTICAM_QA_RECEIPT_SECRET_NAME:-multicam-qa-receipt-secret}"
CALLBACK_SECRET_NAME="${MULTICAM_JOB_CALLBACK_SECRET_NAME:-multicam-job-callback-secret}"
TASK_SECRET_NAME="${MEDIA_WORKER_TASK_SECRET_NAME:-cam-combiner-task-secret}"
CALLBACK_URL="${MULTICAM_JOB_CALLBACK_URL:-https://api.autopromote.org/api/media/internal/multicam-job-failed}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Keep the caption model out of the latency-sensitive preflight service and
# no-caption job. Build this larger image only for requests that burn captions.
gcloud builds submit \
  --project "$PROJECT_ID" \
  --config cloudbuild.cam-combiner.yaml \
  --substitutions "_IMAGE=${IMAGE}" \
  .

gcloud run jobs deploy "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$JOB_SERVICE_ACCOUNT" \
  --command python3 \
  --args multicam_job_runner.py \
  --cpu 8 \
  --memory 8Gi \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 1 \
  --task-timeout 4h \
  --set-env-vars "NODE_ENV=production,FIREBASE_STORAGE_BUCKET=${BUCKET},MULTICAM_INGEST_BUCKET=${BUCKET},MULTICAM_UPLOAD_FIREBASE=true,MULTICAM_MASTER_RETENTION_DAYS=7,MULTICAM_BETA_MAX_SECONDS=10800,MULTICAM_BETA_MAX_SEGMENTS=900,MULTICAM_RENDER_CHECKPOINTS_ENABLED=true,MULTICAM_RENDER_CHECKPOINT_SECONDS=300,MULTICAM_CHECKPOINT_DURATION_TOLERANCE_SECONDS=0.10,ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=false,MULTICAM_REUSE_VIDEO_ONLY_SYNC_AUDIT=1,MULTICAM_SOURCE_PREP_CONCURRENCY=2,MULTICAM_VISUAL_PROXY_CONCURRENCY=2,MULTICAM_SEGMENT_RENDER_CONCURRENCY=2,MULTICAM_X264_THREADS=4,MULTICAM_REACTION_INSERT_INTERVAL_SECONDS=40,MULTICAM_JOB_MAX_RETRIES=1,WHISPER_ENGINE=faster,FASTER_WHISPER_DEVICE=cpu,FASTER_WHISPER_COMPUTE_TYPE=int8,ALLOW_RUNTIME_DEPENDENCY_INSTALL=false,MULTICAM_JOB_CALLBACK_URL=${CALLBACK_URL}" \
  --set-secrets "MULTICAM_QA_RECEIPT_SECRET=${QA_SECRET_NAME}:latest,MULTICAM_JOB_CALLBACK_SECRET=${CALLBACK_SECRET_NAME}:latest,MEDIA_WORKER_TASK_SECRET=${TASK_SECRET_NAME}:latest"

gcloud run jobs describe "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='table(metadata.name,spec.template.template.spec.containers[0].resources.limits.cpu,spec.template.template.spec.containers[0].resources.limits.memory)'
