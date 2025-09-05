# Troubleshooting Guide

## Common Issues and Solutions

### Firebase Admin Initialization Issues
If you encounter errors related to Firebase Admin initialization:

1. Check that all Firebase Admin environment variables are correctly set
2. Verify that your private key is correctly formatted (replace newlines with `\n`)
3. Ensure your service account has the necessary permissions
4. Check the `firebaseAdmin.js` file for proper initialization

### Missing Module Errors
If you see errors like `Cannot find module './validationMiddleware'`:

1. Verify that all required files are included in your repository
2. Check that the file paths in your import statements are correct
3. Make sure all dependencies are installed with `npm install`
4. Clear your deployment cache if using a CI/CD service

### API Testing Issues
When testing your API endpoints:

#### PowerShell Curl Syntax
In PowerShell, curl is an alias for Invoke-WebRequest. Use one of these approaches:

```powershell
# Using Invoke-WebRequest
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method GET

# Using curl with backticks for quotes
curl -X POST -H "Content-Type: application/json" -d `{`"key`":`"value`"`}` http://localhost:3000/api/endpoint

# Alternative: use curl.exe directly
curl.exe -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://localhost:3000/api/endpoint
```

#### JavaScript Testing Alternatives
Use the provided test scripts:

```bash
node test-api.js
node test-deploy.js
```

### Deployment Issues
If your deployment fails:

1. Check deployment logs for specific error messages
2. Verify that all required files are pushed to your repository
3. Ensure all environment variables are correctly set in your deployment platform
4. Check for port configuration issues (use `process.env.PORT` in your server configuration)
5. Confirm your start script in package.json is correct

### Authentication Problems
For authentication issues:

1. Verify that Firebase configuration is correct
2. Check that auth tokens are being properly generated and sent with requests
3. Look for CORS issues if making requests from a frontend application
4. Confirm that Firebase security rules are correctly set

## Getting Additional Help
If you're still experiencing issues:

1. Check the existing issue documentation in the repository
2. Look through the various diagnostic scripts in the root directory
3. Review the Firebase Admin SDK documentation
4. Create a detailed issue on the project GitHub repository
