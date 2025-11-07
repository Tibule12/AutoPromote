param()

Write-Output "Running Black Duck (Synopsys Detect) helper script"

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java not found on PATH. Install Java 11+ and re-run this script. See scripts/README_SCA.md for instructions."
    exit 2
}

$detectJar = Join-Path (Get-Location) 'detect.jar'
if (-not (Test-Path $detectJar)) {
    Write-Error "detect.jar not found in repository root. Download the Synopsys Detect jar and save it as detect.jar in the repo root. See README_SCA.md for link and notes."
    exit 3
}

# Read credentials from environment if present, otherwise prompt
$bdUrl = $env:BLACKDUCK_URL
if (-not $bdUrl) { $bdUrl = Read-Host 'Black Duck URL (e.g. https://blackduck.example.com)' }
$bdToken = $env:BLACKDUCK_TOKEN
if (-not $bdToken) { $bdToken = Read-Host 'Black Duck API token (paste here)' }

$outDir = Join-Path (Get-Location) 'evidence\blackduck'
if (-not (Test-Path $outDir)) { New-Item -Path $outDir -ItemType Directory | Out-Null }
$ts = (Get-Date).ToString('yyyyMMddHHmmss')

Write-Output "Starting Synopsys Detect (output -> $outDir)"

$args = @(
  "--blackduck.url=$bdUrl",
  "--blackduck.api.token=$bdToken",
  "--detect.project.name=AutoPromote",
  "--detect.project.version.name=blackduck-scan-$ts",
  "--detect.output.path=$outDir"
)

Write-Output "java -jar $detectJar $($args -join ' ')"
$proc = Start-Process -FilePath 'java' -ArgumentList ('-jar', $detectJar) + $args -Wait -PassThru -NoNewWindow
Write-Output "Detect exit code: $($proc.ExitCode)"
if ($proc.ExitCode -eq 0) { Write-Output "Detect finished. Check $outDir for reports." } else { Write-Error "Detect failed (exit $($proc.ExitCode)). Inspect logs in $outDir or run the command manually." }
