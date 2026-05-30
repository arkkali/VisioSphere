@echo off
REM ── VisioSphere AI core auto-launcher ──────────────────────────────────────
REM Activates the venv, runs cctv_core.py, and restarts it automatically if it
REM exits for any reason. Logs everything to cctv_run.log.
REM Started automatically at logon by Task Scheduler (see setup notes).

cd /d "C:\Users\Allen\Desktop\VisioSphere\VisioSphere-\ai_core"
call venv\Scripts\activate.bat

:loop
echo [%date% %time%] Starting cctv_core.py >> cctv_run.log
python cctv_core.py >> cctv_run.log 2>&1
echo [%date% %time%] cctv_core.py exited (code %errorlevel%). Restarting in 5s... >> cctv_run.log
timeout /t 5 /nobreak >nul
goto loop
