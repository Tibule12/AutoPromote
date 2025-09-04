@echo off
echo ===================================================
echo AutoPromote Integration Testing Suite
echo ===================================================
echo.

echo Step 1: Checking database connection...
node checkDatabaseConnection.js
if %ERRORLEVEL% NEQ 0 (
  echo Database connection check failed!
  exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Generating sample data if needed...
node generateSampleData.js
if %ERRORLEVEL% NEQ 0 (
  echo Sample data generation failed!
  exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Verifying admin dashboard queries...
node testAdminQueries.js
if %ERRORLEVEL% NEQ 0 (
  echo Admin dashboard query tests failed!
  exit /b %ERRORLEVEL%
)

echo.
echo All tests completed successfully!
echo Results are saved in the test-results directory.
echo.
echo You can now start the application and verify the admin dashboard:
echo npm start
echo.
echo ===================================================
