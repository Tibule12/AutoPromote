$src = 'C:\Users\asus\AutoPromote\AutoPromote\evidence\highlighted_pdfs'
$dst = 'C:\Users\asus\Downloads\AutoPromote_Facebook_Evidence'
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }
$files = @('host_inventory.pdf','policy_bundle.pdf','server_patch_log.pdf')
foreach ($f in $files) {
    $p = Join-Path $src $f
    if (Test-Path $p) {
        Copy-Item -Path $p -Destination $dst -Force
        Write-Output "Copied -> $($dst)\$f"
    } else {
        Write-Output "Missing -> $p"
    }
}
