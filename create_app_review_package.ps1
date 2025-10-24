<#
create_app_review_package.ps1

Description:
  Collects the required App Review evidence files (README, API commands, recorded video,
  me_videos.json, debug_token.json, any other evidence) into a single folder and creates
  a ZIP archive ready for upload to Facebook App Review.

Usage:
  .\create_app_review_package.ps1 -SourceFiles @('facebook_app_review_user_videos_README.txt','facebook_app_review_api_commands.txt','me_videos.json','debug_token.json','screen_recording_trimmed.mp4')

Parameters:
  -SourceFiles (string[]) : list of files (relative or absolute) to include in the package
  -OutputZip (string)     : output zip filename (default .\app_review_package.zip)
  -PackageDir (string)    : temporary package directory (default .\app_review_package)

#>
param(
    [Parameter(Mandatory=$true)][string[]]$SourceFiles,
    [string]$OutputZip = ".\app_review_package.zip",
    [string]$PackageDir = ".\app_review_package"
)

if (Test-Path $PackageDir) { Remove-Item -Recurse -Force $PackageDir }
New-Item -ItemType Directory -Path $PackageDir | Out-Null

$added = @()
foreach ($f in $SourceFiles) {
    if (Test-Path $f) {
        Copy-Item -Path $f -Destination $PackageDir -Force
        $added += $f
    }
    else {
        Write-Warning "File not found, skipping: $f"
    }
}

if ($added.Count -eq 0) {
    Write-Error "No files were added to the package. Provide existing file paths."
    exit 1
}

if (Test-Path $OutputZip) { Remove-Item -Force $OutputZip }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory((Resolve-Path $PackageDir).Path, (Resolve-Path $OutputZip).Path)

Write-Host "Package created: $OutputZip"
Write-Host "Included files:"
$added | ForEach-Object { Write-Host " - $_" }
