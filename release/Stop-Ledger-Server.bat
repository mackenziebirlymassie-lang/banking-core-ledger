@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Core Banking Ledger - Process Shutdown Utility
echo ===================================================
echo.

set FOUND=0

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    set PID=%%a
    if not "!PID!"=="0" (
        echo Found active Ledger Engine on port 8080 with PID: !PID!
        taskkill /F /PID !PID! >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            echo Successfully terminated PID !PID!.
            set FOUND=1
        ) else (
            echo Could not terminate PID !PID!.
        )
    )
)

if "!FOUND!"=="0" (
    echo No active Ledger Engine process found listening on port 8080.
) else (
    echo Core Banking Ledger server has been cleanly stopped.
)

echo.
timeout /t 3 >nul
