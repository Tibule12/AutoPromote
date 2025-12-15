# Running AutoPromote Integration Tests

## Quick Start

1. First, run the validation script to ensure your test environment is ready:

   ```powershell
   node test-validation-simple.js
   ```

2. Then run the integration tests using one of these commands:

   ```powershell
   # In PowerShell:
   .\Run-IntegrationTests.ps1

   # In Command Prompt:
   .\run-integration-tests.bat
   ```

## Troubleshooting

If you encounter the error "... is not recognized as the name of a cmdlet, function, script file, or operable program," make sure to include `.\` before the script name when running it in PowerShell.

### Common Issues:

1. **Firebase Admin SDK not installed**:

   ```
   npm install firebase-admin
   ```

2. **Missing service account key**:
   Ensure `serviceAccountKey.json` exists in the project root directory.

3. **Permission issues**:
   Make sure you have the necessary permissions to run scripts:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

## Test Components

The integration tests include:

1. Database connection verification
2. Sample data generation (if needed)
3. Admin dashboard query validation

All test results are saved to the `test-results` directory.

## Manual Testing

You can also run individual test components manually:

```powershell
# Check database connection
node checkDatabaseConnection.js

# Test admin queries
node testAdminQueries.js

# Generate sample data
node generateSampleData.js
```
