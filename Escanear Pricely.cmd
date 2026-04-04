@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\platform-scraper-rs\scripts\run-pricely-review.ps1" %*
