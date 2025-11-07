$out = Join-Path (Get-Location) 'evidence\evidence_bundle_final.zip'
$files = @(
  'C:\Users\asus\Downloads\pdf_alerts_auditLogs_1761911513933.pdf',
  'C:\Users\asus\Downloads\pdf_alerts_auditLogs_1761911513933_slack.pdf',
  'C:\Users\asus\Downloads\pdf_auditLogs_evidence_1761910644656_redacted.pdf',
  'C:\Users\asus\Downloads\pdf_dependency_scan_report_1761914359533.pdf',
  'C:\Users\asus\Downloads\pdf_npm_audit_1761914365530.pdf',
  '.\evidence\npm-audit.json',
  '.\evidence\dependency-scan-report.txt',
  '.\evidence\auditLogs_evidence_1761910644656_redacted.json',
  '.\evidence\alerts_auditLogs_1761911513933_slack_redacted.json'
)
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path $files -DestinationPath $out -Force
Write-Output "Wrote bundle: $out"
Get-Item $out | Select-Object FullName,Length | Format-Table -AutoSize
