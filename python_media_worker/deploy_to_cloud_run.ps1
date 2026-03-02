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

# 1. Build the container image using Cloud Build
Write-Host "Step 1: Building container image..." -ForegroundColor Yellow
gcloud builds submit --tag gcr.io/$ProjectID/$ServiceName .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit 1
}

# 2. Deploy to Cloud Run
Write-Host "Step 2: Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image gcr.io/$ProjectID/$ServiceName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --concurrency 80

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed!"
    exit 1
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Deployment SUCCESS!                    " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
