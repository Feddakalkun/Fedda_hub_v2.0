@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
powershell -ExecutionPolicy Bypass -File "%ROOT%\scripts\run.ps1" -RootPath "%ROOT%"
