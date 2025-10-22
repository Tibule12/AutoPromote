<#!
auto_record_and_capture.ps1

Description:
  Starts an ffmpeg desktop recording (with optional microphone) and runs two Graph API calls
  while recording: GET /me/videos (requires AccessToken) and debug_token (optional, requires AppId+AppSecret).
  Saves outputs as `me_videos.json` and `debug_token.json` in the current working directory.

Usage example:
  # Provide a user access token (recommended) and optionally AppId and AppSecret for debug_token
  .\auto_record_and_capture.ps1 -DurationSeconds 180 -Output .\screen_recording.mp4 -AudioDevice "Microphone (Realtek(R) Audio)" -AccessToken "EAAB..."

Parameters:
  -DurationSeconds (int) : total recording length in seconds (default 180)
  -Output (string)       : output MP4 path (default .\screen_recording.mp4)
  -AudioDevice (string)  : exact audio device name (optional)
  -AccessToken (string)  : Facebook user access token to use for GET /me/videos (optional)
  -AppId (string)        : Facebook App ID (optional; required for debug_token)
  -AppSecret (string)    : Facebook App Secret (optional; required for debug_token)
  -PauseBeforeApi (int)  : seconds to wait after starting recording before running API calls (default 5)
  -FrameRate (int)       : capture framerate (default 30)
  -Width (int)           : target video width (default 1280)

Security note:
  This script will save JSON responses that may contain sensitive tokens. Keep the files private and avoid committing secrets.
  If you don't want to provide AppSecret on the command line, omit AppSecret and the script will skip debug_token.

#>

param(
    [int]$DurationSeconds = 180,
    [string]$Output = ".\screen_recording.mp4",
    [string]$AudioDevice = "",
    [string]$AccessToken = "",
    [string]$AppId = "",
    [string]$AppSecret = "",
    [int]$PauseBeforeApi = 5,
    [int]$FrameRate = 30,
    [int]$Width = 1280
)

function Ensure-FFmpeg {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Write-Error "ffmpeg not found in PATH. Install ffmpeg and add it to PATH, then re-run this script."
        exit 1
    }
}

Ensure-FFmpeg

# Build ffmpeg args (same approach as auto_record.ps1 but run in background)
$ffArgs = @()
$ffArgs += "-y"
$ffArgs += "-f"; $ffArgs += "gdigrab"
$ffArgs += "-framerate"; $ffArgs += $FrameRate.ToString()
$ffArgs += "-i"; $ffArgs += "desktop"
if ($AudioDevice -ne "") {
    $ffArgs += "-f"; $ffArgs += "dshow"
    $ffArgs += "-i"; $ffArgs += "audio=$AudioDevice"
}
$ffArgs += "-vf"; $ffArgs += "scale=$($Width):-2"
$ffArgs += "-c:v"; $ffArgs += "libx264"
$ffArgs += "-preset"; $ffArgs += "veryfast"
$ffArgs += "-crf"; $ffArgs += "23"
if ($AudioDevice -ne "") {
    $ffArgs += "-c:a"; $ffArgs += "aac"
    $ffArgs += "-b:a"; $ffArgs += "128k"
} else {
    $ffArgs += "-an"
}
$ffArgs += "-t"; $ffArgs += $DurationSeconds.ToString()
$ffArgs += $Output

Write-Host "Starting ffmpeg recording for $DurationSeconds seconds. Output: $Output"
Write-Host "ffmpeg command: ffmpeg $($ffArgs -join ' ')"

# Start ffmpeg in background and keep process object
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = 'ffmpeg'
$startInfo.Arguments = ($ffArgs -join ' ')
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $startInfo
$proc.Start() | Out-Null

Write-Host "Recording started (PID: $($proc.Id)). Waiting $PauseBeforeApi seconds before running API calls..."
Start-Sleep -Seconds $PauseBeforeApi

# Run API calls while ffmpeg records
if ($AccessToken -ne "") {
    try {
        $meVideosUrl = "https://graph.facebook.com/me/videos?limit=100&access_token=$AccessToken"
        Write-Host "Fetching /me/videos..."
        $meVideos = Invoke-RestMethod -Uri $meVideosUrl -Method Get -ErrorAction Stop
        $meVideos | ConvertTo-Json -Depth 10 | Out-File -FilePath .\me_videos.json -Encoding utf8
        Write-Host "Saved me_videos.json"
    }
    catch {
        Write-Warning "Failed to fetch /me/videos: $_"
    }
} else {
    Write-Warning "No AccessToken supplied. Skipping GET /me/videos."
}

# Run debug_token if AppId/AppSecret and AccessToken are provided
if ($AppId -ne "" -and $AppSecret -ne "" -and $AccessToken -ne "") {
    try {
        $appToken = "$AppId|$AppSecret"
        $dbgUrl = "https://graph.facebook.com/debug_token?input_token=$AccessToken&access_token=$appToken"
        Write-Host "Running debug_token..."
        $debug = Invoke-RestMethod -Uri $dbgUrl -Method Get -ErrorAction Stop
        $debug | ConvertTo-Json -Depth 10 | Out-File -FilePath .\debug_token.json -Encoding utf8
        Write-Host "Saved debug_token.json"
    }
    catch {
        Write-Warning "Failed to run debug_token: $_"
    }
} else {
    Write-Host "AppId/AppSecret missing or AccessToken not provided; skipping debug_token."
}

Write-Host "API calls complete. Waiting for ffmpeg to finish (if still running)..."

# Wait for process to exit (guard with timeout slightly above DurationSeconds)
$maxWait = $DurationSeconds + 15
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while (-not $proc.HasExited -and $sw.Elapsed.TotalSeconds -lt $maxWait) {
    Start-Sleep -Milliseconds 200
}
if (-not $proc.HasExited) {
    try { $proc.Kill(); Write-Warning "ffmpeg did not exit in time; process was killed." } catch {}
}

Write-Host "Recording done. Output file: $Output"

# Final note
Write-Host "Files saved:"
if (Test-Path .\me_videos.json) { Write-Host " - me_videos.json" }
if (Test-Path .\debug_token.json) { Write-Host " - debug_token.json" }
Write-Host "Recording file: $Output"
