# Run-IntegrationTests.ps1
# Check if script execution is enabled
$policy = Get-ExecutionPolicy -Scope Process
if ($policy -eq "Restricted") {
    Write-Host "NOTE: PowerShell execution policy is set to Restricted." -ForegroundColor Yellow
    Write-Host "You may need to run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass" -ForegroundColor Yellow
    Write-Host "Or run PowerShell as Administrator for this script to work." -ForegroundColor Yellow
    Write-Host ""
}

# Ensure test-results directory exists
$resultsDir = Join-Path $PSScriptRoot "test-results"
if (-not (Test-Path $resultsDir)) {
    Write-Host "Creating test-results directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
    if (Test-Path $resultsDir) {
        Write-Host "Created test-results directory successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to create test-results directory!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "AutoPromote Integration Testing Suite" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Checking database connection..." -ForegroundColor Yellow
node checkDatabaseConnection.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database connection check failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Step 2: Generating sample data if needed..." -ForegroundColor Yellow
node generateSampleData.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Sample data generation failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Step 3: Verifying admin dashboard queries..." -ForegroundColor Yellow
node testAdminQueries.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Admin dashboard query tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "All tests completed successfully!" -ForegroundColor Green
Write-Host "Results are saved in the test-results directory."
Write-Host ""
Write-Host "You can now start the application and verify the admin dashboard:"
Write-Host "npm start"
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
