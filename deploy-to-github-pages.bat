@echo off
echo ===============================================
echo  GitHub Pages Deployment Script
echo ===============================================
echo.
echo This script will build and deploy your React app to GitHub Pages.
echo It ensures API URLs are correctly configured for GitHub Pages hosting.
echo.

echo Step 1: Building React app...
cd frontend
call npm run build

echo.
echo Step 2: Fixing API URLs in the build files...
node ..\fix-github-pages-api-urls.js

echo.
echo Step 3: Deploying to GitHub Pages...
call npm run deploy

echo.
echo ===============================================
echo Deployment complete! Your app should be live at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo If you still see issues with API calls, check the browser console
echo for error messages. You may need to clear your browser cache.
echo ===============================================
pause
