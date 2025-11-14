# Generate a screenshot image (PNG) of the analyzer console output for evidence
# - Runs the analyzer to produce console text
# - Builds a simple HTML page styled like a terminal
# - Uses Edge headless to capture a PNG screenshot into Downloads

$ErrorActionPreference = 'Stop'
$cwd = Get-Location
$repoRoot = $cwd
$logsDir = Join-Path $repoRoot 'logs'
$previewDir = Join-Path $repoRoot 'evidence\_preview'
if (-not (Test-Path $previewDir)) { New-Item -Path $previewDir -ItemType Directory | Out-Null }
$downloads = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path $downloads)) { New-Item -Path $downloads -ItemType Directory | Out-Null }

# Ensure Edge exists
$edgePaths = @( 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' )
$msedge = $null
foreach ($p in $edgePaths) { if (Test-Path $p) { $msedge = $p; break } }
if (-not $msedge) { Write-Error "msedge not found at expected locations. Install Edge or adjust path in script."; exit 2 }

# Run analyzer and capture console output
Write-Output "Running analyzer to capture console output..."
try {
  $analyzerOutput = & node 'scripts/analyze-logs.js' 2>&1 | Out-String
} catch {
  Write-Error "Failed to run analyzer: $($_.Exception.Message)"; exit 1
}

# Load latest access log and extract suspicious lines (401/403/5xx)
function Get-LatestFile([string]$dir, [string]$pattern){
  if (-not (Test-Path $dir)) { return $null }
  $f = Get-ChildItem -Path $dir -Filter $pattern -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  return $f
}

$latestAccess = Get-LatestFile -dir $logsDir -pattern 'access-*.log'
$suspiciousLines = @()
if ($latestAccess) {
  $suspiciousLines = Get-Content -LiteralPath $latestAccess.FullName -Raw | Select-String -Pattern 'status=401|status=403|status=5\d\d' -AllMatches | ForEach-Object { $_.Line }
}

$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
$htmlPath = Join-Path $previewDir ("analyzer_console_" + $ts + ".html")
$pngPath = Join-Path $downloads ("security_evidence_console_" + $ts + ".png")

# Build styled HTML (dark terminal-like theme)
$escapedConsole = [System.Net.WebUtility]::HtmlEncode($analyzerOutput)
$escapedLog = [System.Net.WebUtility]::HtmlEncode(($suspiciousLines -join "`n"))
$html = @"
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Security Analyzer Output</title>
    <style>
      :root { --bg:#0b0f14; --panel:#0e141b; --text:#e6edf3; --muted:#9fbad1; --accent:#4cc2ff; --ok:#34d399; --warn:#f59e0b; --err:#ef4444; }
      * { box-sizing:border-box; }
      body { margin:0; padding:24px; background:var(--bg); color:var(--text); font-family: Consolas, 'SFMono-Regular', Menlo, Monaco, 'Liberation Mono', monospace; }
      .wrap { max-width: 1100px; margin: 0 auto; }
      h1 { font-size:20px; margin:0 0 12px 0; color:var(--accent); }
      .card { background:var(--panel); border:1px solid #1f2a37; border-radius:10px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.35); margin-bottom:20px; }
      .card .hd { padding:12px 16px; border-bottom:1px solid #1f2a37; color:var(--muted); font-size:12px; letter-spacing:0.08em; text-transform:uppercase; }
      pre { margin:0; padding:16px; white-space:pre-wrap; word-break:break-word; }
      .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; margin-right:8px; }
      .b-high { background:#36141b; color:#fb7185; border:1px solid #fb7185; }
      .b-medium { background:#1f2937; color:#fbbf24; border:1px solid #fbbf24; }
      .meta { color:var(--muted); font-size:12px; margin-bottom:8px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Security Log Analyzer — Console Output</h1>
      <div class="meta">Generated: $(Get-Date -Format o)</div>
      <div class="card">
        <div class="hd">Analyzer Console</div>
        <pre>$escapedConsole</pre>
      </div>
      <div class="card">
        <div class="hd">Suspicious Log Lines (401/403/5xx)</div>
        <pre>$escapedLog</pre>
      </div>
    </div>
  </body>
</html>
"@

$html | Out-File -FilePath $htmlPath -Encoding utf8
Write-Output "Wrote HTML preview: $htmlPath"

# Take screenshot with Edge headless
$args = @('--headless=new', '--hide-scrollbars', '--window-size=1400,1000', "--screenshot=$pngPath", $htmlPath)
Write-Output ("Capturing screenshot to: {0}" -f $pngPath)
$proc = Start-Process -FilePath $msedge -ArgumentList $args -Wait -PassThru -NoNewWindow
Write-Output ("Edge exit code: {0}" -f $proc.ExitCode)
if (Test-Path $pngPath) {
  $size = (Get-Item $pngPath).Length
  Write-Output ("Wrote PNG ({0} bytes): {1}" -f $size, $pngPath)
} else {
  Write-Output "Failed to write PNG: $pngPath"
}
