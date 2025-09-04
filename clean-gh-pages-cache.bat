@echo off
echo ===============================================
echo  GitHub Pages Cache Cleanup Script
echo ===============================================
echo.
echo This script will clean up problematic gh-pages cache directories
echo that can cause submodule errors during deployment.
echo.

echo Checking for frontend directory...
if not exist frontend (
  echo ERROR: frontend directory not found!
  echo Make sure you're running this script from the root project directory.
  goto :error
)

echo Checking for node_modules...
if exist frontend\node_modules (
  echo Found node_modules directory.
  
  echo Checking for gh-pages cache...
  if exist frontend\node_modules\.cache\gh-pages (
    echo Removing gh-pages cache directory...
    rmdir /s /q frontend\node_modules\.cache\gh-pages
    if errorlevel 1 (
      echo WARNING: Failed to remove gh-pages cache directory.
      echo Try running as administrator or manually delete:
      echo frontend\node_modules\.cache\gh-pages
    ) else (
      echo ✓ Removed gh-pages cache directory
    )
  ) else (
    echo - gh-pages cache directory not found
  )
) else (
  echo - node_modules not found in frontend directory
)

echo.
echo Checking for .gitmodules file...
if exist .gitmodules (
  echo Found .gitmodules file, displaying content:
  type .gitmodules
  echo.
  echo Removing .gitmodules file...
  del .gitmodules
  if errorlevel 1 (
    echo WARNING: Failed to remove .gitmodules file.
    echo Try running as administrator or manually delete the file.
  ) else (
    echo ✓ Removed .gitmodules file
  )
) else (
  echo - No .gitmodules file found
)

echo.
echo Cleaning npm cache...
cd frontend
echo Running: npm cache clean --force
call npm cache clean --force
if errorlevel 1 (
  echo WARNING: npm cache clean command failed.
  echo This is not critical, continuing with cleanup.
) else (
  echo ✓ npm cache cleaned
)
cd ..

echo.
echo Checking for package-lock.json for gh-pages dependency...
findstr /C:"gh-pages" frontend\package-lock.json >nul 2>&1
if not errorlevel 1 (
  echo Found gh-pages in package-lock.json.
  echo You might need to reinstall gh-pages package after cleanup:
  echo cd frontend ^&^& npm uninstall gh-pages ^&^& npm install gh-pages --save-dev
)

echo.
echo ===============================================
echo Cleanup complete! Now try running the improved deployment script:
echo   .\improved-github-pages-deploy.bat
echo.
echo If you still have issues, try:
echo   1. Remove the entire node_modules folder and reinstall:
echo      cd frontend ^&^& rmdir /s /q node_modules ^&^& npm install
echo   2. Remove any .git directories in your project (except the main one)
echo ===============================================

goto :end

:error
echo.
echo An error occurred during cleanup. Please check the messages above.
exit /b 1

:end
pause
