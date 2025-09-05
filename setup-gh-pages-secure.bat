@echo off
echo Setting up gh-pages branch for AutoPromote-Secure repository...

:: Check if docs directory exists
if not exist docs (
  echo Creating docs directory...
  mkdir docs
)

:: Save current branch name
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set current_branch=%%a
echo Current branch is %current_branch%

:: Change remote to AutoPromote-Secure
git remote set-url origin https://github.com/Tibule12/AutoPromote-Secure.git

:: Check if gh-pages branch exists locally
git show-ref --verify --quiet refs/heads/gh-pages
if %errorlevel% == 0 (
  echo gh-pages branch already exists locally.
  git checkout gh-pages
) else (
  :: Check if gh-pages exists remotely
  git ls-remote --exit-code --heads origin gh-pages
  if %errorlevel% == 0 (
    echo gh-pages branch exists remotely. Checking out...
    git checkout -b gh-pages origin/gh-pages
  ) else (
    echo Creating new gh-pages branch...
    git checkout --orphan gh-pages
    git rm -rf .
    echo # AutoPromote-Secure Documentation > README.md
    git add README.md
    git commit -m "Initial gh-pages commit"
  )
)

:: Copy docs from current branch if needed
if "%current_branch%" NEQ "gh-pages" (
  echo Copying documentation from %current_branch% branch...
  git checkout %current_branch% -- docs/
  
  :: Move files from docs folder to root of gh-pages
  echo Moving documentation files to root...
  xcopy /E /Y docs\* .
  rmdir /S /Q docs
)

:: Add all changes
git add .
git commit -m "Update documentation on gh-pages branch"

:: Force push to remote
echo Force pushing to gh-pages branch...
git push -f origin gh-pages

:: Go back to original branch
git checkout %current_branch%

echo.
echo GitHub Pages setup complete for AutoPromote-Secure!
echo Your documentation will be available at:
echo https://tibule12.github.io/AutoPromote-Secure/
echo.
echo Remember to:
echo 1. Go to your repository on GitHub
echo 2. Click on Settings
echo 3. Navigate to Pages in the left sidebar
echo 4. Under "Source", select "Deploy from a branch"
echo 5. Under "Branch", select "gh-pages" branch and "/" (root) folder
echo 6. Click Save
echo.
pause
