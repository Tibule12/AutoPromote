<#
record_youtube_review_demo.ps1

Description:
  Helps you record the YouTube App Verification demo video.
  1. Generates a 'sample_upload.mp4' file for testing.
  2. Starts screen recording using auto_record.ps1.
  3. Launches the local app in Chrome (if available) or prompts you.
  4. Provides step-by-step prompts (TELEPROMPTER) in the console for exactly what to do.

Usage:
  .\record_youtube_review_demo.ps1

  (Follow the on-screen prompts!)
#>

param(
    [string]$AppUrl = "https://autopromote-cc6d3.web.app",
    [string]$ClientIdHint = "Make sure to point your mouse at the URL bar to show the client_id=<YOUR_ID> part.",
    [int]$MaxTimeSeconds = 300
)

# 1. Generate Dummy Video if needed
if (-not (Test-Path ".\sample_upload.mp4")) {
    Write-Host "Creating sample_upload.mp4 for you to upload..." -ForegroundColor Cyan
    # Generate 10 second test pattern video
    ffmpeg -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" -c:v libx264 -pix_fmt yuv420p -y sample_upload.mp4 -loglevel error
    Write-Host "Created sample_upload.mp4" -ForegroundColor Green
}

# 2. Instructions
Clear-Host
Write-Host "===================================================" -ForegroundColor Yellow
Write-Host "      YOUTUBE APP VERIFICATION DEMO RECORDER       " -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Yellow
Write-Host "This script will record your screen."
Write-Host "Google REQUIRES the following in the video:"
Write-Host "  1. The full OAuth Consent Screen URL."
Write-Host "  2. You clearly showing the Client ID in the URL bar."
Write-Host "  3. You granting the permissions."
Write-Host "  4. You using the feature (Uploading a video)."
Write-Host ""
Write-Host "Press ENTER when you are ready to start recording..."
Read-Host

# 3. Start Recording in New Window
Write-Host "Launching recorder in a new window..." -ForegroundColor Yellow
Write-Host "⚠️ WHEN FINISHED: Select the recorder window and press 'q' to stop and save!" -ForegroundColor Red

$recorderScriptBlock = {
    param($scriptPath, $cwd)
    Set-Location $cwd
    Write-Host "Recording... Press 'q' to stop." -ForegroundColor Green
    & $scriptPath -DurationSeconds 300 -Output "youtube_demo_evidence.mp4"
}

# We launch the existing auto_record.ps1 in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '.\auto_record.ps1' -DurationSeconds 600 -Output 'youtube_demo_evidence.mp4'"

Write-Host "🔴 RECORDING STARTED (in other window)! Go Go Go!" -ForegroundColor Red
Start-Sleep -Seconds 2

# 4. Open Browser
Start-Process "chrome.exe" $AppUrl
Write-Host "Opened $AppUrl" -ForegroundColor Cyan

# 5. Teleprompter
function Prompter($msg) {
    Write-Host "`n👉 ACTION: $msg" -ForegroundColor Magenta
    Write-Host "   (Press ENTER when done)" -ForegroundColor Gray
    Read-Host
}

Prompter "Navigate to the 'Destinations' or 'Connections' tab."
Prompter "Click 'Connect YouTube'."
Prompter "⚠️ STOP! On the Google Sign-in page, HOVER your mouse over the URL bar at the top."
Prompter "Ensure 'client_id=...' is visible. Highlight it with your mouse."
Prompter "Now select your test account and click 'Continue'."
Prompter "On the 'AutoPromote wants access' screen, SCROLL DOWN to show the scopes/permissions."
Prompter "Click 'Allow/Continue'."
Prompter "Back in AutoPromote, verify it says 'Connected'."
Prompter "Now, go to Upload/Content tab."
Prompter "Select 'sample_upload.mp4' (in this folder)."
Prompter "Click 'Upload to YouTube'."
Prompter "Wait for success message."
Prompter "Open a new tab and go to 'studio.youtube.com' to show the uploaded video."
Prompter "Show the video content briefly."

Write-Host "`n✅ DEMO COMPLETE!" -ForegroundColor Green
Write-Host "➡️ Switch to the recorder window and press 'q' to save the video."
Write-Host "File will be saved to: youtube_demo_evidence.mp4" -ForegroundColor Yellow

Pause
