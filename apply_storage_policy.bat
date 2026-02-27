@echo off
echo Applying Lifecycle Policy to Firebase Storage...
echo This prevents billing issues by auto-deleting temp files after 24h.

rem Try the standard appspot bucket name first
echo Attempting to apply to gs://autopromote-cc6d3.appspot.com...
call gsutil lifecycle set lifecycle.json gs://autopromote-cc6d3.appspot.com
if %ERRORLEVEL% EQU 0 goto success

rem Try the user provided name just in case (though unlikely for GCS)
echo Attempting to apply to gs://autopromote-cc6d3.firebasestorage.app...
call gsutil lifecycle set lifecycle.json gs://autopromote-cc6d3.firebasestorage.app
if %ERRORLEVEL% EQU 0 goto success

echo.
echo [ERROR] Could not apply lifecycle policy.
echo Please ensure you have the Google Cloud SDK installed and authenticated.
echo You can also set this manually in the Firebase Console:
echo 1. Go to Storage > Bucket > Configuration
echo 2. Add a Lifecycle Rule for "Delete" after 1 day for prefix "temp_uploads"
pause
exit /b 1

:success
echo.
echo [SUCCESS] Lifecycle policy applied! Your storage is now safe from overflow.
pause
