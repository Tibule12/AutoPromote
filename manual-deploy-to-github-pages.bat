@echo off
echo ===============================================
echo  Manual GitHub Pages Deployment Script
echo ===============================================
echo.
echo This script will create a clean deployment of your React app to GitHub Pages.
echo It avoids the path length issues that occur with gh-pages.
echo.

echo Step 1: Building React app...
cd frontend
call npm run build

echo.
echo Step 2: Fixing API URLs in the build files...
node ..\fix-github-pages-api-urls.js

echo.
echo Step 3: Creating clean deployment folder...
echo - Creating temporary deployment folder...
if exist ..\gh-pages-deploy rmdir /s /q ..\gh-pages-deploy
mkdir ..\gh-pages-deploy

echo - Copying build files to deployment folder...
xcopy docs\* ..\gh-pages-deploy\ /E /I /Y

echo.
echo Step 4: Setting up Git for deployment...
cd ..\gh-pages-deploy
git init
git checkout -b gh-pages
git add .
git commit -m "Deploy to GitHub Pages"

echo.
echo Step 5: Pushing to GitHub Pages...
git remote add origin https://github.com/Tibule12/AutoPromote.git
git push -f origin gh-pages

echo.
echo ===============================================
echo Deployment complete! Your app should be live at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo If you still see issues with API calls, check the browser console
echo for error messages. You may need to clear your browser cache.
echo ===============================================
cd ..
pause
