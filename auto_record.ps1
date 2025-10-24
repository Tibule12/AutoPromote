<#
auto_record.ps1

Description:
  Simple PowerShell wrapper around ffmpeg to record the Windows desktop (gdigrab)
  and an optional microphone (dshow) into an MP4 file. Uses an argument array to
  avoid quoting problems when invoking ffmpeg from PowerShell.

Usage examples (PowerShell):
  # List available audio devices (to find the AudioDevice name):
  ffmpeg -list_devices true -f dshow -i dummy

  # Record 3 minutes with a named microphone to the repo folder:
  .\auto_record.ps1 -DurationSeconds 180 -Output .\screen_recording.mp4 -AudioDevice "Microphone (Realtek(R) Audio)"

  # Record 2 minutes without audio:
  .\auto_record.ps1 -DurationSeconds 120 -Output .\screen_recording_noaudio.mp4

Parameters:
  -DurationSeconds (int) : recording length in seconds (default 180)
  -Output (string)       : output path for the MP4 file (default .\screen_recording.mp4)
  -AudioDevice (string)  : exact audio device name from ffmpeg dshow list (optional)
  -FrameRate (int)       : capture framerate (default 30)
  -Width (int)           : target video width; height will be auto-calculated to keep aspect (default 1280)

Requirements:
  - ffmpeg must be installed and in PATH.

#>

param(
    [int]$DurationSeconds = 180,
    [string]$Output = ".\screen_recording.mp4",
    [string]$AudioDevice = "",
    [int]$FrameRate = 30,
    [int]$Width = 1280
)

function Ensure-FFmpeg {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Write-Error "ffmpeg not found in PATH. Install ffmpeg (https://ffmpeg.org/) and add it to PATH, then re-run this script."
        exit 1
    }
}

Ensure-FFmpeg

# Build argument list for ffmpeg to avoid complex quoting
$args = @()
$args += "-y"
$args += "-f"; $args += "gdigrab"
$args += "-framerate"; $args += $FrameRate.ToString()
$args += "-i"; $args += "desktop"

if ($AudioDevice -ne "") {
    # add audio capture via dshow
    $args += "-f"; $args += "dshow"
    $args += "-i"; $args += "audio=$AudioDevice"
}

# scale while preserving aspect ratio (width x -2)
$args += "-vf"; $args += "scale=$($Width):-2"
$args += "-c:v"; $args += "libx264"
$args += "-preset"; $args += "veryfast"
$args += "-crf"; $args += "23"

if ($AudioDevice -ne "") {
    $args += "-c:a"; $args += "aac"
    $args += "-b:a"; $args += "128k"
} else {
    $args += "-an"
}

$args += "-t"; $args += $DurationSeconds.ToString()
$args += $Output

Write-Host "Starting screen recording... Duration: $DurationSeconds s; Output: $Output"
Write-Host "ffmpeg command: ffmpeg $($args -join ' ')"

try {
    & ffmpeg @args
    $exit = $LASTEXITCODE
    if ($exit -ne 0) {
        Write-Error "ffmpeg exited with code $exit"
        exit $exit
    }
}
catch {
    Write-Error "Failed to run ffmpeg: $_"
    exit 1
}

Write-Host "Recording finished. File saved to: $Output"
