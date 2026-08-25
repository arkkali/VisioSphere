#!/usr/bin/env bash
# VisioSphere AI core — read-only triage. Changes nothing.
#
#   bash visiosphere_triage.sh > triage.txt 2>&1
#
# Answers the questions that decide what the fix has to be:
#   1. was the service actually running overnight, or did something restart it
#   2. is a second copy running outside systemd
#   3. which cctv_core.py did the running process load, and does it have the guards
#   4. what is this box's clock and timezone (the dashboard prints a bare
#      "5:38:44 AM" with no date and no zone — it is this clock)
#   5. when were alerts and clips really produced
set -u
SERVICE="${SERVICE:-visiosphere-ai}"
line() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

line "1. Clock and timezone on this box"
date
date -u
timedatectl 2>/dev/null | sed 's/^/  /' || echo "  (no timedatectl)"
echo "  Manila now: $(TZ=Asia/Manila date '+%Y-%m-%d %I:%M:%S %p %Z')"
echo "  ^ if these differ, every time on the dashboard is shifted by that much."

line "2. Service state and restart history"
systemctl is-enabled "$SERVICE" 2>&1 | sed 's/^/  enabled: /'
systemctl is-active  "$SERVICE" 2>&1 | sed 's/^/  active : /'
systemctl show "$SERVICE" -p MainPID -p ExecMainStartTimestamp -p NRestarts \
  -p Restart -p ActiveEnterTimestamp -p InactiveEnterTimestamp 2>/dev/null | sed 's/^/  /'
echo "  --- unit file ---"
systemctl cat "$SERVICE" 2>/dev/null | sed 's/^/  /' | head -40

line "2b. THE ONE THAT MATTERS — was it stopped last night, and did the box reboot?"
echo "  booted at   : $(uptime -s 2>/dev/null || who -b)"
echo "  uptime      : $(uptime -p 2>/dev/null)"
echo "  ^ a boot time AFTER you went to sleep means the box restarted (power"
echo "    blip is the usual cause) and systemd started the service again,"
echo "    because it is 'enabled'. Your systemctl stop does not survive a reboot."
echo "  --- recent boots ---"
journalctl --list-boots 2>/dev/null | tail -5 | sed 's/^/    /'
echo "  --- every start/stop of $SERVICE in the last 36h ---"
journalctl -u "$SERVICE" --since "36 hours ago" --no-pager -o short-iso 2>/dev/null \
  | grep -Ei "Started|Stopped|Stopping|Deactivated|Scheduled restart|Main process exited" \
  | sed 's/^/    /'
echo "  ^ NO 'Stopped' line last night = the service never stopped. Closing the"
echo "    VS Code terminal or the SSH session does NOT stop a systemd service;"
echo "    it keeps running on the server with nobody watching."

line "3. Anything else that could start it (timers, paths, cron, rc.local)"
systemctl list-timers --all 2>/dev/null | grep -i visio | sed 's/^/  /' || true
systemctl list-units --type=path --all 2>/dev/null | grep -i visio | sed 's/^/  /' || true
for f in /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/*; do
  [ -f "$f" ] && grep -Hi -e visio -e cctv "$f" 2>/dev/null | sed 's/^/  /'
done
crontab -l 2>/dev/null | grep -i -e visio -e cctv | sed 's/^/  root crontab: /' || true

line "4. Every python process that looks like the AI core"
ps -eo pid,ppid,lstart,etime,cmd | grep -i -e cctv_core -e clip_server -e replay.py \
  | grep -v grep | sed 's/^/  /' || echo "  none running"
echo "  (more than one line here = systemctl stop only stopped one of them)"

line "5. Which file the running process actually loaded"
PID=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null)
if [ -n "${PID:-}" ] && [ "$PID" != "0" ] && [ -d "/proc/$PID" ]; then
  echo "  MainPID     : $PID"
  echo "  started     : $(ps -o lstart= -p "$PID")"
  echo "  cwd         : $(readlink -f "/proc/$PID/cwd")"
  tr '\0' ' ' < "/proc/$PID/cmdline"; echo
  echo "  open .py files:"
  ls -l "/proc/$PID/fd" 2>/dev/null | grep -o '/[^ ]*\.py' | sort -u | sed 's/^/    /'
else
  echo "  service is not running — cannot inspect the loaded file"
fi

line "6. cctv_core.py on disk vs the guards it should contain"
CORE=""
for c in /opt/visiosphere/repo/ai_core/cctv_core.py /opt/visiosphere/ai_core/cctv_core.py \
         /opt/visiosphere/cctv_core.py; do
  [ -f "$c" ] && CORE="$c" && break
done
[ -z "$CORE" ] && CORE=$(find /opt /srv /home -name cctv_core.py -not -path '*/node_modules/*' 2>/dev/null | head -1)
if [ -n "$CORE" ]; then
  echo "  file   : $CORE"
  ls -l --time-style=full-iso "$CORE" | sed 's/^/  /'
  echo "  lines  : $(wc -l < "$CORE")"
  echo "  bytes  : $(stat -c%s "$CORE")   <-- 0 here means the file is EMPTY"
  for g in _alert_budget_ok CLIP_MAX_PER_DAY CAMERA_STALE_AFTER_S PROLONGED_FALL_STEPS_S \
           PROMOTE_MIN_CANDIDATE_FRAMES PERSIST_FALLEN FLOOR_ZONE_REQUIRED; do
    if grep -q "$g" "$CORE"; then echo "    [present] $g"; else echo "    [MISSING] $g"; fi
  done
  echo "  ^ if a guard is MISSING but you remember adding it, the service is"
  echo "    running an older file than the one you edited."
else
  echo "  cctv_core.py not found — set CORE by hand and re-run section 6"
fi

line "7. Camera configuration actually in use (secrets masked)"
for e in /opt/visiosphere/repo/ai_core/.env /opt/visiosphere/ai_core/.env /opt/visiosphere/.env; do
  [ -f "$e" ] || continue
  echo "  $e"
  grep -E '^(CAM_[0-9]+_(ID|SOURCE)|PERSIST_FALLEN|FALLEN_TIMEOUT_S|DET_CONF|MIN_CONFIDENT_KPTS|POSTURE_RATIO|POSTURE_REQUIRE_BOTH|FURNITURE_MODE|UNWITNESSED_FALL|INFERENCE_[WH]|ALERT_MAX_PER_HOUR|CAMERA_STALE_AFTER_S|FLOOR_ZONE_REQUIRED|CLIP_DIR|BACKEND_URL)=' "$e" \
    | sed 's/^/    /'
  echo "    (a CAM_*_SOURCE that is empty, or a C:\\ path on this Linux box,"
  echo "     means that camera can never open — it will read 0 frames forever)"
done

line "8. What the log says — alerts per hour, last 48h"
journalctl -u "$SERVICE" --since "48 hours ago" --no-pager 2>/dev/null \
  | grep -F "[ALERT]" | awk '{print $1" "$2" "substr($3,1,2)":00"}' | uniq -c | tail -50 | sed 's/^/  /'
echo "  --- first and last alert in the window ---"
journalctl -u "$SERVICE" --since "48 hours ago" --no-pager 2>/dev/null | grep -F "[ALERT]" | head -1 | sed 's/^/  /'
journalctl -u "$SERVICE" --since "48 hours ago" --no-pager 2>/dev/null | grep -F "[ALERT]" | tail -1 | sed 's/^/  /'
echo "  --- service start/stop events ---"
journalctl -u "$SERVICE" --since "48 hours ago" --no-pager 2>/dev/null \
  | grep -Ei "Started|Stopped|Stopping|Main process exited|Scheduled restart|Failed" | tail -25 | sed 's/^/  /'
echo "  ^ alerts logged BETWEEN a 'Stopped' and the next 'Started' would be the"
echo "    real anomaly. Alerts only before the stop = the flood is a backlog you"
echo "    are seeing again in the morning, not new alerts."

line "9. Clips — the independent timestamp"
CLIPDIR="${CLIP_DIR:-/opt/visiosphere/clips}"
if [ -d "$CLIPDIR" ]; then
  echo "  dir    : $CLIPDIR"
  echo "  total  : $(ls -1 "$CLIPDIR" 2>/dev/null | wc -l) files"
  echo "  newest 12 (filename carries the time the AI box thought it was;"
  echo "  the mtime column is the real write time — they must agree):"
  ls -lt --time-style=full-iso "$CLIPDIR" 2>/dev/null | head -13 | sed 's/^/    /'
else
  echo "  $CLIPDIR not found"
fi

line "10. Camera liveness as the AI core itself reports it"
curl -s --max-time 5 http://127.0.0.1:5001/status 2>/dev/null | head -c 1200 || echo "  AI core not answering on :5001 (service down?)"
echo

line "Done"
echo "Send this whole output back and the remaining unknowns are settled."
