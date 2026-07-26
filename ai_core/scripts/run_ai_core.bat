@echo off
REM ── VisioSphere AI core auto-launcher ──────────────────────────────────────
REM 1. Discovers the CCTV camera's current IP (it changes per network) and sets
REM    CAM_1_SOURCE in the environment so it overrides the .env default.
REM 2. Runs cctv_core.py and auto-restarts it (and re-discovers the camera) if
REM    it ever exits. Logs everything to cctv_run.log.
REM Launched automatically at logon (Startup-folder shortcut — see setup notes).

cd /d "C:\Users\Allen\Desktop\VisioSphere\VisioSphere-\ai_core"
call venv\Scripts\activate.bat

:loop
echo [%date% %time%] Discovering camera IP on this network... >> cctv_run.log
set "CAM_1_SOURCE="
for /f "usebackq delims=" %%i in (`python find_camera.py 2^>nul`) do set "CAM_1_SOURCE=%%i"
if defined CAM_1_SOURCE (
  echo [%date% %time%] Camera located. Starting cctv_core.py >> cctv_run.log
) else (
  echo [%date% %time%] Camera NOT found; falling back to .env CAM_1_SOURCE >> cctv_run.log
)

python cctv_core.py >> cctv_run.log 2>&1

echo [%date% %time%] cctv_core.py exited (code %errorlevel%). Restarting in 5s... >> cctv_run.log
timeout /t 5 /nobreak >nul
goto loop
