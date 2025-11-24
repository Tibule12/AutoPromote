<#
Print PowerShell commands to set the required GitHub repository secrets using `gh` CLI.
Usage: After generating keys, replace placeholders or set env vars and run the commands printed below.
#>
$ownerRepo = 'Tibule12/AutoPromote'
Write-Host "# Replace 'PLACEHOLDER_*' with your generated secret and run the command below or pipe in via stdin"
Write-Host "echo -n 'PLACEHOLDER_GENERIC_KEY' | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
Write-Host "";
Write-Host "echo -n 'PLACEHOLDER_FUNCTIONS_KEY' | gh secret set FUNCTIONS_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
Write-Host "";
Write-Host "echo -n 'PLACEHOLDER_TWITTER_KEY' | gh secret set TWITTER_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
Write-Host "";
Write-Host "# Or use environment variables in PowerShell to export and pipe the value in (safer than pasting):"
Write-Host "# echo -n $env:GENERIC_TOKEN_ENCRYPTION_KEY | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
Write-Host "# echo -n $env:FUNCTIONS_TOKEN_ENCRYPTION_KEY | gh secret set FUNCTIONS_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
Write-Host "# echo -n $env:TWITTER_TOKEN_ENCRYPTION_KEY | gh secret set TWITTER_TOKEN_ENCRYPTION_KEY --repo $ownerRepo"
