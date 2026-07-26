@echo off
REM VisioSphere Cloudflare Tunnel launcher with auto-restart loop.
REM Called by start_tunnel_hidden.vbs at logon (if the service is NOT installed).
REM If cloudflared is installed as a Windows service, this file is not needed.

:loop
echo [%DATE% %TIME%] Starting cloudflare tunnel...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run
echo [%DATE% %TIME%] Tunnel exited. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
