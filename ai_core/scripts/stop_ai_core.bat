@echo off
REM Stops the VisioSphere AI core when it's running hidden. Kills BOTH the
REM launcher loop (run_ai_core.bat) and the python process, otherwise the loop
REM would just restart it after 5 seconds.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_ai_core.bat*' -or $_.CommandLine -like '*cctv_core.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo AI core stopped.
timeout /t 2 /nobreak >nul
