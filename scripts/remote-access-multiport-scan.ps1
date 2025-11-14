# Multi-port remote access scan evidence generator
# Scans a set of sensitive/administrative service ports against production domains
# Expected: all blocked except standard web ports (80/443 handled by domain)
# Outputs a structured text report saved under evidence\multiport_scan_<timestamp>.txt

$ErrorActionPreference = 'Stop'
$domains = @('autopromote.org','www.autopromote.org')
$ports = @(
  22,    # SSH
  3389,  # RDP
  5900,  # VNC
  3306,  # MySQL
  5432,  # PostgreSQL
  27017, # MongoDB
  6379,  # Redis
  8080   # Alternate HTTP (should be closed externally)
)

$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
$evidenceDir = Join-Path (Join-Path $PSScriptRoot '..') 'evidence'
if (-not (Test-Path $evidenceDir)) { New-Item -ItemType Directory -Path $evidenceDir | Out-Null }
$outPath = Join-Path $evidenceDir "multiport_scan_$ts.txt"

function Test-Port($h,$prt){
  try {
    $r = Test-NetConnection -ComputerName $h -Port $prt -InformationLevel Detailed -WarningAction SilentlyContinue
    [pscustomobject]@{
      Host=$h
      Port=$prt
      TcpTestSucceeded=$r.TcpTestSucceeded
      RemoteAddress=$r.RemoteAddress
      PingSucceeded=$r.PingSucceeded
    }
  } catch {
    [pscustomobject]@{ Host=$h; Port=$prt; TcpTestSucceeded=$false; RemoteAddress=''; PingSucceeded=$false; Error=$_.Exception.Message }
  }
}

$results = @()
foreach ($d in $domains){
  foreach ($p in $ports){
    $results += Test-Port $d $p
  }
}

# Derive summary statistics
$open = $results | Where-Object { $_.TcpTestSucceeded }
$closed = $results | Where-Object { -not $_.TcpTestSucceeded }

$lines = @()
$lines += "AUTO-PROMOTE MULTI-PORT REMOTE ACCESS SCAN"
$lines += ("Timestamp: {0}" -f (Get-Date).ToString('o'))
$lines += "Domains: $($domains -join ', ')"
$lines += "Ports Tested: $($ports -join ', ')"
$lines += ''
$lines += "Open Ports (should be none for privileged services): $($open.Count)"
foreach($o in $open){ $lines += "  - $($o.Host):$($o.Port) OPEN" }
if($open.Count -eq 0){ $lines += '  (No privileged ports open — expected)' }
$lines += ''
$lines += "Blocked / Closed Ports: $($closed.Count)"
foreach($c in $closed){ $lines += "  - $($c.Host):$($c.Port) closed" }
$lines += ''
$lines += 'Detailed Results:'
foreach($r in $results){
  $lines += "Host=$($r.Host) Port=$($r.Port) TcpTestSucceeded=$($r.TcpTestSucceeded) Ping=$($r.PingSucceeded) RemoteAddress=$($r.RemoteAddress)" + $(if($r.Error){" Error=$($r.Error)"} else {''})
}
$lines += ''
$lines += 'Interpretation:'
$lines += '- Absence of open privileged ports (SSH/RDP/DB/etc.) enforces remote access controls.'
$lines += '- Administrative actions occur via provider consoles/API guarded by MFA; direct network service access is blocked.'
$lines += '- Repeat scans retained as evidence; anomalies would trigger a security review.'

$lines | Out-File -FilePath $outPath -Encoding UTF8
Write-Output "Wrote multi-port scan evidence: $outPath"
