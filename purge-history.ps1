# purge-history.ps1
# WARNING: Destructive. Ensure backup bundle exists before running.

$ErrorActionPreference = 'Stop'

$pathsFile = Join-Path $PSScriptRoot 'purge-paths.txt'
if (-not (Test-Path $pathsFile)) {
    Write-Error "purge-paths.txt not found in $PSScriptRoot"
    exit 1
}

$lines = Get-Content -Path $pathsFile | Where-Object { $_ -and $_ -ne '' }
if ($lines.Count -eq 0) {
    Write-Error "No paths listed in purge-paths.txt"
    exit 1
}

$quoted = $lines | ForEach-Object { '"' + $_ + '"' }
$indexFilter = 'git rm --cached --ignore-unmatch ' + ($quoted -join ' ')
Write-Output "Index filter will be: $indexFilter"

Write-Output 'Running git filter-branch -- this may take a while...'
git filter-branch --force --index-filter $indexFilter --prune-empty --tag-name-filter cat -- --all
if ($LASTEXITCODE -ne 0) {
    Write-Error "git filter-branch failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Output 'Removing refs/original (if present) and expiring reflogs...'
if (Test-Path .git\refs\original) {
    Remove-Item -Recurse -Force .git\refs\original
}

Write-Output 'Expiring reflog and running gc...'
git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Output 'Force-pushing all branches and tags to origin...'
git push origin --force --all
if ($LASTEXITCODE -ne 0) { Write-Error 'Force-push branches failed'; exit $LASTEXITCODE }

git push origin --force --tags
if ($LASTEXITCODE -ne 0) { Write-Error 'Force-push tags failed'; exit $LASTEXITCODE }

Write-Output 'Purge complete.'
