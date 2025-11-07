$ts=(Get-Date).ToString('yyyyMMddHHmmss')
$snykTest = Get-Content .\evidence\snyk_test_.json -Raw | ConvertFrom-Json
$summary = @()
$summary += 'Snyk scan summary'
$summary += 'Generated: ' + (Get-Date).ToString('u')
$summary += 'Project: ' + $snykTest.projectName
$summary += 'Dependency count: ' + $snykTest.dependencyCount
$summary += 'Summary: ' + $snykTest.summary
$summary | Out-File .\evidence\dependency-scan-snyk-report_$ts.txt -Encoding utf8
Write-Output 'Wrote summary'

$files = @(
  '.\evidence\snyk_test_.json',
  '.\evidence\snyk_monitor_.json',
  '.\evidence\dependency-scan-report.txt',
  '.\evidence\npm-audit.json',
  ('.\evidence\dependency-scan-snyk-report_' + $ts + '.txt'),
  '.\evidence\auditLogs_evidence_1761910644656_redacted.json',
  '.\evidence\alerts_auditLogs_1761911513933_slack_redacted.json'
)
$out='evidence\evidence_bundle_with_snyk.zip'
if(Test-Path $out){ Remove-Item $out -Force }
Compress-Archive -Path $files -DestinationPath $out -Force
Write-Output 'Wrote bundle: ' + (Get-Item $out).FullName
Get-Item $out | Select-Object FullName,Length | Format-Table -AutoSize
