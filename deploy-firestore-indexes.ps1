# Deploy Firestore Indexes
# This script deploys the indexes defined in firestore.indexes.json to your Firestore database

Write-Host "Deploying Firestore Indexes..." -ForegroundColor Cyan

# Check if Firebase CLI is installed
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Firebase CLI not found!" -ForegroundColor Red
    Write-Host "Install it with: npm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
$loginCheck = firebase projects:list 2>&1
if ($loginCheck -match "not authenticated") {
    Write-Host "ERROR: Not logged in to Firebase!" -ForegroundColor Red
    Write-Host "Run: firebase login" -ForegroundColor Yellow
    exit 1
}

# Deploy indexes
Write-Host "`nDeploying indexes from firestore.indexes.json..." -ForegroundColor Green
firebase deploy --only firestore:indexes

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Firestore indexes deployed successfully!" -ForegroundColor Green
    Write-Host "`nIndexes that were added:" -ForegroundColor Cyan
    Write-Host "  - generated_clips: userId + createdAt (DESC)" -ForegroundColor White
    Write-Host "  - content: userId + createdAt (DESC)" -ForegroundColor White
    Write-Host "  - notifications: user_id + created_at (DESC)" -ForegroundColor White
    Write-Host "  - events: at (ASC)" -ForegroundColor White
    Write-Host "`nNote: Indexes may take a few minutes to build." -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Failed to deploy indexes!" -ForegroundColor Red
    exit 1
}
