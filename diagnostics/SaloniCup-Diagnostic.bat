@echo off
title SaloniCup Diagnostic Kit
color 0B

REM ---- Self-elevate to Administrator (needed for SMART, temps, drivers) ----
net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
echo.
echo   SaloniCup Diagnostic Kit - running full check, please wait...
echo   (this can take 1-2 minutes)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SaloniCup-Diagnostic.ps1"

echo.
echo   Done. The report opened in Notepad and was saved on your Desktop.
echo.
pause
