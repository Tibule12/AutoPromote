@echo off
echo ===============================================
echo  GitHub Pages Build Fix (No Push)
echo ===============================================
echo.
echo This script fixes submodule issues during GitHub Pages build
echo without pushing to GitHub.
echo.

echo Step 1: Cleaning up problematic cache directories...
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
  echo - gh-pages cache directory not found (good)
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
  echo - No .gitmodules file found (good)
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
echo Step 3: Running API URL fix script...
cd ..
if exist fix-github-pages-api-urls.js (
  echo Running: node fix-github-pages-api-urls.js
  node fix-github-pages-api-urls.js
  if errorlevel 1 (
    echo WARNING: API URL fix script failed.
  ) else {
    echo ✓ Fixed API URLs in build files
  }
) else (
  echo WARNING: fix-github-pages-api-urls.js not found.
  echo The build succeeded, but API calls might not work correctly.
)

echo.
echo ===============================================
echo Build complete! Your app should now be built correctly.
echo.
echo If you want to deploy to GitHub Pages later, you can:
echo 1. Use the npm run deploy command in the frontend directory
echo 2. Or run the improved-github-pages-deploy.bat script
echo ===============================================
pause
