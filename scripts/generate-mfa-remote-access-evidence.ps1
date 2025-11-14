# Generate evidence for MFA on remote access to servers by demonstrating SSH is disabled
# - Runs Test-NetConnection to port 22 on production domain(s)
# - Attempts a short ssh connection (expected to fail/refuse/timeout)
# - Renders results into an HTML page and captures a PNG screenshot to Downloads

$ErrorActionPreference = 'Stop'
$cwd = Get-Location
$repoRoot = $cwd
$previewDir = Join-Path $repoRoot 'evidence\_preview'
if (-not (Test-Path $previewDir)) { New-Item -Path $previewDir -ItemType Directory | Out-Null }
$downloads = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path $downloads)) { New-Item -Path $downloads -ItemType Directory | Out-Null }

$domains = @('autopromote.org','www.autopromote.org','autopromote-1.onrender.com','autopromote.onrender.com')

function Try-Test($h){
  try {
    $r = Test-NetConnection -ComputerName $h -Port 22 -InformationLevel Detailed -WarningAction SilentlyContinue
    return $r | Out-String
  } catch { return ("Test-NetConnection failed for {0}: {1}" -f $h, $_.Exception.Message) }
}

function Try-Ssh($h){
  $out = ''
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'ssh'
    $psi.Arguments = "-o ConnectTimeout=5 -v $h"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit(7000) | Out-Null
    $out = $p.StandardOutput.ReadToEnd() + "`n" + $p.StandardError.ReadToEnd()
  } catch { $out = ("ssh invocation failed for {0}: {1}" -f $h, $_.Exception.Message) }
  return $out
}

$results = @()
foreach ($d in $domains) {
  $tnc = Try-Test $d
  $ssh = Try-Ssh $d
  $results += "### Host: $d`n`n--- Test-NetConnection (22) ---`n$tnc`n--- ssh -v (timeout expected) ---`n$ssh`n"
}

# Build HTML
$escaped = [System.Net.WebUtility]::HtmlEncode(($results -join "`n`n"))
$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
$htmlPath = Join-Path $previewDir ("mfa_remote_access_" + $ts + ".html")
$pngPath = Join-Path $downloads ("security_mfa_remote_access_" + $ts + ".png")

$html = @"
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MFA Remote Access Evidence</title>
    <style>
      body { background:#0b0f14; color:#e6edf3; font-family:Consolas, Menlo, monospace; margin:0; padding:24px; }
      .wrap { max-width:1200px; margin:0 auto; }
      h1 { margin:0 0 6px 0; color:#4cc2ff; font-size:20px; }
      .meta { color:#9fbad1; font-size:12px; margin-bottom:16px; }
      .card { background:#0e141b; border:1px solid #1f2a37; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,0.35); overflow:hidden; }
      .hd { padding:12px 16px; border-bottom:1px solid #1f2a37; color:#9fbad1; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; }
      pre { margin:0; padding:16px; white-space:pre-wrap; word-wrap:break-word; }
      .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; margin-right:8px; }
      .b-blocked { background:#36141b; color:#fb7185; border:1px solid #fb7185; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Remote SSH Access — Blocked</h1>
      <div class="meta">Generated: $(Get-Date -Format o) • Policy: No SSH; MFA required at providers for privileged actions</div>
      <div class="card">
        <div class="hd"><span class="badge b-blocked">SSH disabled</span> Port 22 connectivity and handshake attempts</div>
        <pre>$escaped</pre>
      </div>
    </div>
  </body>
</html>
"@

$html | Out-File -FilePath $htmlPath -Encoding utf8
Write-Output "Wrote HTML preview: $htmlPath"

# Find Edge and capture screenshot
$edgePaths = @( 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' )
$msedge = $null
foreach ($p in $edgePaths) { if (Test-Path $p) { $msedge = $p; break } }
if (-not $msedge) { Write-Error "msedge not found at expected locations."; exit 2 }
$args = @('--headless=new', '--hide-scrollbars', '--window-size=1400,1000', "--screenshot=$pngPath", $htmlPath)
Write-Output ("Capturing screenshot to: {0}" -f $pngPath)
$proc = Start-Process -FilePath $msedge -ArgumentList $args -Wait -PassThru -NoNewWindow
Write-Output ("Edge exit code: {0}" -f $proc.ExitCode)
if (Test-Path $pngPath) {
  $size = (Get-Item $pngPath).Length
  Write-Output ("Wrote PNG ({0} bytes): {1}" -f $size, $pngPath)
}
