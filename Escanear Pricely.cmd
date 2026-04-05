@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\platform-scraper-rs\scripts\run-pricely-review.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo El escaneo termino con error. Presiona una tecla para cerrar.
  pause >nul
)
exit /b %EXIT_CODE%
