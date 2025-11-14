$out='evidence\evidence_bundle_with_snyk.zip'
if(Test-Path $out){ Remove-Item $out -Force }
$files=@(
  'C:\Users\asus\Downloads\pdf_alerts_auditLogs_1761911513933.pdf',
  'C:\Users\asus\Downloads\pdf_alerts_auditLogs_1761911513933_slack.pdf',
  'C:\Users\asus\Downloads\pdf_auditLogs_evidence_1761910644656_redacted.pdf',
  'C:\Users\asus\Downloads\pdf_dependency_scan_report_1761915276124.pdf',
  'C:\Users\asus\Downloads\pdf_npm_audit_1761915281467.pdf',
  'C:\Users\asus\Downloads\pdf_snyk_test_1761915290231.pdf',
  'C:\Users\asus\Downloads\pdf_snyk_monitor_1761915299216.pdf',
  '.\evidence\npm-audit.json',
  '.\evidence\dependency-scan-report.txt',
  '.\evidence\snyk_test_.json',
  '.\evidence\snyk_monitor_.json',
  '.\evidence\auditLogs_evidence_1761910644656_redacted.json',
  '.\evidence\alerts_auditLogs_1761911513933_slack_redacted.json'
)
Compress-Archive -Path $files -DestinationPath $out -Force
$info = Get-Item $out
Write-Output "Wrote bundle: $($info.FullName) ($($info.Length) bytes)"
