# facebook_app_review_fetch_api_outputs.ps1
# Run this script locally to fetch sample Graph API outputs for App Review recording.
# Usage: Open PowerShell, navigate to this file's folder, and run:
#    .\facebook_app_review_fetch_api_outputs.ps1
# The script will prompt for a test user ACCESS_TOKEN, VIDEO_ID (optional), APP_ID and APP_SECRET.
# It will write JSON files to the current directory: me_videos.json, video_<VIDEO_ID>.json, debug_token.json

param()

Write-Host "Facebook App Review — fetch API outputs helper" -ForegroundColor Cyan

$accessToken = Read-Host "Enter TEST user ACCESS_TOKEN (replace with your test user's access token)"
if ([string]::IsNullOrWhiteSpace($accessToken)) {
    Write-Host "No access token provided. Exiting." -ForegroundColor Red
    exit 1
}

$videoId = Read-Host "(Optional) Enter a VIDEO_ID to fetch single video details (press Enter to skip)"
$appId = Read-Host "Enter your APP_ID (for debug_token)"
$appSecret = Read-Host "Enter your APP_SECRET (for debug_token)" -AsSecureString
$appSecretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($appSecret))

Write-Host "Fetching /me/videos..." -ForegroundColor Green
try {
    $meVideosUrl = "https://graph.facebook.com/v17.0/me/videos?fields=id,title,description,created_time,thumbnails,source&access_token=$accessToken"
    $meVideos = Invoke-RestMethod -Uri $meVideosUrl -Method Get -ErrorAction Stop
    $meVideos | ConvertTo-Json -Depth 10 | Out-File -FilePath "me_videos.json" -Encoding UTF8
    Write-Host "Saved me_videos.json" -ForegroundColor Green
} catch {
    Write-Host "Error fetching /me/videos: $_" -ForegroundColor Red
}

if (-not [string]::IsNullOrWhiteSpace($videoId)) {
    Write-Host "Fetching specific video $videoId..." -ForegroundColor Green
    try {
        $videoUrl = "https://graph.facebook.com/v17.0/$videoId?fields=id,title,description,created_time,thumbnails,source&access_token=$accessToken"
        $video = Invoke-RestMethod -Uri $videoUrl -Method Get -ErrorAction Stop
        $video | ConvertTo-Json -Depth 10 | Out-File -FilePath "video_$videoId.json" -Encoding UTF8
        Write-Host "Saved video_$videoId.json" -ForegroundColor Green
    } catch {
        Write-Host "Error fetching video: $_" -ForegroundColor Red
    }
}

if (-not [string]::IsNullOrWhiteSpace($appId) -and -not [string]::IsNullOrWhiteSpace($appSecretPlain)) {
    Write-Host "Fetching debug_token..." -ForegroundColor Green
    try {
        $appAccessToken = "${appId}|${appSecretPlain}"
        $debugUrl = "https://graph.facebook.com/debug_token?input_token=$accessToken&access_token=$appAccessToken"
        $debug = Invoke-RestMethod -Uri $debugUrl -Method Get -ErrorAction Stop
        $debug | ConvertTo-Json -Depth 10 | Out-File -FilePath "debug_token.json" -Encoding UTF8
        Write-Host "Saved debug_token.json" -ForegroundColor Green
    } catch {
        Write-Host "Error fetching debug_token: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Skipping debug_token (APP_ID or APP_SECRET missing)" -ForegroundColor Yellow
}

Write-Host "Opening saved JSON files in default editor..." -ForegroundColor Cyan
Start-Process -FilePath "me_videos.json" -WindowStyle Normal -ErrorAction SilentlyContinue
if ($videoId) { Start-Process -FilePath "video_$videoId.json" -WindowStyle Normal -ErrorAction SilentlyContinue }
if (Test-Path "debug_token.json") { Start-Process -FilePath "debug_token.json" -WindowStyle Normal -ErrorAction SilentlyContinue }

Write-Host "Done. Use these files and the open windows during your screen recording to show the Graph API outputs." -ForegroundColor Green
Write-Host "Important: Use test tokens and test users only. Do not reveal production secrets."
