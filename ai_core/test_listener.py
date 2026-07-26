"""
test_listener.py — VisioSphere evaluation harness

Connects to the local backend as a Socket.IO client and records every
cctv_alert event with a real wall-clock timestamp. Use this while the
AI core is processing a test video clip to build a ground-truth comparison log.

Usage:
    1. Set CAM_0_SOURCE / CAM_1_SOURCE in ai_core/.env to your video file paths.
    2. Run: node server.js          (terminal 1)
    3. Run: python cctv_core.py     (terminal 2)
    4. Run: python test_listener.py (terminal 3)  ← this script
    5. When done, press Ctrl+C — alert_log.json is written automatically.

Output — alert_log.json:
    [
      {
        "real_timestamp": "2026-06-12T14:23:07.412",  // wall-clock time alert fired
        "type": "EMERGENCY",
        "message": "[ID 1] FALL DETECTED (HIGH CONFIDENCE)",
        "location": "Test_Clip_Falls",
        "timestamp": "02:23:07 PM"                    // AI core's formatted time
      },
      ...
    ]

Compare real_timestamp offsets against your manually annotated ground-truth
timestamps to compute true positives, false positives, and false negatives.
"""

import socketio
import json
import os
import sys
from datetime import datetime

BACKEND_URL    = os.getenv("BACKEND_URL", "http://localhost:5000")
AI_TOKEN       = os.getenv("AI_SERVICE_TOKEN", "")
OUTPUT_FILE    = os.path.join(os.path.dirname(__file__), "alert_log.json")

sio = socketio.Client()
log = []
start_time = None


def _save():
    with open(OUTPUT_FILE, "w") as f:
        json.dump(log, f, indent=2)
    print(f"\n[LISTENER] Saved {len(log)} alert(s) to {OUTPUT_FILE}")


@sio.event
def connect():
    global start_time
    start_time = datetime.now()
    print(f"[LISTENER] Connected to {BACKEND_URL}")
    print(f"[LISTENER] Session started at {start_time.isoformat()}")
    print("[LISTENER] Waiting for cctv_alert events... (Ctrl+C to stop)\n")


@sio.on("dashboard_alert")
def on_alert(data):
    # The backend receives 'cctv_alert' from the AI core, processes and persists
    # it, then re-broadcasts as 'dashboard_alert' to all connected clients.
    # We listen here, not on 'cctv_alert'.
    now = datetime.now()
    elapsed = (now - start_time).total_seconds() if start_time else 0.0
    entry = {
        "real_timestamp": now.isoformat(timespec="milliseconds"),
        "elapsed_seconds": round(elapsed, 2),
        "type":     data.get("type")     or data.get("severity", "?"),
        "message":  data.get("message")  or data.get("rawMessage", ""),
        "location": data.get("location", "?"),
        "timestamp": data.get("timestamp", ""),
    }
    log.append(entry)
    print(
        f"[+{elapsed:7.2f}s] {entry['type']:10s} | "
        f"{entry['location']:30s} | {entry['message']}"
    )


@sio.event
def disconnect():
    print(f"\n[LISTENER] Disconnected. {len(log)} alert(s) captured.")
    _save()


try:
    sio.connect(BACKEND_URL, auth={"token": AI_TOKEN} if AI_TOKEN else None)
    sio.wait()
except KeyboardInterrupt:
    print("\n[LISTENER] Stopped by user.")
    _save()
    sio.disconnect()
    sys.exit(0)
except Exception as e:
    print(f"[LISTENER] Connection error: {e}")
    print(f"           Is the backend running at {BACKEND_URL}?")
    sys.exit(1)
