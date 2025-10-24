<#
trim_recording.ps1

Description:
  Trim an existing MP4 recording using ffmpeg without re-encoding (stream copy).

Usage:
  .\trim_recording.ps1 -Input .\screen_recording.mp4 -StartSeconds 5 -DurationSeconds 170 -Output .\screen_recording_trimmed.mp4

Parameters:
  -Input (string)        : input MP4 path
  -StartSeconds (int)    : offset in seconds for start (default 0)
  -DurationSeconds (int) : duration in seconds for the trimmed clip (optional; if omitted ffmpeg will trim to end)
  -Output (string)       : output MP4 path

#>
param(
    [Parameter(Mandatory=$true)][string]$Input,
    [int]$StartSeconds = 0,
    [int]$DurationSeconds = 0,
    [Parameter(Mandatory=$true)][string]$Output
)

if (-not (Test-Path $Input)) {
    Write-Error "Input file not found: $Input"
    exit 1
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg not found in PATH. Install ffmpeg and add it to PATH."
    exit 1
}

$args = @()
$args += "-y"
$args += "-ss"; $args += $StartSeconds.ToString()
$args += "-i"; $args += $Input
if ($DurationSeconds -gt 0) {
    $args += "-t"; $args += $DurationSeconds.ToString()
}
$args += "-c"; $args += "copy"
$args += $Output

Write-Host "Running: ffmpeg $($args -join ' ')"
& ffmpeg @args
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }
Write-Host "Trimmed file saved to: $Output"
