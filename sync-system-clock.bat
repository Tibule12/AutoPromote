@echo off
echo ===============================================
echo  System Clock Synchronization Tool
echo ===============================================
echo.
echo This tool will synchronize your system clock with internet time servers.
echo This is important for JWT authentication to work correctly.
echo.
echo Current system time before sync: %date% %time%
echo.
echo Synchronizing system clock...

net stop w32time
net start w32time
w32tm /resync /force

echo.
echo Current system time after sync: %date% %time%
echo.
echo Clock synchronized! Authentication should now work correctly.
echo.
echo If you still experience 401 Unauthorized errors:
echo 1. Make sure your backend server is running
echo 2. Check that your Firebase credentials are correct
echo 3. Run 'node debug-token.js YOUR_TOKEN_HERE' to analyze token issues
echo 4. Ensure you're using an ID token, not a custom token
echo 5. Token length should be much longer than 9 characters
echo.
pause
