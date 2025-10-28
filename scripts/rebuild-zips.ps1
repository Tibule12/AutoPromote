# Rebuild per-question ZIPs so each contains only the single PDF intended for upload
param()

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$evidencePdfDir = Join-Path $repoRoot '..\evidence\highlighted_pdfs' | Resolve-Path -ErrorAction Stop
$zipOutDir = Join-Path $repoRoot '..\evidence\zips'
New-Item -ItemType Directory -Path $zipOutDir -Force | Out-Null

$mapping = @{
    '1_audit-review-policy.zip' = 'audit-logs-collection-review-policy.pdf'
    '2_audit-review-weekly.zip' = 'security-event-investigation-policy.pdf'
    '3_automated-monitoring-evidence.zip' = 'automated-alert.pdf'
    '4_admin-logs-collection.zip' = 'sample-admin-audit-log.pdf'
    '5_admin-logs-attributes.zip' = 'sample-admin-audit-log.pdf'
    '6_dependency-scan.zip' = 'dependency-scan-report.pdf'
    '7_code-backend-updates.zip' = 'code-backend-updates-policy.pdf'
    '8_review-process-screenshots.zip' = 'facebook-evidence-cover.pdf'
}

foreach ($zipName in $mapping.Keys) {
    $pdfName = $mapping[$zipName]
    $pdfPath = Join-Path $evidencePdfDir $pdfName
    $outZip = Join-Path $zipOutDir $zipName
    if (Test-Path $pdfPath) {
        if (Test-Path $outZip) { Remove-Item $outZip -Force }
        Compress-Archive -Path $pdfPath -DestinationPath $outZip -Force
        Write-Output "Created $outZip"
    } else {
        Write-Warning "Missing PDF: $pdfPath - cannot create $zipName"
    }
}

# Copy to Downloads folder
$dl = Join-Path $env:USERPROFILE 'Downloads\AutoPromote_Facebook_Evidence'
New-Item -ItemType Directory -Path $dl -Force | Out-Null
Copy-Item -Path (Join-Path $zipOutDir '*') -Destination $dl -Force

Write-Output "Copied updated zips to $dl"
