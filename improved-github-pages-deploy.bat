@echo off
echo ===============================================
echo  Improved GitHub Pages Deployment Script
echo ===============================================
echo.
echo This script fixes submodule issues during deployment
echo and ensures a clean GitHub Pages deployment.
echo.

echo Step 1: Cleaning previous deployment artifacts...
if exist frontend\node_modules\.cache\gh-pages (
  echo - Removing gh-pages cache directory...
  rmdir /s /q frontend\node_modules\.cache\gh-pages
  if errorlevel 1 (
    echo WARNING: Could not remove gh-pages cache directory.
    echo You might need to run this script with administrator privileges.
  ) else (
    echo ✓ Removed gh-pages cache directory
  )
) else (
  echo - gh-pages cache directory not found
)

if exist .gitmodules (
  echo - Removing .gitmodules file...
  del .gitmodules
  if errorlevel 1 (
    echo WARNING: Could not remove .gitmodules file.
  ) else (
    echo ✓ Removed .gitmodules file
  )
) else (
  echo - No .gitmodules file found
)

echo.
echo Step 2: Building React app...
cd frontend
echo Running: npm run build
call npm run build

if %ERRORLEVEL% NEQ 0 (
  echo Error: Build failed! Check for errors above.
  cd ..
  pause
  exit /b 1
)

echo.
echo Step 3: Checking for fix-github-pages-api-urls.js script...
cd ..
if exist fix-github-pages-api-urls.js (
  echo Running: node fix-github-pages-api-urls.js
  node fix-github-pages-api-urls.js
  if errorlevel 1 (
    echo WARNING: API URL fix script failed, but continuing deployment.
  )
) else (
  echo WARNING: fix-github-pages-api-urls.js not found.
  echo This script would fix API URLs in the build files.
  echo The deployment will continue, but API calls might not work correctly.
)

echo.
echo Step 4: Creating clean deployment folder...
echo - Creating temporary deployment folder...
if exist gh-pages-deploy rmdir /s /q gh-pages-deploy
mkdir gh-pages-deploy

echo - Copying build files to deployment folder...
if exist frontend\docs (
  echo - Copying from frontend\docs directory...
  xcopy frontend\docs\* gh-pages-deploy\ /E /I /Y
  if errorlevel 1 (
    echo Error: Failed to copy files from frontend\docs!
    goto :error
  )
) else if exist frontend\build (
  echo - Copying from frontend\build directory...
  xcopy frontend\build\* gh-pages-deploy\ /E /I /Y
  if errorlevel 1 (
    echo Error: Failed to copy files from frontend\build!
    goto :error
  )
) else (
  echo Error: Neither docs nor build directory found!
  goto :error
)

echo.
echo Step 5: Setting up Git for deployment...
cd gh-pages-deploy

echo - Initializing Git repository...
git init
if errorlevel 1 (
  echo Error: Failed to initialize Git repository!
  cd ..
  goto :error
)

echo - Creating gh-pages branch...
git checkout -b gh-pages
if errorlevel 1 (
  echo Error: Failed to create gh-pages branch!
  cd ..
  goto :error
)

echo - Adding files to Git...
git add .
if errorlevel 1 (
  echo Warning: Issues adding files to Git, but continuing...
)

echo - Creating commit...
git config user.email "deployment@example.com"
git config user.name "GitHub Pages Deployment"
git commit -m "Deploy to GitHub Pages"
if errorlevel 1 (
  echo Error: Failed to create commit!
  cd ..
  goto :error
)

echo.
echo Step 6: Pushing to GitHub Pages...
echo - Adding remote origin...
git remote add origin https://github.com/Tibule12/AutoPromote.git
echo - Force pushing to gh-pages branch...
git push -f origin gh-pages

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Note: If you see authentication errors, you may need to:
  echo 1. Use a Personal Access Token (PAT)
  echo 2. Configure Git credentials
  echo.
  echo Try these commands to store credentials:
  echo   git config --global credential.helper store
  echo   git config --global user.name "Your GitHub Username"
  echo   git config --global user.email "your.email@example.com"
  echo.
  echo Then try pushing manually:
  echo   cd gh-pages-deploy
  echo   git push -f origin gh-pages
  echo.
  cd ..
  goto :partialerror
)

echo.
echo ===============================================
echo Deployment complete! Your app should be live at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo If you still see issues with API calls, check the browser console
echo for error messages. You may need to clear your browser cache.
echo ===============================================
cd ..
goto :end

:error
echo.
echo ===============================================
echo ERROR: Deployment failed! Please check the error messages above.
echo ===============================================
cd ..
exit /b 1

:partialerror
echo.
echo ===============================================
echo WARNING: Deployment completed with warnings or errors.
echo Please check the messages above for more information.
echo ===============================================

:end
pause
