@echo off
title EchoBridge STS - AI Meeting Interpreter
color 0B
echo.
echo  ============================================
echo       EchoBridge STS - AI Meeting Interpreter
echo  ============================================
echo.

:: Check Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Python is not installed or not in PATH.
    echo  Please install Python 3.10+ from python.org
    pause
    exit /b 1
)

:: Install dependencies if needed
cd /d "%~dp0backend"
if not exist "__pycache__" (
    echo  Installing dependencies (first run only)...
    pip install -r requirements.txt -q
    echo  Done!
    echo.
)

:: Start backend server
echo  Starting EchoBridge server...
start /B python -m uvicorn main:app --host 127.0.0.1 --port 8000 2>nul

:: Wait for server to be ready
echo  Waiting for server to start...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:8000/health >nul 2>&1
if %ERRORLEVEL% neq 0 goto wait_loop

echo.
echo  [OK] Server is ready!
echo.

:: Open browser
echo  Opening Chrome...
start "" "chrome" "http://localhost:8000"

echo.
echo  ============================================
echo   EchoBridge STS is running at:
echo   http://localhost:8000
echo.
echo   Close this window to stop the server.
echo  ============================================
echo.

:: Keep alive - when user closes window, Python process dies too
cmd /k "echo Press Ctrl+C to stop && pause >nul"
