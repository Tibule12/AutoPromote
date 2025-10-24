# Minimal helper to fetch Graph API outputs for App Review
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\facebook_app_review_run_simple.ps1

Write-Host 'Facebook App Review - simple fetch helper'

$accessToken = Read-Host 'ACCESS_TOKEN (test user token)'
if ([string]::IsNullOrWhiteSpace($accessToken)) { Write-Host 'No token provided. Exiting.'; exit 1 }

$videoId = Read-Host 'VIDEO_ID (optional)'
$appId = Read-Host 'APP_ID (optional)'
$appSecret = Read-Host 'APP_SECRET (optional)'

# Build me/videos URL without using interpolation
$meVideosUrl = 'https://graph.facebook.com/v17.0/me/videos?fields=id,title,description,created_time,thumbnails,source&access_token=' + $accessToken
try {
  $meVideos = Invoke-RestMethod -Uri $meVideosUrl -Method Get -ErrorAction Stop
  $meVideos | ConvertTo-Json -Depth 10 | Out-File -FilePath 'me_videos.json' -Encoding UTF8
  Write-Host 'Saved me_videos.json'
} catch {
  Write-Host 'Error fetching /me/videos: ' $_
}

if (-not [string]::IsNullOrWhiteSpace($videoId)) {
  $videoUrl = 'https://graph.facebook.com/v17.0/' + $videoId + '?fields=id,title,description,created_time,thumbnails,source&access_token=' + $accessToken
  try {
    $video = Invoke-RestMethod -Uri $videoUrl -Method Get -ErrorAction Stop
    $video | ConvertTo-Json -Depth 10 | Out-File -FilePath ('video_' + $videoId + '.json') -Encoding UTF8
    Write-Host ('Saved video_' + $videoId + '.json')
  } catch {
    Write-Host 'Error fetching video: ' $_
  }
}

if (-not [string]::IsNullOrWhiteSpace($appId) -and -not [string]::IsNullOrWhiteSpace($appSecret)) {
  $appAccessToken = $appId + '|' + $appSecret
  $debugUrl = 'https://graph.facebook.com/debug_token?input_token=' + $accessToken + '&access_token=' + $appAccessToken
  try {
    $debug = Invoke-RestMethod -Uri $debugUrl -Method Get -ErrorAction Stop
    $debug | ConvertTo-Json -Depth 10 | Out-File -FilePath 'debug_token.json' -Encoding UTF8
    Write-Host 'Saved debug_token.json'
  } catch {
    Write-Host 'Error fetching debug_token: ' $_
  }
} else {
  Write-Host 'Skipping debug_token (APP_ID or APP_SECRET missing)'
}

# Open files if they exist
if (Test-Path 'me_videos.json') { Start-Process -FilePath 'me_videos.json' }
if (Test-Path 'debug_token.json') { Start-Process -FilePath 'debug_token.json' }

Write-Host 'Done.'
