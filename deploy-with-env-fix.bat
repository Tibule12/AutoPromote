@echo off
echo ===============================================
echo  Enhanced GitHub Pages Deployment Script
echo ===============================================
echo.
echo This script fixes API URL issues and deploys your React app to GitHub Pages.
echo.

echo Step 1: Cleaning previous deployment artifacts...
if exist frontend\node_modules\.cache\gh-pages (
  echo - Removing gh-pages cache directory...
  rmdir /s /q frontend\node_modules\.cache\gh-pages
  if errorlevel 1 (
    echo WARNING: Could not remove gh-pages cache directory.
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
echo Step 2: Creating production environment file...
echo Creating .env.production file with proper settings...
echo # Production environment settings for GitHub Pages deployment > frontend\.env.production
echo REACT_APP_API_URL=https://autopromote.onrender.com >> frontend\.env.production
echo REACT_APP_FIREBASE_API_KEY=AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY >> frontend\.env.production
echo REACT_APP_FIREBASE_AUTH_DOMAIN=autopromote-464de.firebaseapp.com >> frontend\.env.production
echo REACT_APP_FIREBASE_PROJECT_ID=autopromote-464de >> frontend\.env.production
echo ✓ Created .env.production file

echo.
echo Step 3: Building React app...
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
echo Step 4: Running enhanced API URL fix script...
cd ..
if exist enhanced-fix-github-pages.js (
  echo Running: node enhanced-fix-github-pages.js
  node enhanced-fix-github-pages.js
  if errorlevel 1 (
    echo WARNING: API URL fix script failed, but continuing deployment.
  )
) else (
  echo WARNING: enhanced-fix-github-pages.js not found.
  echo Using standard fix script instead...
  node fix-github-pages-api-urls.js
)

echo.
echo Step 5: Deploying to GitHub Pages...
cd frontend
echo Running: npm run deploy
call npm run deploy

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Error: Deployment failed! Check the error messages above.
  cd ..
  pause
  exit /b 1
)

cd ..
echo.
echo ===============================================
echo Deployment complete! Your app should be live at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo Don't forget to:
echo 1. Set GitHub Pages to use the gh-pages branch and root folder
echo 2. Check your browser console for any remaining errors
echo 3. Clear your browser cache if needed
echo ===============================================
pause
