@echo off
title AlphaPlus Hotel POS - Zero-Dialog Direct Print Launcher
echo ========================================================
echo  AlphaPlus Hotel POS - Direct Silent Thermal Print
echo  Zero-Dialog / Kiosk Mode Launcher
echo ========================================================
echo.

:: 1. Try 64-bit Google Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo Launching Google Chrome in Silent Kiosk Mode...
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit /b
)

:: 2. Try 32-bit Google Chrome
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo Launching Google Chrome (x86) in Silent Kiosk Mode...
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit /b
)

:: 3. Try Microsoft Edge
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    echo Launching Microsoft Edge in Silent Kiosk Mode...
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit /b
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    echo Launching Microsoft Edge in Silent Kiosk Mode...
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit /b
)

echo [WARNING] Chrome or Edge not found at standard installation path.
start https://alphapluswebapp.vercel.app/dashboard/pos
exit /b
