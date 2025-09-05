@echo off
echo Fixing GitHub Pages branch push issue...

:: Switch to gh-pages branch
git checkout gh-pages

:: Option 1: Force push (will overwrite remote branch)
echo.
echo About to force push to the gh-pages branch.
echo This will overwrite any existing content on the remote gh-pages branch.
echo.
choice /C YN /M "Do you want to proceed with force push"

if errorlevel 2 goto option2
if errorlevel 1 goto forcepush

:forcepush
echo.
echo Force pushing to gh-pages branch...
git push -f origin gh-pages
goto end

:option2
:: Option 2: Try to merge remote changes
echo.
echo Attempting to merge remote changes...
git pull --rebase origin gh-pages
git push origin gh-pages
goto end

:end
:: Return to original branch
git checkout secure-firebase-config

echo.
echo GitHub Pages setup complete!
echo Your documentation will be available at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo Remember to check GitHub repository settings to ensure:
echo 1. GitHub Pages is enabled
echo 2. It's configured to use the gh-pages branch
echo.
pause
