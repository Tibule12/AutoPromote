# Requires: Python, internet, and cloud credentials for your environment.
# This script installs Scout Suite and outlines commands to scan cloud configuration.
# Fill in the provider and credentials as appropriate.

$ErrorActionPreference = 'Stop'

Write-Host 'Installing Scout Suite...'
python -m pip install --user scoutsuite
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','User') + ';' + [System.Environment]::GetEnvironmentVariable('Path','Machine')

$OutDir = Join-Path $PSScriptRoot '..' '..' 'evidence' 'cloud-scan'
$OutDir = Resolve-Path $OutDir
New-Item -Force -ItemType Directory -Path $OutDir | Out-Null

# Example: GCP (if using Firebase/Firestore under GCP project)
# Pre-req: gcloud auth application-default login (or service account creds via GOOGLE_APPLICATION_CREDENTIALS)
# scoutsuite gcp --project-id <YOUR_GCP_PROJECT_ID> --report-dir "$OutDir"

# Example: AWS
# scoutsuite aws --report-dir "$OutDir"

# Example: Azure
# scoutsuite azure --subscription-id <SUBSCRIPTION_ID> --report-dir "$OutDir"

Write-Host "Run the appropriate command above with your project/subscription and credentials configured."
Write-Host "Report(s) will be saved in: $OutDir"