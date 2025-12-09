#!/usr/bin/env pwsh
<#
Script: copy-local-service-account.ps1
Purpose: Copy a local `service-account-key.json` (kept at repo root for convenience) into `test/e2e/tmp/service-account.json` for local testing.
Usage (PowerShell):
  .\scripts\copy-local-service-account.ps1
#>

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$src = Join-Path $repoRoot 'service-account-key.json'
$dstDir = Join-Path $repoRoot 'test\e2e\tmp'
$dst = Join-Path $dstDir 'service-account.json'

if (-not (Test-Path $src)) {
  Write-Error "Source service account not found at: $src`nPlace your local file named 'service-account-key.json' in the repository root or create the file from your secrets."
  exit 1
}

New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
Copy-Item -Path $src -Destination $dst -Force
Write-Output "Copied $src -> $dst"
exit 0
