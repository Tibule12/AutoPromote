@echo off
echo Restarting Python Media Worker...
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM "python.exe" /T 2>nul
echo Old processes killed.
timeout /t 2 >nul
echo Starting Media Worker...
start "Media Worker" cmd /k "python python_media_worker/main_media_server.py"
echo Done.Media Worker should be running on port 8000.
pause