# Start-Tests.ps1
# This script sets the execution policy for the current process and runs the integration tests

# Set execution policy for the current process only (doesn't require admin rights)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Run the integration tests
& "$PSScriptRoot\Run-IntegrationTests.ps1"

# Return the exit code from the test script
exit $LASTEXITCODE
