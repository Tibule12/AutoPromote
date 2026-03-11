#!/bin/bash
# Google Cloud Run Deployment Script for Python Media Worker
set -e

PROJECT_ID="autopromote-cc6d3"
SERVICE_NAME="media-worker-v1"
REGION="us-central1"

echo "=========================================="
echo "   Deploying Python Worker to Cloud Run   "
echo "=========================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: Google Cloud SDK (gcloud) is not installed or not in PATH."
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Ensure we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Set the project
gcloud config set project "$PROJECT_ID"

# 1. Build the container image using Cloud Build
echo "Step 1: Building container image via Cloud Build..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME" .

# 2. Deploy to Cloud Run
echo "Step 2: Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 4Gi \
    --cpu 4 \
    --timeout 900 \
    --concurrency 1 \
    --min-instances 0 \
    --max-instances 3 \
    --set-env-vars "FIREBASE_STORAGE_BUCKET=autopromote-cc6d3.firebasestorage.app"

echo "=========================================="
echo "   Deployment SUCCESS!                    "
echo "=========================================="

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "IMPORTANT: Set this env var on your Render backend:"
echo "  MEDIA_WORKER_URL=$SERVICE_URL"
echo ""
echo "Test the worker:"
echo "  curl $SERVICE_URL/status"
