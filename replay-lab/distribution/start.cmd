@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0replay-lab\start.ps1" %*
set "replay_exit=%errorlevel%"
if not "%replay_exit%"=="0" pause
exit /b %replay_exit%
