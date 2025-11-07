param()

Write-Output "Running Mend / WhiteSource Unified Agent helper script"

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java not found on PATH. Install Java 11+ and re-run this script. See scripts/README_SCA.md for instructions."
    exit 2
}

$agentJar = Join-Path (Get-Location) 'unified-agent.jar'
if (-not (Test-Path $agentJar)) {
    Write-Error "unified-agent.jar not found in repository root. Download WhiteSource / Mend Unified Agent jar and save it as unified-agent.jar in the repo root. See README_SCA.md for link and notes."
    exit 3
}

$apiKey = $env:MEND_API_KEY
if (-not $apiKey) { $apiKey = Read-Host 'Mend (WhiteSource) API key (paste here)' }

$outDir = Join-Path (Get-Location) 'evidence\mend'
if (-not (Test-Path $outDir)) { New-Item -Path $outDir -ItemType Directory | Out-Null }
$ts = (Get-Date).ToString('yyyyMMddHHmmss')

Write-Output "Starting Mend Unified Agent (output -> $outDir)"

$args = @(
  '-apiKey', $apiKey,
  '-product', 'AutoPromote',
  '-project', 'AutoPromote',
  '-offline', 'false'
)

Write-Output "java -jar $agentJar $($args -join ' ')"
$proc = Start-Process -FilePath 'java' -ArgumentList @('-jar', $agentJar) + $args -Wait -PassThru -NoNewWindow
Write-Output "Unified Agent exit code: $($proc.ExitCode)"
if ($proc.ExitCode -eq 0) { Write-Output "Unified Agent finished. Check $outDir for reports." } else { Write-Error "Unified Agent failed (exit $($proc.ExitCode)). Inspect logs in $outDir or run the command manually." }
