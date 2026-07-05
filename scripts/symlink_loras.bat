@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FEDDA LoRA Symlink

:: ============================================================================
:: Link an external LoRA folder into ComfyUI/models/loras as a subfolder.
:: Uses directory junctions (mklink /J) - no admin rights needed.
:: Usage:  symlink_loras.bat                          (interactive)
::         symlink_loras.bat <name> <target-folder>   (create link)
::         symlink_loras.bat remove <name>            (remove link only -
::                                                     never touches the target)
:: Example: symlink_loras.bat MyStash E:\AI\loras
::          -> ComfyUI\models\loras\MyStash shows E:\AI\loras contents
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "APP_DIR=%%~fI"
set "LORAS_DIR=%APP_DIR%\ComfyUI\models\loras"

if not exist "%LORAS_DIR%" (
    echo [ERROR] LoRA folder not found: %LORAS_DIR%
    echo         Run the installer first.
    pause & exit /b 1
)

:: --- remove mode ---
if /i "%~1"=="remove" (
    if "%~2"=="" ( echo Usage: symlink_loras.bat remove ^<name^> & pause & exit /b 1 )
    set "LINK=%LORAS_DIR%\%~2"
    if not exist "!LINK!" ( echo [ERROR] No such link: !LINK! & pause & exit /b 1 )
    fsutil reparsepoint query "!LINK!" >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] "%~2" is a real folder, not a link - refusing to remove it.
        pause & exit /b 1
    )
    rmdir "!LINK!"
    if errorlevel 1 ( echo [ERROR] Could not remove link. ) else ( echo Link "%~2" removed. Target folder untouched. )
    pause & exit /b 0
)

:: --- show existing links ---
echo.
echo Current links in models\loras:
set "FOUND="
for /f "delims=" %%D in ('dir /AL /B "%LORAS_DIR%" 2^>nul') do (
    set "FOUND=1"
    echo   %%D
)
if not defined FOUND echo   (none)
echo.

set "NAME=%~1"
set "TARGET=%~2"

if "%TARGET%"=="" (
    set /p "TARGET=Path to your external LoRA folder (e.g. E:\AI\loras): "
)
if "%TARGET%"=="" ( echo Nothing entered. & pause & exit /b 1 )
if not exist "%TARGET%\" (
    echo [ERROR] Folder does not exist: %TARGET%
    pause & exit /b 1
)

if "%NAME%"=="" (
    for %%I in ("%TARGET%") do set "DEFNAME=%%~nxI"
    set /p "NAME=Subfolder name in loras [!DEFNAME!]: "
    if "!NAME!"=="" set "NAME=!DEFNAME!"
)

set "LINK=%LORAS_DIR%\%NAME%"
if exist "%LINK%" (
    echo [ERROR] "%NAME%" already exists in models\loras.
    echo         Pick another name, or remove it first: symlink_loras.bat remove %NAME%
    pause & exit /b 1
)

mklink /J "%LINK%" "%TARGET%"
if errorlevel 1 (
    echo.
    echo [WARN] Junction failed - trying a symbolic link (may need admin or Developer Mode)...
    mklink /D "%LINK%" "%TARGET%"
    if errorlevel 1 (
        echo [ERROR] Could not create the link.
        echo         Junctions only work for local drives. For network paths,
        echo         run this script as Administrator.
        pause & exit /b 1
    )
)

echo.
echo Linked: models\loras\%NAME%  -^>  %TARGET%
echo Refresh the LoRA list in FEDDA (or restart ComfyUI) to see them.
pause
exit /b 0
