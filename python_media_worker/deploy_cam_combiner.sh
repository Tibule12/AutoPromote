#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-autopromote-cc6d3}"
SERVICE_NAME="${SERVICE_NAME:-cam-combiner-worker}"
REGION="${REGION:-us-central1}"
IMAGE="${MULTICAM_FAST_WORKER_IMAGE:-gcr.io/${PROJECT_ID}/cam-combiner-worker-fast:latest}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-autopromote-cc6d3.firebasestorage.app}"
QA_RECEIPT_SECRET_NAME="${MULTICAM_QA_RECEIPT_SECRET_NAME:-multicam-qa-receipt-secret}"
TASK_SECRET_NAME="${MEDIA_WORKER_TASK_SECRET_NAME:-cam-combiner-task-secret}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

gcloud config set project "$PROJECT_ID"
gcloud builds submit \
  --config cloudbuild.cam-combiner-fast.yaml \
  --substitutions "_IMAGE=${IMAGE}" \
  .

# This service stays private. The Node API obtains an OIDC identity token for
# every request. Production async renders are owned by the durable Job below.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --platform managed \
  --execution-environment gen2 \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --memory 8Gi \
  --cpu 4 \
  --cpu-throttling \
  --cpu-boost \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "NODE_ENV=production,FIREBASE_STORAGE_BUCKET=${BUCKET},MULTICAM_INGEST_BUCKET=${BUCKET},MULTICAM_UPLOAD_FIREBASE=true,MULTICAM_MASTER_RETENTION_DAYS=7,MULTICAM_BETA_MAX_SECONDS=10800,MULTICAM_BETA_MAX_SEGMENTS=900,MULTICAM_RENDER_CHECKPOINTS_ENABLED=true,MULTICAM_RENDER_CHECKPOINT_SECONDS=300,MULTICAM_CHECKPOINT_DURATION_TOLERANCE_SECONDS=0.10,MULTICAM_EXECUTION_MODE=cloud_run_jobs,MULTICAM_FAST_NO_CAPTIONS=1,ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK=false,MULTICAM_REUSE_VIDEO_ONLY_SYNC_AUDIT=1,ALLOW_RUNTIME_DEPENDENCY_INSTALL=false" \
  --set-secrets "MULTICAM_QA_RECEIPT_SECRET=${QA_RECEIPT_SECRET_NAME}:latest,MEDIA_WORKER_TASK_SECRET=${TASK_SECRET_NAME}:latest"

gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --format='table(status.url,status.latestReadyRevisionName)'
