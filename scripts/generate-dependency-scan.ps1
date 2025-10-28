<#
Generate dependency scan outputs using npm. Produces audit.json and deps.json in the project's evidence directory.
Run: .\scripts\generate-dependency-scan.ps1
#>

Param()

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path "$projectRoot\.."
$evidenceDir = Join-Path $repoRoot 'evidence'
if (-not (Test-Path $evidenceDir)) { New-Item -ItemType Directory -Path $evidenceDir | Out-Null }

Write-Host "Running npm audit --json..."
Push-Location $repoRoot
try {
    npm audit --json 2>$null | Out-File -FilePath (Join-Path $evidenceDir 'npm-audit.json') -Encoding utf8
    npm ls --all --json 2>$null | Out-File -FilePath (Join-Path $evidenceDir 'npm-deps.json') -Encoding utf8
    Write-Host "Dependency scan outputs written to $evidenceDir"
} catch {
    Write-Error "Failed to run npm commands: $_"
} finally {
    Pop-Location
}
