@echo off
echo ================================================
echo   AutoPromote - Complete Production Deployment
echo ================================================
echo.

echo [1/7] Cleaning previous gh-pages cache...
if exist "frontend\node_modules\.cache\gh-pages" (
    rmdir /s /q "frontend\node_modules\.cache\gh-pages"
    echo      Cache directory removed successfully.
) else (
    echo      No cache directory found, continuing.
)

if exist ".gitmodules" (
    del .gitmodules
    echo      .gitmodules file removed successfully.
) else (
    echo      No .gitmodules file found, continuing.
)

echo.
echo [2/7] Creating production environment file...
echo REACT_APP_API_URL=https://autopromote-api.herokuapp.com> frontend\.env.production
echo REACT_APP_FIREBASE_API_KEY=AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY>> frontend\.env.production
echo REACT_APP_FIREBASE_AUTH_DOMAIN=autopromote-464de.firebaseapp.com>> frontend\.env.production
echo REACT_APP_FIREBASE_PROJECT_ID=autopromote-464de>> frontend\.env.production
echo REACT_APP_FIREBASE_STORAGE_BUCKET=autopromote-464de.appspot.com>> frontend\.env.production
echo REACT_APP_FIREBASE_MESSAGING_SENDER_ID=317746682241>> frontend\.env.production
echo REACT_APP_FIREBASE_APP_ID=1:317746682241:web:f363e099d55ffd1af1b080>> frontend\.env.production
echo REACT_APP_FIREBASE_MEASUREMENT_ID=G-8QDQXF0FPQ>> frontend\.env.production
echo      Production environment file created successfully.

echo.
echo [3/7] Installing dependencies...
cd frontend
call npm install
echo      Dependencies installed successfully.

echo.
echo [4/7] Building production version...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo      Build failed! Aborting deployment.
    exit /b %ERRORLEVEL%
)
echo      Build completed successfully.

echo.
echo [5/7] Preparing for GitHub Pages deployment...
cd build
echo      Creating .nojekyll file to bypass Jekyll processing...
echo > .nojekyll

echo.
echo [6/7] Initializing git repository for deployment...
git init
git add .
git commit -m "Deploy to GitHub Pages"

echo.
echo [7/7] Pushing to gh-pages branch...
git remote add origin https://github.com/Tibule12/AutoPromote.git
git push -f origin master:gh-pages

echo.
echo ================================================
echo   Deployment complete!
echo ================================================
echo.
echo Your site should now be available at:
echo https://tibule12.github.io/AutoPromote/
echo.
echo Remember to set GitHub Pages source to the gh-pages branch
echo in your repository settings if you haven't already.
echo.
echo Admin login credentials:
echo Email: admin123@gmail.com
echo Password: AutoPromote123
echo.
pause
