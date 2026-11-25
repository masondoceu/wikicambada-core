@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 ou superior nao foi encontrado
  pause
  exit /b 1
)
node "%~dp0setup.js" %*
if errorlevel 1 (
  echo Nao foi possivel concluir o setup
  pause
  exit /b 1
)
exit /b 0
