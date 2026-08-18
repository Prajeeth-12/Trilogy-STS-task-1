@echo off
echo.
echo ============================================
echo   EchoBridge STS — Building Desktop App
echo ============================================
echo.

set SRC=%~dp0backend
set FRONTEND=%~dp0frontend

echo [1/4] Building frontend...
cd "%FRONTEND%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Copying frontend build to backend/static...
if exist "%SRC%\static" rmdir /s /q "%SRC%\static"
xcopy /E /I /Y "%FRONTEND%\dist" "%SRC%\static" >nul
echo Done.

echo.
echo [3/4] Installing PyInstaller...
pip install pyinstaller -q

echo.
echo [4/4] Packaging into EchoBridge.exe...
cd "%SRC%"
pyinstaller --onefile --noconsole --name EchoBridge ^
  --workpath "%TEMP%\eb_build\work" ^
  --distpath "%~dp0" ^
  --specpath "%TEMP%\eb_build" ^
  --add-data "%SRC%\static;static" ^
  --add-data "%SRC%\main.py;." ^
  --add-data "%SRC%\config.py;." ^
  --add-data "%SRC%\routers;routers" ^
  --add-data "%SRC%\services;services" ^
  --add-data "%SRC%\models;models" ^
  --collect-all fastapi ^
  --collect-all starlette ^
  --collect-all uvicorn ^
  --hidden-import pydantic ^
  --hidden-import httpx ^
  --hidden-import httpx._transports.default ^
  --hidden-import dotenv ^
  --hidden-import websockets ^
  --hidden-import websockets.legacy.server ^
  launcher.py

if exist "%~dp0EchoBridge.exe" (
    echo.
    echo ============================================
    echo   SUCCESS!
    echo   App: %~dp0EchoBridge.exe
    echo ============================================
) else (
    echo.
    echo ERROR: Build failed.
)

pause
