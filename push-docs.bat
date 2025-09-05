@echo off
echo Pushing documentation changes to GitHub...

git add docs/
git commit -m "Add documentation for GitHub Pages"
git push origin main

echo Documentation pushed to GitHub.
echo Remember to configure GitHub Pages in your repository settings:
echo 1. Go to your repository on GitHub
echo 2. Click on Settings
echo 3. Navigate to Pages in the left sidebar
echo 4. Under "Source", select "Deploy from a branch"
echo 5. Under "Branch", select "main" and "/docs" folder
echo 6. Click Save
echo.
echo Once configured, your documentation will be available at:
echo https://yourusername.github.io/AutoPromote/
pause
