# Google Cloud Run Deployment Script for Python Media Worker
# Run this script from PowerShell

$ProjectID = "autopromote-cc6d3" # UPDATED to your real project ID
$ServiceName = "media-worker-v1"
$Region = "us-central1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Deploying Python Worker to Cloud Run   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "Google Cloud SDK (gcloud) is not installed or not in your PATH."
    Write-Host "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
}

if (Test-Path "../service-account-key.json") {
    Write-Host "Found service account key in parent directory. Copying for build..." -ForegroundColor Cyan
    Copy-Item "../service-account-key.json" -Destination "serviceAccountKey.json"
} elseif (Test-Path "../serviceAccountKey.json") {
    Write-Host "Found service account key (alt name) in parent directory. Copying for build..." -ForegroundColor Cyan
    Copy-Item "../serviceAccountKey.json" -Destination "serviceAccountKey.json"
} else {
    Write-Warning "No service account key found in parent directory. Worker may fail to auth with Firebase/GCP Storage."
}

# 1. Reuse the production image as a remote layer cache.
Write-Host "Step 1: Building container image..." -ForegroundColor Yellow
gcloud builds submit `
    --config cloudbuild.media-worker.yaml `
    --substitutions "_IMAGE=gcr.io/$ProjectID/${ServiceName}:latest,_CACHE_IMAGE=gcr.io/$ProjectID/${ServiceName}:latest" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit 1
}

# Cleanup key after build
if (Test-Path "serviceAccountKey.json") {
    Remove-Item "serviceAccountKey.json"
}

# 2. Deploy to Cloud Run. Keep the worker at zero while idle; Cloud Run starts it on demand.
Write-Host "Step 2: Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image gcr.io/$ProjectID/$ServiceName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --memory 4Gi `
    --cpu 2 `
    --timeout 300 `
    --concurrency 1 `
    --min-instances 0 `
    --max-instances 3 `
    --set-env-vars "NODE_ENV=production,WHISPER_ENGINE=faster,PROMO_WHISPER_MODEL=small,FASTER_WHISPER_DEVICE=cpu,FASTER_WHISPER_COMPUTE_TYPE=int8,FASTER_WHISPER_STRICT=true,ALLOW_RUNTIME_DEPENDENCY_INSTALL=false"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed!"
    exit 1
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Deployment SUCCESS!                    " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
