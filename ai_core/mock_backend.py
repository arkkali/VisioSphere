"""Minimal stand-in for the Node backend, for detection evaluation only.
Accepts cctv_alert from the AI core, logs it in evaluate.py's format,
and re-broadcasts as dashboard_alert so test_listener.py also works."""
import socketio, json, os
from datetime import datetime
from flask import Flask

sio = socketio.Server(async_mode='threading', cors_allowed_origins='*')
app = Flask(__name__)
app.wsgi_app = socketio.WSGIApp(sio, app.wsgi_app)

OUT = os.path.join(os.path.dirname(__file__), "alert_log.json")
log, start = [], None

@sio.event
def connect(sid, environ, auth=None):
    global start
    if start is None:
        start = datetime.now()
    print(f"[MOCK] connected {sid}")

@sio.on('cctv_alert')
def on_alert(sid, data):
    global start
    now = datetime.now()
    if start is None:
        start = now
    elapsed = (now - start).total_seconds()
    entry = {
        "real_timestamp": now.isoformat(timespec="milliseconds"),
        "elapsed_seconds": round(elapsed, 2),
        "type": data.get("type"),
        "message": data.get("message", ""),
        "location": data.get("location", "?"),
        "timestamp": data.get("timestamp", ""),
    }
    log.append(entry)
    print(f"[+{elapsed:7.2f}s] {entry['type']:10s} | {entry['message']}")
    with open(OUT, "w") as f:
        json.dump(log, f, indent=2)
    sio.emit('dashboard_alert', data)

@sio.on('cctv_alert_clip')
def on_clip(sid, data):
    pass

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, threaded=True)
