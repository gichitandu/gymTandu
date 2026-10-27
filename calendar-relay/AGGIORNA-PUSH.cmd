@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Installa Node.js LTS da https://nodejs.org e riprova.
 pause
 exit /b 1
)
node update-push-windows.mjs
set "PUSH_UPDATE_RESULT=%errorlevel%"
pause
exit /b %PUSH_UPDATE_RESULT%
