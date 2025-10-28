$src = 'C:\Users\asus\AutoPromote\AutoPromote\evidence\highlighted_pdfs'
$dst = 'C:\Users\asus\Downloads\AutoPromote_Facebook_Evidence'
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

$mapping = @(
    @{ src='host_inventory.pdf'; num='screenshot_1.pdf' },
    @{ src='policy_bundle.pdf'; num='screenshot_2.pdf' },
    @{ src='server_patch_log.pdf'; num='screenshot_3.pdf' }
)

foreach ($m in $mapping) {
    $inP = Join-Path $src $m.src
    $outP = Join-Path $src $m.num
    if (Test-Path $inP) {
        Copy-Item -Path $inP -Destination $outP -Force
        Copy-Item -Path $outP -Destination (Join-Path $dst $m.num) -Force
        Write-Output "Created & copied -> $($m.num)"
    } else {
        Write-Output "Missing source -> $inP"
    }
}
