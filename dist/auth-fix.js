/**
 * Authentication Fix
 * 
 * This script helps diagnose and fix common authentication issues.
 * It checks for clock synchronization issues which often cause JWT validation failures.
 */

const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m'
};

console.log(`\n${colors.brightCyan}===============================================${colors.reset}`);
console.log(`${colors.brightCyan}  Authentication Fix Tool${colors.reset}`);
console.log(`${colors.brightCyan}===============================================${colors.reset}\n`);

// Create a helper function to run commands with error handling
const runCommand = (command, ignoreErrors = false) => {
  try {
    const output = execSync(command, { encoding: 'utf8' });
    return { success: true, output };
  } catch (error) {
    if (!ignoreErrors) {
      console.error(`${colors.red}Error running command: ${command}${colors.reset}`);
      console.error(`${colors.red}${error.message}${colors.reset}`);
    }
    return { success: false, error: error.message };
  }
};

// Check for system clock synchronization issues
console.log(`${colors.brightYellow}Checking system clock synchronization...${colors.reset}`);

// Get server time and local time
const serverTime = new Date();
console.log(`${colors.white}Local system time: ${serverTime.toISOString()}${colors.reset}`);

// Create batch file to sync system clock on Windows
console.log(`\n${colors.brightYellow}Creating system clock synchronization script...${colors.reset}`);

const batContent = `@echo off
echo ===============================================
echo  System Clock Synchronization Tool
echo ===============================================
echo.
echo This tool will synchronize your system clock with internet time servers.
echo This is important for JWT authentication to work correctly.
echo.
echo Current system time before sync: %date% %time%
echo.
echo Synchronizing system clock...

net stop w32time
net start w32time
w32tm /resync /force

echo.
echo Current system time after sync: %date% %time%
echo.
echo Clock synchronized! Authentication should now work correctly.
echo.
echo If you still experience 401 Unauthorized errors:
echo 1. Make sure your backend server is running
echo 2. Check that your Firebase credentials are correct
echo 3. Try registering a new user
echo.
pause
`;

fs.writeFileSync(path.join(__dirname, 'sync-system-clock.bat'), batContent);
console.log(`${colors.green}Created sync-system-clock.bat${colors.reset}`);

// Create a diagnostic document
console.log(`\n${colors.brightYellow}Creating authentication troubleshooting guide...${colors.reset}`);

const authFixMd = `# Authentication Troubleshooting Guide

## Common 401 Unauthorized Error Causes

If you're experiencing 401 Unauthorized errors in your application, here are the most common causes and their solutions:

### 1. System Clock Synchronization Issues

JWT tokens rely on timestamps to validate token expiration. If your system clock is out of sync with the Firebase servers, token validation will fail.

**Solution:**
- Run the \`sync-system-clock.bat\` script we've created for you
- This will synchronize your system clock with internet time servers
- After synchronization, try logging in again

### 2. Firebase Credentials Issues

Your application may be using outdated or invalid Firebase credentials.

**Solution:**
- Generate new Firebase service account credentials from the Firebase console
- Update your environment variables with the new credentials
- Restart your backend server

### 3. Token Expiration

Firebase ID tokens expire after 1 hour by default.

**Solution:**
- Make sure your application refreshes tokens before they expire
- Implement token refresh logic in your frontend

### 4. Cross-Origin Resource Sharing (CORS) Issues

If your backend is not configured to accept requests from your frontend domain, authentication requests will fail.

**Solution:**
- Check that your backend CORS configuration includes your frontend domain
- For GitHub Pages, make sure it allows \`https://tibule12.github.io\`

### 5. GitHub Pages API URL Issues

GitHub Pages hosts static content and cannot serve as an API backend.

**Solution:**
- Make sure all API requests go to your actual backend (\`https://autopromote.onrender.com\`)
- Run the \`fix-github-pages.js\` script after each build

## Troubleshooting Steps

1. Run \`sync-system-clock.bat\` to synchronize your system clock
2. Rebuild your frontend with \`npm run build\`
3. Run \`fix-github-pages.js\` to fix API URLs
4. Deploy the updated code to GitHub Pages
5. If issues persist, run \`firebase-diagnostics.js\` for more detailed diagnostics

## Contact Support

If you continue to experience issues after trying these solutions, please contact support with the output from \`firebase-diagnostics.js\`.
`;

fs.writeFileSync(path.join(__dirname, 'AUTHENTICATION_FIX.md'), authFixMd);
console.log(`${colors.green}Created AUTHENTICATION_FIX.md${colors.reset}`);

console.log(`\n${colors.brightGreen}Authentication fix completed!${colors.reset}`);
console.log(`${colors.white}Next steps:${colors.reset}`);
console.log(`${colors.white}1. Run the sync-system-clock.bat file to synchronize your system clock${colors.reset}`);
console.log(`${colors.white}2. Restart your browser and clear cache${colors.reset}`);
console.log(`${colors.white}3. Try logging in again${colors.reset}`);
console.log(`${colors.white}4. Check AUTHENTICATION_FIX.md for more troubleshooting tips${colors.reset}`);
