# Renders evidence files to HTML and prints to PDF using Edge headless
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\print_evidence_to_pdf.ps1

$ErrorActionPreference = 'Stop'
$cwd = Get-Location
$previewDir = Join-Path $cwd 'evidence\_preview'
if (-not (Test-Path $previewDir)) { New-Item -Path $previewDir -ItemType Directory | Out-Null }
$downloads = Join-Path $env:USERPROFILE 'Downloads'

$filesToRender = @(
    @{ src = 'evidence\dependency-scan-report.txt'; name = 'dependency_scan_report' },
    @{ src = 'evidence\npm-audit.json'; name = 'npm_audit' }
)

$ts = (Get-Date).ToString('yyyyMMddHHmmss')

# Find msedge path
$edgePaths = @( 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' )
$msedge = $null
foreach ($p in $edgePaths) { if (Test-Path $p) { $msedge = $p; break } }
if (-not $msedge) { Write-Error "msedge not found at expected locations. Install Edge or adjust path in script."; exit 2 }

foreach ($f in $filesToRender) {
    $srcPath = Join-Path $cwd $f.src
    if (-not (Test-Path $srcPath)) { Write-Output "Skipping missing file: $srcPath"; continue }
    $content = Get-Content -LiteralPath $srcPath -Raw
    $encoded = [System.Net.WebUtility]::HtmlEncode($content)
    $html = "<html><head><meta charset='utf-8'><title>$($f.name)</title></head><body><pre>$encoded</pre></body></html>"
    $htmlPath = Join-Path $previewDir ("{0}_{1}.html" -f $f.name, $ts)
    $html | Out-File -FilePath $htmlPath -Encoding utf8
    Write-Output "Wrote HTML preview: $htmlPath"
    $pdfPath = Join-Path $downloads ("pdf_{0}_{1}.pdf" -f $f.name, $ts)
    Write-Output "Printing to PDF: $pdfPath"
    $proc = Start-Process -FilePath $msedge -ArgumentList @('--headless','--print-to-pdf=' + $pdfPath, $htmlPath) -Wait -PassThru -NoNewWindow
    Write-Output "Edge exit code: $($proc.ExitCode)"
    if (Test-Path $pdfPath) { $size = (Get-Item $pdfPath).Length; Write-Output "Wrote PDF ($size bytes): $pdfPath" } else { Write-Output "Failed to write PDF: $pdfPath (Edge exit code: $($proc.ExitCode))" }
}

Write-Output 'Done'
