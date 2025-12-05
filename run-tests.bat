@echo off
REM run-tests.bat
REM Windows batch script to run all PayPal integration tests

echo.
echo ========================================
echo   AutoPromote Test Suite Runner
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Check if .env file exists
if not exist ".env" (
    echo WARNING: .env file not found
    echo Some tests may fail without environment variables
    echo.
)

echo Running Test Suite...
echo.

REM Test 1: Local PayPal Webhook Test
echo ======================================
echo Test 1: PayPal Webhook Configuration
echo ======================================
node test-paypal-webhook-local.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Test 1 FAILED - Check configuration
    echo.
)
echo.
timeout /t 2 >nul

REM Test 2: PayPal Integration Tests
echo ======================================
echo Test 2: PayPal Integration Tests
echo ======================================
node test-paypal-integration.js
set INTEGRATION_RESULT=%ERRORLEVEL%
echo.
timeout /t 2 >nul

REM Test 3: Production Flow Tests
echo ======================================
echo Test 3: Production Readiness Test
echo ======================================
node test-production-flow.js
set PRODUCTION_RESULT=%ERRORLEVEL%
echo.

REM Summary
echo.
echo ========================================
echo   TEST SUITE SUMMARY
echo ========================================
echo.

if %INTEGRATION_RESULT% EQU 0 (
    echo [PASS] PayPal Integration Tests
) else (
    echo [FAIL] PayPal Integration Tests
)

if %PRODUCTION_RESULT% EQU 0 (
    echo [PASS] Production Readiness Tests
) else (
    echo [FAIL] Production Readiness Tests
)

echo.

if %INTEGRATION_RESULT% EQU 0 if %PRODUCTION_RESULT% EQU 0 (
    echo ========================================
    echo   ALL TESTS PASSED!
    echo   Ready for Production Launch
    echo ========================================
) else (
    echo ========================================
    echo   SOME TESTS FAILED
    echo   Review errors above before launching
    echo ========================================
)

echo.
echo Press any key to exit...
pause >nul
