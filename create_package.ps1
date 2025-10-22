# create_package.ps1
# Run this script in PowerShell to create facebook_app_review_package.zip
# It will include:
# - facebook_app_review_user_videos_README.txt
# - facebook_app_review_api_commands.txt
# - facebook_app_review_fetch_api_outputs.ps1

$files = @(
    "facebook_app_review_user_videos_README.txt",
    "facebook_app_review_api_commands.txt",
    "facebook_app_review_fetch_api_outputs.ps1"
)

$zipName = "facebook_app_review_package.zip"

# Remove existing zip if present
if (Test-Path $zipName) { Remove-Item $zipName -Force }

Compress-Archive -Path $files -DestinationPath $zipName -Force

Write-Host "Created $zipName with files:" -ForegroundColor Green
$files | ForEach-Object { Write-Host " - $_" }
