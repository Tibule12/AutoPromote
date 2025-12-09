param(
  [Parameter(Mandatory=$true)] [string] $RepoOwner,
  [Parameter(Mandatory=$true)] [string] $Repo,
  [Parameter(Mandatory=$true)] [string] $SecretName,
  [Parameter(Mandatory=$true)] [string] $FilePath
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "The 'gh' CLI is required. Install from https://cli.github.com/"
  exit 1
}

if (-not (Test-Path $FilePath)) {
  Write-Error "File not found: $FilePath"
  exit 1
}

$content = Get-Content -Raw -Path $FilePath

Write-Host "Updating secret '$SecretName' for repo $RepoOwner/$Repo..."

# Use gh to set the secret value (this writes it as a repository secret). gh handles base64/encoding.
gh secret set $SecretName --body "$content" --repo "$RepoOwner/$Repo"

if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to update secret via gh CLI."
  exit $LASTEXITCODE
}

Write-Host "Secret updated. Trigger CI to validate deployments use the new key." -ForegroundColor Green
