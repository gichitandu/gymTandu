@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installa Node.js LTS da https://nodejs.org e riapri questo file.
  pause
  exit /b 1
)
node setup-windows.mjs
set "SETUP_RESULT=%errorlevel%"
pause
exit /b %SETUP_RESULT%
