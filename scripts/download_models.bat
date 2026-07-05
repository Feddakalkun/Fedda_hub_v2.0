@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FEDDA Model Downloader

:: ============================================================================
:: FEDDA per-workflow model downloader (resumable).
:: Usage:  download_models.bat <workflow-id>   e.g. download_models.bat ltx-img2vid
::         download_models.bat                 (interactive - lists manifests)
::         download_models.bat ALL-MODELS      (everything, ~large!)
:: Manifests live in config\model_manifests\ (regenerate with
:: scripts\generate_model_manifests.py after workflow changes).
:: Downloads resume where they left off (curl -C -) and retry 5 times.
:: NOTE: user-initiated only - never call this from install or update scripts
:: (Z-Image core models must never auto-download).
:: Set HF_TOKEN env var for gated HuggingFace repos.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "APP_DIR=%%~fI"

set "MANIFEST_DIR=%APP_DIR%\config\model_manifests"
set "MODELS_DIR=%APP_DIR%\ComfyUI\models"
set "MAX_RETRIES=5"
set "RETRY_DELAY=10"

if not exist "%MANIFEST_DIR%" (
    echo [ERROR] Manifest folder not found: %MANIFEST_DIR%
    pause & exit /b 1
)
if not exist "%MODELS_DIR%" (
    echo [ERROR] ComfyUI models folder not found: %MODELS_DIR%
    echo         Run the installer first.
    pause & exit /b 1
)

set "WFID=%~1"
if "%WFID%"=="" (
    echo.
    echo Available workflow manifests:
    echo -----------------------------
    for %%F in ("%MANIFEST_DIR%\*.txt") do echo   %%~nF
    echo.
    set /p "WFID=Enter workflow id (or ALL-MODELS): "
)
if "%WFID%"=="" ( echo Nothing selected. & pause & exit /b 1 )

set "MANIFEST=%MANIFEST_DIR%\%WFID%.txt"
if not exist "%MANIFEST%" (
    echo [ERROR] No manifest for "%WFID%" at %MANIFEST%
    pause & exit /b 1
)

set "AUTH_ARGS="
if defined HF_TOKEN set "AUTH_ARGS=-H "Authorization: Bearer %HF_TOKEN%""

echo.
echo ============================================================
echo   Downloading models for: %WFID%
echo   Target: %MODELS_DIR%
echo   Downloads resume if interrupted - safe to re-run.
echo ============================================================
echo.

set /a TOTAL=0
set /a FAILED=0
set /a SKIPPED=0

for /f "usebackq delims=" %%A in ("%MANIFEST%") do (
    set "LINE=%%A"
    if not "!LINE!"=="" if not "!LINE:~0,1!"=="#" (
        set "URL=" & set "FOLDER=" & set "FILENAME="
        for /f "tokens=1,2,3" %%a in ("!LINE!") do (
            set "URL=%%a"
            set "FOLDER=%%b"
            set "FILENAME=%%c"
        )
        if "!FILENAME!"=="" for %%F in ("!URL!") do set "FILENAME=%%~nxF"

        set "TARGET_DIR=%MODELS_DIR%\!FOLDER:/=\!"
        set "TARGET_FILE=!TARGET_DIR!\!FILENAME!"
        if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!"

        set /a TOTAL+=1
        echo ------------------------------------------------------------
        echo [!TOTAL!] !FILENAME!  -^>  models\!FOLDER!
        call :Download "!URL!" "!TARGET_FILE!"
    )
)

echo.
echo ============================================================
echo   DONE - %TOTAL% files processed, %FAILED% failed.
if %FAILED% gtr 0 echo   Re-run this script to resume failed downloads.
echo ============================================================
pause
exit /b %FAILED%

:Download
set "DL_URL=%~1"
set "DL_OUT=%~2"
set /a RETRIES=0
:Retry
curl -L --connect-timeout 30 -C - %AUTH_ARGS% -o "%DL_OUT%" "%DL_URL%"
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! LSS %MAX_RETRIES% (
        echo   Retry !RETRIES!/%MAX_RETRIES% in %RETRY_DELAY%s...
        timeout /t %RETRY_DELAY% >nul
        goto Retry
    ) else (
        echo   FAILED: %DL_URL%
        set /a FAILED+=1
    )
) else (
    echo   OK
)
exit /b
