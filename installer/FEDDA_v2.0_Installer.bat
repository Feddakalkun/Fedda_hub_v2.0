@echo off
setlocal EnableDelayedExpansion
title FEDDA v2.0 One-Click Installer
set "APP_NAME=FEDDA Hub v2.0"

:: ===========================================================================
::  Front-of-house: welcome, requirements + offer-to-install, disclaimer, info.
::  (Prototyped in ghost-installer.bat, ported here 2026-07-24.)
:: ===========================================================================

:SHOW_WELCOME
cls
echo.
echo   ============================================================
echo      %APP_NAME%  -  Setup
echo   ============================================================
echo.
echo   Welcome. This wizard will set up FEDDA Hub on this computer.
echo.
echo   Before anything is installed, please read the notice on the
echo   next screens.
echo.
echo   Press any key to continue...
pause >nul

:SHOW_REQUIREMENTS
cls
echo.
echo   ============================================================
echo      BEFORE YOU START  -  what you need
echo   ============================================================
echo.
echo   FEDDA brings its own Python and sets up ComfyUI and PyTorch
echo   for you - you do NOT need to install those.
echo.
echo   You DO need these on your computer first:
echo.
echo     - An NVIDIA GeForce RTX graphics card with a recent driver
echo     - Git         https://git-scm.com/download/win
echo     - Node.js LTS https://nodejs.org  (version 18 or newer)
echo.
echo   Optional: Ollama https://ollama.com  (smarter prompt / vision
echo   helpers; FEDDA works without it too).
echo.
echo   ------------------------------------------------------------
echo   Quick check on this machine:
echo   ------------------------------------------------------------

set "GIT_OK=MISSING"
where git >nul 2>nul && set "GIT_OK=found"
set "NODE_OK=MISSING"
where node >nul 2>nul && set "NODE_OK=found"

echo     Git      : %GIT_OK%
echo     Node.js  : %NODE_OK%
echo.
if /i "%GIT_OK%"=="found" if /i "%NODE_OK%"=="found" goto REQ_OK

:: --- one or both missing: offer to install them for the user ---
where winget >nul 2>nul
if errorlevel 1 goto REQ_MANUAL

set "WHATLIST="
if /i not "%GIT_OK%"=="found" set "WHATLIST=Git"
if /i not "%NODE_OK%"=="found" if defined WHATLIST (set "WHATLIST=%WHATLIST% and Node.js LTS") else (set "WHATLIST=Node.js LTS")

echo   Good news - FEDDA can install the missing tools for you
echo   using the built-in Windows Package Manager (winget).
echo.
echo   This will DOWNLOAD and INSTALL: %WHATLIST%
echo   Nothing is installed until you confirm below.
echo.

:ASK_INSTALL
set "DOINST="
set /p "DOINST=Install now? Type Y to install, or N to skip: "
if /i "%DOINST%"=="Y" goto DO_INSTALL
if /i "%DOINST%"=="N" goto REQ_MANUAL
echo   Please type Y or N.
goto ASK_INSTALL

:DO_INSTALL
echo.
if /i not "%GIT_OK%"=="found" (
    echo   Installing Git ...
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
)
if /i not "%NODE_OK%"=="found" (
    echo   Installing Node.js LTS ...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
)
echo.
echo   ------------------------------------------------------------
echo   Done. Please CLOSE this window and start the installer again
echo   so the newly installed tools are picked up.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0

:REQ_MANUAL
echo.
echo   [X] Git and/or Node.js is missing, and FEDDA cannot install
echo       without them. Install the missing tool from the link
echo       shown above, then run this installer again.
echo.
pause
exit /b 1

:REQ_OK
echo   Press any key to continue...
pause >nul

:SHOW_DISCLAIMER
cls
echo.
echo   ============================================================
echo      IMPORTANT - PLEASE READ BEFORE INSTALLING
echo   ============================================================
echo.
echo   %APP_NAME% is a local, self-hosted AI media studio. It runs
echo   on YOUR machine and generates synthetic / AI images, video
echo   and voice. By installing and using it you agree to the
echo   following:
echo.
echo   1. ADULTS ONLY. This software can produce adult content. It
echo      is intended for users who are 18+ and legally adults in
echo      their jurisdiction.
echo.
echo   2. YOUR RESPONSIBILITY. You are solely responsible for what
echo      you generate and where you publish it, and for obeying
echo      the laws that apply to you and the terms of any platform
echo      you post to.
echo.
echo   3. NO REAL PEOPLE WITHOUT CONSENT. Do not create content
echo      depicting a real, identifiable person without their
echo      consent. Creating sexual or abusive content of anyone
echo      who is, or appears to be, a minor is strictly forbidden
echo      and illegal - never do this.
echo.
echo   4. THIRD-PARTY MODELS. Checkpoints, LoRAs and nodes are made
echo      by third parties under their own licenses. You are
echo      responsible for using them within those licenses.
echo.
echo   5. LOCAL AND PRIVATE. FEDDA runs entirely on your own
echo      machine. Your prompts and creations stay with you -
echo      nothing is sent to us. It is a community project that
echo      keeps getting better over time.
echo.
echo   ------------------------------------------------------------
echo.
echo   Press any key to continue...
pause >nul

:SHOW_INFO
cls
echo.
echo   ============================================================
echo      READY TO INSTALL  -  what will happen
echo   ============================================================
echo.
echo   The installer will now:
echo     - Download a private copy of the app source
echo     - Set up an embedded Python + ComfyUI
echo     - Install the required custom nodes and dependencies
echo     - Build the FEDDA frontend
echo.
echo   Good to know:
echo     - This can take 30-60 minutes on a first run
echo     - It needs a stable internet connection
echo     - Plan for a good amount of free disk space for models
echo     - A recent NVIDIA GPU is strongly recommended
echo.
echo   No further input is required once it starts.
echo.
echo   Press any key to begin the installation...
pause >nul

echo.
echo ============================================================
echo   FEDDA Hub v2.0 - Standalone Installer
echo ============================================================
echo.

set "INSTALL_ROOT=%~dp0"
if "%INSTALL_ROOT:~-1%"=="\" set "INSTALL_ROOT=%INSTALL_ROOT:~0,-1%"

set "APP_DIR=%INSTALL_ROOT%\app"
set "LOGS_DIR=%INSTALL_ROOT%\logs"
set "REPO_URL=https://github.com/Feddakalkun/Fedda_hub_v2.0.git"
set "INSTALL_LOG=%LOGS_DIR%\install.log"

echo Install root     : %INSTALL_ROOT%
echo Target app dir   : %APP_DIR%
echo Git remote       : %REPO_URL%
echo.

:: --- Prepare log file ---
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
echo # FEDDA Hub v2.0 Installation Log > "%INSTALL_LOG%"
echo **Started:** %date% %time% >> "%INSTALL_LOG%"
echo **Root:** %INSTALL_ROOT% >> "%INSTALL_LOG%"
echo **Repo:** %REPO_URL% >> "%INSTALL_LOG%"
echo. >> "%INSTALL_LOG%"
echo --- >> "%INSTALL_LOG%"

:: --- Prerequisites (Git + Node.js) already verified in the front-of-house ---

:: --- Prepare folders ---
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

:: --- Clone or update the source ---
if not exist "%APP_DIR%\.git" (
    echo [1/3] Cloning clean v2.0 repository into app\ ...
    echo [1/3] Cloning clean v2.0 repository into app\ ... >> "%INSTALL_LOG%"
    git clone --depth 1 "%REPO_URL%" "%APP_DIR%" >> "%INSTALL_LOG%" 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Git clone failed.
        echo [ERROR] Git clone failed. >> "%INSTALL_LOG%"
        pause
        exit /b 1
    )
) else (
    echo [1/3] Updating existing app\ from GitHub ...
    echo [1/3] Updating existing app\ from GitHub ... >> "%INSTALL_LOG%"
    pushd "%APP_DIR%"
    git fetch origin >> "%INSTALL_LOG%" 2>&1
    git reset --hard origin/main >> "%INSTALL_LOG%" 2>&1
    popd
)

echo [1/3] Source ready in app\
echo [1/3] Source ready in app\ >> "%INSTALL_LOG%"

:: --- Run the inner modular installer (main single install) ---
echo [2/3] Running inner setup...
echo         This will install ComfyUI, custom nodes, frontend deps, etc.
echo.
echo   The inner installer is now starting.
echo   Its output will appear below. This can take several minutes.
echo   No input is required during this step.
echo.
echo [2/3] Running inner setup... >> "%INSTALL_LOG%"
echo Inner installer starting - live output follows. No input required. >> "%INSTALL_LOG%"
echo. >> "%INSTALL_LOG%"

set "FEDDA_UNATTENDED=1"
pushd "%APP_DIR%"
call scripts\install.bat
set "INNER_EXIT=%errorlevel%"
popd
set "FEDDA_UNATTENDED="

echo. >> "%INSTALL_LOG%"
echo --- Inner installer finished (exit code %INNER_EXIT%) --- >> "%INSTALL_LOG%"
if exist "%APP_DIR%\logs\install_fast_log.txt" (
    echo. >> "%INSTALL_LOG%"
    echo --- app\logs\install_fast_log.txt --- >> "%INSTALL_LOG%"
    type "%APP_DIR%\logs\install_fast_log.txt" >> "%INSTALL_LOG%"
)
if exist "%APP_DIR%\logs\install_report.txt" (
    echo. >> "%INSTALL_LOG%"
    echo --- app\logs\install_report.txt --- >> "%INSTALL_LOG%"
    type "%APP_DIR%\logs\install_report.txt" >> "%INSTALL_LOG%"
)

if %INNER_EXIT% neq 0 (
    echo.
    echo [WARN] Inner installer exited with code %INNER_EXIT%.
    echo        You may need to run it again manually.
    echo        See app\scripts\install.bat for options.
    echo [WARN] Inner installer exited with code %INNER_EXIT% >> "%INSTALL_LOG%"
) else (
    echo.
    echo [2/3] Inner installer completed successfully.
    echo [2/3] Inner installer completed successfully. >> "%INSTALL_LOG%"
)

:: --- Create convenience launchers in the install root ---
echo [3/3] Creating run.bat and update.bat in the install root...
echo [3/3] Creating run.bat and update.bat in the install root... >> "%INSTALL_LOG%"

:: Thin run.bat - launches the real one inside app\
:: NOTE: use echo-only inside redirect blocks - other commands (cd, call, pause) get EXECUTED, not written
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call run.bat %%*
) > "%INSTALL_ROOT%\run.bat"

:: Thin update.bat - for existing users (distribute this when adding new workflows)
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo echo ============================================================
    echo echo   FEDDAKALKUN - Update for Existing Installs
    echo echo ============================================================
    echo echo.
    echo echo This will:
    echo echo   - Pull latest code and new workflow files from GitHub
    echo echo   - Install any new custom nodes required by new workflows
    echo echo   - Update ComfyUI core and dependencies as needed
    echo echo.
    echo echo Starting update...
    echo echo.
    echo if exist "scripts\run_update.bat" ^(
    echo     call scripts\run_update.bat
    echo ^) else ^(
    echo     powershell -ExecutionPolicy Bypass -File "scripts\update_code.ps1"
    echo ^)
    echo echo.
    echo echo Update finished. Check logs\update.log for details.
    echo echo You may need to restart ComfyUI / FEDDA after this.
    echo echo.
    echo pause
) > "%INSTALL_ROOT%\update.bat"

:: Thin download_models.bat - per-workflow model downloads (resumable)
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call scripts\download_models.bat %%*
) > "%INSTALL_ROOT%\download_models.bat"

:: Thin symlink_modelfolder.bat - link an external model folder into models\<subfolder>
(
    echo @echo off
    echo cd /d "%%~dp0app"
    echo call scripts\symlink_modelfolder.bat %%*
) > "%INSTALL_ROOT%\symlink_modelfolder.bat"

echo.
echo ============================================================
echo   Installation preparation complete!
echo ============================================================
echo.
echo The following files now exist next to this installer:
echo   - FEDDA_v2.0_Installer.bat  (this file - for new users)
echo   - run.bat                   (double-click to start FEDDA)
echo   - update.bat                (distribute this to existing users when adding new workflows/nodes)
echo   - download_models.bat       (OPTIONAL: pre-download a workflow's models so its
echo                                first run is instant; workflows can also self-fetch)
echo   - symlink_modelfolder.bat   (link an external model folder into models\, e.g. loras)
echo   - log.md                    (install log in markdown)
echo.
echo Actual application source + runtime lives in the "app" subfolder.
echo Logs will go to "logs\".
echo.
echo Next steps for you:
echo   1. Double-click run.bat to start FEDDA
echo   2. When adding new workflows later: give existing users the "update.bat"
echo      It pulls new code + installs any newly required custom nodes.
echo   3. Later you can run the inner installer manually:
echo        cd app
echo        scripts\install.bat
echo.

:: --- Generate log.md that contains the entire install log ---
echo.
echo [INFO] Generating log.md with the install log...
(
    echo # FEDDAKALKUN v2.0 - Installation Log
    echo.
    echo **Generated:** %date% %time%
    echo **Install Root:** %INSTALL_ROOT%
    echo **Target Repo:** %REPO_URL%
    echo **Inner Installer Exit Code:** %INNER_EXIT%
    echo.
    echo ---
    echo.
    echo ## Complete Install Log
    echo.
    echo ```text
    type "%INSTALL_LOG%"
    echo ```
    echo.
    echo ---
    echo.
    echo *This file contains the entire output from the installation process.*
) > "%INSTALL_ROOT%\log.md"

echo [INFO] log.md created successfully at %INSTALL_ROOT%\log.md
echo [INFO] log.md created successfully at %INSTALL_ROOT%\log.md >> "%INSTALL_LOG%"

echo.
echo Installation preparation complete.
echo Press any key to close this window...
pause
exit /b 0
