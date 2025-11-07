param()

Write-Output "Running Sonatype Nexus IQ CLI helper script"

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java not found on PATH. Install Java 11+ and re-run this script. See scripts/README_SCA.md for instructions."
    exit 2
}

$cliJar = Join-Path (Get-Location) 'nexus-iq-cli.jar'
if (-not (Test-Path $cliJar)) {
    Write-Error "nexus-iq-cli.jar not found in repository root. Download the Nexus IQ CLI jar and save it as nexus-iq-cli.jar in the repo root. See README_SCA.md for link and notes."
    exit 3
}

$iqUrl = $env:NEXUS_IQ_URL
if (-not $iqUrl) { $iqUrl = Read-Host 'Nexus IQ Server URL (e.g. https://iq.example.com)' }
$user = $env:NEXUS_IQ_USER
if (-not $user) { $user = Read-Host 'Nexus IQ username' }
$pass = $env:NEXUS_IQ_PASS
if (-not $pass) { $pass = Read-Host 'Nexus IQ password or token' }

$outDir = Join-Path (Get-Location) 'evidence\sonatype'
if (-not (Test-Path $outDir)) { New-Item -Path $outDir -ItemType Directory | Out-Null }
$ts = (Get-Date).ToString('yyyyMMddHHmmss')

Write-Output "Starting Nexus IQ CLI (output -> $outDir)"

$cliArgs = @(
  '-s', $iqUrl,
  '-a', ($user + ':' + $pass),
  '-i', 'AutoPromote',
  '-r', (Join-Path $outDir ("nexus_iq_report_$ts.html"))
)

Write-Output "java -jar $cliJar $($cliArgs -join ' ')"
$proc = Start-Process -FilePath 'java' -ArgumentList @('-jar', $cliJar) + $cliArgs -Wait -PassThru -NoNewWindow
Write-Output "Nexus IQ exit code: $($proc.ExitCode)"
if ($proc.ExitCode -eq 0) { Write-Output "Nexus IQ finished. Check $outDir for reports." } else { Write-Error "Nexus IQ failed (exit $($proc.ExitCode)). Inspect logs in $outDir or run the command manually." }
