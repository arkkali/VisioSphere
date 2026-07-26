@echo off
REM Stops the hidden Cloudflare tunnel: kills the launcher loop (run_tunnel.bat)
REM AND cloudflared so it does not auto-restart.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_tunnel.bat*' -or $_.Name -eq 'cloudflared.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Tunnel stopped.
timeout /t 2 /nobreak >nul
