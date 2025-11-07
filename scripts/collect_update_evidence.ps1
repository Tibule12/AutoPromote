<#
Collect update/antivirus evidence for Windows endpoints and export to CSV.

Run this script on a representative machine or run remotely via PowerShell Remoting
for a set of hosts. The script is non-destructive and only queries WMI/registry.

Outputs (default): ./evidence/update_inventory.csv (or timestamped file if OutDir not provided)
#>

param(
  [string[]]$Targets = @(),
  [string]$OutDir = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\..\evidence",
  [switch]$Force
)

function Ensure-Directory {
  param([string]$Path)
  $dir = Split-Path $Path -Parent
  if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
}

Ensure-Directory -Path $OutDir

$outCsv = Join-Path $OutDir "update_inventory.csv"

function Get-AV {
  # Try SecurityCenter2 (may require local/remote permissions)
  try {
    $av = Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct -ErrorAction Stop | Select-Object -First 1
    if ($av) { return @{Product = $av.displayName; Version = ($av.productState -as [string])} }
  } catch { }

  # Fallback: registry search for common AV product names
  $regPaths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach ($p in $regPaths) {
    try {
      Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.DisplayName -and ($_.DisplayName -match 'virus|avast|avg|defender|kaspersky|trend micro|mcafee|sophos|bitdefender')) {
          return @{Product = $_.DisplayName; Version = $_.DisplayVersion}
        }
      }
    } catch { }
  }
  return @{Product='Unknown'; Version='Unknown'}
}

function Get-BrowserVersions {
  $b = @{Chrome=$null; Edge=$null; Firefox=$null}
  try {
    $chromeCmd = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($chromeCmd) { $b.Chrome = (Get-Item $chromeCmd.Source).VersionInfo.ProductVersion }
  } catch { }
  try {
    $edgeCmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($edgeCmd) { $b.Edge = (Get-Item $edgeCmd.Source).VersionInfo.ProductVersion }
  } catch { }
  try {
    $ffCmd = Get-Command firefox.exe -ErrorAction SilentlyContinue
    if ($ffCmd) { $b.Firefox = (Get-Item $ffCmd.Source).VersionInfo.ProductVersion }
  } catch { }
  return $b
}

function Collect-Local {
  $os = Get-CimInstance -ClassName Win32_OperatingSystem
  $hotfix = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
  $av = Get-AV
  $browsers = Get-BrowserVersions

  [PSCustomObject]@{
    CollectedAt = (Get-Date).ToString('u')
    ComputerName = $env:COMPUTERNAME
    User = $env:USERNAME
    OS = ($os.Caption) + ' ' + ($os.Version)
    LastHotfix = if ($hotfix) { ($hotfix.InstalledOn).ToString('u') + ' - ' + $hotfix.HotFixID } else { 'NoneFound' }
    AV_Product = $av.Product
    AV_Version = $av.Version
    Chrome_Version = $browsers.Chrome
    Edge_Version = $browsers.Edge
    Firefox_Version = $browsers.Firefox
  }
}

function Collect-FromTarget {
  param($target)
  Write-Output "Collecting evidence from: $target"
  try {
    if ($target -and $target -ne $env:COMPUTERNAME) {
      # Use PowerShell Remoting to run Collect-Local on remote host
      $res = Invoke-Command -ComputerName $target -ScriptBlock ${function:Collect-Local} -ErrorAction Stop
      return $res
    } else {
      return Collect-Local
    }
  } catch {
    Write-Warning "Failed to collect from $target : $_"
    return [PSCustomObject]@{ CollectedAt=(Get-Date).ToString('u'); ComputerName=$target; Error=$_.Exception.Message }
  }
}

$results = @()
if ($Targets -and $Targets.Length -gt 0) {
  foreach ($t in $Targets) { $results += Collect-FromTarget -target $t }
} else {
  $results += Collect-FromTarget -target $env:COMPUTERNAME
}

if ((Test-Path $outCsv) -and (-not $Force)) {
  $results | Export-Csv -Path $outCsv -NoTypeInformation -Append -Encoding UTF8
} else {
  $results | Export-Csv -Path $outCsv -NoTypeInformation -Force -Encoding UTF8
}

Write-Output "Wrote CSV: $outCsv"
