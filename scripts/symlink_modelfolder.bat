@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FEDDA Model Folder Symlink

:: ============================================================================
:: Link an external folder into one of ComfyUI\models\<subfolder> so FEDDA can
:: use a big model library that lives on another drive WITHOUT copying it.
:: Uses directory junctions (mklink /J) - no admin rights needed.
::
:: Usage:  symlink_modelfolder.bat
::            interactive - pick the model folder, then the external path
::         symlink_modelfolder.bat <subfolder> <name> <target-folder>
::            e.g. symlink_modelfolder.bat loras MyStash E:\AI\loras
::                 -> ComfyUI\models\loras\MyStash shows E:\AI\loras contents
::         symlink_modelfolder.bat remove <subfolder> <name>
::            removes the link only - never touches the target folder
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "APP_DIR=%%~fI"
set "MODELS_DIR=%APP_DIR%\ComfyUI\models"

if not exist "%MODELS_DIR%" (
    echo [ERROR] Models folder not found: %MODELS_DIR%
    echo         Run the installer first.
    pause & exit /b 1
)

:: --- remove mode:  remove <subfolder> <name> ---
if /i "%~1"=="remove" (
    if "%~2"=="" ( echo Usage: symlink_modelfolder.bat remove ^<subfolder^> ^<name^> & pause & exit /b 1 )
    if "%~3"=="" ( echo Usage: symlink_modelfolder.bat remove ^<subfolder^> ^<name^> & pause & exit /b 1 )
    set "LINK=%MODELS_DIR%\%~2\%~3"
    if not exist "!LINK!" ( echo [ERROR] No such link: !LINK! & pause & exit /b 1 )
    fsutil reparsepoint query "!LINK!" >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] "%~3" is a real folder, not a link - refusing to remove it.
        pause & exit /b 1
    )
    rmdir "!LINK!"
    if errorlevel 1 ( echo [ERROR] Could not remove link. ) else ( echo Link "%~2\%~3" removed. Target folder untouched. )
    pause & exit /b 0
)

set "SUBFOLDER=%~1"
set "NAME=%~2"
set "TARGET=%~3"

:: --- pick which model subfolder to link into ---
if not "%SUBFOLDER%"=="" goto HAVE_SUB
echo.
echo Model folders in ComfyUI\models:
for /f "delims=" %%D in ('dir /AD /B "%MODELS_DIR%" 2^>nul') do echo   %%D
echo.
set /p "SUBFOLDER=Which model folder to link into [loras]: "
if "%SUBFOLDER%"=="" set "SUBFOLDER=loras"
:HAVE_SUB

set "DEST_DIR=%MODELS_DIR%\%SUBFOLDER%"
if exist "%DEST_DIR%\" goto HAVE_DEST
echo.
echo [!] models\%SUBFOLDER% does not exist yet.
set /p "MKIT=Create it? [Y/N]: "
if /i not "%MKIT%"=="Y" ( echo Cancelled. & pause & exit /b 1 )
mkdir "%DEST_DIR%"
:HAVE_DEST

:: --- show existing links in that subfolder ---
echo.
echo Current links in models\%SUBFOLDER%:
set "FOUND="
for /f "delims=" %%D in ('dir /AL /B "%DEST_DIR%" 2^>nul') do (
    set "FOUND=1"
    echo   %%D
)
if not defined FOUND echo   (none)
echo.

:: --- external target path ---
if not "%TARGET%"=="" goto HAVE_TARGET
set /p "TARGET=Path to your external folder (e.g. E:\AI\loras): "
:HAVE_TARGET
if "%TARGET%"=="" ( echo Nothing entered. & pause & exit /b 1 )
if not exist "%TARGET%\" (
    echo [ERROR] Folder does not exist: %TARGET%
    pause & exit /b 1
)

:: --- link name (defaults to the target folder's own name) ---
if not "%NAME%"=="" goto HAVE_NAME
for %%I in ("%TARGET%") do set "DEFNAME=%%~nxI"
set /p "NAME=Subfolder name in %SUBFOLDER% [!DEFNAME!]: "
if "%NAME%"=="" set "NAME=!DEFNAME!"
:HAVE_NAME

set "LINK=%DEST_DIR%\%NAME%"
if exist "%LINK%" (
    echo [ERROR] "%NAME%" already exists in models\%SUBFOLDER%.
    echo         Pick another name, or remove it first:
    echo         symlink_modelfolder.bat remove %SUBFOLDER% %NAME%
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
echo Linked: models\%SUBFOLDER%\%NAME%  -^>  %TARGET%
echo Refresh the model list in FEDDA (or restart ComfyUI) to see them.
pause
exit /b 0
