# Copy highlighted PDFs to Downloads with exact upload filenames for Facebook
$dl = Join-Path $env:USERPROFILE 'Downloads\AutoPromote_Facebook_Evidence'
New-Item -ItemType Directory -Path $dl -Force | Out-Null

$src = 'C:\Users\asus\AutoPromote\AutoPromote\evidence\highlighted_pdfs'

$map = @{
    '1_audit-review-policy.pdf' = 'audit-logs-collection-review-policy.pdf'
    '2_audit-review-weekly.pdf' = 'security-event-investigation-policy.pdf'
    '3_automated-monitoring-evidence.pdf' = 'automated-alert.pdf'
    '4_admin-logs-collection.pdf' = 'sample-admin-audit-log.pdf'
    '5_admin-logs-attributes.pdf' = 'sample-admin-audit-log.pdf'
    '6_dependency-scan.pdf' = 'dependency-scan-report.pdf'
    '7_code-backend-updates.pdf' = 'code-backend-updates-policy.pdf'
    '8_review-process-screenshots.pdf' = 'facebook-evidence-cover.pdf'
}

foreach ($dest in $map.Keys) {
    $srcFile = Join-Path $src $map[$dest]
    $destFile = Join-Path $dl $dest
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination $destFile -Force
        Write-Output "Copied -> $destFile"
    } else {
        Write-Warning "Missing source PDF: $srcFile"
    }
}

Get-ChildItem $dl | Select Name,Length | Format-Table -AutoSize
