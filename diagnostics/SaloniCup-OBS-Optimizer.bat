@echo off
title SaloniCup OBS Optimizer
color 0A

REM ---- Self-elevate to Administrator ----
net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
echo.
echo   SaloniCup OBS Optimizer
echo   Applies SAFE, reversible tweaks (power, Game DVR, GPU pref) and
echo   creates ready OBS profiles for Intel QuickSync. A backup + restore
echo   script are created. Nothing is deleted.
echo.
echo   Close OBS first so the OBS profiles can be written.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SaloniCup-OBS-Optimizer.ps1"

echo.
echo   Done. See the report and the Backup folder on your Desktop.
echo.
pause
