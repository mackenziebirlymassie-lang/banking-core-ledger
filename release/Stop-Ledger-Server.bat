@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Core Banking Ledger - Process Shutdown Utility
echo ===================================================
echo.

set FOUND=0
set KILLED_PIDS=

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    set PID=%%a
    if not "!PID!"=="0" (
        echo !KILLED_PIDS! | findstr " !PID! " >nul
        if errorlevel 1 (
            set "KILLED_PIDS=!KILLED_PIDS! !PID! "
            echo Found active Ledger Engine on port 8080 with PID: !PID!
            taskkill /F /PID !PID! >nul 2>&1
            if !ERRORLEVEL! equ 0 (
                echo Successfully terminated PID !PID!.
                set FOUND=1
            )
        )
    )
)

if "!FOUND!"=="0" (
    echo No active Ledger Engine process found listening on port 8080.
) else (
    echo Core Banking Ledger server has been cleanly stopped.
)

echo.
ping 127.0.0.1 -n 2 >nul
