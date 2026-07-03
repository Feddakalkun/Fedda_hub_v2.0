@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
cd ..

set "ROOT_DIR=%CD%"
set "LOG_FILE=%ROOT_DIR%\logs\update.log"

if not exist "%ROOT_DIR%\logs" mkdir "%ROOT_DIR%\logs"

if exist "%ROOT_DIR%\.last_node_update" del "%ROOT_DIR%\.last_node_update" >nul 2>&1

echo [%date% %time%] FEDDA Update Starting... (logging to %LOG_FILE%)

powershell -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\update_code.ps1"

set "UPDATE_EXIT=%errorlevel%"

if !UPDATE_EXIT! equ 0 (
    echo [%date% %time%] FEDDA Update Completed Successfully >> "%LOG_FILE%"
) else (
    echo [%date% %time%] FEDDA Update Failed with exit code !UPDATE_EXIT! >> "%LOG_FILE%"
)

exit /b %UPDATE_EXIT%
