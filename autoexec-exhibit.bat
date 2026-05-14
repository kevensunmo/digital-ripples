@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Node HTTP + WebSocket server (see server.mjs); default PORT=8080
start "Digital Ripples Server" /min cmd /c "cd /d ""%~dp0"" && npm start"

rem Brief pause so the listener is up before Chrome loads the page
timeout /t 2 /nobreak >nul

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  echo Google Chrome was not found under Program Files. Install Chrome or set CHROME to chrome.exe manually.
  pause
  exit /b 1
)

set "URL=http://127.0.0.1:8080/display.html"
start "" "%CHROME%" --kiosk --start-fullscreen "%URL%"

endlocal
