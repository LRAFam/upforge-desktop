@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Check-PC.ps1" -ReportPath "%~dp0pc-readiness.json"
echo.
echo The report is saved beside this checker as pc-readiness.json.
pause
