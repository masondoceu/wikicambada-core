@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or later is required
  pause
  exit /b 1
)
node "%~dp0setup.js" %*
if errorlevel 1 (
  echo Setup could not be completed
  pause
  exit /b 1
)
exit /b 0
