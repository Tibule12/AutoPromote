# Detect common management agents and AV on this machine
$out = [ordered]@{}
$svcNames = 'ccmexec','IntuneManagementExtension','WinDefend','McShield','McAfeeFramework','Sense','csagent'
$out.Services = Get-Service -Name $svcNames -ErrorAction SilentlyContinue | Select-Object Name,Status
try { $out.WSUSPolicy = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' -ErrorAction SilentlyContinue | Select-Object * } catch { $out.WSUSPolicy = $null }
$out.MDMEnrollment = Test-Path 'HKLM:\SOFTWARE\Microsoft\Enrollments'

$apps = @()
$regPaths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($p in $regPaths) {
    try {
        $apps += Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Select-Object DisplayName,DisplayVersion,Publisher
    } catch { }
}
$out.InstalledApps = $apps | Where-Object { $_.DisplayName -match 'Intune|Company Portal|Configuration Manager|SCCM|System Center|McAfee|CrowdStrike|Sophos|Defender|Trend Micro|Avast|AVG|Kaspersky|Bitdefender' } | Select-Object -Unique

$out | ConvertTo-Json -Depth 4 | Out-File -FilePath "$env:TEMP\management_probe_result.json" -Encoding utf8
Write-Output "Probe written to: $env:TEMP\management_probe_result.json"
Write-Output (Get-Content "$env:TEMP\management_probe_result.json" -Raw)
