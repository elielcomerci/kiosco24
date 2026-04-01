@echo off
setlocal
title Kiosco24 - Scraper Carrefour

cd /d "%~dp0"

echo ====================================================
echo   Preparando Scraper de Carrefour (Kiosco24)
echo ====================================================
echo.

echo [1/2] Verificando y compilando ultimos cambios en Rust...
cargo build --release
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Fallo la compilacion. Asegurate de tener Rust instalado.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Iniciando flujo de scaneo y panel en vivo...
echo (Podes pasar parametros extra al ps1, ej: Escanear Carrefour.cmd -Limit 50)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-carrefour-review.ps1" %*

echo.
echo Presiona cualquier tecla para cerrar la ventana...
pause >nul

endlocal
