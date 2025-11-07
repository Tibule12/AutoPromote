# Requires: Python + pipx (or pip), internet access
# This script installs Semgrep and runs a repo-wide scan, saving JSON and SARIF outputs.
# Usage: Right-click > Run with PowerShell (or run from a PowerShell terminal in repo root)

$ErrorActionPreference = 'Stop'

function Ensure-Pipx {
  if (-not (Get-Command pipx -ErrorAction SilentlyContinue)) {
    Write-Host 'pipx not found. Installing pipx via pip...'
    python -m pip install --user pipx
    python -m pipx ensurepath
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','User') + ';' + [System.Environment]::GetEnvironmentVariable('Path','Machine')
  }
}

Ensure-Pipx

Write-Host 'Installing/Upgrading semgrep...'
pipx install semgrep --force

$OutDir = Join-Path $PSScriptRoot '..' '..' 'evidence' 'semgrep'
$OutDir = Resolve-Path $OutDir
New-Item -Force -ItemType Directory -Path $OutDir | Out-Null

$Date = Get-Date -Format 'yyyyMMdd-HHmmss'
$JsonOut = Join-Path $OutDir "semgrep-$Date.json"
$SarifOut = Join-Path $OutDir "semgrep-$Date.sarif"

Write-Host 'Running semgrep scan (this may take a few minutes)...'
semgrep scan --config p/ci --json -o $JsonOut --sarif -o $SarifOut .

Write-Host "Done. Outputs saved to: $OutDir"
Write-Host "JSON:  $JsonOut"
Write-Host "SARIF: $SarifOut"