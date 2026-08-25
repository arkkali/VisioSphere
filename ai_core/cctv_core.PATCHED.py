import os

# Load ai_core/.env (if present) BEFORE any os.getenv() calls below — including
# the OPENCV transport hint and CAMERAS config — so a developer's local .env
# can override every default without per-session `$env:VAR = ...` exports.
# python-dotenv is an optional dependency: if it's not installed we just skip
# loading and fall back to whatever's already in the process environment.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    print("[INIT] python-dotenv not installed; skipping .env load. "
          "Run `pip install python-dotenv` to enable .env support.")

# Force OpenCV's FFmpeg backend to use TCP for RTSP transport. Tapo cameras
# (and many other H.264 IP cams) drop UDP auth handshakes silently, producing
# spurious 401 errors even with correct credentials — VLC works because it
# negotiates auth differently. Must be set BEFORE `import cv2`; FFmpeg reads
# this env var once at module init and never re-checks. The `stimeout` value
# is a 5-second socket timeout to fail fast on unreachable cameras instead of
# hanging the inference thread.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|stimeout;5000000",
)

import cv2
import numpy as np
import time
import signal
import sys
import socketio
import threading
from collections import deque
from pathlib import Path
from urllib.parse import quote
from flask import Flask, Response
from flask_cors import CORS
from ultralytics import YOLO

try:
    import boto3
    import botocore.exceptions as botocore_exceptions
except ImportError:
    boto3 = None
    botocore_exceptions = None

# ─────────────────────────────────────────────────────────────────────────────
# Camera Configuration
# ─────────────────────────────────────────────────────────────────────────────
# Camera IDs flow through the alert payload as the `location` field — the
# Node backend persists this verbatim and the frontend displays it as
# "Fall Detected — <location>". Override via env vars without touching code:
#
#   CAM_0_ID=House of Charbel        CAM_0_SOURCE=0
#   CAM_1_ID=House of Gabriel        CAM_1_SOURCE=rtsp://192.168.100.109/stream1
#
# CAM_*_SOURCE accepts either an integer (webcam device index) or a URL
# (IP camera / RTSP / MJPEG stream).
#
# Tapo TC65 RTSP note: Tapo cameras require a "Camera Account" (Tapo app →
# camera → Advanced Settings → Camera Account). If anonymous RTSP fails with
# 401, prepend credentials: rtsp://<user>:<pass>@192.168.100.109:554/stream1
# (stream1 = 2K HD, stream2 = lower-res sub-stream — use stream2 if pose
# inference can't keep up).
def _coerce_source(value):
    """Try to read a numeric webcam index; fall back to the raw URL string."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return value

def _make_camera(id_key, id_default, src_key, src_default):
    """Return (cam_id, source) or None if either value is empty/unset."""
    cam_id = os.getenv(id_key, id_default).strip()
    source = _coerce_source(os.getenv(src_key, src_default).strip() if isinstance(os.getenv(src_key, src_default), str) else os.getenv(src_key, src_default))
    if not cam_id or source == "":
        return None
    return (cam_id, source)

# Camera slots are discovered from the environment, not hardcoded, so adding a
# camera is a pure .env change:
#
#     CAM_2_ID=Living Room
#     CAM_2_SOURCE=rtsp://<user>:<pass>@<ip>:554/stream1
#
# Slots 0 and 1 keep their historical defaults so existing installs behave
# exactly as before. Slots 2+ exist only when both _ID and _SOURCE are set.
# To DISABLE a slot, set its source empty (e.g. CAM_0_SOURCE=) — that is how
# you retire the laptop webcam once a real camera replaces it.
#
# Each camera also needs a facility mapping in backend/config/facilities.js
# (CAMERA_FACILITY) or its incidents fall back to the default facility.
_CAMERA_SLOT_DEFAULTS = {
    0: ("House of Charbel", "0"),
    1: ("House of Gabriel", "rtsp://192.168.100.109/stream1"),
}
_MAX_CAMERA_SLOTS = int(os.getenv("MAX_CAMERA_SLOTS", "10"))

def _discover_cameras():
    found = []
    for i in range(_MAX_CAMERA_SLOTS):
        id_default, src_default = _CAMERA_SLOT_DEFAULTS.get(i, ("", ""))
        cam = _make_camera(f"CAM_{i}_ID", id_default, f"CAM_{i}_SOURCE", src_default)
        if cam is None:
            continue
        if any(existing_id == cam[0] for existing_id, _ in found):
            print(f"[CAMERAS] Slot {i} reuses cam_id {cam[0]!r} — skipping the duplicate. "
                  f"Each camera needs a unique CAM_<n>_ID.")
            continue
        found.append(cam)
    return found

CAMERAS = _discover_cameras()

if not CAMERAS:
    print("[CAMERAS] WARNING: no cameras configured. Set CAM_0_ID / CAM_0_SOURCE in ai_core/.env.")
else:
    print(f"[CAMERAS] {len(CAMERAS)} configured: " + ", ".join(cid for cid, _ in CAMERAS))

# ─────────────────────────────────────────────────────────────────────────────
# IP Camera Auto-Discovery
# Scans the ARP table for TP-Link / Tapo MAC OUIs and probes RTSP on each
# candidate.  Called by capture_thread when the configured IP stops responding.
# ─────────────────────────────────────────────────────────────────────────────
import re as _re
import subprocess as _subprocess
from urllib.parse import urlparse as _urlparse

# Known TP-Link / Tapo MAC OUI prefixes (first 3 octets, colon-separated, lowercase)
_TPLINK_OUIS = {
    '50:c7:bf', 'b0:95:75', 'c0:06:c3', 'b4:b0:24', '14:eb:b6',
    'b0:4e:26', '98:48:27', '54:af:97', '50:91:e3', '1c:61:b4',
    'f4:f2:6d', 'e8:48:b8', '30:de:4b', 'a4:2b:b0', 'ec:08:6b',
    '60:32:b1', 'ac:84:c9', '00:1d:0f', 'c4:e9:84', '18:d6:c7',
    '74:da:38', '70:4f:57', '3c:84:6a', 'f8:1a:67', '44:61:32',
    'ac:a7:f1',  # Tapo TC65 (House of Gabriel)
}

def _get_arp_candidates():
    """Return IPs from the ARP table whose MAC prefix matches a TP-Link OUI."""
    try:
        out = _subprocess.check_output(['arp', '-a'], text=True, timeout=5)
    except Exception:
        return []
    candidates = []
    for line in out.splitlines():
        ip_m  = _re.search(r'(\d{1,3}(?:\.\d{1,3}){3})', line)
        mac_m = _re.search(
            r'([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})[:\-]'
            r'[0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}',
            line.lower()
        )
        if ip_m and mac_m:
            oui = mac_m.group(1).replace('-', ':')
            if oui in _TPLINK_OUIS:
                candidates.append(ip_m.group(1))
    return candidates

def _test_rtsp(url, timeout_ms=5000):
    """Return True if OpenCV can grab at least one frame from the RTSP URL."""
    cap = cv2.VideoCapture(url)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC,  timeout_ms)
    ok, _ = cap.read()
    cap.release()
    return ok

def discover_rtsp_source(original_url):
    """
    When the configured RTSP IP is unreachable (e.g. after a network change),
    scan the ARP table for TP-Link/Tapo devices and probe each one with the
    same credentials / port / path extracted from original_url.
    Returns a working RTSP URL, or None if discovery fails.
    """
    if not isinstance(original_url, str) or not original_url.startswith('rtsp://'):
        return None

    parsed    = _urlparse(original_url)
    cred_part = f"{parsed.username}:{parsed.password}@" if parsed.username else ''
    port      = parsed.port or 554
    path      = parsed.path or '/stream1'

    print("[DISCOVERY] Scanning ARP table for TP-Link/Tapo devices …")
    candidates = _get_arp_candidates()

    if not candidates:
        print("[DISCOVERY] No TP-Link MAC addresses in ARP table — "
              "is the camera on the same network as this machine?")
        return None

    for ip in candidates:
        url = f"rtsp://{cred_part}{ip}:{port}{path}"
        print(f"[DISCOVERY] Trying {url} …")
        if _test_rtsp(url):
            print(f"[DISCOVERY] ✓ Camera found at {ip}")
            # Persist the new IP back to .env so the next restart is instant
            try:
                env_path = os.path.join(os.path.dirname(__file__), '.env')
                if os.path.exists(env_path):
                    with open(env_path, 'r') as f:
                        env_text = f.read()
                    import re as _re2
                    new_text = _re2.sub(
                        r'(CAM_\d+_SOURCE\s*=\s*rtsp://[^\s]*@)[\d.]+(:)',
                        lambda m: m.group(0).rsplit('@', 1)[0] + '@' + ip + m.group(2),
                        env_text
                    )
                    # Only write if the URL actually changed
                    old_ip = _urlparse(original_url).hostname
                    if old_ip and old_ip != ip:
                        new_text = env_text.replace(old_ip, ip)
                        with open(env_path, 'w') as f:
                            f.write(new_text)
                        print(f"[DISCOVERY] Updated .env: {old_ip} → {ip}")
            except Exception as e:
                print(f"[DISCOVERY] Could not update .env: {e}")
            return url

    print("[DISCOVERY] Candidates found but none responded to RTSP.")
    return None

# ─────────────────────────────────────────────────────────────────────────────
# Socket.IO & Backend Config
# ─────────────────────────────────────────────────────────────────────────────
sio = socketio.Client()
backend_url      = os.getenv("BACKEND_URL", "http://localhost:5000")
ai_service_token = os.getenv("AI_SERVICE_TOKEN", "")

# Socket.io auth payload — the backend's io.use() middleware checks this token
# and only this token can emit cctv_alert / cctv_alert_clip events. Without it
# the backend will reject the connection entirely. Put the same value in both
# backend/.env and ai_core/.env.
if not ai_service_token:
    print("[INIT] WARNING: AI_SERVICE_TOKEN is empty. Backend will reject this "
          "connection once Socket.io auth is enforced.")

# ── Socket.io event handlers ────────────────────────────────────────────────
# python-socketio does NOT auto-retry when the initial connect fails with
# "namespaces failed to connect" (auth rejection or namespace handshake fail).
# We provide explicit retry-with-backoff below and event handlers here so we
# can see (a) when we first connect, (b) when we disconnect, and (c) when a
# reconnect happens — the previous one-shot try/except hid all three states.
@sio.event
def connect():
    print(f"[OK]   Socket.io connected to {backend_url} (role: ai-service)")

@sio.event
def disconnect():
    print("[WARN] Socket.io disconnected — alerts will NOT reach the dashboard until reconnect")

@sio.event
def connect_error(data):
    print(f"[ERR]  Socket.io connect_error: {data}")


def _connect_to_backend(max_attempts=15, delay_s=2.0):
    """Connect to the Node backend, retrying with backoff. We retry ourselves
    (instead of relying on python-socketio's auto-reconnect) because the
    namespace-handshake-fail path is treated as a permanent error by the
    library — but in practice it's almost always a transient timing issue
    (backend wasn't fully ready yet). Re-sending the auth dict on every
    attempt also guarantees the AI_SERVICE_TOKEN isn't dropped on retry."""
    for attempt in range(1, max_attempts + 1):
        try:
            sio.connect(backend_url, auth={"token": ai_service_token})
            return True   # @sio.event connect handler prints success
        except Exception as e:
            if attempt == max_attempts:
                print(f"[INIT] Giving up after {max_attempts} attempts. Last error: {e}")
                print("[INIT] The AI core will keep running locally but ALERTS WILL NOT REACH THE DASHBOARD.")
                return False
            print(f"[INIT] Backend not ready (attempt {attempt}/{max_attempts}: {e}); retrying in {delay_s:.0f}s...")
            time.sleep(delay_s)
    return False


_connect_to_backend()

# ─────────────────────────────────────────────────────────────────────────────
# Flask & Frame Storage
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# Frame buffers, keyed by cam_id. Built from CAMERAS so adding a third
# camera is a single env-var change rather than three sync'd code edits.
cam_frames = {cam_id: None for cam_id, _ in CAMERAS}
raw_frames = {cam_id: None for cam_id, _ in CAMERAS}
# Clean frame + what was detected in it, for the clip worker's post-roll.
# cam_frames holds the annotated frame the browser sees; this holds the
# unannotated twin so a clip can be repainted for one subject only.
# See CLIP_ISOLATE_SUBJECT.
cam_clean  = {cam_id: None for cam_id, _ in CAMERAS}
lock     = threading.Lock()
raw_lock = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# Alert Clip Recording
# ─────────────────────────────────────────────────────────────────────────────
# When send_alert() fires, we save a video clip of the surrounding window:
# CLIP_PREROLL_S seconds of frames from BEFORE the alert (drained from a
# rolling deque the inference thread keeps full) + CLIP_POSTROLL_S seconds
# of frames AFTER, sampled from cam_frames in a daemon worker.
#
# The work happens off the inference thread — send_alert returns immediately.
# The first emit goes out without a clipPath; the worker stamps the clipPath
# into a follow-up `cctv_alert_clip` event ~POSTROLL_S seconds later, and the
# backend updates the corresponding Incident document.
#
# Memory: at default settings (10s pre-roll * 10 fps * 640x480x3 bytes) we
# hold ~92 MB per camera in the rolling buffer. Two cameras ≈ 184 MB. If you
# add more cameras or increase resolution, watch this number.
import math
import json
from datetime import datetime

# ── Display timezone ─────────────────────────────────────────────────────────
# Every clock in this file used time.strftime() with no timezone, which means
# "whatever the HOST is set to". The deployment box runs UTC while the facility
# is in Asia/Manila, so the burnt-in HUD clock and the alert timestamp read
# eight hours behind the wall clock in the room — 09:28 on a frame recorded at
# 17:28. On a system whose whole purpose is telling a nurse WHEN a resident
# fell, that is not cosmetic.
#
# Setting DISPLAY_TZ converts from the epoch, so it is correct whether or not
# the host clock is fixed, and the two cannot double-correct each other.
# Leaving it unset keeps the previous behaviour (host local time).
#
# The durable fix is still to set the server's own zone:
#     sudo timedatectl set-timezone Asia/Manila
# which also corrects journald, log files and MongoDB's createdAt.
# Defaults to Asia/Manila rather than to the host, because requiring an extra
# .env line to get the right time was a bad call: the clock stayed wrong after
# a sync and looked like the fix had failed. Override DISPLAY_TZ for any other
# site, or set it empty to go back to host local time.
DISPLAY_TZ = os.getenv("DISPLAY_TZ", "Asia/Manila").strip()
_display_tz = None
if DISPLAY_TZ:
    try:
        from zoneinfo import ZoneInfo
        _display_tz = ZoneInfo(DISPLAY_TZ)
        print(f"[INIT] Clocks will render in {DISPLAY_TZ}")
    except Exception as err:
        print(f"[INIT] DISPLAY_TZ={DISPLAY_TZ!r} unusable ({err}); "
              f"falling back to host local time")


def clock_str(ts=None, fmt="%H:%M:%S"):
    """Wall-clock string for the facility, not for the host."""
    if _display_tz is not None:
        return datetime.fromtimestamp(ts if ts is not None else time.time(),
                                      _display_tz).strftime(fmt)
    return time.strftime(fmt, time.localtime(ts) if ts is not None
                         else time.localtime())

# Inference frame size. Capture frames are downscaled to this before pose
# inference. 640×480 is CPU-friendly; 1280×720 is the practical max with a
# CUDA GPU before YOLO-pose-medium starts dropping FPS. See capture_thread()
# for full notes.
INFERENCE_W = int(os.getenv("INFERENCE_W", "640"))
INFERENCE_H = int(os.getenv("INFERENCE_H", "480"))

CLIP_PREROLL_S  = float(os.getenv("CLIP_PREROLL_S",  "10"))
CLIP_POSTROLL_S = float(os.getenv("CLIP_POSTROLL_S", "10"))
CLIP_FPS        = int(  os.getenv("CLIP_FPS",        "10"))
CLIP_COOLDOWN_S = float(os.getenv("CLIP_COOLDOWN_S", "5"))
CLIP_DIR_RAW    =       os.getenv("CLIP_DIR",        "../backend/uploads/clips")

# Resolve CLIP_DIR relative to ai_core/ if it isn't absolute, so the default
# `../backend/uploads/clips` lands in the right place regardless of CWD.
CLIP_DIR = Path(CLIP_DIR_RAW)
if not CLIP_DIR.is_absolute():
    CLIP_DIR = (Path(__file__).parent / CLIP_DIR).resolve()
CLIP_DIR.mkdir(parents=True, exist_ok=True)
print(f"[INIT] Alert clips will be saved to {CLIP_DIR}")

CLIP_S3_BUCKET = os.getenv("CLIP_S3_BUCKET", "").strip()
CLIP_S3_PREFIX = os.getenv("CLIP_S3_PREFIX", "clips/").strip()
if CLIP_S3_PREFIX and not CLIP_S3_PREFIX.endswith("/"):
    CLIP_S3_PREFIX += "/"


def get_s3_client():
    if not CLIP_S3_BUCKET:
        raise RuntimeError("CLIP_S3_BUCKET is not configured")
    if boto3 is None:
        raise RuntimeError("boto3 is not installed. Install with: pip install boto3")
    return boto3.session.Session().client('s3')


def get_s3_clip_url(bucket, key):
    region = os.getenv("AWS_REGION", "").strip()
    escaped_key = quote(key, safe="/")
    if not region:
        return f"s3://{bucket}/{escaped_key}"
    return f"https://{bucket}.s3.{region}.amazonaws.com/{escaped_key}"

# Rolling pre-roll buffer per camera. maxlen is generously sized to absorb
# inference-rate variance — we throttle appends to CLIP_FPS in the inference
# thread so the deque never overflows in steady state, but a brief inference
# burst won't push older pre-roll frames out before send_alert can snapshot.
_PREROLL_MAXLEN = max(8, math.ceil(CLIP_PREROLL_S * CLIP_FPS) + 5)
clip_buffers      = {cam_id: deque(maxlen=_PREROLL_MAXLEN) for cam_id, _ in CAMERAS}
clip_buffer_lock  = threading.Lock()

# ── Clip-worker tracking for graceful shutdown ─────────────────────────────
# Each call to send_alert() spawns a daemon thread that records 10 seconds
# of mp4 and writes it to disk. If the AI core gets killed mid-write the
# file is corrupt. We maintain a registry of in-flight workers so a SIGTERM
# or SIGINT handler can wait for them to finish (up to a hard time budget)
# before exiting.
_clip_workers       = []                # list of (Thread, started_at) tuples
_clip_workers_lock  = threading.Lock()
SHUTDOWN_BUDGET_S   = 10.0              # max seconds to wait on shutdown

# Throttle: cam_id -> next-allowed-append timestamp. Inference thread checks
# this before pushing a frame so the deque grows at ~CLIP_FPS regardless of
# how fast YOLO is running.
_clip_next_append = {cam_id: 0.0 for cam_id, _ in CAMERAS}

# Cooldown: cam_id -> next-allowed-clip timestamp. Prevents a single fall
# (which often triggers fall + lying-down + inactivity within seconds) from
# producing 3 overlapping clips on disk.
_clip_cooldown_until = {cam_id: 0.0 for cam_id, _ in CAMERAS}






# -- Poster frames ------------------------------------------------------------
# Each clip gets a JPEG sibling ("<clip>.jpg") so the dashboard grid can show a
# thumbnail. The alternative -- letting the browser fetch each clip and draw a
# frame to a canvas -- would download every clip in the list just to browse it,
# over the tunnel, and would mint a full playback token for clips nobody opens.
# One small JPEG written here, once, is far cheaper for everyone.
POSTER_MAX_WIDTH = int(os.getenv("CLIP_POSTER_WIDTH", "480"))
POSTER_QUALITY   = int(os.getenv("CLIP_POSTER_QUALITY", "70"))


def poster_path_for(clip_path):
    """Sibling JPEG path for a clip. Keeps the .mp4 in the stem so the two
    names stay obviously paired and one basename maps to the other by suffix
    swap alone -- which is what the backend relies on when signing."""
    return clip_path.with_suffix(".jpg")


def _write_poster(clip_path, frames, pre_roll_len):
    """Write a downscaled JPEG of the detection moment next to the clip.

    Frame choice matters: frame 0 is CLIP_PREROLL_S seconds BEFORE anything
    happened, so a grid of posters would be a wall of empty rooms. The frame at
    the pre-roll boundary is the moment the detector fired, which is the one
    frame that actually shows what the card is about.
    """
    if not frames:
        return False
    idx = min(max(pre_roll_len, 0), len(frames) - 1)
    frame = frames[idx]
    try:
        h, w = frame.shape[:2]
        if w > POSTER_MAX_WIDTH:
            scale = POSTER_MAX_WIDTH / float(w)
            frame = cv2.resize(frame, (POSTER_MAX_WIDTH, max(1, int(h * scale))),
                               interpolation=cv2.INTER_AREA)
        return bool(cv2.imwrite(str(poster_path_for(clip_path)), frame,
                                [cv2.IMWRITE_JPEG_QUALITY, POSTER_QUALITY]))
    except Exception as err:
        # A missing poster is cosmetic -- the card falls back to its gradient.
        # Never let it take down the clip itself.
        print(f"[CLIP] poster failed for {clip_path.name}: {err}")
        return False


# -- Browser-playable encoding ------------------------------------------------
# The pip-installed opencv-python wheel CANNOT write H.264. Its bundled FFmpeg
# exposes only h264_v4l2m2m (a hardware encoder that needs a V4L2 device and
# fails without one), so cv2.VideoWriter falls back to mp4v = MPEG-4 Part 2.
# Chromium ships no MPEG-4 Part 2 decoder, so those files download fine and
# then render as a black box -- which is exactly what the dashboard showed.
#
# Standalone ffmpeg, however, does have libx264. So the clip is written with
# whatever codec OpenCV can manage and then transcoded in place. This runs on
# the clip worker's own daemon thread, after recording is complete, so it never
# blocks capture or inference.
#
# CLIP_TRANSCODE:  "auto" (default) transcode when ffmpeg is available and the
#                  clip is not already H.264; "1" force; "0" disable.
# FFMPEG_BIN:      explicit path, if ffmpeg is not on PATH.
CLIP_TRANSCODE = os.getenv("CLIP_TRANSCODE", "auto").strip().lower()
_ffmpeg_cached = None


def _ffmpeg_path():
    """Resolve ffmpeg once. Returns the path, or None if unavailable."""
    global _ffmpeg_cached
    if _ffmpeg_cached is None:
        import shutil
        _ffmpeg_cached = os.getenv("FFMPEG_BIN", "").strip() or shutil.which("ffmpeg") or ""
    return _ffmpeg_cached or None


def _transcode_to_h264(src_path):
    """Rewrite `src_path` as H.264/yuv420p in place. Returns True on success.

    -pix_fmt yuv420p is not optional: browsers refuse 4:2:2 and 4:4:4 H.264.
    -movflags +faststart moves the moov atom to the front so playback can begin
    before the whole file arrives, which matters over the tunnel.

    On any failure the ORIGINAL file is left untouched. A clip in a codec the
    browser cannot read is still evidence a nurse may need; losing it to a
    failed conversion would be worse than showing the player error.
    """
    import subprocess
    ffmpeg = _ffmpeg_path()
    if not ffmpeg:
        return False

    tmp_path = src_path.with_name(src_path.name + ".h264.tmp.mp4")
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src_path),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-an", str(tmp_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0 or not tmp_path.exists() or tmp_path.stat().st_size == 0:
            err = (result.stderr or b"").decode("utf-8", "replace").strip()[:300]
            print(f"[CLIP] transcode failed for {src_path.name}: {err}")
            tmp_path.unlink(missing_ok=True)
            return False
        os.replace(str(tmp_path), str(src_path))
        return True
    except subprocess.TimeoutExpired:
        print(f"[CLIP] transcode timed out for {src_path.name}")
        tmp_path.unlink(missing_ok=True)
        return False
    except Exception as err:
        print(f"[CLIP] transcode error for {src_path.name}: {err}")
        tmp_path.unlink(missing_ok=True)
        return False


# ── Incident-scoped clips ────────────────────────────────────────────────────
# One incident, one clip, named for the WORST thing that happened during it.
#
# Previously the filename was fixed by the FIRST alert and the file written 5s
# later, so a slow descent saved as "lying_down" even after it escalated to a
# fall 20s on. The recording now stays open while the incident keeps producing
# alerts (each one pushes the deadline out, capped by CLIP_INCIDENT_MAX_S) and
# the name is chosen at write time from the highest-ranked classification seen.
#
# Alerts still fire immediately — only the video file is delayed.
CLIP_INCIDENT_MAX_S = float(os.getenv("CLIP_INCIDENT_MAX_S", "5"))
CLIP_MAX_TOTAL_S = float(os.getenv("CLIP_MAX_TOTAL_S", "10"))

# Hard cap on simultaneous recordings per camera.
#
# Incidents became per-person so two residents get two clips. But ByteTrack
# mints a new id every time an intermittently-visible person reappears, so one
# fall can spawn a dozen ids — and each one opened its own 45s recording,
# every worker JPEG-encoding at CLIP_FPS. Thirty concurrent incidents is 300
# encodes/sec competing with YOLO, which is where the fps drop came from.
#
# Two genuine residents falling together still both get clips; it is the
# churn-generated duplicates beyond that which get dropped.
CLIP_MAX_CONCURRENT = int(os.getenv("CLIP_MAX_CONCURRENT", "3"))

# Hard ceiling on clips written per camera per rolling hour.
#
# CLIP_MAX_CONCURRENT bounds how many recordings run AT ONCE; it does nothing
# about how many are written over time. A detection bug that mints a fresh
# incident every few seconds therefore filled the disk — 80 files from one
# afternoon. This is the backstop that makes storage bounded no matter what
# the detector does upstream.
#
# It never suppresses an ALERT. Nurses still get every notification; only the
# video write is skipped, and loudly, so a hit here reads as "something is
# wrong upstream" rather than failing silently.
# 6/hour, not 20. An unattended overnight run showed 20/hour still permits ~60
# files while nobody is watching, which is both useless as evidence and enough
# to matter in S3. Six an hour is still far more than a real facility produces.
CLIP_MAX_PER_HOUR = int(os.getenv("CLIP_MAX_PER_HOUR", "6"))
# ...and a rolling-day ceiling, because an hourly cap alone still integrates to
# 144 files over a long unattended run.
CLIP_MAX_PER_DAY  = int(os.getenv("CLIP_MAX_PER_DAY", "40"))
_clip_written = {}          # cam_id -> [timestamps of clips started]


def _clip_budget_ok(cam_id, now):
    """True if this camera may start another clip, per hour AND per day."""
    if CLIP_MAX_PER_HOUR <= 0 and CLIP_MAX_PER_DAY <= 0:
        return True
    day = [t for t in _clip_written.get(cam_id, ()) if now - t < 86400]
    _clip_written[cam_id] = day
    hour = [t for t in day if now - t < 3600]
    if CLIP_MAX_PER_HOUR > 0 and len(hour) >= CLIP_MAX_PER_HOUR:
        return False
    if CLIP_MAX_PER_DAY > 0 and len(day) >= CLIP_MAX_PER_DAY:
        return False
    day.append(now)
    return True
_CLIP_LABEL_RANK = {"prolonged_fall": 4, "fall_detected": 3,
                    "lying_down": 2, "inactivity": 1}

# ── Static HUD on saved clips ────────────────────────────────────────────────
# The live HUD reports the WORST STATUS OF THE CURRENT FRAME, which is correct
# for a monitor someone is watching: it has to follow the scene. It is wrong
# for a saved incident clip. Detection of a body on the floor is intermittent,
# so across the frames of one lying-down incident the band reads
#
#     "WORST: LYING DOWN"  -> orange
#     "WORST: NO PERSON"   -> grey     (the detector lost them for a moment)
#     "WORST: NORMAL"      -> green    (a track re-appeared before committing)
#
# and the clip flickers between three colours while showing one continuous
# event. Whoever reviews it sees "normal" stamped over a person on the floor.
#
# So the clip gets its own band, redrawn at write time in the incident's FINAL
# classification — the same label the file is named for. It is resolved once
# the incident closes, which is exactly why this cannot be done while the
# frames are being captured: the pre-roll is recorded before the event is
# even classified, and a lying-down can still escalate to a fall afterwards.
# The per-frame wall clock is preserved so the clip stays reviewable.
# Set CLIP_STATIC_HUD=0 to keep the live band in saved clips.
CLIP_STATIC_HUD = os.getenv("CLIP_STATIC_HUD", "1") == "1"

# ── Isolate the incident subject in saved clips ──────────────────────────────
# The live view must show everyone — an operator watching a monitor needs the
# whole room. A saved clip is the opposite: it is evidence about ONE person,
# and in a lounge with eight residents the subject was lost in a thicket of
# boxes and skeletons belonging to people who had nothing to do with it.
#
# So the clip is repainted at write time with only the incident's own track,
# over an otherwise clean frame. Everyone else is still VISIBLE — they are in
# the video — they simply carry no overlay.
#
# This is why the pre-roll buffer holds the clean frame plus the per-track
# records rather than the finished annotated frame: at capture time we do not
# yet know which person the incident will turn out to be about, and the
# pre-roll is recorded before the event is even classified.
#
# Track IDs are resolved through _clip_alias, so a ByteTrack ID switch part-way
# through an incident still follows the same body instead of losing the
# overlay halfway through the clip.
# Set CLIP_ISOLATE_SUBJECT=0 to go back to showing every person's overlay.
CLIP_ISOLATE_SUBJECT = os.getenv("CLIP_ISOLATE_SUBJECT", "1") == "1"
_CLIP_LABEL_STATUS = {
    "prolonged_fall": "PROLONGED FALL",
    "fall_detected":  "FALL DETECTED",
    "lying_down":     "LYING DOWN",
    "inactivity":     "INACTIVE",
    "agitation":      "AGITATION_RISK",
}
# Keyed by (cam_id, track_id), NOT by camera. Keying on the camera merged two
# different people into one incident: a lying-down for ID 12 and a fall for
# ID 55 became a single clip named for the worse of the two, and one of the
# events vanished entirely. One person, one incident, one clip.
_clip_incidents      = {}     # (cam_id, track_id) -> incident dict
_clip_incident_lock  = threading.Lock()
# (cam_id, track_id) -> last time THAT track was FALLEN. The recording stays
# open while this keeps updating, so the clip spans the whole time the person
# is down rather than closing in the gaps between alerts. The persistence path
# holds FALLEN even with no detection, so an unseen person keeps it alive too.
_clip_fallen_seen    = {}


# Track-ID aliases created by re-association. When ByteTrack renames a person
# mid-incident, the alert path must keep writing into the ORIGINAL incident
# rather than opening a second recording of the same fall. The running clip
# worker already holds its key as a local, so we redirect lookups instead of
# rewriting the dicts underneath it.
_clip_alias = {}     # (cam_id, new_tid) -> (cam_id, original_tid)


def _canonical_clip_key(cam_id, track_id):
    key = (cam_id, track_id)
    for _ in range(8):          # bounded: alias chains cannot loop forever
        nxt = _clip_alias.get(key)
        if nxt is None or nxt == key:
            break
        key = nxt
    return key


def alias_clip_track(cam_id, old_tid, new_tid):
    """Point (cam, new_tid) at whatever incident (cam, old_tid) belongs to."""
    canon = _canonical_clip_key(cam_id, old_tid)
    if canon != (cam_id, new_tid):
        _clip_alias[(cam_id, new_tid)] = canon


def note_fallen(cam_id, track_id, now):
    with _clip_incident_lock:
        _clip_fallen_seen[_canonical_clip_key(cam_id, track_id)] = now


def _clip_label_rank(label):
    return _CLIP_LABEL_RANK.get(label, 0)


def _jpg(frame):
    """Buffer frames JPEG-encoded. A 45s incident at CLIP_FPS would be ~460MB
    raw at 720x480; encoded it is ~20MB, which matters on a box already
    running YOLO."""
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return buf.tobytes() if ok else None


def _record_alert_clip(cam_id, key, inc):
    """Worker (daemon thread): record until the incident stops extending,
    then write one mp4 named for the worst classification it reached.

    Snapshots the rolling pre-roll buffer immediately so we don't lose pre-
    incident context. On finish, emits `cctv_alert_clip` so the backend can
    stamp clipPath onto the matching Incident document.
    """
    alert_payload = inc["payload"]

    # 1) Snapshot pre-roll IMMEDIATELY. The inference thread keeps appending
    #    during our wait, but the snapshot we hold is frozen.
    # (capture_time, jpeg) — the timestamp is carried through so the static
    # band can keep each frame's real wall clock when it repaints the bar.
    with clip_buffer_lock:
        pre_roll = [(ts, _jpg(f), recs) for ts, f, recs in clip_buffers[cam_id]]

    # 2) Sample cam_frames at fixed cadence until the incident closes. Each
    #    new alert for this camera pushes `end_at` later, up to the cap.
    post_roll = []
    sample_dt = 1.0 / max(1, CLIP_FPS)
    next_t    = time.time()
    while True:
        with _clip_incident_lock:
            # Keep recording while the person is still down, capped so a
            # permanently-held FALLEN track can't record forever.
            fallen_at = _clip_fallen_seen.get(key, 0.0)
            deadline = min(max(inc["end_at"], fallen_at + CLIP_POSTROLL_S),
                           inc["opened"] + CLIP_INCIDENT_MAX_S)
        if time.time() >= deadline or _shutting_down:
            break
        sleep_for = next_t - time.time()
        if sleep_for > 0:
            time.sleep(sleep_for)
        with lock:
            snap = cam_clean.get(cam_id)
            if snap is not None:
                _cf, _recs = snap
                post_roll.append((time.time(), _jpg(_cf), _recs))
        next_t += sample_dt

    # 3) Incident is over — resolve the filename from the worst label reached.
    with _clip_incident_lock:
        label = inc["label"]
        inc["done"] = True
        if _clip_incidents.get(key) is inc:
            _clip_incidents.pop(key, None)
        _clip_fallen_seen.pop(key, None)
    clip_path = CLIP_DIR / (f"{inc['cam']}_{label}_{inc['ts']}_{inc['key']}.mp4")

    # Decode, then stamp the incident's FINAL classification over the live
    # band so the whole clip carries one colour instead of following the
    # detector's frame-by-frame opinion. See CLIP_STATIC_HUD.
    status_label = _CLIP_LABEL_STATUS.get(label, label.replace("_", " ").upper())
    bar_color    = status_color(status_label)
    all_frames = []
    painted = 0
    for ts, b, recs in (pre_roll + post_roll):
        if b is None:
            continue
        frm = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
        if frm is None:
            continue
        # Repaint the overlay for THIS incident's person only. Resolving each
        # record through _canonical_clip_key means a track that was renamed
        # mid-incident still matches, so the overlay does not vanish partway
        # through the clip when ByteTrack re-numbers the subject.
        for rec in (recs or ()):
            if CLIP_ISOLATE_SUBJECT and \
                    _canonical_clip_key(cam_id, rec["tid"]) != key:
                continue
            rx1, ry1, rx2, ry2 = rec["box"]
            rcolor = status_color(rec["status"])
            rprio  = _priority(rec["status"])
            r_box, r_bone, r_joint, r_font = overlay_weights(
                ry2 - ry1, frm.shape[0], rprio)
            cv2.rectangle(frm, (rx1, ry1), (rx2, ry2), rcolor, r_box)
            cv2.putText(frm, f"ID {rec['tid']}", (rx1, ry2 + 14),
                        cv2.FONT_HERSHEY_SIMPLEX, r_font, rcolor, 1)
            if rec.get("kpts") is not None:
                draw_pose_overlay(frm, rec["kpts"], color=rcolor,
                                  bone_t=r_bone, joint_r=r_joint)
            painted += 1
        if CLIP_STATIC_HUD:
            draw_status_bar(frm, cam_id, f"INCIDENT: {status_label}", bar_color,
                            clock=clock_str(ts))
        all_frames.append(frm)
    if not all_frames:
        print(f"[CLIP] {cam_id}: no frames captured, skipping save")
        return

    # 3) Encode.
    #
    # The codec matters more than it looks. This used to be hardcoded to "mp4v"
    # (MPEG-4 Part 2) with a comment claiming broad <video> compatibility --
    # that is wrong. Chromium ships no MPEG-4 Part 2 decoder, so every clip
    # played back as a black box in Chrome, Edge and VS Code's own preview.
    # H.264 ("avc1") is what browsers actually decode.
    #
    # Some OpenCV builds ship without an H.264 encoder for licensing reasons,
    # so try in order of preference and fall back rather than failing outright:
    # a clip in a codec the browser cannot read still beats no clip at all, and
    # the warning below says exactly what to fix. Override with CLIP_FOURCC.
    h, w = all_frames[0].shape[:2]
    preferred = os.getenv("CLIP_FOURCC", "").strip()
    candidates = ([preferred] if preferred else []) + ["avc1", "H264", "mp4v"]

    writer = None
    used_fourcc = None
    for code in candidates:
        candidate = cv2.VideoWriter(
            str(clip_path), cv2.VideoWriter_fourcc(*code),
            float(CLIP_FPS), (w, h)
        )
        if candidate.isOpened():
            writer, used_fourcc = candidate, code
            break
        candidate.release()

    if writer is None:
        print(f"[CLIP] {cam_id}: no usable codec (tried {candidates}) "
              f"at {clip_path}")
        return

    if used_fourcc == "mp4v":
        print(f"[CLIP] {cam_id}: WARNING encoded with mp4v -- this OpenCV build "
              f"has no H.264 encoder, so browsers will NOT play this clip. "
              f"Install a build with avc1 support (e.g. system ffmpeg + "
              f"opencv-python built against it) or transcode on write.")
    else:
        print(f"[CLIP] {cam_id}: encoding with {used_fourcc}")
    for frame in all_frames:
        writer.write(frame)
    writer.release()

    # Make the file playable in a browser. See _transcode_to_h264 above: this is
    # the step that actually fixes playback, because OpenCV almost certainly
    # just wrote mp4v regardless of what was requested.
    already_h264 = used_fourcc in ("avc1", "H264", "h264")
    want_transcode = (
        CLIP_TRANSCODE == "1"
        or (CLIP_TRANSCODE == "auto" and not already_h264)
    )
    if want_transcode:
        if _ffmpeg_path():
            if _transcode_to_h264(clip_path):
                print(f"[CLIP] {cam_id}: transcoded {clip_path.name} to H.264")
            else:
                print(f"[CLIP] {cam_id}: WARNING left as {used_fourcc}; browsers "
                      f"will not play {clip_path.name}")
        else:
            print(f"[CLIP] {cam_id}: WARNING ffmpeg not found, so {clip_path.name} "
                  f"stays {used_fourcc} and will NOT play in a browser. "
                  f"Install ffmpeg (apt install ffmpeg) or set FFMPEG_BIN.")

    # Thumbnail for the dashboard grid. Uses the pre-transcode frame list still
    # in memory, so it costs one JPEG encode and no extra decode.
    if _write_poster(clip_path, all_frames, len(pre_roll)):
        print(f"[CLIP] {cam_id}: wrote poster {poster_path_for(clip_path).name}")

    s3_path = None
    if CLIP_S3_BUCKET:
        s3_key = f"{CLIP_S3_PREFIX}{clip_path.name}" if CLIP_S3_PREFIX else clip_path.name
        try:
            client = get_s3_client()
            client.upload_file(str(clip_path), CLIP_S3_BUCKET, s3_key)
            s3_path = get_s3_clip_url(CLIP_S3_BUCKET, s3_key)
            print(f"[CLIP] {cam_id}: uploaded clip to {s3_path}")
        except Exception as err:
            print(f"[CLIP] {cam_id}: failed to upload clip to S3: {err}")

    # 4) Tell the backend the clip is ready so it can update the Incident.
    # clipPath must identify the file on THIS machine, because /clips above is
    # what actually serves it. It used to prefer the S3 URL whenever
    # CLIP_S3_BUCKET was set, which made playback depend on the bucket being
    # publicly readable -- i.e. resident CCTV footage reachable by anyone with
    # the URL. The S3 upload stays available as an offsite backup, but it no
    # longer decides what the dashboard plays.
    _ = s3_path
    rel_path = f"clips/{clip_path.name}"
    print(f"[CLIP] {cam_id}: saved {clip_path.name} ({len(all_frames)} frames, "
          f"{len(pre_roll)} pre / {len(post_roll)} post) -> {rel_path}")
    if sio.connected:
        sio.emit("cctv_alert_clip", {
            "location":  cam_id,
            "clipPath":  rel_path,
            "alertKey":  alert_payload.get("alertKey"),
            "timestamp": alert_payload.get("timestamp"),
        })


def _maybe_buffer_frame(cam_id, frame, records=None):
    """Throttled append into the pre-roll deque. Called by the inference thread
    once per published frame.

    `frame` is the CLEAN frame (no boxes, no skeletons) and `records` is what
    was detected in it — see CLIP_ISOLATE_SUBJECT. The live stream keeps its
    own fully-annotated copy in cam_frames; this pair exists so the clip worker
    can repaint each frame with only the person the incident is about.
    """
    now = time.time()
    if now < _clip_next_append[cam_id]:
        return
    _clip_next_append[cam_id] = now + (1.0 / max(1, CLIP_FPS))
    with clip_buffer_lock:
        clip_buffers[cam_id].append((now, frame, records or ()))

# ─────────────────────────────────────────────────────────────────────────────
# Pose Model — yolo11m-pose
# ─────────────────────────────────────────────────────────────────────────────
# We use Ultralytics' YOLOv11 pose model (medium variant). YOLOv11 is the
# current state-of-the-art from Ultralytics (released Sept 2024) — drop-in
# API compatible with YOLOv8, ~5–10% better keypoint accuracy at similar
# inference speed. The medium size class trades inference time for materially
# better keypoint precision on partially-occluded and distance-shot subjects,
# both of which are common in CCTV footage.
#
# IMPORTANT: we deliberately do NOT load a global model here. Each
# process_camera_thread loads its OWN track_model instance because Ultralytics
# carries tracker state on the model object — a shared global would
# cross-contaminate IDs between cameras (House of Charbel person becoming
# House of Gabriel person). See process_camera_thread for the per-thread load.
POSE_MODEL_PATH = os.getenv("POSE_MODEL_PATH", "yolo11m-pose.pt")

# Detection confidence floor, applied BEFORE the tracker sees anything.
# bytetrack.yaml already accepts detections down to track_low_thresh 0.1, but
# this gate discards them first, so the tracker never gets the chance. A person
# lying on the floor commonly scores 0.15-0.30 where the same person standing
# scores 0.85 — at 0.25 they simply cease to exist. Set DET_CONF=0.25 in .env
# to restore the previous behaviour.
DET_CONF = float(os.getenv("DET_CONF", "0.10"))

# Minimum confident keypoints for a detection to count as a person. The low
# DET_CONF above is needed to see a body on the floor, but it also admits
# boxes on furniture and shadows, and a stationary ghost will eventually fire
# an inactivity alert. Five of seventeen is lenient — a heavily occluded
# person still clears it, a hallucinated box generally does not.
MIN_CONFIDENT_KPTS = int(os.getenv("MIN_CONFIDENT_KPTS", "5"))

# Anatomical plausibility. MIN_CONFIDENT_KPTS asks "are there enough points?";
# this asks "do those points describe a body?". Five weak keypoints scattered
# across an armchair clear the first test and fail this one. See
# pose_is_plausible() for the measurements behind 0.6.
POSE_PLAUSIBILITY_ON  = os.getenv("POSE_PLAUSIBILITY", "1") == "1"
POSE_MIN_TORSO_RATIO  = float(os.getenv("POSE_MIN_TORSO_RATIO", "0.6"))

# Tracker config. Stock bytetrack.yaml has new_track_thresh 0.25, which is
# ABOVE the DET_CONF floor above — so a weak detection reaches the tracker but
# is refused a track ID, and line ~1733 then discards it. bytetrack_fall.yaml
# lowers that to match. Set TRACKER_CFG=bytetrack.yaml to use the stock file.
TRACKER_CFG = os.getenv("TRACKER_CFG", os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bytetrack_fall.yaml"))

print(f"[INIT] Pose model configured: {POSE_MODEL_PATH}")
print(f"[INIT]   (per-camera instances loaded inside each inference thread)")


# ─────────────────────────────────────────────────────────────────────────────
# Graceful shutdown — wait for in-flight clip writes before exiting
# ─────────────────────────────────────────────────────────────────────────────
# Without this, a Ctrl+C (SIGINT) or `kill` (SIGTERM) interrupts whatever clip
# worker thread is currently encoding mp4 frames, leaving a truncated /
# corrupt file on disk. We catch the signal, log a notice, and join() each
# active worker up to a hard total budget (SHUTDOWN_BUDGET_S seconds). After
# that window we exit even if some clips are still encoding — the budget
# prevents a stuck worker from blocking shutdown indefinitely.
_shutting_down = False

def _graceful_shutdown(signum, frame):
    global _shutting_down
    if _shutting_down:
        # Second Ctrl+C — fall through to default behaviour (immediate exit).
        print("[SHUTDOWN] Second signal received — exiting immediately.")
        sys.exit(1)
    _shutting_down = True

    sig_name = signal.Signals(signum).name if hasattr(signal, "Signals") else str(signum)
    print(f"\n[SHUTDOWN] {sig_name} received — waiting up to "
          f"{SHUTDOWN_BUDGET_S:.0f}s for in-flight clip encodes to finish...")

    deadline = time.time() + SHUTDOWN_BUDGET_S
    with _clip_workers_lock:
        # Snapshot the workers list so we don't hold the lock while joining.
        # (Joining a thread can take seconds; the lock should not be held
        # that long since other threads may need to append to the list.)
        pending = [(t, started) for (t, started) in _clip_workers if t.is_alive()]

    print(f"[SHUTDOWN] {len(pending)} clip worker(s) still running.")
    for t, started in pending:
        remaining = max(0.0, deadline - time.time())
        if remaining <= 0:
            print(f"[SHUTDOWN] Budget exhausted; abandoning worker "
                  f"started {time.time() - started:.1f}s ago.")
            continue
        t.join(timeout=remaining)
        if t.is_alive():
            print(f"[SHUTDOWN] Worker did not finish within budget; clip may be truncated.")
        else:
            print(f"[SHUTDOWN] Clip worker finished cleanly.")

    print("[SHUTDOWN] Exiting.")
    sys.exit(0)


# Register on both signals so it works for `kill <pid>` (SIGTERM, e.g. from
# systemd or Docker stop) and for Ctrl+C in an interactive terminal (SIGINT).
# Windows only fully supports SIGINT — SIGTERM is acceptable but Windows uses
# different mechanisms for service stop. The handler is installed unconditionally
# because signal.signal() is a no-op on platforms where the signal isn't supported.
try:
    signal.signal(signal.SIGINT, _graceful_shutdown)
    signal.signal(signal.SIGTERM, _graceful_shutdown)
    print("[INIT] Graceful shutdown handlers installed (SIGINT/SIGTERM)")
except (ValueError, AttributeError) as e:
    # ValueError fires when signal.signal() is called outside the main thread.
    # AttributeError can fire on platforms without SIGTERM.
    print(f"[INIT] Warning: could not install signal handlers ({e})")

# ─────────────────────────────────────────────────────────────────────────────
# Agitation detection — body-pose only
# ─────────────────────────────────────────────────────────────────────────────
# We previously prototyped face-based agitation scoring with MediaPipe
# FaceLandmarker but removed it because face crops below ~80px tall produced
# noisy blendshape values that triggered false alerts on still subjects with
# focused expressions. Current agitation scoring (BodyAgitationScorer below)
# uses pure pose geometry — hands-on-head, bilateral arm raises, bilateral
# wrist oscillation — which is robust at typical CCTV distances.

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — tune these without touching logic
# ─────────────────────────────────────────────────────────────────────────────

# Module C — Fall Detection
# Lowered from 0.45 → 0.35 to allow fall detection when hip keypoints are
# partially occluded (common for crouching/fallen poses on overhead cameras).
# The angle + aspect dual-condition gates still prevent junk keypoints from
# firing false alerts.
POSE_CONF_THRESHOLD      = 0.45
FALL_ANGLE_THRESHOLD        = 65.0   # torso degrees from vertical → LYING
STUMBLE_ANGLE_THRESHOLD     = 60.0   # torso degrees → transitional / at-risk (raised to avoid bending false positives)
FALL_HEIGHT_RATIO_THRESHOLD = 0.50  # raised from 0.65 — catch overhead falls where bbox shrinks less
# Path B's own comment says the aspect gate exists to stop "a person walking
# away from the camera gets smaller but stays upright" from firing this path,
# and names 1.2 as the value. The code used 1.5. On fall3_slow.mp4 a standing
# man across the room measured aspect 1.40 — inside the 1.5 gate, outside the
# 1.2 one — and was classified FALLEN. Restoring the documented number.
FALL_PATH_B_ASPECT_MAX      = float(os.getenv("FALL_PATH_B_ASPECT_MAX", "1.2"))
# Gate on body_extent_ratio(): Path B may only fire when the skeleton agrees
# the body is compressed. Measured on fall3_slow.mp4 — lying 1.32-1.70,
# upright 3.31-3.60 — so 2.5 sits in the empty middle with margin on both
# sides. Unmeasurable torso => the gate abstains and Path B behaves as before;
# a missing measurement must never suppress a fall.
FALL_EXTENT_MAX             = float(os.getenv("FALL_EXTENT_MAX", "2.5"))
FALL_FRAMES_REQUIRED        = 3      # consecutive frames before fall alert fires (~0.3s at inference FPS)
STUMBLE_FRAMES_REQUIRED     = 4      # higher than fall — stumble is noisier, needs more confirmation
FALL_ALERT_COOLDOWN_S       = 15.0  # seconds before same alert can repeat

# Module D — Behavioral Monitoring
# ── Switch between TEST and PRODUCTION values here ────────────────────────────
# TEST mode: fast response, low thresholds — use while verifying detection works
# PRODUCTION mode: conservative, sustained — use for real deployment
# Env-driven now, defaulting to PRODUCTION. These were hardcoded True with a
# "set False before deployment" comment, and were still True while running live
# at the facility — a 10s inactivity threshold on real residents.
BEHAVIOR_TEST_MODE       = os.getenv("BEHAVIOR_TEST_MODE", "0") == "1"

if BEHAVIOR_TEST_MODE:
    BEHAVIOR_WINDOW_S        = 10     # rolling window for display score
    AGITATION_THRESHOLD      = 0.25   # per-frame score must exceed this
    BEHAVIOR_MIN_SUSTAINED_S = 8.0    # must stay above threshold for 8s continuously
    BEHAVIOR_COOLDOWN_S      = 30.0   # 30s before same alert repeats
else:
    BEHAVIOR_WINDOW_S        = 30
    AGITATION_THRESHOLD      = 0.25
    BEHAVIOR_MIN_SUSTAINED_S = 20.0   # change to 20.0 before demo
    BEHAVIOR_COOLDOWN_S      = 300.0

# ── Logging ────────────────────────────────────────────────────────────────
# When False, only [ALERT], [INIT], [READY], and [INFER ...] startup lines
# print. All per-frame and per-event diagnostic chatter ([MOVE], [FALL SM],
# [BODY AGI]) is silenced. Flip True while debugging detection logic.
VERBOSE_LOGS             = False

# Module E — Movement
INACTIVITY_VEL_MAX       = 0.015  # normalized velocity below this = stationary
MOVEMENT_COOLDOWN_S      = 60.0

# Module F (Pacing) was REMOVED. It counted a direction reversal from three
# consecutive bbox centroids, and that test is scale-blind: a stationary person
# whose box rattled between two points produced a 180-degree turn every frame,
# so a motionless resident alerted as pacing. Fixing it needs a real-world
# distance measure (leg length and duration), which does not exist in this
# uncalibrated view. Nothing else reads it; the backend's ^PACING branch and the
# frontend's Pacing filter simply never receive anything now.

# ── Agitation / Inactivity disambiguation ─────────────────────────────────
# Number of seconds a person must have been stationary (vel below
# INACTIVITY_VEL_MAX) before AGITATION_RISK alerts are suppressed for that
# track. Real agitation involves body motion — a resident sitting perfectly
# still is, by definition, not agitated. Without this gate, MediaPipe brow
# noise and YOLO keypoint flicker on a still subject can fire spurious
# AGITATION_RISK alerts during inactivity. Gate is applied at the call site
# in process_camera_thread; the scorers themselves are untouched.
AGITATION_MOTION_GATE_S  = 2.5

# Torso-angle band (degrees from vertical) that flags a stationary person as
# being in a *concerning posture*. Below this they're sitting upright fine.
# At/above FALL_ANGLE_THRESHOLD (65°) the FallStateMachine takes over and we
# leave that band alone. So this catches the gap: slumped forward, head down
# on a table, slowly drowsing into an unsafe position — "weird position"
# inactivity that's distinct from a clean fall.
INACTIVITY_POSTURE_ANGLE = 40.0

# Standing-upright gate: if bbox aspect ratio exceeds this AND torso angle is
# below INACTIVITY_STANDING_ANGLE_MAX the person is standing normally.
# Standing still is routine behavior (watching TV, talking) and must NOT
# trigger an inactivity alert. Only sitting/crouching/slumped postures are
# clinically meaningful inactivity for this system.
INACTIVITY_STANDING_ASPECT_MIN = 1.5   # bbox h/w above this → tall, upright body
INACTIVITY_STANDING_ANGLE_MAX  = 30.0  # torso degrees from vertical → upright range

# ── TEST vs PRODUCTION movement thresholds ────────────────────────────────────
# Same pattern as BEHAVIOR_TEST_MODE.
# TEST: short window → stand still ~10s and you'll see INACTIVE.
# PROD: real values for deployment — flip this back BEFORE the demo.
MOVEMENT_TEST_MODE       = os.getenv("MOVEMENT_TEST_MODE", "0") == "1"

if MOVEMENT_TEST_MODE:
    INACTIVITY_THRESHOLD_S   = 10     # seconds stationary → alert
    MOVEMENT_DEBUG_EVERY_S   = 2.0    # print tracker diagnostics this often
else:
    # Raised from 60s to 5 minutes (300s) for deployment. One minute of
    # immobility is too short — false-fires on a resident reading quietly,
    # watching a TV scene, or napping briefly. Five minutes balances "long
    # enough to filter normal still-but-fine behaviour" against "short enough
    # to catch a real loss of consciousness or fall-without-collapse event."
    INACTIVITY_THRESHOLD_S   = 1200
    MOVEMENT_DEBUG_EVERY_S   = 0.0    # silent in production

# ── Fall rate threshold ───────────────────────────────────────────────────────
# Peak angular velocity (deg/sec) above which a torso transition is treated as
# a genuine fall rather than an intentional lie-down.
#   Fast fall  (~0.7 s for 75°)     → ~107°/s  (well above)
#   Slumping fall (~1.5 s for 75°)  → ~50°/s   (above 45)
#   Intentional lie-down (~4 s)     → ~19°/s   (well below)
FALL_RATE_THRESHOLD      = 45.0
FALL_RATE_WINDOW_S       = 2.5    # lookback for peak rise (long enough at 3 fps)

# ── Angle history is bounded by TIME, not frame count ────────────────────────
# THE LATENT BUG THIS FIXES: `_angle_history` was `deque(maxlen=60)` — sixty
# SAMPLES — while every consumer treats it as a time window:
#
#   _get_angle_rate(window_s=2.5)  filters by timestamp, then measures the rise
#   _never_seen_upright()          asks "was this person ever upright?"
#
# Sixty samples is ~10-20 s at the 3-8 fps the comment assumed, but the length
# in SECONDS is whatever the inference rate happens to be:
#
#     3 fps  -> 20 s of history      (as designed)
#     25 fps -> 2.4 s                (rate window silently truncated)
#     120 fps-> 0.5 s                (rate window is a fifth of its setting)
#
# Two consequences, both observed on fall1_slow.mp4:
#   * `_get_angle_rate` anchors on the minimum angle in the last 2.5 s. When
#     only 0.5 s of history exists, the anchor is a much larger angle and dt is
#     much smaller, so the computed rate INFLATES — a controlled sit-down
#     measured 28 deg/s at 8 fps and 76 deg/s over the same footage at 120 fps.
#     That is the difference between "LYING DOWN" and "FALL DETECTED (HIGH
#     CONFIDENCE)", produced purely by how fast the host machine runs.
#   * `_never_seen_upright()` forgets a person was standing after two seconds
#     on a fast host, which routes ordinary events into the unwitnessed path.
#
# So the same recording classifies differently on a GPU box than on a CPU box.
# Bounding by time makes the behaviour a property of the footage instead.
ANGLE_HISTORY_S       = float(os.getenv("ANGLE_HISTORY_S", "30"))
# Hard memory cap only — the time prune is what actually bounds the window.
# 1200 samples covers 30 s at 40 fps; beyond that the oldest entries drop.
ANGLE_HISTORY_MAXLEN  = int(os.getenv("ANGLE_HISTORY_MAXLEN", "1200"))

# ── Unwitnessed-fall gate ────────────────────────────────────────────────────
# `_never_seen_upright()` promotes "this track has no record of standing" into
# an immediate EMERGENCY. That is right for a resident found on the floor after
# a detection gap, and wrong for a track that is two frames old — and a
# two-frame-old track is precisely what a ByteTrack ID switch produces. One
# person on the floor churning through ids 7 / 19 / 20 fired three separate
# emergencies, which is the redundancy in the logs.
#
# Track re-association (see REASSOC_* below) is the real fix; this is the
# backstop. A track must have existed this long, and supplied this many pose
# frames, before it may raise an unwitnessed fall on the spot. Below the gate
# the fall is not discarded — it is routed through the lying-confirm timer and
# still fires as an EMERGENCY FALL once sustained, just LYING_CONFIRM_SECONDS
# later. Severity is preserved; only the trigger-happiness is removed.
UNWITNESSED_MIN_AGE_S  = float(os.getenv("UNWITNESSED_MIN_AGE_S", "1.5"))
UNWITNESSED_MIN_FRAMES = int(os.getenv("UNWITNESSED_MIN_FRAMES", "5"))

# ── Displacement gate on the fast-fall path ──────────────────────────────────
# THE DEFECT THIS FIXES: `_get_angle_rate()` measures how fast the ESTIMATE
# changed, not how fast the BODY moved. Those are the same thing only while
# the pose estimate is stable. They come apart in exactly the situations that
# matter here:
#
#   * keypoint flicker on an ambiguous horizontal body — YOLO alternates
#     between two plausible skeletons and the torso angle swings 60 degrees
#     between consecutive frames with nobody moving at all;
#   * a person who was ALREADY reclined, held at NORMAL by the seated or
#     furniture guard, and then reclassified — the angle "rises" the instant
#     the guard releases;
#   * a track that picks the person up mid-pose after a detection gap.
#
# In all three the computed rate is enormous (100-200 deg/s) and the code
# reads that as a violent collapse. A stationary person becomes an EMERGENCY.
#
# The discriminator: a real fall MOVES THE BODY. The centre of mass drops and
# the bounding box collapses. A re-classification does neither. So before the
# fast path may fire, require corroborating displacement over the same window
# the rate was measured on — measured in units of the person's own standing
# height, so it needs no calibration.
#
# FAIL OPEN, deliberately: when there is not enough history to measure
# displacement, the gate ABSTAINS and the fall is allowed through. A missing
# measurement must never silence a real emergency — the gate exists to reject
# positive evidence of "nothing moved", not to demand proof of motion.
FALL_MOTION_GATE_ON   = os.getenv("FALL_MOTION_GATE", "1") == "1"
# Fraction of standing height the body centre must drop.
FALL_MIN_DESCENT      = float(os.getenv("FALL_MIN_DESCENT", "0.15"))
# ...or the fraction of standing height the bbox must lose. Either satisfies
# the gate: a fall directly toward the camera barely moves the centroid but
# collapses the box, and a fall across the view does the opposite.
FALL_MIN_HEIGHT_DROP  = float(os.getenv("FALL_MIN_HEIGHT_DROP", "0.20"))
FALL_MOTION_DEBUG     = os.getenv("FALL_MOTION_DEBUG", "0") == "1"

# ── Track re-association across ID switches ──────────────────────────────────
# When a person changes shape drastically — which is exactly what falling is —
# ByteTrack frequently retires the track and mints a new id. Every downstream
# state machine is keyed by that id, so the new id starts with: no angle
# history (→ spurious "UNWITNESSED"), no standing-height reference (→ Path B
# recalibrates against the fallen bbox), and fresh cooldowns (→ the alert
# repeats). Meanwhile the abandoned id keeps ticking under PERSIST_FALLEN and
# emits its own "NO LONGER VISIBLE" alert for the same person.
#
# So: when an unseen id disappears and a new id appears overlapping its last
# known box within REASSOC_MAX_GAP_S, treat it as the same person and move the
# state across. IoU is enough here — we are matching a box to the box it was
# occupying a moment ago, not re-identifying across a room.
REASSOC_ON          = os.getenv("REASSOC", "1") == "1"
REASSOC_MAX_GAP_S   = float(os.getenv("REASSOC_MAX_GAP_S", "3.0"))
REASSOC_MIN_IOU     = float(os.getenv("REASSOC_MIN_IOU", "0.35"))
REASSOC_DEBUG       = os.getenv("REASSOC_DEBUG", "0") == "1"

# ── Camera-level duplicate suppression ───────────────────────────────────────
# Belt and braces behind re-association. Two fall-family alerts describing the
# same patch of floor within this window are the same event, whatever the
# tracker thinks. Escalation is still allowed through: a LYING DOWN followed by
# a real FALL in the same spot is an upgrade, not a duplicate, so the higher
# rank always passes and re-arms the window.
FALL_DEDUP_ON     = os.getenv("FALL_DEDUP", "1") == "1"
# 25s was sized against the old 60s prolonged-fall metronome and is far too
# short now: the escalation ladder spans minutes, so a re-numbered track in the
# same spot slipped past the window and started its own ladder. 180s covers the
# first two rungs. Escalation still passes — a higher rank always goes through
# and re-arms the window — so a lying-down that becomes a real fall is never
# swallowed; only a same-or-lower rank repeat of the same patch of floor is.
FALL_DEDUP_S      = float(os.getenv("FALL_DEDUP_S", "180"))
FALL_DEDUP_MIN_IOU = float(os.getenv("FALL_DEDUP_MIN_IOU", "0.25"))

# ── Lying-down confirmation ──────────────────────────────────────────────────
# When the FallStateMachine classifies a transition to FALLEN as slow/controlled
# (angle_rate < FALL_RATE_THRESHOLD), we DO NOT alert immediately. Instead we
# require the person to remain in the FALLEN state for this many seconds before
# emitting "LYING DOWN DETECTED". Rationale:
#   • Avoids alerting on someone briefly bending to pick something up that the
#     geometric classifier momentarily reads as fallen.
#   • Avoids alerting when a slow lie-down was actually a transient pose that
#     resolved (sat back up, leaned back upright).
#   • Genuine intentional lie-down on a bed/couch/floor easily exceeds 3 s,
#     so the alert still reaches nurses for "resident lying on hallway floor"
#     scenarios — just with 3 s of confirmation rather than instant firing.
# Fast falls (angle_rate >= FALL_RATE_THRESHOLD) bypass this timer entirely;
# emergencies must alert as fast as the FALL_FRAMES_REQUIRED window allows.
# 10s, not 3s. Three seconds is shorter than picking something up off the floor,
# shorter than tying a shoe, shorter than wiping a spill — and a bend that
# outlasts the window gets relabelled LYING DOWN. standing_bend() catches most
# of those now, but it fails open whenever the legs are not visible, and this is
# the cheap second line behind it. A resident who has genuinely gone down stays
# down far longer than this, and a FAST fall skips the timer completely (see
# _evaluate_alert), so nothing about an emergency is slowed by raising it.
LYING_CONFIRM_SECONDS    = float(os.getenv("LYING_CONFIRM_SECONDS", "10.0"))

# ── Prolonged-fall re-alerting ───────────────────────────────────────────────
# A person still on the floor after ten minutes IS worse news than one who has
# been down for one, so this must keep escalating — going silent would be the
# dangerous choice. But it used to re-fire on a fixed 60-second metronome with
# no cap, which produced this, observed live:
#
#     10:39:55  [ID 2133] PROLONGED FALL (30s)
#     10:47:56  [ID 2133] PROLONGED FALL (510s)
#     10:48:56  [ID 2133] PROLONGED FALL (570s)
#     10:49:56  [ID 2133] PROLONGED FALL (630s)
#
# Eleven notifications about one event, each carrying no information the
# previous one lacked. That is alarm fatigue, and alarm fatigue is itself a
# safety failure: a nurse who has learned to swipe these away is not reading
# the one that matters.
#
# So it now escalates on MILESTONES instead of a timer. Each alert marks a
# genuinely different clinical situation — a minute down, five minutes down,
# half an hour down — and there are six of them in the first hour rather than
# sixty. The HUD still shows the live counter continuously; only the
# NOTIFICATIONS are thinned.
#
# Set PROLONGED_FALL_MAX_ALERTS=1 to notify once and never repeat.
PROLONGED_FALL_AFTER_S = float(os.getenv("PROLONGED_FALL_AFTER_S", "30"))
PROLONGED_FALL_STEPS_S = tuple(
    float(s) for s in os.getenv(
        "PROLONGED_FALL_STEPS_S", "120,300,900,1800,3600").split(",") if s.strip())
PROLONGED_FALL_MAX_ALERTS = int(os.getenv("PROLONGED_FALL_MAX_ALERTS", "6"))

# ── Persist a fallen person through detection loss ───────────────────────────
# A body on the floor is the HARDEST thing for the detector to see, so the
# track lapses exactly when it matters most. Previously that meant:
#   * update() stopped being called, so the lying-confirm timer froze
#     mid-count and the alert never fired
#   * the GC deleted the state machine after TRACK_TIMEOUT_S (5s), erasing
#     the fact that anyone had fallen at all
# The net effect is worst for a person who does not move after falling — the
# unconscious case — because stillness makes redetection least likely.
#
# This does NOT try to see them. It only stops the system forgetting: a track
# already classified FALLEN keeps its timers running from its last known state,
# so confirmation and prolonged-fall alerts still fire with no new detections.
PERSIST_FALLEN_ON  = os.getenv("PERSIST_FALLEN", "1") == "1"
FALLEN_TIMEOUT_S   = float(os.getenv("FALLEN_TIMEOUT_S", "300"))

# Accuracy guards for the unseen path. Continuing a conclusion is only sound
# when the disappearance itself is unexplained:
#   * a track last seen touching the frame border probably walked out, and
#     holding it as fallen for five minutes would be a false alarm
#   * a track that vanished after only a moment of FALLEN never really
#     established the state; requiring a minimum dwell stops a single noisy
#     frame from being carried indefinitely
# 20px, not 45. At 45 a fall beside a desk or low in the frame was rejected as
# "probably walked out" — two of four plausible fall positions in a 720x480
# frame. Only a box genuinely touching the border should count as an exit.
PERSIST_EDGE_MARGIN = int(os.getenv("PERSIST_EDGE_MARGIN", "20"))
# PERSIST_DEBUG=1 explains why a lost track was or wasn't carried.
PERSIST_DEBUG = os.getenv("PERSIST_DEBUG", "0") == "1"
# 0.3s, not 1.0s. Detection of a body on the floor typically dies within a
# frame or two of the fall, so a 1s dwell requirement was rejecting exactly the
# cases persistence exists for. FALL_FRAMES_REQUIRED already demands 3
# consecutive frames before FALLEN commits, so this is a second filter on top
# of an existing one — it only needs to reject a single-frame flicker.
PERSIST_MIN_FALLEN_S = float(os.getenv("PERSIST_MIN_FALLEN_S", "0.3"))

# Candidate frames a vanishing track must have supplied before promote_on_vanish
# will commit it to FALLEN. 1 (the old value) meant a single flickering frame on
# a ghost detection became a held fall, an alert cascade and a saved clip. 2 is
# still below FALL_FRAMES_REQUIRED (3), so a genuine fall that loses its track
# after two frames is still caught — it only rejects the single-frame flicker.
PROMOTE_MIN_CANDIDATE_FRAMES = int(os.getenv("PROMOTE_MIN_CANDIDATE_FRAMES", "2"))

# Keypoint indices (COCO-17)
LEFT_SHOULDER,  RIGHT_SHOULDER  = 5,  6
LEFT_HIP,       RIGHT_HIP       = 11, 12
LEFT_KNEE,      RIGHT_KNEE      = 13, 14
LEFT_ANKLE,     RIGHT_ANKLE     = 15, 16

# ─────────────────────────────────────────────────────────────────────────────
# Helpers — Pose / Geometry
# ─────────────────────────────────────────────────────────────────────────────
def midpoint(p1, p2):
    return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)

def point_conf(kpt):
    return float(kpt[2])

def pose_has_required_keypoints(kpts):
    required = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
    return all(point_conf(kpts[i]) >= POSE_CONF_THRESHOLD for i in required)

def get_torso_angle(kpts):
    """Returns angle of shoulder→hip vector from vertical (0=upright, 90=horizontal)."""
    sh_mid  = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    hip_mid = midpoint(kpts[LEFT_HIP][:2], kpts[RIGHT_HIP][:2])
    dx = hip_mid[0] - sh_mid[0]
    dy = hip_mid[1] - sh_mid[1]
    return abs(np.degrees(np.arctan2(dx, dy if abs(dy) > 1e-6 else 1e-6)))











# ── Seated guard ─────────────────────────────────────────────────────────────
# Path B fires on bbox height alone (`height_ratio < 0.72`) with no angle
# condition, and sitting collapses height to ~55-70% of standing — squarely
# inside that window. By height, sitting and falling are identical.
#
# The knees separate them: ~60-95° seated, 160-180° lying flat. Knee flexion is
# an angle between three keypoints, so it needs no calibration.
#
# TWO SAFEGUARDS, both learned the hard way:
#   1. SEATED_OVERRIDE_HRATIO — below this the body is unambiguously at floor
#      level and the guard gets no vote. Without it the guard suppressed
#      FALLEN outright, which also killed the "NO LONGER VISIBLE" persistence,
#      because tick_absent() only continues a track that reached FALLEN.
#   2. Stickiness is short. At 2.5s the dwell spanned the whole time a person
#      stayed visible, so they never reached FALLEN at all.
SEATED_GUARD_ON        = os.getenv("SEATED_GUARD", "1") == "1"
KNEE_BENT_MAX_DEG      = float(os.getenv("KNEE_BENT_MAX_DEG", "120"))
KNEE_DEEP_DEG          = float(os.getenv("KNEE_DEEP_DEG", "95"))
# Anatomical floor. Heel-to-buttock is roughly 30-40 degrees at the human
# limit, so anything below this is a bad keypoint estimate, not a deep squat.
# Observed on a man lying on the floor with folded legs: "seated L28/R21",
# which suppressed a genuine fall. Implausible angles must count as no
# evidence rather than as strong evidence.
KNEE_MIN_PLAUSIBLE_DEG = float(os.getenv("KNEE_MIN_PLAUSIBLE_DEG", "40"))

# A torso angle at or below this counts as "we saw them upright". If a track's
# whole angle history sits above it, the descent was never observed.
UPRIGHT_ANGLE_MAX = float(os.getenv("UPRIGHT_ANGLE_MAX", "25"))

# OFF by default. This rule reports a fall whenever a track was never observed
# standing, on the reasoning that an unwitnessed descent to the floor is more
# likely a fall than a deliberate lie-down. That holds on a test clip where one
# person walks in and falls.
#
# In a real lounge it is badly wrong: residents are ALREADY seated when the
# system starts, so they are never seen upright and every one of them is
# reported as FALL DETECTED (UNWITNESSED) — observed live at the facility with
# three seated residents raising two emergencies. Enable only where the camera
# reliably sees people enter on their feet.
#
# DEFAULT IS NOW OFF. It used to default to "1", which contradicted the
# paragraph directly above it: the guidance said "enable only where the camera
# reliably sees people enter on their feet", while the default enabled it
# everywhere. Every deployment therefore shipped with the failure mode already
# documented here, and stayed that way unless someone remembered to set an env
# var — which is not a safeguard, it is a trap. A detector this prone to false
# EMERGENCIES has to be opted INTO for a specific camera placement, not opted
# out of after the alarms start.
#
# Nothing goes unreported when this is off: the same person falls through to
# the ordinary slow-descent path and is still reported as LYING DOWN DETECTED
# once they have stayed down for LYING_CONFIRM_SECONDS. The difference is
# Warning instead of Emergency, and a few seconds later.
UNWITNESSED_FALL_ON = os.getenv("UNWITNESSED_FALL", "0") == "1"

SEATED_TORSO_MAX       = float(os.getenv("SEATED_TORSO_MAX", "30"))
SEATED_TORSO_MAX_DEEP  = float(os.getenv("SEATED_TORSO_MAX_DEEP", "70"))
SEATED_STICKY_S        = float(os.getenv("SEATED_STICKY_S", "1.2"))
SEATED_OVERRIDE_HRATIO = float(os.getenv("SEATED_OVERRIDE_HRATIO", "0.45"))

# ── Hip flexion — ankle-free seated evidence ─────────────────────────────────
# The knee test above needs hip+knee+ankle all confident on one leg. On a sofa
# the near leg is routinely hidden by an armrest or foreshortened to nothing,
# so `seen` comes back empty and the guard ABSTAINS on exactly the pose it was
# written for. That is why a seated resident still reached FALLEN.
#
# Hip flexion is the shoulder→hip→knee angle. It needs no ankle:
#     lying flat, legs extended   ~170-180  (shoulder, hip, knee collinear)
#     reclined on a sofa          ~130-155
#     sitting upright             ~85-100   (torso vertical, thighs horizontal)
# You cannot lie flat on the floor with your torso folded onto your thighs, so
# a low value is positive evidence of support under the buttocks.
#
# Weaker evidence than the knee test — a foetal position on the floor also
# folds the hip — so it gets its own, tighter torso allowance and never counts
# as `deep`. The floor-level height override still outranks it.
# 145, not 130. Measured on synthetic skeletons: sitting upright reads ~90,
# reclining 35-45 degrees on a sofa reads 130-140, and lying flat with the legs
# out reads 170-180. At 130 the recliner — the exact pose in the report — fell
# on the wrong side of the line.
#
# THE TRADE-OFF, stated plainly: raising this suppresses more sofa poses AND
# makes it likelier that a resident who has slid down a wall into a slumped
# floor position is read as "seated". 145 keeps a clear margin below flat-out
# lying, and the furniture zones are the primary defence for the sofa — this
# guard is the no-setup fallback, so it does not need to be pushed further.
# Lower it toward 120 if you would rather have sofa false alarms than miss a
# slumped resident; that is a clinical judgement, not a technical one.
HIP_FLEX_GUARD_ON       = os.getenv("HIP_FLEX_GUARD", "1") == "1"
HIP_FLEX_SEATED_MAX     = float(os.getenv("HIP_FLEX_SEATED_MAX", "145"))
# Below this the three points are effectively folded onto each other, which is
# a keypoint-collapse artefact rather than a real posture.
HIP_FLEX_MIN_PLAUSIBLE  = float(os.getenv("HIP_FLEX_MIN_PLAUSIBLE", "25"))
# Oblique/overhead CCTV projects a seated torso well past SEATED_TORSO_MAX=30,
# which is the second reason the guard never fired on the sofa. Hip-flexion
# evidence carries a larger allowance because the fold itself already rules
# out lying flat.
SEATED_TORSO_MAX_HIPFLEX = float(os.getenv("SEATED_TORSO_MAX_HIPFLEX", "75"))

# ── Standing-bend guard ──────────────────────────────────────────────────────
# Bending at the waist to pick something off the floor puts the torso at
# 85-115 degrees from vertical, which Path A reads as a horizontal body. A
# resident cleaning was reported as FALL DETECTED, and when she stayed bent
# past LYING_CONFIRM_SECONDS the same state relabelled itself LYING DOWN.
#
# The seated guard cannot cover this. Bending keeps the knees straight, and
# looks_seated() returns False as soon as it sees a straight leg — before the
# hip-flexion test that would otherwise notice the folded waist.
#
# BEND_LEG_DROP_MIN is the hip-to-ankle vertical drop, in torso lengths,
# above which the legs count as still extended beneath the body. See
# standing_bend() for the measured values behind 1.2, and for the one pose it
# deliberately misreads. Set BEND_GUARD=0 to switch it off.
BEND_GUARD_ON      = os.getenv("BEND_GUARD", "1") == "1"
BEND_LEG_DROP_MIN  = float(os.getenv("BEND_LEG_DROP_MIN", "1.2"))
# Ankle-free fallback, used when the feet are hidden by furniture, by another
# person, or by the frame edge — which is the case in every false alarm seen so
# far. Shoulders below hip level AND knees below hips. See standing_bend() for
# the measured table and for the two lying poses each condition alone gets
# wrong. 0.60 rather than 0.50 on the knee drop keeps a margin above a
# collapsed, slumped-forward body, which measured 0.41 and must stay detectable.
BEND_TORSO_INVERT_MIN = float(os.getenv("BEND_TORSO_INVERT_MIN", "0.30"))
BEND_KNEE_DROP_MIN    = float(os.getenv("BEND_KNEE_DROP_MIN", "0.60"))
BEND_DEBUG         = os.getenv("BEND_DEBUG", "0") == "1"

# ── Furniture zones — "lying down means ON THE FLOOR" ────────────────────────
# Honest statement of the limit this works around: in an uncalibrated oblique
# monocular view, height above the floor is NOT observable. A body reclining on
# a sofa and a body on the carpet in front of it project nearly identical
# skeletons. No threshold on torso angle or bbox ratio can separate them,
# because the information is not in the image. The only fix is to tell the
# system where the furniture is.
#
# Zones are per camera, drawn once, and stored in JSON:
#
#   {
#     "Test_Falls_2": [
#       {"name": "sofa", "rect": [0.42, 0.55, 0.72, 0.80]},
#       {"name": "bed",  "poly": [[120,300],[400,300],[400,430],[120,430]]}
#     ]
#   }
#
# Coordinates may be normalised (every value 0..1, resolution-independent —
# preferred) or absolute pixels in INFERENCE_W x INFERENCE_H space. Use
# draw_zones.py to click them out on a still frame.
#
# A person whose HIP MIDPOINT falls inside a zone is being held up by
# furniture, so the fall paths are suppressed for them. Draw zones TIGHT to
# the seat/mattress surface: from an oblique camera the floor immediately in
# front of a sofa projects close to the seat itself, and an over-large zone
# will swallow a genuine fall beside the furniture.
#
# FURNITURE_MODE:
#   "all"  (default) — no FALLEN state at all inside a zone. Matches "lying
#          down should only be on the floor" literally: no red box, no alert.
#   "slow" — only the slow/lie-down path is suppressed; a fast collapse still
#          raises an EMERGENCY even inside the zone. Safer, but a seated
#          resident may still flash a red box on a noisy frame.
# Empty config = zero behaviour change, so this is inert until you draw zones.
FURNITURE_ZONES_FILE = os.getenv(
    "FURNITURE_ZONES_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "furniture_zones.json"))
FURNITURE_MODE  = os.getenv("FURNITURE_MODE", "all").strip().lower()

# ── Floor allowlist — "on the floor" as positive evidence ────────────────────
# The furniture zones above are a DENYLIST: a body is exonerated only where a
# zone was drawn, so every undrawn square metre is treated as floor by default.
# In a room with residents seated across the whole view, those undrawn gaps are
# where the false LYING DOWN alerts come from.
#
# This inverts it. Draw ONE polygon per camera named "floor" (draw_zones.py,
# then type `floor` when it asks for the zone name) covering the open floor a
# body could actually land on. FALLEN may then only be declared when the support
# point is inside that polygon.
#
# Fails OPEN: a camera with no floor polygon configured behaves exactly as it
# does today, so this changes nothing until you draw one.
FLOOR_ZONE_REQUIRED = os.getenv("FLOOR_ZONE_REQUIRED", "1") == "1"
FLOOR_ZONE_NAMES    = {"floor", "ground", "open floor"}

# ── Lower-body visibility gate ───────────────────────────────────────────────
# standing_bend() fails open when it can see neither ankles nor knees, which is
# right for a guard — a missing measurement must never suppress a fall. But that
# is exactly the condition in the observed false alarms: a resident seated
# behind other people, showing head, shoulders and maybe one hip. The torso
# angle computed from that is noise, and nothing downstream can tell.
#
# So: if the half of the body that would be ON the floor cannot be seen, do not
# declare a fall from the half that can. Both hips plus at least one knee.
FALL_REQUIRE_LOWER_BODY = os.getenv("FALL_REQUIRE_LOWER_BODY", "1") == "1"

# ── Minimum apparent size for fall geometry ──────────────────────────────────
# Torso angle and aspect ratio are measured in pixels. On a body 50 px tall at
# the back of the room, 3 px of keypoint jitter is a 15-20 degree swing in torso
# angle — wider than the whole margin between "seated" and "fallen". Below this
# fraction of frame height the geometry is not evidence. 0 disables.
FALL_MIN_BBOX_H_FRAC = float(os.getenv("FALL_MIN_BBOX_H_FRAC", "0.15"))

# ── Non-square pixels — the measurement error under every threshold ──────────
# Every frame is force-resized to INFERENCE_W x INFERENCE_H. When the source does
# not share that aspect ratio, x and y are scaled by DIFFERENT factors, and every
# angle and every bbox ratio computed afterwards is wrong by that factor.
#
# A 1280x720 (16:9) camera squeezed into 720x480 (3:2) is scaled 0.5625 in x and
# 0.6667 in y: bodies come out 18.5% taller than they are, and a torso truly at
# 45 degrees measures 40. Thresholds tuned against the 3:2 test videos therefore
# do not mean the same thing on the live camera — which is the sort of silent
# error that makes tuning feel like guesswork.
#
# k = (source aspect) / (inference aspect). Multiply every x-difference by k and
# the geometry is back in true proportions. k == 1 for a matching source, so this
# changes nothing when there is nothing to correct. Set 0 to disable.
PIXEL_ASPECT_CORRECT = os.getenv("PIXEL_ASPECT_CORRECT", "1") == "1"
cam_pixel_k = {}          # cam_id -> k, measured once from the first real frame

# Log falls suppressed by the gates above. Leave on for the first few days — it
# is how you tell "the gates are working" from "the camera stopped seeing
# anything". Throttled per track so a seated resident cannot fill the journal at
# the inference frame rate.
FLOOR_GATE_DEBUG       = os.getenv("FLOOR_GATE_DEBUG", "1") == "1"
FLOOR_GATE_LOG_EVERY_S = float(os.getenv("FLOOR_GATE_LOG_EVERY_S", "10"))

FURNITURE_DEBUG = os.getenv("FURNITURE_DEBUG", "0") == "1"

_FURNITURE_ZONES = {}     # cam_id -> list of {"name": str, "pts": np.int32 (N,2)}


def _load_furniture_zones():
    """Parse FURNITURE_ZONES_FILE into pixel-space contours, once at startup.

    Any malformed entry is skipped with a warning rather than raising — a typo
    in a zone file must never stop the cameras coming up.
    """
    zones = {}
    if not os.path.isfile(FURNITURE_ZONES_FILE):
        print(f"[ZONES] no furniture zone file at {FURNITURE_ZONES_FILE} — "
              f"furniture suppression disabled")
        return zones
    try:
        with open(FURNITURE_ZONES_FILE, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception as err:
        print(f"[ZONES] failed to read {FURNITURE_ZONES_FILE}: {err} — "
              f"furniture suppression disabled")
        return zones

    for cam_id, entries in (raw or {}).items():
        parsed = []
        for entry in entries or []:
            try:
                name = entry.get("name", "zone")
                if "rect" in entry:
                    x1, y1, x2, y2 = [float(v) for v in entry["rect"]]
                    pts = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
                elif "poly" in entry:
                    pts = [(float(p[0]), float(p[1])) for p in entry["poly"]]
                    if len(pts) < 3:
                        raise ValueError("poly needs >= 3 points")
                else:
                    raise ValueError("entry has neither 'rect' nor 'poly'")

                # Normalised coords iff every value is within 0..1.
                if all(0.0 <= v <= 1.0 for p in pts for v in p):
                    pts = [(x * INFERENCE_W, y * INFERENCE_H) for x, y in pts]

                parsed.append({
                    "name": name,
                    "pts":  np.array([[int(round(x)), int(round(y))]
                                      for x, y in pts], dtype=np.int32),
                })
            except Exception as err:
                print(f"[ZONES] {cam_id}: skipping bad zone {entry!r}: {err}")
        if parsed:
            zones[cam_id] = parsed
            print(f"[ZONES] {cam_id}: loaded {len(parsed)} furniture zone(s): "
                  + ", ".join(z["name"] for z in parsed))
    if not zones:
        print("[ZONES] furniture zone file contained no usable zones")
    return zones


def furniture_zone_at(cam_id, point):
    """Name of the furniture zone containing `point`, or None.

    `point` is (x, y) in INFERENCE_W x INFERENCE_H pixel space.
    """
    if point is None:
        return None
    for z in _FURNITURE_ZONES.get(cam_id, ()):
        # A 'floor' polygon is an allowlist, not a seat — it must never
        # exonerate anybody as 'on furniture'.
        if _is_floor_zone(z["name"]):
            continue
        if cv2.pointPolygonTest(z["pts"], (float(point[0]), float(point[1])),
                                False) >= 0:
            return z["name"]
    return None


def _is_floor_zone(name):
    return str(name).strip().lower() in FLOOR_ZONE_NAMES


def camera_has_floor_zone(cam_id):
    """True if a 'floor' polygon has been drawn for this camera."""
    return any(_is_floor_zone(z["name"]) for z in _FURNITURE_ZONES.get(cam_id, ()))


def in_floor_zone(cam_id, point):
    """True if `point` is inside this camera's 'floor' polygon.

    Fails OPEN — a camera with no floor polygon returns True — so drawing the
    zone is what switches the gate on, one camera at a time.
    """
    zones = [z for z in _FURNITURE_ZONES.get(cam_id, ())
             if _is_floor_zone(z["name"])]
    if not zones:
        return True
    if point is None:
        return True
    for z in zones:
        if cv2.pointPolygonTest(z["pts"],
                                (float(point[0]), float(point[1])),
                                False) >= 0:
            return True
    return False


def lower_body_visible(kpts):
    """Both hips and at least one knee detected above POSE_CONF_THRESHOLD."""
    if kpts is None:
        return False
    hips = (point_conf(kpts[LEFT_HIP])  >= POSE_CONF_THRESHOLD and
            point_conf(kpts[RIGHT_HIP]) >= POSE_CONF_THRESHOLD)
    knee = (point_conf(kpts[LEFT_KNEE])  >= POSE_CONF_THRESHOLD or
            point_conf(kpts[RIGHT_KNEE]) >= POSE_CONF_THRESHOLD)
    return bool(hips and knee)


def pixel_k(cam_id):
    """x-scale correction for this camera. 1.0 = square pixels, nothing to fix."""
    return cam_pixel_k.get(cam_id, 1.0) if PIXEL_ASPECT_CORRECT else 1.0


def correct_angle(deg, k):
    """Re-measure an angle-from-vertical in true proportions.

    tan(true) = k * tan(measured), evaluated with atan2 so 90 degrees is safe.
    """
    if k == 1.0 or deg is None:
        return deg
    r = math.radians(deg)
    return math.degrees(math.atan2(k * math.sin(r), math.cos(r)))


def support_point(kpts, box):
    """Best estimate of where the body's weight is resting, in pixels.

    Hip midpoint when both hips are confident — that is what a sofa or bed
    actually holds up. Falls back to the bbox centre so the zone test still
    works on a partially-occluded detection.
    """
    if kpts is not None and \
            point_conf(kpts[LEFT_HIP]) >= POSE_CONF_THRESHOLD and \
            point_conf(kpts[RIGHT_HIP]) >= POSE_CONF_THRESHOLD:
        return midpoint(kpts[LEFT_HIP][:2], kpts[RIGHT_HIP][:2])
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def draw_furniture_zones(frame, cam_id):
    """Faint outline of each configured zone, so operators can see the mask."""
    for z in _FURNITURE_ZONES.get(cam_id, ()):
        cv2.polylines(frame, [z["pts"]], True, (90, 90, 160), 1)
        x, y = z["pts"][0]
        cv2.putText(frame, z["name"], (int(x) + 3, int(y) + 14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (90, 90, 160), 1)


_FURNITURE_ZONES = _load_furniture_zones()


def _joint_angle(a, b, c):
    """Interior angle at joint `b` formed by a-b-c, in degrees, or None."""
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1, n2 = math.hypot(*v1), math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cosang = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosang))))


def knee_flexion(kpts):
    """(left, right) knee angles; either may be None. ~90 sitting, ~180 flat."""
    out = []
    for hip, knee, ankle in ((LEFT_HIP, LEFT_KNEE, LEFT_ANKLE),
                             (RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)):
        if all(point_conf(kpts[i]) >= POSE_CONF_THRESHOLD
               for i in (hip, knee, ankle)):
            out.append(_joint_angle(kpts[hip][:2], kpts[knee][:2], kpts[ankle][:2]))
        else:
            out.append(None)
    return out[0], out[1]


def hip_flexion(kpts):
    """(left, right) shoulder-hip-knee angles; either may be None.

    ~90 sitting upright, ~130-155 reclined, ~175 lying flat with legs out.
    Deliberately ankle-free: the ankle is the keypoint a sofa hides.
    """
    out = []
    sh_mid = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    for hip, knee in ((LEFT_HIP, LEFT_KNEE), (RIGHT_HIP, RIGHT_KNEE)):
        if (point_conf(kpts[hip]) >= POSE_CONF_THRESHOLD
                and point_conf(kpts[knee]) >= POSE_CONF_THRESHOLD
                and (point_conf(kpts[LEFT_SHOULDER]) >= POSE_CONF_THRESHOLD
                     or point_conf(kpts[RIGHT_SHOULDER]) >= POSE_CONF_THRESHOLD)):
            out.append(_joint_angle(sh_mid, kpts[hip][:2], kpts[knee][:2]))
        else:
            out.append(None)
    return out[0], out[1]


def looks_seated(kpts, torso_angle):
    """Return (seated, deep) — seated verdict, and whether the knees are
    deeply folded.

    One visible bent knee is enough: armchairs hide a leg constantly, and
    requiring both switched the guard off exactly where sitting happens.
    The torso allowance is graded, since deeply folded knees permit far more
    lean — nobody lies flat with their legs folded to 60°.

    `deep` matters because a low armchair viewed from above can put a seated
    person's bbox below the floor-level override, which would otherwise
    disable the guard on the very pose it exists for.
    """
    if not SEATED_GUARD_ON:
        return False, False
    # Discard anatomically impossible angles — they are keypoint noise from
    # folded or occluded legs, which is exactly what a body on the floor
    # produces. Treating them as "deeply seated" masked real falls.
    seen = [k for k in knee_flexion(kpts)
            if k is not None and k >= KNEE_MIN_PLAUSIBLE_DEG]
    if seen:
        straighter = max(seen)
        if straighter < KNEE_BENT_MAX_DEG:
            deep = straighter < KNEE_DEEP_DEG
            allowed = SEATED_TORSO_MAX_DEEP if deep else SEATED_TORSO_MAX
            if torso_angle < allowed:
                return True, deep
        else:
            # Legs are straight. That is a positive reading of "not seated",
            # so do not let the weaker hip test overturn it.
            return False, False

    # No usable knee evidence (or knees bent but torso past the allowance) —
    # fall through to hip flexion, which survives a hidden ankle. Never
    # reports `deep`: it is the weaker signal and must not outrank the
    # floor-level height override.
    if not HIP_FLEX_GUARD_ON:
        return False, False
    hips = [h for h in hip_flexion(kpts)
            if h is not None and h >= HIP_FLEX_MIN_PLAUSIBLE]
    if not hips:
        return False, False
    # The straighter hip decides. One folded hip is common in a body sprawled
    # on the floor; both folded, with a torso that is not flat, is a chair.
    if max(hips) >= HIP_FLEX_SEATED_MAX:
        return False, False
    return (torso_angle < SEATED_TORSO_MAX_HIPFLEX), False


def pose_is_plausible(kpts):
    """Could this skeleton belong to an actual human body?

    DET_CONF is 0.10 so a person on the floor still registers. The cost is that
    a dark armchair, a pile of laundry or a shadow can accumulate enough weak
    keypoints to clear MIN_CONFIDENT_KPTS and be handed a track — and a track
    is entitled to be classified, alerted on, and recorded. A red FALL DETECTED
    box was observed sitting on an empty armchair with a tangle of lines in it
    that no body could produce.

    The discriminator is proportion. A real torso is never much shorter than
    the shoulders are wide, whatever the camera angle. Measured:

        standing, facing camera   2.67      ghost, scattered points   0.22
        standing, side-on         9.92      ghost, wide and flat      0.10
        seated                    2.40
        lying flat across view    3.66
        lying, foreshortened      1.72   <- the lowest any real pose reached
        bent over                 3.46

    1.72 versus 0.22 is an order of magnitude, so 0.6 sits in empty space with
    a wide margin on both sides. Only the LOW end is tested: a high ratio is
    what a genuine side-on person produces (9.92) and is not evidence of
    anything wrong.

    Returns True when unmeasurable — a missing measurement must never be
    treated as proof of a ghost, for the same reason it must never be treated
    as proof of a fall.
    """
    if not POSE_PLAUSIBILITY_ON or kpts is None:
        return True
    for i in (LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP):
        if point_conf(kpts[i]) < POSE_CONF_THRESHOLD:
            return True
    shoulder_w = math.hypot(kpts[LEFT_SHOULDER][0] - kpts[RIGHT_SHOULDER][0],
                            kpts[LEFT_SHOULDER][1] - kpts[RIGHT_SHOULDER][1])
    if shoulder_w < 1e-3:
        return True
    sh_mid  = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    hip_mid = midpoint(kpts[LEFT_HIP][:2],      kpts[RIGHT_HIP][:2])
    torso_len = math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1])
    return (torso_len / shoulder_w) >= POSE_MIN_TORSO_RATIO


def standing_bend(kpts, k=1.0):
    """True when the legs are still extended below the hips — bent over, but
    standing on their feet. False when unmeasurable (fail open: never let a
    missing measurement suppress a fall).

    Measured as the vertical drop from hip midpoint to the LOWEST confident
    ankle, divided by torso length, so the person's own body is the ruler and
    camera distance cancels out. On synthetic skeletons:

        standing upright            2.00
        bending to pick something   2.09      <- the false positive
        deep bend, hands to floor   1.97
        sitting on a chair          1.00
        kneeling                    0.81
        collapsed, legs folded      0.43
        lying flat across the view  0.16
        lying, feet away from cam  -1.62

    A threshold of 1.2 sits in the empty band between bending and everything
    that is genuinely down, with ~60% margin either side.

    THE ONE POSE THIS MISREADS, and why the caller must respect it: a body
    lying with its FEET TOWARD THE CAMERA measures 1.59 — above the threshold —
    because that pose foreshortens the torso and shrinks the denominator. It is
    not a standing bend. That is why this may only gate Path A, whose torso-
    angle condition that pose does not meet anyway (it projects near 0 degrees);
    Paths B and C still catch it. Do not promote this to a global override.
    """
    if not BEND_GUARD_ON or kpts is None:
        return False
    for i in (LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP):
        if point_conf(kpts[i]) < POSE_CONF_THRESHOLD:
            return False
    sh_mid  = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    hip_mid = midpoint(kpts[LEFT_HIP][:2],      kpts[RIGHT_HIP][:2])
    # x and y are not the same scale after the resize — see
    # PIXEL_ASPECT_CORRECT. The drops below are pure-y and unaffected,
    # but this length mixes both axes, so it needs the correction or
    # the ratios shift against the thresholds measured above.
    torso_len = math.hypot((sh_mid[0] - hip_mid[0]) * k,
                           sh_mid[1] - hip_mid[1])
    if torso_len < 1e-3:
        return False
    ankles = [kpts[i] for i in (LEFT_ANKLE, RIGHT_ANKLE)
              if point_conf(kpts[i]) >= POSE_CONF_THRESHOLD]
    if ankles:
        ankle_y = max(float(a[1]) for a in ankles)
        return ((ankle_y - hip_mid[1]) / torso_len) >= BEND_LEG_DROP_MIN

    # ── Ankle-free fallback ──────────────────────────────────────────────────
    # Requiring ankles made the guard abstain in precisely the cases it was
    # built for. Every observed false alarm — bending over a table, reaching
    # down to a chair, picking something off the floor at the frame edge — hid
    # the feet under furniture, behind another resident, or outside the frame.
    #
    # Two conditions, and BOTH are needed:
    #
    #   inverted torso : the shoulders have dropped BELOW hip level. You fold
    #                    at the waist to reach something; you cannot lie flat
    #                    on a floor with your shoulders under your hips.
    #   knees below hips: the legs are still hanging down, i.e. weight is on
    #                    the feet.
    #
    # Either alone is unsafe, and the poses that prove it are in the table
    # below (measured on synthetic skeletons, y increasing downward):
    #
    #                              torso inv   knee drop
    #     bend over table              0.68        1.21   <- suppress
    #     bend to pick up              0.69        0.94   <- suppress
    #     bend over chair              0.86        1.06   <- suppress
    #     lying prone, head to camera  1.00       -0.81   <- MUST NOT suppress
    #     lying supine, feet to camera-0.99        0.92   <- MUST NOT suppress
    #     collapsed, slumped forward   0.47        0.41   <- MUST NOT suppress
    #     lying flat across view      -0.04        0.16
    #     kneeling                    -1.00        0.62
    #
    # A body lying prone toward the camera inverts the torso by projection and
    # would be masked by the first condition alone; its knees sit ABOVE the
    # hips, so the second condition rejects it. A body lying feet-to-camera
    # passes the knee test and fails the torso test. Requiring both leaves a
    # clear margin around the collapsed case, which is the one that actually
    # matters clinically.
    knees = [kpts[i] for i in (LEFT_KNEE, RIGHT_KNEE)
             if point_conf(kpts[i]) >= POSE_CONF_THRESHOLD]
    if not knees:
        return False          # neither feet nor knees — abstain, allow the fall
    knee_y  = max(float(k[1]) for k in knees)
    inverted = (sh_mid[1]  - hip_mid[1]) / torso_len
    knee_drop = (knee_y    - hip_mid[1]) / torso_len
    return (inverted  >= BEND_TORSO_INVERT_MIN and
            knee_drop >= BEND_KNEE_DROP_MIN)


def _iou(a, b):
    """Intersection-over-union of two (x1, y1, x2, y2) boxes; 0.0 if either
    is None. Used both to re-link a switched track ID to the box it just
    vacated, and to recognise two alerts describing the same patch of floor."""
    if a is None or b is None:
        return 0.0
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = ix2 - ix1, iy2 - iy1
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = float(iw * ih)
    area_a = max(ax2 - ax1, 0) * max(ay2 - ay1, 0)
    area_b = max(bx2 - bx1, 0) * max(by2 - by1, 0)
    union = float(area_a + area_b - inter)
    return inter / union if union > 0 else 0.0


def body_extent_ratio(kpts, bbox_h):
    """bbox height measured in the person's OWN torso lengths, or None.

    THE PROBLEM THIS SOLVES. Path B compares the current bbox height against
    `_max_bbox_h`, the tallest box this track ever produced. That is a single
    scalar for the whole room, and apparent height depends on RANGE, not just
    posture. Measured on fall3_slow.mp4, one person, no posture change:

        walks in near the camera   bbox 262 px
        stands across the room     bbox  95 px   -> height ratio 0.36

    0.36 is far below FALL_HEIGHT_RATIO_THRESHOLD, so Path B called a standing
    man on the far side of the room "fallen". The same clip shows the inverse:
    the person actually on the floor scored height ratio 0.86-0.99, because
    their track began after they were already down and the reference was set
    from the fallen box. Path B was reading distance, not posture.

    Dividing bbox height by torso length cancels range — both shrink together.
    Measured on the same clip:

        standing, near or far      3.31 - 3.60
        lying on the floor         1.32 - 1.70

    A clean 2x margin with no calibration and no per-camera setup.

    Returns None when the torso is not measurable, and callers MUST treat that
    as "no opinion" rather than as evidence — see FALL_EXTENT_MAX.
    """
    if kpts is None or bbox_h is None or bbox_h <= 0:
        return None
    for i in (LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP):
        if point_conf(kpts[i]) < POSE_CONF_THRESHOLD:
            return None
    sh_mid  = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    hip_mid = midpoint(kpts[LEFT_HIP][:2],      kpts[RIGHT_HIP][:2])
    torso_len = math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1])
    if torso_len < 1e-3:
        return None
    return bbox_h / torso_len


def get_body_aspect_ratio(box):
    """Returns bbox height/width. >1.5 = standing, <0.9 = likely fallen."""
    x1, y1, x2, y2 = box
    w = max(x2 - x1, 1)
    h = max(y2 - y1, 1)
    return h / w


# ── Calibration-free posture ratios ──────────────────────────────────────────
# Both measures divide one body measurement by another, so the person's own
# skeleton is the ruler and distance from the camera cancels out. No per-camera
# setup, no metres, identical constants on every scene.
#
#   elevation = (ankle_y - shoulder_y) / torso_length
#       How high the shoulders sit above the feet, in torso-lengths.
#       Standing ~2.5-3.0, sitting ~1.2-1.8, lying ~0-1.
#
#   compactness = full_body_extent / shoulder_width
#       A standing body always projects roughly 3.5-4 shoulder-widths tall.
#       When someone lies with their body pointing toward or away from the
#       camera the length foreshortens and this collapses to ~1.5-2, even
#       though the silhouette still looks upright. This is the only one of
#       the two that sees through that projection, and it only reduces the
#       blind spot rather than removing it.
#
# Thresholds below are derived from human proportion, NOT measured on this
# footage — expect one tuning pass.
POSTURE_RATIO_ON      = os.getenv("POSTURE_RATIO", "0") == "1"
# Tuned against synthetic skeletons: standing 2.38/4.76, seated 1.77/3.85,
# crouching 2.38/2.87, lying across view 0.23/4.76, lying along view 2.38/2.12.
# These values clear seated and crouching while catching both lying poses.
POSTURE_ELEVATION_MAX = float(os.getenv("POSTURE_ELEVATION_MAX", "1.00"))
POSTURE_COMPACT_MAX   = float(os.getenv("POSTURE_COMPACT_MAX",   "2.40"))
# The OR above was written on the reasoning that each ratio covers the other's
# blind spot. That reasoning is sound in principle, but in practice it means
# EITHER ratio alone can raise an EMERGENCY — and one of them was being
# computed from a broken torso_len (see get_posture_ratios). Observed on a
# seated resident: e=0.02 (fires) with c=4.12 (nowhere near its threshold);
# the good measurement said "upright" and was overruled by the bad one.
#
# Requiring agreement costs the lying-along-the-view case that OR was added
# for — that pose now falls back to the angle and height paths, which is
# where it was before POSTURE_RATIO existed. Set POSTURE_REQUIRE_BOTH=0 to
# restore OR once you have re-tuned the thresholds against the fixed
# elevation values.
POSTURE_REQUIRE_BOTH  = os.getenv("POSTURE_REQUIRE_BOTH", "1") == "1"


def get_posture_ratios(kpts):
    """Return (elevation, compactness), either may be None if unmeasurable.

    Abstains rather than guessing: a missing ankle yields elevation=None and
    the caller simply falls back to the existing angle/aspect paths.
    """
    elevation = compactness = None

    sh_mid  = midpoint(kpts[LEFT_SHOULDER][:2], kpts[RIGHT_SHOULDER][:2])
    hip_mid = midpoint(kpts[LEFT_HIP][:2],      kpts[RIGHT_HIP][:2])
    # BUG FIX: this passed the y-difference as BOTH arguments —
    #     math.hypot(sh_mid[1] - hip_mid[1], sh_mid[1] - hip_mid[1])
    # so torso_len was sqrt(2) * |dy| instead of the real torso length. For a
    # body lying across the view dy collapses toward zero while dx is the whole
    # torso, so the denominator went to ~0 and `elevation` became meaningless.
    # It is the value printed as `e=` on the overlay, and with POSTURE_RATIO=1
    # it alone could force the FALLEN classification.
    torso_len = math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1])

    ankles = [kpts[i] for i in (LEFT_ANKLE, RIGHT_ANKLE)
              if point_conf(kpts[i]) >= POSE_CONF_THRESHOLD]
    if torso_len > 1e-3 and ankles:
        # Lowest visible ankle is the best available floor contact point.
        ankle_y = max(float(a[1]) for a in ankles)
        elevation = (ankle_y - sh_mid[1]) / torso_len

    shoulder_w = math.hypot(kpts[LEFT_SHOULDER][0] - kpts[RIGHT_SHOULDER][0],
                            kpts[LEFT_SHOULDER][1] - kpts[RIGHT_SHOULDER][1])
    visible = [k for k in kpts if point_conf(k) >= POSE_CONF_THRESHOLD]
    if shoulder_w > 1e-3 and len(visible) >= 6:
        xs = [float(k[0]) for k in visible]
        ys = [float(k[1]) for k in visible]
        extent = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
        compactness = extent / shoulder_w

    return elevation, compactness

# ── Keypoint temporal smoothing ───────────────────────────────────────────────
# Per-track EMA smoothing eliminates the flicker caused by confidence
# oscillating around POSE_CONF_THRESHOLD.  alpha=0.40 → each new frame
# contributes 40%; the previous smoothed value contributes 60%.
#
# Position (x, y) is only pulled toward the new estimate when the keypoint
# is actually visible (raw conf ≥ 0.15); otherwise the position freezes in
# place.  Confidence is always blended so it transitions smoothly through the
# threshold rather than snapping on/off — this is what kills the flicker.
KPT_SMOOTH_ALPHA = 0.40
KPT_VISIBLE_MIN  = 0.15   # raw-conf floor to update x,y (occlusion guard)

def smooth_keypoints(kpt_smooth: dict, tid: int, raw_kpts) -> np.ndarray:
    """Return EMA-smoothed keypoints for track `tid`, updating kpt_smooth in place.

    kpt_smooth : dict  track_id → np.ndarray (17, 3)
    raw_kpts   : np.ndarray (17, 3) from YOLO this frame
    """
    alpha = KPT_SMOOTH_ALPHA
    if tid not in kpt_smooth:
        kpt_smooth[tid] = raw_kpts.copy()
        return raw_kpts.copy()

    prev    = kpt_smooth[tid]
    blended = prev.copy()
    for j in range(len(raw_kpts)):
        new_conf = float(raw_kpts[j, 2])
        if new_conf >= KPT_VISIBLE_MIN:
            blended[j, 0] = alpha * raw_kpts[j, 0] + (1.0 - alpha) * prev[j, 0]
            blended[j, 1] = alpha * raw_kpts[j, 1] + (1.0 - alpha) * prev[j, 1]
        # confidence always blends — gives hysteresis so a keypoint near the
        # threshold fades in/out over several frames instead of blinking.
        blended[j, 2] = alpha * new_conf + (1.0 - alpha) * float(prev[j, 2])

    kpt_smooth[tid] = blended
    return blended


# ── Overlay weights scale with how big the person is on screen ───────────────
# Every box was 2-5 px thick and every joint a 4 px disc, regardless of whether
# the person filled the frame or stood across the room. On a wide shot of a
# lounge with eight residents the far ones disappeared under their own
# skeletons — the dots merged into a green blob and you could not tell where
# one person ended and the next began.
#
# Line weight now follows apparent size: a person occupying OVERLAY_SCALE_REF
# of the frame height gets the MAX weights, someone much smaller gets the MIN.
# Severity still reads at a glance because the box keeps its priority bump.
#
# OVERLAY_SCALE is the single knob — 0.8 for thinner everywhere, 1.3 for
# heavier — and the MIN/MAX pairs are there if you want finer control.
# 0.7, not 1.0. At 1.0 a nearby person still got 2 px bones and 2 px joints,
# which on a 640x360 stream upscaled ~1.6x by the browser reads as 3-4 px on
# screen — still a blob in a seven-person frame. At 0.7 everything below an
# emergency lands on 1 px. This is close to the practical floor: 1 px is the
# thinnest line OpenCV draws. Raise it if the skeleton becomes too faint.
OVERLAY_SCALE      = float(os.getenv("OVERLAY_SCALE", "0.7"))
# Raised from 0.55: a person has to be genuinely close before they earn the
# heavy end of the scale, so everyone at conversational distance and beyond
# now sits on the thin end rather than the middle.
OVERLAY_SCALE_REF  = float(os.getenv("OVERLAY_SCALE_REF", "0.75"))
OVERLAY_BOX_T_MIN  = float(os.getenv("OVERLAY_BOX_T_MIN",  "1"))
OVERLAY_BOX_T_MAX  = float(os.getenv("OVERLAY_BOX_T_MAX",  "2"))
OVERLAY_BONE_T_MIN = float(os.getenv("OVERLAY_BONE_T_MIN", "1"))
OVERLAY_BONE_T_MAX = float(os.getenv("OVERLAY_BONE_T_MAX", "2"))
OVERLAY_JOINT_R_MIN = float(os.getenv("OVERLAY_JOINT_R_MIN", "1"))
OVERLAY_JOINT_R_MAX = float(os.getenv("OVERLAY_JOINT_R_MAX", "2"))
OVERLAY_FONT_MIN   = float(os.getenv("OVERLAY_FONT_MIN", "0.28"))
OVERLAY_FONT_MAX   = float(os.getenv("OVERLAY_FONT_MAX", "0.42"))
# The diagnostic captions — "seated L85/R83", "on Bench", "e=.. c=..",
# "Body agi:", "BENDING (on feet)". They explain WHY a track is classified the
# way it is, which is invaluable while tuning and pure clutter once you trust
# it: on a seven-person frame they overlap each other and the skeletons.
# They now scale with distance like everything else; set OVERLAY_DEBUG_TEXT=0
# for a clean view showing only boxes, skeletons, IDs and status labels.
# Default OFF. These were left on as a tuning aid, but on a seven-person frame
# they overlap each other and the skeletons and are most of what "obstructing"
# actually means. Set OVERLAY_DEBUG_TEXT=1 to bring them back while tuning.
OVERLAY_DEBUG_TEXT = os.getenv("OVERLAY_DEBUG_TEXT", "0") == "1"


def overlay_weights(bbox_h, frame_h, prio=0):
    """(box_thickness, bone_thickness, joint_radius, font_scale) for a track.

    Interpolates between the MIN and MAX constants on apparent size, so a
    distant person is drawn with hairlines and small joints while someone
    close keeps a readable overlay. The box gains +1 for a warning and +2 for
    an emergency AFTER scaling, so a red box is never as faint as a green one
    however far away it is — severity must survive the shrinking.
    """
    ref = max(1.0, float(frame_h) * OVERLAY_SCALE_REF)
    s   = min(1.0, max(0.0, float(bbox_h or 0) / ref))
    def _lerp(lo, hi):
        return lo + (hi - lo) * s
    box   = int(round(_lerp(OVERLAY_BOX_T_MIN,   OVERLAY_BOX_T_MAX)   * OVERLAY_SCALE))
    bone  = int(round(_lerp(OVERLAY_BONE_T_MIN,  OVERLAY_BONE_T_MAX)  * OVERLAY_SCALE))
    joint = int(round(_lerp(OVERLAY_JOINT_R_MIN, OVERLAY_JOINT_R_MAX) * OVERLAY_SCALE))
    font  = _lerp(OVERLAY_FONT_MIN, OVERLAY_FONT_MAX) * OVERLAY_SCALE
    if   prio >= 7: box += 2
    elif prio >= 4: box += 1
    return max(1, box), max(1, bone), max(1, joint), max(0.28, font)


def draw_pose_overlay(frame, kpts, color=None, bone_t=2, joint_r=4):
    """Skeleton overlay. `color` (BGR) ties the joints and bones to the track's
    status so the skeleton, the box and the HUD all say the same thing; the
    joints are drawn in a lightened version so they stay readable against the
    bones. Passing None keeps the original cyan/yellow scheme.

    `bone_t` / `joint_r` come from overlay_weights() at the call sites; the
    defaults reproduce the old fixed weights for any other caller."""
    skeleton = [
        (0,1),(0,2),(1,3),(2,4),(5,6),(5,7),(7,9),(6,8),
        (8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)
    ]
    bone_c  = color if color is not None else (255, 255, 0)
    joint_c = (tuple(min(255, int(c) + 60) for c in color)
               if color is not None else (0, 255, 255))
    for a, b in skeleton:
        if kpts[a][2] > POSE_CONF_THRESHOLD and kpts[b][2] > POSE_CONF_THRESHOLD:
            cv2.line(
                frame,
                (int(kpts[a][0]), int(kpts[a][1])),
                (int(kpts[b][0]), int(kpts[b][1])),
                bone_c, bone_t
            )
    # Joints last so they sit on top of the bones rather than under them.
    for kp in kpts:
        if kp[2] > POSE_CONF_THRESHOLD:
            cv2.circle(frame, (int(kp[0]), int(kp[1])), joint_r, joint_c, -1)

# ─────────────────────────────────────────────────────────────────────────────
# Module D — Body-Based Agitation Scorer
# ─────────────────────────────────────────────────────────────────────────────
class BodyAgitationScorer:
    """
    Detects agitation through distress body posture and movement.
    Uses COCO-17 pose keypoints — fully CCTV-compatible (ceiling/wall mount).

    Signals detected:
      1. One hand near head  — wrist elevated to head level (distress / self-soothing)
      2. Both hands on head  — bilateral wrist-to-head (classic distress pose)
      3. Wrist oscillation   — rapid repetitive wrist motion near head
                               (hair-grabbing / self-hitting pattern)
      4. Bilateral arm raise — both elbows above shoulders (agitation posture)

    No face required — works at distance and from above-angle CCTV.
    """

    GRACE_S = 3.0   # seconds below threshold before timer resets

    def __init__(self):
        self._wrist_history   = deque(maxlen=150)   # (avg_wrist_y, timestamp)
        self._body_agi_since  = None
        self._body_grace_since = None
        self._last_alert      = 0.0
        # Per-frame signals exposed for HUD rendering. The inference loop
        # reads these to draw the explicit "HAIR-GRAB" label when both
        # conditions are active simultaneously, separate from the generic
        # body-agitation readout.
        self._last_hands_on_head = 0
        self._last_oscillation   = 0.0

    def update(self, kpts, now):
        """
        kpts : numpy (17, 3) COCO keypoints or None.
        Returns (body_score, alert_or_None).
        """
        if kpts is None:
            return 0.0, None

        score = self._compute_score(kpts, now)
        alert = self._evaluate_alert(score, now)
        return score, alert

    def _compute_score(self, kpts, now):
        CONF = 0.35

        def xy(i):   return kpts[i][0], kpts[i][1]
        def ok(i):   return float(kpts[i][2]) >= CONF

        # Need nose + both shoulders as anchors
        if not (ok(0) and ok(5) and ok(6)):
            return 0.0

        nose_x,  nose_y  = xy(0)
        lsh_x,   lsh_y   = xy(5)
        rsh_x,   rsh_y   = xy(6)

        shoulder_mid_y  = (lsh_y + rsh_y) / 2
        shoulder_width  = abs(rsh_x - lsh_x)
        head_x          = nose_x

        score = 0.0

        # ── Signal 1 & 2 : Hand(s) near head ─────────────────────────────
        # A wrist counts as "near head" when:
        #   • confidence >= 0.45 (lowered from 0.55: hair-grab / face-touch
        #     occludes the wrist enough that YOLOv8-pose typically reports
        #     0.40–0.50 confidence on the gripping hand. The geometric
        #     constraints below are strict enough that ghost keypoints at
        #     this level rarely satisfy both conditions simultaneously.)
        #   • it is above the shoulder midpoint (Y axis, image coords)
        #   • it is within 1.0 × shoulder_width horizontally of the nose
        #     (widened from 0.7: a hair-grab anchors the wrist at temple
        #     level, ~0.7–1.0 shoulder-widths out from the nose. The old
        #     0.7 boundary cut off legitimate temple grips.)
        #
        # ONE hand near head = 0.15 (below threshold — scratching, adjusting hair)
        # BOTH hands near head = 0.70 (genuine distress pose)
        # Oscillation only counted when BOTH hands present — scratching ≠ agitation
        HIGH_CONF = 0.45
        hands_on_head = 0
        wrist_ys = []
        for wr_i in [9, 10]:           # left wrist=9, right wrist=10
            if float(kpts[wr_i][2]) >= HIGH_CONF:
                wx, wy = xy(wr_i)
                if wy < shoulder_mid_y and abs(wx - head_x) < shoulder_width * 1.0:
                    hands_on_head += 1
                    wrist_ys.append(wy)

        if hands_on_head == 2:
            score += 0.70              # both hands on head — strong distress signal
        elif hands_on_head == 1:
            score += 0.15              # one hand near head — normal (scratch, adjust hair)

        # Track wrist position for oscillation only when BOTH hands near head
        if wrist_ys:
            self._wrist_history.append((sum(wrist_ys) / len(wrist_ys), now))

        # ── Signal 3 : Wrist oscillation (grabbing / pulling motion) ──────
        # Only counts when BOTH hands are near head — prevents scratch triggering it
        osc = self._oscillation_score(now)
        if hands_on_head == 2:
            score += osc * 0.25        # rapid bilateral wrist movement near head

        # Stash for the HUD — the inference loop checks these to decide
        # whether to overlay the explicit "HAIR-GRAB" indicator.
        self._last_hands_on_head = hands_on_head
        self._last_oscillation   = osc

        # ── Signal 4 : Bilateral arm raise (both elbows above shoulders) ──
        if ok(7) and ok(8):
            le_x, le_y = xy(7)
            re_x, re_y = xy(8)
            if le_y < shoulder_mid_y and re_y < shoulder_mid_y and hands_on_head == 0:
                score += 0.25          # raised arms, hands NOT on head

        return float(np.clip(score, 0.0, 1.0))

    def is_hair_grab_pattern(self, osc_threshold=0.4):
        """
        True when the most recent frame matched the hair-grab signature:
        BOTH wrists near the head AND rapid wrist oscillation. Used by the
        HUD to draw an explicit "HAIR-GRAB" indicator separate from the
        generic body-agitation score readout.
        """
        return (self._last_hands_on_head == 2
                and self._last_oscillation >= osc_threshold)

    def _oscillation_score(self, now):
        """Rapid repetitive wrist movement near head → hair-grabbing pattern."""
        cutoff = now - 4.0
        recent = [(y, t) for y, t in self._wrist_history if t > cutoff]
        if len(recent) < 5:
            return 0.0
        ys = [y for y, _ in recent]
        reversals = sum(
            1 for i in range(2, len(ys))
            if (ys[i-1] - ys[i-2]) * (ys[i] - ys[i-1]) < 0
            and abs(ys[i] - ys[i-1]) > 4   # min pixel movement to count
        )
        return min(1.0, reversals / 5.0)

    def _evaluate_alert(self, score, now):
        if score > AGITATION_THRESHOLD:
            self._body_agi_since  = self._body_agi_since or now
            self._body_grace_since = None
        else:
            if self._body_agi_since is not None:
                self._body_grace_since = self._body_grace_since or now
                if now - self._body_grace_since > self.GRACE_S:
                    self._body_agi_since  = None
                    self._body_grace_since = None

        if (self._body_agi_since is not None and
                now - self._body_agi_since > BEHAVIOR_MIN_SUSTAINED_S and
                now - self._last_alert > BEHAVIOR_COOLDOWN_S):
            self._last_alert       = now
            self._body_agi_since   = None
            self._body_grace_since = None
            return "AGITATION_RISK"
        return None

# ─────────────────────────────────────────────────────────────────────────────
# Module E — Movement Tracker
# ─────────────────────────────────────────────────────────────────────────────
class MovementTracker:
    """
    Detects inactivity from normalized per-track signals.

    Tracks two signals per frame:
      cx     — centroid x, normalized to frame width
      cy     — centroid y, normalized to frame height

    Inactivity has two flavours:
      • plain   "INACTIVE (Ns)"                  — stationary, posture OK
      • posture "INACTIVE — POSTURE (Ns)"        — stationary AND torso pitched
                                                    past INACTIVITY_POSTURE_ANGLE
                                                    (slumped / head-down etc.)

    Also exposes is_stationary(now) so the orchestration loop can suppress
    AGITATION_RISK alerts on a person who hasn't moved — agitation requires
    motion, so a still subject cannot be agitated by definition.
    """

    def __init__(self, frame_w=640, frame_h=480, label="CAM"):
        self.fw, self.fh  = frame_w, frame_h
        self.label        = label              # used for debug printouts
        # (cx, cy, timestamp).
        self._positions   = deque(maxlen=300)
        self._stationary_since = None
        self._last_inactivity_alert = 0.0
        self._last_debug_print      = 0.0

    def update(self, center_px, now, torso_angle=0.0, has_kpts=False):
        """
        center_px   : (cx, cy) in pixel coordinates
        torso_angle : torso degrees from vertical (0 = upright, 90 = horizontal)
        has_kpts    : whether torso_angle is trustworthy (requires keypoints)
        Returns alert_type string or None.
        """
        cx    = center_px[0] / self.fw
        cy    = center_px[1] / self.fh

        # EMA smoothing on the centroid. Standing-person bboxes jitter more
        # than seated ones (full body visible = more keypoint degrees of
        # freedom for YOLO to vary). alpha=0.3 dampens that noise enough
        # that a genuinely stationary standing person's smoothed velocity
        # stays below INACTIVITY_VEL_MAX, while real walking (20+ px/frame)
        # still reaches steady-state velocity within 3–4 frames.
        if self._positions:
            px_prev, py_prev, _ = self._positions[-1]
            alpha = 0.3
            cx = alpha * cx + (1 - alpha) * px_prev
            cy = alpha * cy + (1 - alpha) * py_prev

        self._positions.append((cx, cy, now))

        # ── Inactivity check ─────────────────────────────────────────────
        # Instantaneous velocity is kept only for the debug readout.
        # The stationary DECISION uses a 3-second rolling median via
        # is_stationary() — single-frame spikes from breathing or YOLO
        # bbox jitter no longer reset the timer.
        if len(self._positions) >= 2:
            px, py, pt = self._positions[-2]
            dt  = max(now - pt, 1e-6)
            vel = np.sqrt((cx - px)**2 + (cy - py)**2) / dt
        else:
            vel = 1.0

        if self.is_stationary(now, min_seconds=2.0):
            self._stationary_since = self._stationary_since or now
            elapsed = now - self._stationary_since
            self._maybe_debug(now, vel, elapsed)
            if (elapsed >= INACTIVITY_THRESHOLD_S and
                    now - self._last_inactivity_alert > MOVEMENT_COOLDOWN_S):
                self._last_inactivity_alert = now
                # Posture-aware variant: if the person is held still AND
                # leaning past the concerning-posture angle, surface that
                # in the alert. Caller picks "EMERGENCY" off the "INACTIVE"
                # prefix either way, so the level is unchanged.
                if has_kpts and torso_angle > INACTIVITY_POSTURE_ANGLE:
                    return f"INACTIVE — POSTURE ({int(elapsed)}s)"
                return f"INACTIVE ({int(elapsed)}s)"
        else:
            self._stationary_since = None
            self._maybe_debug(now, vel, 0.0)

        return None

    def is_stationary(self, now, min_seconds=AGITATION_MOTION_GATE_S):
        """
        True if the MEDIAN per-step velocity over the last `min_seconds`
        of position history is below INACTIVITY_VEL_MAX.

        Why median over a window, not a continuous timer:
        the previous implementation reset `_stationary_since` to None on
        any single frame where vel exceeded the threshold. With noisy
        keypoint / bbox input that meant the gate almost never engaged,
        and AGITATION_RISK leaked through on a perfectly still subject.
        Median over a window absorbs single-frame spikes — the gate now
        engages whenever the subject is "mostly still", which is the
        correct semantic for suppressing agitation noise.

        Inactivity alerting still uses the strict continuous timer
        (`_stationary_since`) inside update() — only the gate signal
        is loosened here.
        """
        cutoff = now - min_seconds
        recent = [(cx, cy, t) for cx, cy, t in self._positions if t >= cutoff]
        if len(recent) < 3:
            return False
        vels = []
        for i in range(1, len(recent)):
            cx0, cy0, t0 = recent[i - 1]
            cx1, cy1, t1 = recent[i]
            dt = max(t1 - t0, 1e-6)
            vels.append(np.hypot(cx1 - cx0, cy1 - cy0) / dt)
        if not vels:
            return False
        return float(np.median(vels)) < INACTIVITY_VEL_MAX

    def _maybe_debug(self, now, vel, stationary_elapsed):
        """
        Periodic diagnostic print so you can see what the tracker observes
        during live testing. Silent unless VERBOSE_LOGS is on.
        """
        if not VERBOSE_LOGS:
            return
        if MOVEMENT_DEBUG_EVERY_S <= 0:
            return
        if now - self._last_debug_print < MOVEMENT_DEBUG_EVERY_S:
            return
        self._last_debug_print = now

        moving = "STILL " if vel < INACTIVITY_VEL_MAX else "MOVING"
        print(f"[MOVE {self.label}] {moving} | vel={vel:.4f} | "
              f"stationary={stationary_elapsed:.1f}s/{INACTIVITY_THRESHOLD_S}s | "
              f"samples={len(self._positions)}")

    def reset(self):
        self._stationary_since = None

# ─────────────────────────────────────────────────────────────────────────────
# Module C — Fall State Machine
# ─────────────────────────────────────────────────────────────────────────────
class FallStateMachine:
    """
    Temporally-smoothed fall detection.
    Requires N consecutive frames before committing to a new state —
    prevents single-frame noise from triggering false alerts.
    """

    NORMAL   = "NORMAL"
    STUMBLE  = "STUMBLE"
    FALLEN   = "FALLEN"

    def __init__(self):
        self._state            = self.NORMAL
        self._candidate        = self.NORMAL
        self._candidate_count  = 0
        self._last_fall_alert_time    = 0.0   # cooldown for FALL only
        self._last_lying_alert_time   = 0.0   # separate cooldown for LYING DOWN
        self._fallen_since     = None
        # When a slow transition into FALLEN is observed, we set this timestamp
        # and only emit the LYING DOWN alert after LYING_CONFIRM_SECONDS have
        # elapsed with the person continuously in FALLEN. None when no slow
        # transition is pending. See _evaluate_alert for the firing logic.
        self._lying_confirm_since = None
        self._last_fall_label  = "FALL DETECTED (HIGH CONFIDENCE)"
        # (angle, timestamp). Bounded by TIME, not frame count — see
        # ANGLE_HISTORY_S for why the old maxlen=60 was a latent bug.
        self._angle_history    = deque(maxlen=ANGLE_HISTORY_MAXLEN)
        # (centre_y, bbox_h, timestamp) — parallel to _angle_history, so the
        # fast-fall path can ask "did the body actually move while that angle
        # was changing?". See FALL_MOTION_GATE.
        self._motion_history   = deque(maxlen=ANGLE_HISTORY_MAXLEN)
        self._max_bbox_h       = 0  # largest bbox height seen for this track (standing reference)
        self._seated_until     = 0.0  # sticky seated dwell, see SEATED_STICKY_S
        self._seated_deep      = False  # knees deeply folded at last seated reading
        self._pending_onset    = False  # promoted on vanish; run onset logic next tick
        # First observation timestamp — used to refuse an instant EMERGENCY to
        # a track that has existed for two frames. See UNWITNESSED_MIN_*.
        self._first_seen       = None
        self._frames_seen      = 0
        # Set when the unwitnessed-fall path was deferred for want of track
        # history; the confirm timer then fires it as a FALL, not a lie-down.
        self._unwitnessed_pending = False
        # Prolonged-fall escalation: how many notices this fall has produced,
        # and the elapsed-seconds mark the next one is due at.
        self._prolonged_sent = 0
        self._prolonged_due  = PROLONGED_FALL_AFTER_S
        # Name of the furniture zone the person was last resting in, or None.
        self._furniture = None

    def update(self, angle, aspect_ratio, has_kpts, now, bbox_h=0,
               posture=(None, None), seated=False, seated_deep=False,
               furniture=None, center_y=None, extent_ratio=None,
               bend=False,
               on_floor=True, lower_body=True):
        """
        angle:        torso angle from vertical (degrees)
        aspect_ratio: bbox height / width
        has_kpts:     whether required keypoints are visible
        bbox_h:       bounding box height in pixels (used for height-ratio fall path)
        posture:      (elevation, compactness) from get_posture_ratios(), only
                      consulted when POSTURE_RATIO=1; defaults keep the old
                      signature working for any other caller.
        furniture:    name of the furniture zone supporting this person, or
                      None. Defaults to None so any other caller is unaffected.
        center_y:     bbox centre y in pixels, for the fast-fall displacement
                      gate. None disables the gate for this track (fail open).
        extent_ratio: body_extent_ratio() — bbox height in torso lengths.
                      None means unmeasurable, and the Path B gate abstains.
        bend:         standing_bend() — True when the legs are still extended
                      below the hips, i.e. bent over but on their feet.
                      Suppresses Path A only. Defaults False so any other
                      caller behaves exactly as before.
        Returns (state_string, alert_type_or_None)
        """
        self._furniture = furniture
        if self._first_seen is None:
            self._first_seen = now
        self._frames_seen += 1
        if not has_kpts:
            self._candidate = self.NORMAL
            self._candidate_count = 0
            return self._state, None

        # Maintain standing-height reference. Guard on current state (NORMAL)
        # rather than aspect_ratio > 1.5 — overhead/diagonal CCTV cameras
        # produce square bboxes even for standing people, so the old aspect
        # guard meant _max_bbox_h was never set and Path B never fired.
        if bbox_h > 0 and self._state == self.NORMAL:
            self._max_bbox_h = max(self._max_bbox_h, bbox_h)

        height_ratio = (bbox_h / self._max_bbox_h
                        if self._max_bbox_h > 30 and bbox_h > 0 else 1.0)

        # Track angle over time — used to measure transition speed
        self._angle_history.append((angle, now))
        # ...and the body's position/size alongside it, so the fast-fall path
        # can check the angle change was accompanied by actual movement.
        self._motion_history.append(
            (center_y if center_y is not None else None, bbox_h, now))
        # Prune by age so the window is a number of SECONDS on every host,
        # regardless of inference rate. Always keep at least two samples so a
        # rate can still be computed after a long detection gap.
        horizon = now - ANGLE_HISTORY_S
        while len(self._angle_history) > 2 and self._angle_history[0][1] < horizon:
            self._angle_history.popleft()
        while len(self._motion_history) > 2 and self._motion_history[0][2] < horizon:
            self._motion_history.popleft()

        # Classify raw frame.
        # Path A: classic horizontal fall — wide bbox + large torso angle.
        #   aspect_ratio < 0.85 (bbox clearly wider-than-tall) is required to
        #   avoid false positives on overhead CCTV cameras where perspective
        #   compresses standing people to a near-square bbox (aspect 1.0–1.4)
        #   and simultaneously projects their torso angle above 65°.
        #   The get_body_aspect_ratio docstring already states <0.9 = "likely
        #   fallen" — 0.85 aligns with that contract; the old 1.2 was too loose.
        # Path B: vertical fall toward/away from camera — 2D torso angle stays
        #         near 0° (projection artefact), but bbox height collapses to
        #         less than FALL_HEIGHT_RATIO_THRESHOLD of the standing reference.
        #   aspect_ratio < 1.2 gate prevents perspective-driven bbox shrinkage
        #   (person walking away from camera gets smaller but stays upright)
        #   from triggering this path.
        # Path C (POSTURE_RATIO=1): calibration-free body ratios. Unlike Path B
        # this needs no standing reference, so it also catches someone already
        # down when the stream starts. Both ratios must agree before it fires —
        # either alone is too noisy to justify an EMERGENCY.
        # OR, not AND: the two ratios cover each other's blind spot. Elevation
        # catches a body lying across the view, where compactness stays high;
        # compactness catches a body lying along the view, where elevation is
        # fooled by projection. Requiring both would fire on neither.
        path_c = False
        if POSTURE_RATIO_ON:
            elevation, compactness = posture
            low_elev = elevation is not None and elevation < POSTURE_ELEVATION_MAX
            low_comp = compactness is not None and compactness < POSTURE_COMPACT_MAX
            if POSTURE_REQUIRE_BOTH:
                # Both must be measurable AND both must agree. A single ratio
                # is not enough evidence to declare a person on the floor.
                path_c = (elevation is not None and compactness is not None
                          and low_elev and low_comp)
            else:
                path_c = low_elev or low_comp

        # Short dwell so an armchair briefly hiding a knee doesn't blink the
        # guard off mid-sit; the override below stops it ever masking a fall.
        if seated:
            self._seated_until = now + SEATED_STICKY_S
            self._seated_deep  = seated_deep
        seated_now = seated or now < self._seated_until

        # Floor-level override — but NOT while the knees are deeply folded.
        # A low armchair seen from above puts a seated person's bbox under the
        # threshold, and letting height win there disabled the guard on exactly
        # the pose it exists for. You cannot lie flat with your knees at 60°,
        # so deep flexion outranks bbox height.
        if height_ratio < SEATED_OVERRIDE_HRATIO and not self._seated_deep:
            seated_now = False
            self._seated_until = 0.0

        # The guard may PREVENT a fall, never UNDO one. Once FALLEN is
        # established, a seated-looking reading (bent knees on the floor) must
        # not reset the state — doing so cleared _lying_confirm_since and
        # restarted the 3s confirmation on every brief re-detection, so it
        # never completed. Recovery needs positive evidence of getting up,
        # which the existing NORMAL classification below still provides.
        # Furniture override — the actual "lying down means ON THE FLOOR" rule.
        # A hip midpoint inside a sofa/bed/chair zone means the body is being
        # held up by furniture, which no pose geometry can tell you. In "all"
        # mode this outranks every fall path; in "slow" mode it only blocks
        # the controlled-descent path, so a genuine collapse onto the bed
        # still alerts. It never UNDOES an established FALLEN, for the same
        # reason the seated guard doesn't: that reset the confirm timer every
        # frame and the alert never completed.
        # Path B, with both gates its comment always described:
        #   * aspect below FALL_PATH_B_ASPECT_MAX (a taller-than-wide box is
        #     an upright person, however small they look at range);
        #   * the skeleton agreeing the body is compressed. `_max_bbox_h` is
        #     range-blind, so height_ratio alone measures how far away the
        #     person walked. body_extent_ratio() cancels range.
        # extent_ratio None => unmeasurable => the gate abstains (fail open).
        path_b = (height_ratio < FALL_HEIGHT_RATIO_THRESHOLD
                  and aspect_ratio < FALL_PATH_B_ASPECT_MAX
                  and (extent_ratio is None or extent_ratio < FALL_EXTENT_MAX))

        # Path A, with the standing-bend exception.
        #
        # Path A reads a large torso angle as "horizontal body". Bending at the
        # waist to pick something up produces exactly that — 85-115 degrees —
        # while the person is still on their feet, so a cleaner reaching for
        # something off the floor was reported as a fall, and if she stayed
        # bent for LYING_CONFIRM_SECONDS the confirm timer relabelled it
        # LYING DOWN. The seated guard cannot catch this: bending leaves the
        # knees straight, and looks_seated() returns False the moment it sees
        # a straight leg, before the hip-flexion test can run.
        #
        # standing_bend() supplies the missing fact — the legs are still
        # extended below the hips, i.e. the person is standing up.
        #
        # Deliberately scoped to Path A ONLY, not a global override, because
        # the same measurement misreads a body lying with its FEET TOWARD THE
        # CAMERA: that pose foreshortens the torso, shrinking the denominator
        # until the legs look extended (measured 1.59, above the threshold).
        # That pose has a torso angle near 0 so Path A was never firing on it,
        # and it is caught by Path B/C instead — which this leaves alone.
        path_a = (angle > FALL_ANGLE_THRESHOLD and aspect_ratio < 1.3
                  and not bend)

        # ── Positive-evidence gates for a NEW fall ───────────────────────
        # The paths above say "this shape could be horizontal", and
        # standing_bend() already removes the person who is bent over but still
        # on their feet. These ask what none of them can:
        #   is the body over the floor at all,
        #   can we see the half of it that would be on the floor,
        #   is it big enough in pixels for any of this to mean anything.
        #
        # They only ever PREVENT a fall. None may undo an established FALLEN —
        # clearing that state mid-confirmation restarts the timer and the real
        # alert never completes. Same reason the seated guard doesn't.
        if self._state != self.FALLEN:
            _gate = None
            if FLOOR_ZONE_REQUIRED and not on_floor:
                _gate = "support point outside the floor zone"
            elif FALL_REQUIRE_LOWER_BODY and not lower_body:
                _gate = "hips/knees not visible - cannot see the lower body"
            elif (FALL_MIN_BBOX_H_FRAC > 0 and bbox_h > 0
                  and bbox_h < FALL_MIN_BBOX_H_FRAC * INFERENCE_H):
                _gate = "body only %dpx tall - too far for fall geometry" % int(bbox_h)
            if _gate is not None:
                if FLOOR_GATE_DEBUG and (
                        now - getattr(self, "_gate_logged_at", 0.0)
                        >= FLOOR_GATE_LOG_EVERY_S):
                    self._gate_logged_at = now
                    print("[FALL SM] gate: FALLEN suppressed - " + _gate)
                self._candidate = self.NORMAL
                self._candidate_count = 0
                return self._state, None

        on_furniture = furniture is not None
        if on_furniture and FURNITURE_MODE == "all" and self._state != self.FALLEN:
            raw = self.NORMAL
        elif seated_now and self._state != self.FALLEN:
            raw = self.NORMAL
        elif path_a or path_b or path_c:
            raw = self.FALLEN
        elif angle > STUMBLE_ANGLE_THRESHOLD:
            raw = self.STUMBLE
        else:
            raw = self.NORMAL


        # Temporal smoothing
        if raw == self._candidate:
            self._candidate_count += 1
        else:
            self._candidate = raw
            self._candidate_count = 1

        required = {
            self.FALLEN:  FALL_FRAMES_REQUIRED,
            self.STUMBLE: STUMBLE_FRAMES_REQUIRED,
            self.NORMAL:  2,
        }
        if self._candidate_count < required[raw]:
            return self._state, None

        prev = self._state
        self._state = raw

        # Track how long person has been on floor
        if self._state == self.FALLEN:
            self._fallen_since = self._fallen_since or now
        else:
            self._fallen_since = None
            self._unwitnessed_pending = False
            # They got up. A LATER fall is a new event and deserves the full
            # escalation again, so rearm here rather than at alert time.
            self._prolonged_sent = 0
            self._prolonged_due  = PROLONGED_FALL_AFTER_S
            # Person left FALLEN before the lying-confirm window elapsed —
            # this is exactly what the timer is for: their "fall" was
            # transient (a bend, a partial slump that recovered) and should
            # NOT alert. Cancel the pending confirmation.
            self._lying_confirm_since = None

        alert = self._evaluate_alert(prev, self._state, now)
        return self._state, alert

    def is_fallen(self):
        return self._state == self.FALLEN

    def promote_on_vanish(self, now):
        """Commit a fall that was still being confirmed when the track died.

        FALL_FRAMES_REQUIRED demands 3 consecutive FALLEN frames before the
        state commits. A body on the floor is the hardest thing for the
        detector to hold, so a real fall often supplies only one or two frames
        before the track is lost — the candidate never commits, _state stays
        NORMAL, and tick_absent() has nothing to continue. The fall then only
        surfaces if the person MOVES later and detection returns, which is
        precisely backwards for an unconscious resident.

        A track that was upright, began registering FALLEN, and then vanished
        is far more likely to be on the floor than to have left the room, so
        the pending candidate is committed here and the lying-down
        confirmation armed. Returns True if it promoted.
        """
        if self._state == self.FALLEN:
            return False
        # EVIDENCE BAR. This used to accept `_candidate_count >= 1` from a
        # track of any age, which is how the facility got ~80 phantom clips.
        # At DET_CONF 0.10 the detector mints tracks on shadows, chair backs
        # and half-occluded limbs; such a track lives a frame or two, its junk
        # keypoints happen to read as horizontal, and it vanishes. That was
        # enough to commit it to FALLEN and hold it for FALLEN_TIMEOUT_S,
        # which is long enough to emit LYING DOWN plus two PROLONGED FALL
        # notices and open an incident clip — per ghost, and the ID counter
        # was in the tens of thousands.
        #
        # Promotion exists for a REAL fall whose track dies mid-descent, and a
        # real fall supplies more than one frame and comes from a track that
        # existed before it fell. Demanding both costs nothing on the genuine
        # case and removes the ghost case entirely.
        if self._candidate != self.FALLEN or \
                self._candidate_count < PROMOTE_MIN_CANDIDATE_FRAMES:
            return False
        if not self._has_enough_history(now):
            if PERSIST_DEBUG:
                print(f"[PERSIST] refusing to promote a {self._track_age(now):.1f}s / "
                      f"{self._frames_seen}-frame track — too new to trust")
            return False
        # Last seen supported by furniture — the disappearance of someone
        # sitting on a sofa is not evidence of a collapse, it is evidence the
        # detector lost a stationary person. Promoting here manufactured falls
        # out of every seated resident whose track lapsed.
        if self._furniture is not None:
            return False
        self._state = self.FALLEN
        self._fallen_since = now
        # Do NOT assume this was a slow lie-down. Previously this armed the
        # lying-confirm unconditionally, so every unseen fall — however violent
        # — was reported as LYING DOWN. Defer to _evaluate_alert's normal
        # onset logic, which reads the recorded angle history and decides fast
        # fall vs slow descent on the evidence.
        self._pending_onset = True
        return True

    def tick_absent(self, now):
        """Advance timers for a track the detector can no longer see.

        Only meaningful once the person has ALREADY been classified FALLEN —
        we are continuing a conclusion that was reached while they were still
        visible, not inventing one. State is deliberately left unchanged: with
        no observation there is no evidence they got up, and assuming recovery
        is the dangerous assumption.

        Returns an alert string or None. Cooldowns inside _evaluate_alert stop
        this from re-firing every frame.
        """
        if not (self._state == self.FALLEN and self._fallen_since is not None):
            return None
        # Must have actually held FALLEN, not flickered through it.
        if now - self._fallen_since < PERSIST_MIN_FALLEN_S:
            return None
        # First tick after a promotion runs the ONSET branch, so the fast/slow
        # decision is made from the real angle history rather than defaulting
        # to a lie-down. A violent fall that vanished mid-descent still reports
        # as FALL DETECTED.
        if getattr(self, "_pending_onset", False):
            self._pending_onset = False
            return self._evaluate_alert(self.NORMAL, self.FALLEN, now)
        return self._evaluate_alert(self.FALLEN, self.FALLEN, now)

    def vanished_mid_frame(self, frame_w, frame_h, margin=PERSIST_EDGE_MARGIN):
        """True if the last known box was clear of the frame border.

        Someone who disappears at the edge most likely walked out; someone who
        disappears mid-room did not, and that is the case worth holding on to.
        """
        b = getattr(self, "last_box", None)
        if b is None:
            return True          # unknown — err toward keeping them
        x1, y1, x2, y2 = b
        return not (x1 <= margin or y1 <= margin
                    or x2 >= frame_w - margin or y2 >= frame_h - margin)

    def _track_age(self, now):
        return 0.0 if self._first_seen is None else max(0.0, now - self._first_seen)

    def _has_enough_history(self, now):
        """True if this track is old enough for 'never seen upright' to mean
        anything. A newborn track has no history because it is newborn, not
        because the person was already down."""
        return (self._track_age(now) >= UNWITNESSED_MIN_AGE_S
                and self._frames_seen >= UNWITNESSED_MIN_FRAMES)

    def adopt_from(self, other):
        """Take over another track's identity after a tracker ID switch.

        Carries the evidence that makes the fall logic correct — angle history
        (so `_never_seen_upright` is not fooled), the standing-height
        reference (so Path B doesn't recalibrate against a fallen bbox), the
        alert cooldowns (so the same event cannot re-fire under a new id) and
        the committed state itself.

        Deliberately NOT carried: nothing. The whole point is that this is the
        same person, so the new id should be indistinguishable from the old.
        """
        self._state               = other._state
        self._candidate           = other._candidate
        self._candidate_count     = other._candidate_count
        self._last_fall_alert_time  = other._last_fall_alert_time
        self._last_lying_alert_time = other._last_lying_alert_time
        self._fallen_since        = other._fallen_since
        self._lying_confirm_since = other._lying_confirm_since
        self._last_fall_label     = other._last_fall_label
        self._angle_history       = other._angle_history
        self._motion_history      = other._motion_history
        self._max_bbox_h          = other._max_bbox_h
        self._seated_until        = other._seated_until
        self._seated_deep         = other._seated_deep
        self._pending_onset       = other._pending_onset
        self._first_seen          = other._first_seen
        self._frames_seen         = other._frames_seen
        self._unwitnessed_pending = other._unwitnessed_pending
        # Carry the escalation state too. Without this a ByteTrack ID switch
        # rearms the whole ladder, and the same body on the same floor starts
        # its notifications again from zero under a new number — which is the
        # spam this was written to stop, arriving by a different route.
        self._prolonged_sent      = other._prolonged_sent
        self._prolonged_due       = other._prolonged_due
        self._furniture           = other._furniture
        if getattr(other, "last_box", None) is not None:
            self.last_box = other.last_box

    def _never_seen_upright(self):
        """True if this track has no record of the person standing.

        The angle history starts when the track is created. If its minimum
        torso angle is already past UPRIGHT_ANGLE_MAX, the track began with
        the person part-way down or already on the floor — so there is no
        descent to measure and a low rate means nothing.
        """
        if not self._angle_history:
            return True
        return min(a for a, _ in self._angle_history) > UPRIGHT_ANGLE_MAX

    def _get_angle_rate(self, now, window_s=FALL_RATE_WINDOW_S):
        """
        Peak rising rate of torso angle (deg/sec) within the last window_s.

        Computed as (current_angle − min_angle_in_window) / Δt_since_min.

        WHY this and not (latest − earliest):
          At realistic inference rates (3–5 fps for YOLO-pose + MediaPipe on
          CPU), by the time FALLEN commits (FALL_FRAMES_REQUIRED frames after
          the raw classification), the entire 0.8 s window is already saturated
          near 85°. (latest − earliest) ≈ 0 → every fall mis-classifies as
          "LYING DOWN". Anchoring on min angle inside a longer window
          recovers the actual upright→fallen velocity.
        """
        cutoff = now - window_s
        recent = [(a, t) for a, t in self._angle_history if t >= cutoff]
        if len(recent) < 2:
            return 0.0
        angles = [a for a, _ in recent]
        times  = [t for _, t in recent]
        min_idx = int(np.argmin(angles))
        if min_idx == len(angles) - 1:
            return 0.0   # min IS the current frame — no rise to measure
        dt = max(times[-1] - times[min_idx], 0.001)
        return max(0.0, (angles[-1] - angles[min_idx]) / dt)

    def _body_actually_moved(self, now, window_s=FALL_RATE_WINDOW_S):
        """Did the body move, over the window the angle rate was measured on?

        Returns (moved, reason). `moved` is True when the evidence supports a
        real fall OR when there is not enough evidence to judge — abstaining
        must never suppress an emergency, so the only False is a positive
        reading of "the body held still while the estimate jumped".

        Both measures are divided by the person's own standing bbox height, so
        the thresholds carry across cameras and distances with no calibration.
        """
        if not FALL_MOTION_GATE_ON:
            return True, "gate off"
        scale = self._max_bbox_h
        if scale <= 30:
            return True, "no standing reference"

        cutoff = now - window_s
        recent = [(cy, bh, t) for cy, bh, t in self._motion_history if t >= cutoff]
        if len(recent) < 2:
            return True, "too few samples"

        # Anchor on the same frame _get_angle_rate anchors on: the minimum
        # angle in the window, i.e. the most upright the person was seen.
        angles = [(a, t) for a, t in self._angle_history if t >= cutoff]
        if len(angles) < 2:
            return True, "too few angle samples"
        anchor_t = min(angles, key=lambda at: at[0])[1]
        before = [m for m in recent if m[2] <= anchor_t] or [recent[0]]
        start, end = before[-1], recent[-1]

        descent = None
        if start[0] is not None and end[0] is not None:
            descent = (end[0] - start[0]) / scale        # +ve = moved down
        drop = (start[1] - end[1]) / scale if (start[1] and end[1]) else None

        if descent is None and drop is None:
            return True, "nothing measurable"
        if (descent is not None and descent >= FALL_MIN_DESCENT) or \
           (drop is not None and drop >= FALL_MIN_HEIGHT_DROP):
            return True, (f"descent {descent if descent is None else round(descent, 2)}, "
                          f"height drop {drop if drop is None else round(drop, 2)}")
        return False, (f"descent {descent if descent is None else round(descent, 2)}, "
                       f"height drop {drop if drop is None else round(drop, 2)} "
                       f"— body did not move")

    def _evaluate_alert(self, prev, curr, now):
        alert = None

        if curr == self.FALLEN and prev != self.FALLEN:
            # FIRST FRAME of FALLEN — classify as fast fall vs slow lie-down.
            # Peak rising rate of torso angle over the last FALL_RATE_WINDOW_S.
            # Anchored on min angle in the window — see _get_angle_rate docstring
            # for why (latest − earliest) was unreliable at low inference fps.
            angle_rate = self._get_angle_rate(now)
            moved, why_moved = self._body_actually_moved(now)
            if FALL_MOTION_DEBUG:
                print(f"[FALL SM] motion gate: rate {angle_rate:.1f}deg/s, "
                      f"moved={moved} ({why_moved})")
            # A high rate with no displacement is the pose estimate jumping,
            # not a person falling. Demote it to the confirm path rather than
            # firing an EMERGENCY — if they really are down, the 3s window
            # still produces an alert.
            if angle_rate >= FALL_RATE_THRESHOLD and not moved:
                angle_rate = 0.0
                print(f"[FALL SM] ⚖ apparent fast transition rejected: {why_moved}")

            if angle_rate >= FALL_RATE_THRESHOLD:
                # Fast uncontrolled transition → genuine fall.
                # Emergencies fire IMMEDIATELY — they bypass the lying-confirm
                # timer because waiting 3s on a real fall would delay help.
                if now - self._last_fall_alert_time >= FALL_ALERT_COOLDOWN_S:
                    conf  = "HIGH" if prev == self.NORMAL else "MEDIUM"
                    alert = f"FALL DETECTED ({conf} CONFIDENCE)"
                    self._last_fall_alert_time = now
                    self._last_fall_label = alert
                    if VERBOSE_LOGS:
                        print(f"[FALL SM] ⚡ Fast transition ({angle_rate:.1f}°/s) → genuine fall")
                # Cancel any pending lying-confirm — we're past it now.
                self._lying_confirm_since = None
            elif self._furniture is not None:
                # Slow descent onto known furniture. In "all" mode we never got
                # here (raw was forced NORMAL); this is the "slow" mode path.
                # Lying on a sofa is not lying on the floor — no alert.
                #
                # Checked BEFORE the unwitnessed branch on purpose: a resident
                # who was already settled on the sofa when the stream started
                # has no upright history either, and without this ordering the
                # unwitnessed path would call that a fall.
                self._lying_confirm_since = None
                self._unwitnessed_pending = False
                self._last_fall_label = f"ON {self._furniture.upper()}"
                if FURNITURE_DEBUG:
                    print(f"[FALL SM] 🛋 slow descent inside zone "
                          f"'{self._furniture}' — not a floor event, suppressed")
            elif UNWITNESSED_FALL_ON and self._never_seen_upright():
                # We never observed this person standing, so a "slow" rate is
                # an artefact of missing history, not evidence of a controlled
                # descent — the fall happened while the detector had lost them.
                # Someone deliberately lying down is normally tracked doing it;
                # appearing already on the floor after an absence is far more
                # consistent with a fall, so it is treated as one.
                #
                # ...UNLESS the track is newborn. A track two frames old also
                # has "no upright history", and that is what an ID switch looks
                # like. Defer instead of discarding: arm the confirm timer and
                # let it fire the same EMERGENCY a few seconds later, once the
                # body has actually stayed down. See UNWITNESSED_MIN_*.
                if self._has_enough_history(now):
                    if now - self._last_fall_alert_time >= FALL_ALERT_COOLDOWN_S:
                        alert = "FALL DETECTED (UNWITNESSED)"
                        self._last_fall_alert_time = now
                        self._last_fall_label = alert
                        print(f"[FALL SM] ⚡ no upright history — descent was not "
                              f"observed, reporting as fall")
                    self._lying_confirm_since = None
                    self._unwitnessed_pending = False
                else:
                    self._unwitnessed_pending = True
                    self._lying_confirm_since = now
                    self._last_fall_label = "FALL? (CONFIRMING)"
                    if VERBOSE_LOGS:
                        print(f"[FALL SM] ⏳ no upright history but track is only "
                              f"{self._track_age(now):.1f}s / {self._frames_seen} "
                              f"frames old — confirming over "
                              f"{LYING_CONFIRM_SECONDS:.1f}s before alerting")
            else:
                # Slow/controlled → potential intentional lie-down.
                # Do NOT alert yet. Arm the confirmation timer; the alert only
                # fires if the person stays in FALLEN for LYING_CONFIRM_SECONDS.
                # If they leave FALLEN before then (bent over and recovered),
                # update() resets _lying_confirm_since to None and no alert
                # is sent. This is the false-positive guard you asked for.
                self._lying_confirm_since = now
                self._last_fall_label = "LYING DOWN (CONFIRMING)"
                print(f"[FALL SM] 🛏 Slow transition ({angle_rate:.1f}°/s) → "
                      f"confirming over {LYING_CONFIRM_SECONDS:.1f}s before alerting")

        elif curr == self.STUMBLE and prev == self.NORMAL:
            # STUMBLE: visual indicator only — no notification sent.
            # Bending, sitting, and picking up objects are geometrically
            # indistinguishable from stumbling, making stumble alerts unreliable.
            # The orange bounding box still renders on-screen as a monitoring signal.
            pass

        elif curr == self.FALLEN and self._fallen_since:
            # CONTINUED FALLEN state — check the lying-confirm timer first,
            # then fall back to the prolonged-fall re-alert.

            # ── Lying-down confirmation ────────────────────────────────────
            # If the slow-transition path armed the timer and the person has
            # now been continuously fallen for LYING_CONFIRM_SECONDS, fire.
            # A deferred unwitnessed fall does not need the full lying-confirm
            # window — it only needed the track to grow old enough to be
            # trusted. Waiting the extra time was measured costing 3.0s on a
            # real fall (33.75s vs 30.75s on fall1_slow.mp4) for no added
            # evidence. Fire as soon as the age/frame bar is met.
            if (self._unwitnessed_pending and self._lying_confirm_since is not None
                    and self._furniture is None and self._has_enough_history(now)):
                if now - self._last_fall_alert_time >= FALL_ALERT_COOLDOWN_S:
                    alert = "FALL DETECTED (UNWITNESSED)"
                    self._last_fall_alert_time = now
                    self._last_fall_label = alert
                    print(f"[FALL SM] ⚡ unwitnessed fall confirmed "
                          f"(track now {self._track_age(now):.1f}s / "
                          f"{self._frames_seen} frames) → alert sent")
                self._unwitnessed_pending = False
                self._lying_confirm_since = None

            if self._lying_confirm_since is not None:
                if now - self._lying_confirm_since >= LYING_CONFIRM_SECONDS:
                    if self._furniture is not None:
                        # They settled onto furniture, not the floor. Nothing
                        # to report; drop the pending fall too, because a body
                        # resting on a sofa is not an unwitnessed collapse.
                        self._last_fall_label = f"ON {self._furniture.upper()}"
                        self._unwitnessed_pending = False
                        if FURNITURE_DEBUG:
                            print(f"[FALL SM] 🛋 confirm window elapsed inside "
                                  f"zone '{self._furniture}' — suppressed")
                    elif self._unwitnessed_pending:   # (see the early-fire below)
                        # Deferred unwitnessed fall, now sustained. Same
                        # EMERGENCY severity as the immediate path — the gate
                        # only bought evidence, it did not downgrade anything.
                        if now - self._last_fall_alert_time >= FALL_ALERT_COOLDOWN_S:
                            alert = "FALL DETECTED (UNWITNESSED)"
                            self._last_fall_alert_time = now
                            self._last_fall_label = alert
                            print(f"[FALL SM] ⚡ unwitnessed fall confirmed "
                                  f"({LYING_CONFIRM_SECONDS:.1f}s sustained) → alert sent")
                        self._unwitnessed_pending = False
                    elif now - self._last_lying_alert_time >= FALL_ALERT_COOLDOWN_S:
                        alert = "LYING DOWN DETECTED"
                        self._last_lying_alert_time = now
                        self._last_fall_label = "LYING DOWN"
                        print(f"[FALL SM] 🛏 Confirmed lying down "
                              f"({LYING_CONFIRM_SECONDS:.1f}s sustained) → alert sent")
                    # One-shot: clear the timer so we don't re-fire each frame.
                    self._lying_confirm_since = None

            # ── Prolonged-fall re-alert ────────────────────────────────────
            # Independent of the lying-confirm path: triggers for any fall
            # (fast or slow) that has persisted >30s. Guard against firing
            # twice on the same frame as the lying-confirm above.
            # Escalates on milestones, not on a metronome — see
            # PROLONGED_FALL_STEPS_S for why, and for the log that prompted it.
            if alert is None and self._furniture is None:
                elapsed = now - self._fallen_since
                if (elapsed >= self._prolonged_due
                        and self._prolonged_sent < PROLONGED_FALL_MAX_ALERTS):
                    alert = f"PROLONGED FALL ({int(elapsed)}s)"
                    self._last_fall_alert_time = now
                    self._last_fall_label = alert
                    self._prolonged_sent += 1
                    # Next milestone strictly beyond where we already are, so a
                    # detection gap that resumes at 900s cannot replay 120s and
                    # 300s back to back.
                    self._prolonged_due = next(
                        (s for s in PROLONGED_FALL_STEPS_S if s > elapsed),
                        float("inf"))
                    print(f"[FALL SM] ⏱ prolonged fall notice "
                          f"{self._prolonged_sent}/{PROLONGED_FALL_MAX_ALERTS} "
                          f"at {int(elapsed)}s; next at "
                          f"{self._prolonged_due if self._prolonged_due != float('inf') else 'never'}")

        return alert

# ─────────────────────────────────────────────────────────────────────────────
# Alert Emitter
# ─────────────────────────────────────────────────────────────────────────────
# ── Camera-level duplicate suppression for fall-family alerts ────────────────
# Per camera: the recent fall alerts and where they happened. Re-association
# should already have prevented most duplicates by keeping one person on one
# id; this catches the rest — a track that dies and reappears outside the
# re-association window, or two overlapping detections of one body.
_FALL_ALERT_RANK = {"lying_down": 1, "fall_detected": 2, "prolonged_fall": 3}
_fall_dedup      = {}    # cam_id -> [ {ts, box, rank} ]
_fall_dedup_lock = threading.Lock()


def _fall_alert_is_duplicate(cam_id, detection, box, now):
    """True if this fall-family alert repeats a recent one in the same place.

    Escalation always passes: a higher-ranked classification (lying → fall →
    prolonged) is new information about the same body and must reach the
    nurse. Only a same-or-lower rank inside the window is dropped.
    """
    rank = _FALL_ALERT_RANK.get(detection or "", 0)
    if not FALL_DEDUP_ON or rank == 0 or box is None:
        return False
    with _fall_dedup_lock:
        recent = [e for e in _fall_dedup.get(cam_id, ())
                  if now - e["ts"] <= FALL_DEDUP_S]
        for e in recent:
            if _iou(box, e["box"]) >= FALL_DEDUP_MIN_IOU and rank <= e["rank"]:
                _fall_dedup[cam_id] = recent
                return True
        recent.append({"ts": now, "box": tuple(box), "rank": rank})
        _fall_dedup[cam_id] = recent
    return False


# ── Circuit breaker on alert volume ──────────────────────────────────────────
# Every other guard in this file fixes a specific CAUSE of spurious alerts —
# the prolonged-fall ladder, the ghost-promotion bar, the stale-frame halt, the
# time-jump reset. Each was a real bug. But fixing causes one at a time means
# the next unknown cause floods the system again, and the operator waits
# another day for another patch.
#
# This bounds the damage instead of the cause. Past ALERT_MAX_PER_HOUR alerts
# from one camera in a rolling hour, something is wrong with the DETECTOR, not
# with the facility — no real ward produces twelve emergencies an hour. Further
# alerts are dropped and a single loud notice goes out in their place.
#
# THE TRADE, stated plainly because it is a safety decision and not a technical
# one: while the breaker is open, a genuine fall WILL be missed. That is
# accepted because the alternative is fifty unread notifications, which is
# equally missed and additionally trains staff to ignore the system. The open
# breaker is itself an alert, and it says the thing that is actually true:
# this camera's detection cannot be trusted right now, go and look.
#
# Set ALERT_MAX_PER_HOUR=0 to disable.
ALERT_MAX_PER_HOUR = int(os.getenv("ALERT_MAX_PER_HOUR", "12"))
_alert_times   = {}     # cam_id -> [timestamps]
_alert_tripped = {}     # cam_id -> bool, so the notice is sent once per hour
_alert_lock    = threading.Lock()


def _alert_budget_ok(cam_id, now):
    """(allowed, first_trip). first_trip is True on the frame the breaker opens,
    so exactly one 'suppressing' notice reaches the dashboard."""
    if ALERT_MAX_PER_HOUR <= 0:
        return True, False
    with _alert_lock:
        recent = [t for t in _alert_times.get(cam_id, ()) if now - t < 3600]
        _alert_times[cam_id] = recent
        if len(recent) >= ALERT_MAX_PER_HOUR:
            first = not _alert_tripped.get(cam_id)
            _alert_tripped[cam_id] = True
            return False, first
        _alert_tripped[cam_id] = False
        recent.append(now)
        return True, False


def send_alert(cam_id, alert_type, message, detection=None, track_id=None,
               box=None):
    """Emit alert via Socket.IO to the Node.js backend, and (subject to a
    per-camera cooldown) spawn a background worker that saves a pre/post-roll
    clip to disk and stamps the clipPath onto the persisted Incident.

    The cooldown deliberately does NOT suppress the alert itself — nurses
    still need every notification — only the *clip recording*. Clustered
    alerts (fall → lying-down → inactivity) all show up on the dashboard;
    only the first one within a CLIP_COOLDOWN_S window writes a video.
    """
    now = time.time()

    # Drop a fall/lying alert that repeats one already raised for the same
    # place moments ago. Checked before the emit, so the duplicate never
    # reaches the dashboard, the incident list, or the clip recorder.
    if _fall_alert_is_duplicate(cam_id, detection, box, now):
        print(f"[DEDUP] [{cam_id}] suppressed duplicate {detection}: {message}")
        return

    # Circuit breaker. Last line of defence, cause-agnostic: whatever is
    # generating them, one camera does not legitimately raise more than
    # ALERT_MAX_PER_HOUR alerts in an hour. See _alert_budget_ok.
    _allowed, _first_trip = _alert_budget_ok(cam_id, now)
    if not _allowed:
        print(f"[BREAKER] [{cam_id}] alert rate limit "
              f"({ALERT_MAX_PER_HOUR}/hour) exceeded — dropping {detection}: "
              f"{message}")
        if not _first_trip:
            return
        # Replace the flood with ONE notice that says what is actually wrong.
        message   = (f"DETECTION FAULT — {ALERT_MAX_PER_HOUR}+ alerts in one "
                     f"hour from this camera. Alerts suppressed; verify the "
                     f"camera and the room directly.")
        alert_type = "WARNING"
        detection  = None
        track_id   = None
        box        = None

    # alertKey lets the backend match the deferred `cctv_alert_clip` payload
    # to the Incident document this alert created. We hand the same key to
    # both sides; the backend uses (location, alertKey) as a join.
    alert_key = f"{cam_id}|{int(now * 1000)}"

    payload = {
        "type":      alert_type,
        "message":   message,
        "location":  cam_id,
        "timestamp": clock_str(fmt="%I:%M:%S %p"),
        "alertKey":  alert_key,
    }

    if sio.connected:
        sio.emit("cctv_alert", payload)
    print(f"[ALERT] [{cam_id}] {alert_type}: {message}")


    safe_type = (detection or alert_type).lower().replace(" ", "_").replace("/", "_")

    # Incidents are per PERSON, not per camera. Two residents can be in one
    # frame with unrelated events; merging them lost one of the clips entirely.
    clip_key = _canonical_clip_key(cam_id, track_id)

    # If this person already has an incident recording, fold the alert into it:
    # push the deadline out and promote the label if this is worse. That makes
    # one person's lying-down that escalates save as a single prolonged_fall
    # clip, without touching anyone else's incident.
    with _clip_incident_lock:
        inc = _clip_incidents.get(clip_key)
        if inc is not None and not inc["done"]:
            r = _clip_label_rank(safe_type)
            if r > inc["rank"]:
                print(f"[CLIP] {cam_id}: ID {track_id} incident escalating "
                      f"{inc['label']} -> {safe_type}")
                inc["label"], inc["rank"] = safe_type, r
            inc["end_at"] = min(now + CLIP_POSTROLL_S,
                                inc["opened"] + CLIP_INCIDENT_MAX_S)
            return

    # Cooldown: don't reopen an incident for the SAME person immediately after
    # one closed. Per-person, so a second resident is never gagged by the first.
    if now < _clip_cooldown_until.get(clip_key, 0.0):
        return
    _clip_cooldown_until[clip_key] = now + CLIP_POSTROLL_S + CLIP_COOLDOWN_S

    # Concurrency cap. The alert has already been sent above — only the video
    # is skipped, so nothing is silenced, we just stop stacking encoders.
    with _clip_incident_lock:
        live = sum(1 for (c, _), i in _clip_incidents.items()
                   if c == cam_id and not i["done"])
    if live >= CLIP_MAX_CONCURRENT:
        print(f"[CLIP] {cam_id}: {live} recordings already open, skipping clip "
              f"for ID {track_id} ({safe_type}) — alert still sent")
        return

    # Rolling-hour budget. Bounds disk usage regardless of what the detector
    # does upstream. Alert already sent above; only the video is skipped.
    if not _clip_budget_ok(cam_id, now):
        print(f"[CLIP] {cam_id}: clip budget reached "
              f"({CLIP_MAX_PER_HOUR}/hour, {CLIP_MAX_PER_DAY}/day) — skipping "
              f"clip for ID {track_id} ({safe_type}). Alert still sent. "
              f"If you see this repeatedly, the detector is generating "
              f"incidents faster than it should.")
        return

    # Deterministic filename: <cam>_<label>_<YYYYMMDD_HHMMSS>_<key>.mp4
    # The label is provisional until the incident closes.
    inc = {
        "cam":    cam_id.replace(" ", "_").replace("/", "_").replace("\\", "_"),
        "label":  safe_type,
        "rank":   _clip_label_rank(safe_type),
        "ts":     datetime.now().strftime("%Y%m%d_%H%M%S"),
        "key":    alert_key.split("|")[-1][-6:],   # last 6 digits of ms-epoch
        "opened": now,
        "end_at": now + CLIP_POSTROLL_S,
        "done":   False,
        "payload": payload,
    }
    with _clip_incident_lock:
        _clip_incidents[clip_key] = inc

    t = threading.Thread(
        target=_record_alert_clip,
        args=(cam_id, clip_key, inc),
        daemon=True,
    )
    t.start()
    # Register in the global worker list so the graceful-shutdown handler
    # can wait for in-flight encodes to finish before exiting.
    with _clip_workers_lock:
        _clip_workers.append((t, time.time()))

# ─────────────────────────────────────────────────────────────────────────────
# Capture Thread — one per camera
# ─────────────────────────────────────────────────────────────────────────────
def capture_thread(cam_id, source):
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    # For video file sources, throttle reads to the file's native FPS so that
    # time-based state machines (lying-down confirmation timer, inactivity
    # threshold, fall rate window) behave as they would on a live stream.
    # Live streams (integer device index or RTSP URL) are not throttled.
    _is_file_source = isinstance(source, str) and not source.startswith("rtsp://")
    _file_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    _frame_dt = 1.0 / _file_fps if _is_file_source else 0.0
    _fail_count = 0
    _DISCOVERY_AFTER = 5  # trigger auto-discovery after this many consecutive failures
    while True:
        ret, frame = cap.read()
        if not ret:
            # For video file sources, loop back to the start instead of
            # treating end-of-file as a camera failure. This keeps the
            # browser feed alive during testing and lets time-based detectors
            # (inactivity) accumulate state across the full clip.
            if _is_file_source:
                print(f"[CAPTURE {cam_id}] Video file ended — sending blank frames to clear detections...")
                # Pump a BLACK frame (not the last real frame) so YOLO sees no
                # people and cannot fire false alerts on a frozen static image.
                # Tracks are GC'd after TRACK_TIMEOUT_S (5s) and all state
                # machines reset cleanly. Browser shows a black "VIDEO ENDED" screen.
                _blank = np.zeros((INFERENCE_H, INFERENCE_W, 3), dtype=np.uint8)
                cv2.putText(_blank, "VIDEO ENDED", (INFERENCE_W // 2 - 120, INFERENCE_H // 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.2, (60, 60, 60), 2)
                cv2.putText(_blank, "Press Ctrl+C to stop", (INFERENCE_W // 2 - 140, INFERENCE_H // 2 + 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (40, 40, 40), 1)
                _end_at = time.time() + 10
                while time.time() < _end_at and not _shutting_down:
                    with raw_lock:
                        raw_frames[cam_id] = (_blank, time.time())
                    time.sleep(0.1)
                print(f"[CAPTURE {cam_id}] Video finished. Press Ctrl+C to stop.")
                break
            _fail_count += 1
            time.sleep(1)
            # After repeated failures on an RTSP source, try to find the camera
            # at its new IP (e.g. after a network change).
            if (_fail_count >= _DISCOVERY_AFTER
                    and isinstance(source, str)
                    and source.startswith('rtsp://')):
                print(f"[CAPTURE {cam_id}] {_fail_count} consecutive failures — "
                      "running auto-discovery …")
                discovered = discover_rtsp_source(source)
                if discovered and discovered != source:
                    print(f"[CAPTURE {cam_id}] Switching source → {discovered}")
                    source = discovered
                    _fail_count = 0
            cap = cv2.VideoCapture(source)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            _file_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            _frame_dt = 1.0 / _file_fps if _is_file_source else 0.0
            continue
        _fail_count = 0  # reset on successful read
        if _frame_dt:
            time.sleep(_frame_dt)
        # Stamp the frame at capture time. Inference may queue behind this,
        # but timing logic (fall rate, inactivity windows) needs the
        # moment the frame was *seen*, not the moment we got around to it.
        capture_ts = time.time()
        # Inference resolution is bounded by INFERENCE_W × INFERENCE_H. Defaults
        # to 640×480 — the sweet spot for the medium pose model on CPU. With a
        # CUDA GPU you can safely bump this to 1280×720 (set INFERENCE_W=1280
        # and INFERENCE_H=720 in ai_core/.env) for noticeably better keypoint
        # precision at distance, with no FPS loss. Bumping past 720p gives
        # diminishing returns because the model's internal stride is 32.
        # Measure the x/y scale mismatch this resize introduces, once.
        # Everything downstream measures angles and ratios in these pixels.
        if cam_id not in cam_pixel_k:
            _sh, _sw = frame.shape[:2]
            _k = ((_sw / max(_sh, 1)) / (INFERENCE_W / float(INFERENCE_H))
                  if PIXEL_ASPECT_CORRECT else 1.0)
            cam_pixel_k[cam_id] = _k
            print(f"[GEOM {cam_id}] source {_sw}x{_sh} -> "
                  f"{INFERENCE_W}x{INFERENCE_H}, x-correction k={_k:.3f}"
                  + ("  (square pixels, nothing to correct)"
                     if abs(_k - 1.0) < 0.02 else
                     "  (angles and aspect ratios were distorted by this "
                     "factor - now corrected)"))
        frame = cv2.resize(frame, (INFERENCE_W, INFERENCE_H))
        with raw_lock:
            raw_frames[cam_id] = (frame, capture_ts)

# ─────────────────────────────────────────────────────────────────────────────
# Inference Thread — one per camera
# ─────────────────────────────────────────────────────────────────────────────
TRACK_TIMEOUT_S = 5.0   # drop a track's per-person state after this much absence


def reassociate_tracks(cam_id, boxes_by_tid, fall_machines, last_seen,
                       carry_dicts, now):
    """Re-link tracker IDs that were renamed mid-incident.

    boxes_by_tid : {new_tid: (x1, y1, x2, y2)} for every track seen THIS frame
    fall_machines: {tid: FallStateMachine} — read and rewritten in place
    last_seen    : {tid: timestamp} — read and rewritten in place
    carry_dicts  : other per-track dicts to move across, in place

    A brand-new id that lands on the box an id vacated moments ago is the same
    body: ByteTrack drops a track when the silhouette changes shape, which is
    exactly what falling does. Matching is spatial only — IoU against the last
    known box, inside REASSOC_MAX_GAP_S. This never invents a track; if nothing
    overlaps, the new id proceeds as a genuinely new person.

    Returns the list of (old_tid, new_tid, iou) it applied.
    """
    if not REASSOC_ON or not boxes_by_tid:
        return []

    seen_now = set(boxes_by_tid)
    claimed  = set()
    plan     = []
    for new_tid, nb in boxes_by_tid.items():
        if new_tid in last_seen:
            continue                       # already an established track
        best, best_iou = None, 0.0
        for old_tid, sm in fall_machines.items():
            if old_tid in seen_now or old_tid in claimed:
                continue                   # still visible = a different person
            gap = now - last_seen.get(old_tid, 0.0)
            if gap <= 0.0 or gap > REASSOC_MAX_GAP_S:
                continue
            score = _iou(nb, getattr(sm, "last_box", None))
            if score > best_iou:
                best, best_iou = old_tid, score
        if best is not None and best_iou >= REASSOC_MIN_IOU:
            claimed.add(best)
            plan.append((best, new_tid, best_iou))

    for old_tid, new_tid, score in plan:
        old_sm = fall_machines.pop(old_tid, None)
        new_sm = FallStateMachine()
        if old_sm is not None:
            new_sm.adopt_from(old_sm)
        fall_machines[new_tid] = new_sm
        # Carry the behavioural detectors too. Their rolling windows are what
        # make inactivity mean anything, and resetting them on every ID switch
        # is how a still resident kept escaping the inactivity check.
        for d in carry_dicts:
            if old_tid in d:
                d[new_tid] = d.pop(old_tid)
        last_seen.pop(old_tid, None)
        # Keep writing into the incident/clip the old id opened.
        alias_clip_track(cam_id, old_tid, new_tid)
        if REASSOC_DEBUG or VERBOSE_LOGS:
            print(f"[REASSOC {cam_id}] ID {old_tid} → {new_tid} "
                  f"(IoU {score:.2f}) — same person, state carried over")
    return plan

# Status string → display color
# DEPRESSION_RISK and MIXED_RISK previously lived here; the depression
# sub-score was removed from BehaviorScorer (see its docstring) and
# nothing ever set MIXED_RISK as a worst_status, so both were dropped.
# ─────────────────────────────────────────────────────────────────────────────
# Status styling — ONE table for severity and colour
# ─────────────────────────────────────────────────────────────────────────────
# There used to be two dicts, both keyed on exact strings, and the labels the
# state machine actually emits had drifted away from those keys. Every unlisted
# label silently fell back to priority 1 (identical to NORMAL) and colour
# (200,200,200) (white). Observed consequences, all visible on the Test_Falls_5
# frames:
#
#   "LYING DOWN (CONFIRMING)"   -> priority 1  => the HUD read "WORST: NORMAL"
#                                                in GREEN while the box was red
#   "LYING DOWN"                -> no colour   => HUD text white, box red
#   "FALL DETECTED (UNWITNESSED)" -> priority 1 => a real emergency ranked as
#                                                NORMAL in the aggregator
#   "PROLONGED FALL (37s)"      -> no match    => the dict key is "PROLONGED
#                                                FALL", the label carries the
#                                                seconds, so it never matched
#
# So this is not only cosmetic: _priority() decides which person's status the
# camera-level HUD reports, and an emergency scoring 1 could be masked by any
# other track. Matching is now by PREFIX, longest-specific first, so label
# variants ("... (HIGH CONFIDENCE)", "(37s)", "— POSTURE") are covered by
# construction instead of needing a new dict key each time.
#
# Colour language, BGR:
#   green  = fine        amber  = pending confirmation
#   orange = warning     red    = emergency        dark red = escalated
STATUS_STYLES = [
    # (label prefix,               priority, BGR colour)
    ("PROLONGED FALL",                  10, (0,   0, 160)),
    ("FALL DETECTED",                    9, (0,   0, 255)),
    ("FALLEN (UNSEEN)",                  9, (0,   0, 255)),
    ("FALL? (CONFIRMING)",               8, (0, 120, 255)),
    ("INACTIVE",                         7, (0,  40, 220)),
    ("LYING DOWN (CONFIRMING)",          5, (0, 200, 255)),
    ("LYING DOWN",                       6, (0, 140, 255)),
    ("STUMBLE DETECTED",                 4, (0, 165, 255)),
    ("AGITATION_RISK",                   3, (0,  60, 200)),
    # Benign, but worth showing as distinct from plain NORMAL: the person is
    # accounted for and resting on furniture, not unmonitored.
    ("ON ",                              1, (180, 150,  70)),
    ("SITTING",                          1, (180, 150,  70)),
    ("NORMAL",                           1, (0,  200,   0)),
    ("STANDING",                         1, (0,  200,   0)),
    ("NO PERSON",                        0, (150, 150, 150)),
]
# Sorted so a longer, more specific prefix always wins over a shorter one that
# is also a prefix of it — "LYING DOWN (CONFIRMING)" must not match
# "LYING DOWN". Done here rather than relying on the literal order above, so
# adding an entry cannot silently break the precedence.
STATUS_STYLES.sort(key=lambda e: -len(e[0]))

# Fallback for a label nobody registered. Amber, priority 4: visible as
# "something is being reported" rather than disappearing into NORMAL green.
STATUS_STYLE_DEFAULT = (4, (0, 200, 255))


def status_style(status):
    """(priority, BGR) for a status label. Prefix match, most specific first."""
    if status:
        for prefix, prio, color in STATUS_STYLES:
            if status.startswith(prefix):
                return prio, color
    return STATUS_STYLE_DEFAULT


def _priority(status):
    return status_style(status)[0]


def status_color(status):
    return status_style(status)[1]


# Kept for any external reader; derived so it cannot drift from the table.
STATUS_COLORS = {prefix: color for prefix, _p, color in STATUS_STYLES}


def draw_status_bar(frame, cam_id, text, color, clock=None):
    """The black HUD band across the top. Shared by the live stream and the
    saved clip so both are laid out identically and only the colour differs."""
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, 0), (w, 40), (0, 0, 0), -1)
    cv2.putText(frame, f"[{cam_id}] {text}", (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    if clock:
        cv2.putText(frame, clock, (max(10, w - 80), 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)


def process_camera_thread(cam_id):
    """
    Main inference loop per camera — multi-person, track-aware.

    Uses Ultralytics' built-in ByteTrack tracker (model.track(persist=True))
    so each detected person carries a stable integer ID across frames.
    Every per-track state machine (fall, body-agitation, movement) is keyed
    by that ID and lives in a dict. Tracks that haven't been seen for
    TRACK_TIMEOUT_S seconds get garbage-collected.
    """
    # IMPORTANT: model.track() carries tracker state ON THE MODEL OBJECT.
    # Each camera needs its own model instance so ByteTrack's track table
    # for House of Charbel doesn't leak into House of Gabriel's tracks.
    # yolo11m-pose is ~40MB on disk; two instances comfortably fit on a
    # 4GB RTX 2050 alongside MediaPipe (~200MB) and CUDA overhead.
    track_model = YOLO(POSE_MODEL_PATH)
    print(f"[INFER {cam_id}] thread-local tracker model loaded "
          f"({POSE_MODEL_PATH}, ByteTrack).")

    # Per-track state — created on first sight, GC'd after TRACK_TIMEOUT_S.
    fall_machines     = {}   # track_id → FallStateMachine
    body_agi_scorers  = {}   # track_id → BodyAgitationScorer
    movement_trackers = {}   # track_id → MovementTracker
    last_seen         = {}   # track_id → wall-clock timestamp
    last_behavior_per = {}   # track_id → last body-agitation alert string (debounce)
    last_movement_per = {}   # track_id → last movement alert string (debounce)
    kpt_smooth        = {}   # track_id → np.ndarray (17,3) EMA-smoothed keypoints
    # Gate bookkeeping — see the stale-frame and low-light checks in the loop.
    last_stale_log    = 0.0
    last_dark_log     = 0.0
    dark_now          = False

    def state_for(d, track_id, factory):
        if track_id not in d:
            d[track_id] = factory()
        return d[track_id]

    while True:
        with raw_lock:
            raw = raw_frames.get(cam_id)
            if raw is None:
                frame, capture_ts = None, None
            else:
                frame, capture_ts = raw[0].copy(), raw[1]

        if frame is None:
            time.sleep(0.01)
            continue

        # Capture timestamp, not inference timestamp. See capture_thread comment.
        now = capture_ts

        # ── Is this frame still live, or is the camera gone? ─────────────────
        # THE BUG THIS FIXES, and it is a bad one. capture_thread never clears
        # raw_frames on a read failure — it retries the connection and leaves
        # the last good frame sitting there. So when the camera is switched
        # off, unplugged, or the RTSP link drops, the inference thread keeps
        # re-running YOLO on that ONE frozen frame, forever, at full rate.
        #
        # Everyone who happened to be in the last frame stays "detected"
        # indefinitely. They never move, so the inactivity timer runs; tracks
        # churn on the static image; alerts and clips keep being produced from
        # a camera that has been off for hours. That is how a shut-down system
        # kept filling S3 overnight.
        #
        # camera_health() already knew about this — /status reports a camera
        # offline after CAMERA_STALE_AFTER_S — but nothing told the inference
        # loop. Now it does.
        frame_age = time.time() - (capture_ts or 0)
        if frame_age > CAMERA_STALE_AFTER_S:
            if now - last_stale_log > 60:
                last_stale_log = now
                print(f"[STALE {cam_id}] last frame is {frame_age:.0f}s old — "
                      f"camera is not delivering. Inference halted; no alerts "
                      f"or clips will be produced until it returns.")
            stale_frame = frame.copy()
            draw_status_bar(stale_frame, cam_id, "CAMERA OFFLINE — NO SIGNAL",
                            (120, 120, 120), clock=clock_str())
            with lock:
                cam_frames[cam_id] = stale_frame
                cam_clean[cam_id] = (frame, ())
            time.sleep(0.5)
            continue
        # ── Frames came back after a gap: wipe per-track state ───────────────
        # THIS is what flooded S3 overnight, and it is nastier than the frozen
        # frame on its own.
        #
        # Every timer in this system is measured against `now`, which is the
        # CAPTURE timestamp. While the camera was off, capture_ts never
        # advanced, so `now` was frozen at the last live frame: elapsed times
        # stopped growing, cooldowns stopped expiring, and nothing fired. That
        # is the silence from 10pm to 3am — not the system being off, the
        # system being stuck.
        #
        # Then the camera returned and `now` jumped forward six hours in a
        # single frame. Every comparison detonated at once:
        #   now - _fallen_since        -> 21600s, so PROLONGED FALL fired
        #                                 instantly for every held track
        #   now - _last_fall_alert_time-> 21600s, so every cooldown was expired
        #   now - last_seen            -> every track stale at the same instant
        # A six-hour jump makes the whole state machine believe six hours of
        # emergency happened in one frame. Hence the 4am flood.
        #
        # After a gap this long the old state means nothing — whoever was in
        # frame is long gone. Start clean instead of carrying stale timestamps
        # into fresh time.
        if last_stale_log:
            gap = frame_age
            print(f"[STALE {cam_id}] frames flowing again after a gap — "
                  f"discarding {len(fall_machines)} stale track state(s) so "
                  f"old timers cannot fire against the new clock")
            fall_machines.clear();     body_agi_scorers.clear()
            movement_trackers.clear(); last_seen.clear()
            last_behavior_per.clear(); last_movement_per.clear()
            kpt_smooth.clear()
            with clip_buffer_lock:
                clip_buffers[cam_id].clear()   # pre-roll is from before the gap
            last_stale_log = 0.0

        # ── Too dark to trust? ───────────────────────────────────────────────
        # An unattended overnight run produced a stream of phantom falls and
        # roughly sixty clips of an empty room. DET_CONF is 0.10 so a body on
        # the floor still registers, and in a dark frame that same floor lets
        # sensor noise, furniture edges and IR glare assemble into skeletons.
        # Those ghosts are then entitled to everything a person gets: alerts,
        # a held FALLEN state, an incident, a clip.
        #
        # Deliberately keyed on BRIGHTNESS, not on the clock. Night falls are
        # the most dangerous ones, so gating by hours would be indefensible —
        # but acting on a frame too dark to see is worse than not acting,
        # because it buries real alerts under noise. If the lights are on, this
        # never engages regardless of the hour.
        if NIGHT_GATE_ON:
            lum = float(np.mean(frame)) if frame is not None else 0.0
            if dark_now:
                dark_now = lum < (NIGHT_GATE_LUMA + NIGHT_GATE_HYST)
            else:
                dark_now = lum < NIGHT_GATE_LUMA
            if dark_now:
                if now - last_dark_log > 300:
                    last_dark_log = now
                    print(f"[NIGHT {cam_id}] scene luminance {lum:.1f} < "
                          f"{NIGHT_GATE_LUMA} — inference paused, no alerts or "
                          f"clips will be produced until it brightens")
                dark_frame = frame.copy()
                draw_status_bar(dark_frame, cam_id, "TOO DARK — MONITORING PAUSED",
                                (120, 120, 120), clock=clock_str())
                with lock:
                    cam_frames[cam_id] = dark_frame
                    cam_clean[cam_id] = (frame, ())
                time.sleep(0.2)
                continue
            elif last_dark_log:
                print(f"[NIGHT {cam_id}] luminance {lum:.1f} — inference resumed")
                last_dark_log = 0.0

        # persist=True keeps the tracker's track table across calls within this
        # thread. ByteTrack (swapped from BoT-SORT) maintains tracks across
        # occlusion using low-confidence detections that BoT-SORT discards —
        # noticeably better identity preservation when residents cross paths
        # in common areas. We use track_model (per-thread) so cameras don't
        # share tracker state.
        results = track_model.track(frame, conf=DET_CONF, iou=0.5, persist=True,
                                    tracker=TRACKER_CFG, verbose=False)
        display = frame.copy()

        # ── Collect every (track_id, kpts, box) the tracker returned ──────
        # On the very first frame after startup, r.boxes.id can be None
        # because the tracker hasn't initialised yet — skip those frames.
        observations = []   # list of dicts: {tid, kpts, box, conf}
        for r in results:
            if r.boxes is None or r.keypoints is None:
                continue
            if r.boxes.id is None:
                continue
            ids = r.boxes.id.cpu().numpy().astype(int)
            for i, box in enumerate(r.boxes):
                raw_kpts = r.keypoints.data[i].cpu().numpy()
                # Apply EMA smoothing before any drawing or detection logic.
                # smooth_keypoints() updates kpt_smooth[tid] in place and returns
                # the blended (17,3) array; raw_kpts is never modified.
                # DET_CONF=0.10 is deliberately permissive so a body on the
                # floor still registers, but it also lets junk through — a
                # box on an empty desk counted as a person and sat still long
                # enough to trigger inactivity. A real detection has a
                # skeleton; a hallucinated box does not. Judge on the RAW
                # keypoints: the EMA smoother carries confidence forward, so
                # a ghost inherits plausibility from earlier frames.
                if (int(np.sum(raw_kpts[:, 2] >= POSE_CONF_THRESHOLD))
                        < MIN_CONFIDENT_KPTS):
                    continue
                kpts = smooth_keypoints(kpt_smooth, int(ids[i]), raw_kpts)
                observations.append({
                    "tid":  int(ids[i]),
                    "kpts": kpts,
                    "box":  box,
                    "conf": float(box.conf[0]),
                })

        # ── Re-associate switched track IDs ───────────────────────────────
        # Runs BEFORE any state is created for this frame, so a renamed person
        # inherits their history instead of starting from nothing.
        reassociate_tracks(
            cam_id,
            {o["tid"]: tuple(map(int, o["box"].xyxy[0])) for o in observations},
            fall_machines, last_seen,
            (body_agi_scorers, movement_trackers,
             last_behavior_per, last_movement_per, kpt_smooth),
            now,
        )

        # Faint outline of any configured furniture so operators can see what
        # the suppression mask actually covers.
        draw_furniture_zones(display, cam_id)

        # ── HUD aggregator: worst status across all visible tracks ────────
        worst_status = "NO PERSON" if not observations else "NORMAL"

        # What was detected this frame, kept separately from the drawing so a
        # saved clip can be repainted for one subject. See CLIP_ISOLATE_SUBJECT.
        frame_records = []

        for obs in observations:
            tid  = obs["tid"]
            kpts = obs["kpts"]
            box  = obs["box"]
            last_seen[tid] = now

            # Get-or-create per-track state
            fall_sm     = state_for(fall_machines,     tid, FallStateMachine)
            body_agi_sc = state_for(body_agi_scorers,  tid, BodyAgitationScorer)
            movement_tr = state_for(movement_trackers, tid,
                                    lambda: MovementTracker(640, 480, label=f"{cam_id}#{tid}"))

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # NOTE: the box, the ID text and the skeleton are drawn at the END
            # of this block, once track_status is final. They used to be drawn
            # here in a fixed green and then partly repainted, which is why the
            # skeleton stayed cyan/yellow no matter what the box said.
            # Enough points AND those points describe a body. An implausible
            # skeleton leaves has_kpts False, so update() returns before any
            # fall path runs and the candidate resets to NORMAL — a ghost on
            # furniture can still be tracked, but it cannot raise an emergency
            # or open an incident clip.
            has_kpts  = (pose_has_required_keypoints(kpts)
                         and pose_is_plausible(kpts))
            _k        = pixel_k(cam_id)
            angle     = correct_angle(get_torso_angle(kpts), _k) if has_kpts else 0.0
            aspect    = get_body_aspect_ratio((x1, y1, x2, y2)) / _k
            # Movement signal uses BBOX centroid, not torso keypoints.
            # YOLO-pose jitters keypoints by 2–5 px even on a perfectly
            # still subject; that jitter spikes per-frame velocity past
            # INACTIVITY_VEL_MAX and prevents the inactivity timer from
            # ever accumulating. Bbox centers from ByteTrack are
            # dramatically more stable.
            # NOTE: fall detection still uses torso angle / aspect / kpts
            # exactly as before — only the movement input changes here.
            center_px = ((x1 + x2) / 2, (y1 + y2) / 2)

            # Size-based weights, computed once here so the diagnostic labels
            # below shrink with distance too — they were fixed at 0.45-0.5 and
            # were most of the clutter in a crowded frame. The box is
            # re-weighted after track_status is known, to add the severity bump.
            _dbg_font = overlay_weights(y2 - y1, display.shape[0])[3]

            # ── Module C: Fall ────────────────────────────────────────────
            posture = get_posture_ratios(kpts) if POSTURE_RATIO_ON else (None, None)

            if POSTURE_RATIO_ON and OVERLAY_DEBUG_TEXT:
                _ev, _cp = posture
                _txt = (f"e={_ev:.2f}" if _ev is not None else "e=--") + \
                       (f" c={_cp:.2f}" if _cp is not None else " c=--")
                # Amber once either ratio crosses its threshold, so the frame
                # where Path C starts firing is visible without reading logs.
                _hot = ((_ev is not None and _ev < POSTURE_ELEVATION_MAX) or
                        (_cp is not None and _cp < POSTURE_COMPACT_MAX))
                cv2.putText(display, _txt, (x1, y2 + 28),
                            cv2.FONT_HERSHEY_SIMPLEX, _dbg_font,
                            (0, 165, 255) if _hot else (200, 200, 60), 1)
            _seated, _seated_deep = (looks_seated(kpts, angle) if has_kpts
                                     else (False, False))
            if _seated and OVERLAY_DEBUG_TEXT:
                _kl, _kr = knee_flexion(kpts)
                _kt = ((f"L{_kl:.0f}" if _kl is not None else "L--") + "/" +
                       (f"R{_kr:.0f}" if _kr is not None else "R--"))
                cv2.putText(display, f"seated {_kt}", (x1, y1 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, _dbg_font,
                            (120, 200, 255), 1)
            # Which furniture, if any, is holding this person up. Hip midpoint
            # is the test point — that is what a seat actually supports.
            _support = support_point(kpts if has_kpts else None, (x1, y1, x2, y2))
            _furniture = furniture_zone_at(cam_id, _support)
            _on_floor = in_floor_zone(cam_id, _support)
            _lower_ok = lower_body_visible(kpts if has_kpts else None)
            if _furniture and OVERLAY_DEBUG_TEXT:
                cv2.circle(display, (int(_support[0]), int(_support[1])),
                           3, (160, 160, 255), -1)
                cv2.putText(display, f"on {_furniture}", (x1, y2 + 42),
                            cv2.FONT_HERSHEY_SIMPLEX, _dbg_font,
                            (160, 160, 255), 1)

            # Bent over but still on their feet — see standing_bend(). Gates
            # Path A only, so a genuine fall is unaffected.
            _bend = standing_bend(kpts, _k) if has_kpts else False
            if _bend and angle > FALL_ANGLE_THRESHOLD and OVERLAY_DEBUG_TEXT:
                cv2.putText(display, "BENDING (on feet)", (x1, y1 - 24),
                            cv2.FONT_HERSHEY_SIMPLEX, _dbg_font,
                            (120, 220, 120), 1)

            fall_status, fall_alert = fall_sm.update(angle, aspect, has_kpts, now,
                                                     bbox_h=(y2 - y1), posture=posture,
                                                     seated=_seated,
                                                     seated_deep=_seated_deep,
                                                     furniture=_furniture,
                                                     on_floor=_on_floor,
                                                     lower_body=_lower_ok,
                                                     center_y=(y1 + y2) / 2.0,
                                                     extent_ratio=body_extent_ratio(
                                                         kpts if has_kpts else None,
                                                         y2 - y1),
                                                     bend=_bend)
            if fall_sm.is_fallen():
                note_fallen(cam_id, tid, now)
            # Remember where they were, so the persistence path can judge
            # whether a disappearance looks like an exit or a collapse.
            fall_sm.last_box = (x1, y1, x2, y2)


            if fall_alert:
                if "FALL" in fall_alert:
                    # "PROLONGED FALL" also contains "FALL", so it must be
                    # tested first or the clip is filed as a plain fall.
                    send_alert(cam_id, "EMERGENCY", f"[ID {tid}] {fall_alert}",
                               detection=("prolonged_fall"
                                          if "PROLONGED FALL" in fall_alert
                                          else "fall_detected"),
                               track_id=tid, box=(x1, y1, x2, y2))
                elif "LYING DOWN" in fall_alert:
                    send_alert(cam_id, "WARNING",   f"[ID {tid}] {fall_alert}", detection="lying_down",
                               track_id=tid, box=(x1, y1, x2, y2))

                # Clear inactivity state for this track, so the timer does not
                # fire on someone the system already knows has fallen. It will
                # accumulate fresh state only if the person recovers and stays
                # in frame long enough.
                movement_tr.reset()

            track_status = "NORMAL"
            if fall_status == "FALLEN":
                track_status = fall_sm._last_fall_label
            elif fall_status == "STUMBLE":
                track_status = "STUMBLE DETECTED"

            # ── Module D: Body Agitation (only if not already on floor) ──
            # Body-pose agitation only — face-based scoring was removed for
            # being unreliable at CCTV distance (see top of file). The
            # geometric body signals (hands-on-head, bilateral arm raise,
            # wrist oscillation) fire on clear distress POSES, so no motion
            # gate is needed: a resident sitting motionless with both hands
            # clutching their head is textbook distress and MUST alert.
            if fall_status != "FALLEN":
                body_agi_score, body_alert = body_agi_sc.update(
                    kpts if has_kpts else None, now
                )

                # Visual debug overlay — wrist circles + score readout when
                # the scorer is registering anything meaningful.
                if has_kpts and body_agi_score > 0.1 and OVERLAY_DEBUG_TEXT:
                    for wr_i in [9, 10]:
                        if float(kpts[wr_i][2]) >= 0.35:
                            wx, wy = int(kpts[wr_i][0]), int(kpts[wr_i][1])
                            wcolor = (0, 80, 255) if body_agi_score > AGITATION_THRESHOLD else (180, 80, 255)
                            cv2.circle(display, (wx, wy), 7, wcolor, 1)
                    cv2.putText(display, f"Body agi: {body_agi_score:.2f}",
                                (x1, y1 - 40), cv2.FONT_HERSHEY_SIMPLEX,
                                _dbg_font, (180, 80, 255), 1)

                # ── Explicit HAIR-GRAB indicator ─────────────────────────
                # Surfaces the specific hair-grab signature (both hands on
                # head + oscillating wrists) as a labeled overlay so nurses
                # / panel can see *why* the agitation score is climbing,
                # not just that it is. Independent of the alert path —
                # this is purely a visual cue. The actual alert still
                # fires through the unified AGITATION_RISK channel after
                # BEHAVIOR_MIN_SUSTAINED_S of sustained high score.
                if has_kpts and body_agi_sc.is_hair_grab_pattern():
                    # Bright magenta box + label above the head zone
                    cv2.rectangle(display, (x1, y1 - 30), (x1 + 160, y1 - 8),
                                  (180, 0, 200), -1)
                    cv2.putText(display, "HAIR-GRAB PATTERN",
                                (x1 + 4, y1 - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                                (255, 255, 255), 1)
                    # Trail-style highlight on the wrists when the pattern
                    # is active so the visual ties to the actual gesture.
                    for wr_i in [9, 10]:
                        if float(kpts[wr_i][2]) >= 0.35:
                            wx, wy = int(kpts[wr_i][0]), int(kpts[wr_i][1])
                            cv2.circle(display, (wx, wy), 14, (180, 0, 200), 2)

                if body_alert:
                    print(f"[BODY AGI {cam_id} ID{tid}] 🔴 AGITATION_RISK — sending alert")
                    send_alert(cam_id, "WARNING", f"[ID {tid}] {body_alert}", detection="agitation",
                               track_id=tid)
                    last_behavior_per[tid] = body_alert
                    if _priority(body_alert) > _priority(track_status):
                        track_status = body_alert
                else:
                    last_behavior_per.pop(tid, None)


                # ── Module E: Movement / Inactivity ──────────────────────
                # Uses bbox centroid (not keypoints) — runs on every tracked
                # bbox regardless of pose confidence. has_kpts is passed
                # through only for the posture-aware INACTIVE—POSTURE variant.
                #
                # Standing-upright gate: check BEFORE update() so the timer
                # never accumulates while the person is upright. Checking
                # after update() let the timer run internally and fire alerts
                # that got caught and reset — but the timer immediately
                # restarted the next frame and the cycle repeated.
                # angle defaults to 0.0 when has_kpts=False, so the angle
                # check safely passes for tall-bbox tracks without pose data.
                # Aspect ratio alone is the reliable standing indicator —
                # the bbox docstring states h/w > 1.5 = standing.
                # The angle condition was removed: torso angle computed from
                # CCTV-angle keypoints is too noisy for standing people
                # (frequently 30–50° even when fully upright), so AND-ing
                # it caused the gate to silently fail and let the timer run.
                _is_standing = (aspect > INACTIVITY_STANDING_ASPECT_MIN)
                if _is_standing:
                    movement_result = None
                    movement_tr.reset()
                    last_movement_per.pop(tid, None)
                else:
                    movement_result = movement_tr.update(
                        center_px, now,
                        torso_angle=angle,
                        has_kpts=has_kpts,
                    )
                # Debounce on the alert KIND, not the whole message. The message
                # carries a live counter — "INACTIVE (1980s)" — so comparing
                # full strings never matched: every cooldown expiry produced a
                # different number and re-alerted the same track indefinitely.
                # Strip the "(NNNs)" so one track raises inactivity once, and
                # again only if it recovers and goes still a second time.
                #
                # NOTE: this module imports the regex library as `_re` (line
                # ~126), NOT as `re`. Writing `re.sub` here raises
                # NameError inside the per-track loop, which kills the whole
                # inference thread and freezes the feed on "AI LOADING...".
                _kind = _re.sub(r"\s*\(\d+s\)", "", movement_result or "")
                if movement_result and _kind != last_movement_per.get(tid):
                    level = "EMERGENCY" if "INACTIVE" in movement_result else "WARNING"
                    send_alert(cam_id, level, f"[ID {tid}] {movement_result}", detection="inactivity",
                               track_id=tid)
                    last_movement_per[tid] = _kind
                elif not movement_result:
                    # Clear as soon as the module stops reporting inactivity.
                    #
                    # This used to also require `not is_stationary(now)`, but
                    # is_stationary() takes the MEDIAN velocity over the last
                    # 2 seconds, so it stays True for a moment after someone
                    # starts moving — and the stale label survived that gap.
                    # Since the label feeds track_status below, the red box and
                    # the WORST header kept showing a frozen "INACTIVE (1980s)"
                    # long after the person got up. update() has already reset
                    # _stationary_since by this point; only the string lingered.
                    last_movement_per.pop(tid, None)
                if last_movement_per.get(tid) and \
                   _priority(last_movement_per[tid]) > _priority(track_status):
                    track_status = last_movement_per[tid]

            # ── Per-track visuals, in the ONE colour this track's status maps
            # to. Drawn last so the box, the label, the ID and the skeleton
            # are always consistent with each other and with the HUD band.
            t_prio  = _priority(track_status)
            t_color = status_color(track_status)
            # Weights follow apparent size so a distant person is a hairline
            # rather than a blob; the box still gains thickness with severity.
            t_thick, t_bone, t_joint, t_font = overlay_weights(
                y2 - y1, display.shape[0], t_prio)
            cv2.rectangle(display, (x1, y1), (x2, y2), t_color, t_thick)
            cv2.putText(display, f"ID {tid}", (x1, y2 + 14),
                        cv2.FONT_HERSHEY_SIMPLEX, t_font, t_color, 1)
            draw_pose_overlay(display, kpts, color=t_color,
                              bone_t=t_bone, joint_r=t_joint)
            if t_prio >= 2:
                cv2.putText(display, track_status, (x1, y1 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, t_font * 1.15, t_color,
                            max(1, t_bone))

            # Same facts the overlay above was drawn from, recorded so the clip
            # worker can redraw this ONE track later. kpts is copied because
            # the EMA smoother keeps mutating its per-track array.
            frame_records.append({
                "tid":    tid,
                "box":    (x1, y1, x2, y2),
                "kpts":   kpts.copy(),
                "status": track_status,
            })

            # Update camera-level worst status
            if t_prio > _priority(worst_status):
                worst_status = track_status

        # ── Garbage-collect stale tracks ─────────────────────────────────
        # Person walked out of frame → drop their state after TRACK_TIMEOUT_S
        # so a returning visitor doesn't inherit stale fall/movement history.
        # ── Keep ticking anyone last seen on the floor ────────────────────
        # Their track is gone, but the conclusion that they fell still stands.
        if PERSIST_FALLEN_ON:
            _seen_now = {o["tid"] for o in observations}
            for _tid, _sm in list(fall_machines.items()):
                if _tid in _seen_now:
                    continue
                # Track died mid-descent before the state could commit —
                # commit it now rather than waiting for the person to move.
                if not _sm.is_fallen():
                    if not _sm.promote_on_vanish(now):
                        if PERSIST_DEBUG:
                            print(f"[PERSIST {cam_id}] ID {_tid}: cannot promote — "
                                  f"state={_sm._state} candidate={_sm._candidate} "
                                  f"count={_sm._candidate_count} "
                                  f"seated_sticky={now < _sm._seated_until}")
                        continue
                    if PERSIST_DEBUG:
                        print(f"[PERSIST {cam_id}] ID {_tid}: track lost mid-fall — "
                              f"committing FALLEN from pending candidate")
                if not _sm.vanished_mid_frame(INFERENCE_W, INFERENCE_H):
                    if PERSIST_DEBUG:
                        print(f"[PERSIST {cam_id}] ID {_tid}: skipped, last box "
                              f"{getattr(_sm, 'last_box', None)} touches the border")
                    continue            # last seen at the border — likely exited
                note_fallen(cam_id, _tid, now)   # still down, keep clip rolling
                _a = _sm.tick_absent(now)
                if PERSIST_DEBUG and not _a:
                    print(f"[PERSIST {cam_id}] ID {_tid}: holding FALLEN "
                          f"{now - (_sm._fallen_since or now):.1f}s, no alert due yet")
                if not _a:
                    continue
                _msg = f"[ID {_tid}] {_a} — NO LONGER VISIBLE"
                _lb = getattr(_sm, "last_box", None)
                if "FALL" in _a:
                    send_alert(cam_id, "EMERGENCY", _msg,
                               detection=("prolonged_fall"
                                          if "PROLONGED FALL" in _a
                                          else "fall_detected"),
                               track_id=_tid, box=_lb)
                elif "LYING DOWN" in _a:
                    send_alert(cam_id, "WARNING", _msg, detection="lying_down",
                               track_id=_tid, box=_lb)
                if worst_status in ("NO PERSON", "NORMAL"):
                    worst_status = "FALLEN (UNSEEN)"

        # A track last seen ON THE FLOOR is held far longer than one that
        # simply walked out of frame — deleting it at 5s is what erased the
        # fall before the confirmation timer could complete.
        stale = []
        for tid, t in last_seen.items():
            _sm = fall_machines.get(tid)
            _limit = (FALLEN_TIMEOUT_S
                      if (PERSIST_FALLEN_ON and _sm is not None and _sm.is_fallen())
                      else TRACK_TIMEOUT_S)
            if now - t > _limit:
                stale.append(tid)
        for tid in stale:
            fall_machines.pop(tid, None)
            body_agi_scorers.pop(tid, None)
            movement_trackers.pop(tid, None)
            last_seen.pop(tid, None)
            last_behavior_per.pop(tid, None)
            last_movement_per.pop(tid, None)
            kpt_smooth.pop(tid, None)

        # ── On-frame HUD ──────────────────────────────────────────────────
        # HUD bar spans the full frame width and a fixed pixel height so it
        # scales correctly when INFERENCE_W is bumped to 1280 on GPU setups.
        n_people = len(observations)
        draw_status_bar(display, cam_id,
                        f"{n_people} person(s) | WORST: {worst_status}",
                        status_color(worst_status),
                        clock=clock_str())

        with lock:
            if cam_frames[cam_id] is None:
                print(f"[STREAM {cam_id}] ✅ First frame ready — browser feed is now live.")
            # The browser gets the fully annotated frame: an operator watching
            # live needs to see everyone in the room.
            cam_frames[cam_id] = display.copy()
            # The clip worker gets the clean frame plus what was in it, and
            # paints only the incident's subject at write time.
            cam_clean[cam_id] = (frame, tuple(frame_records))

        # Throttled push into the pre-roll buffer for alert clip recording.
        # Clean frame + records, NOT the annotated `display`: the pre-roll is
        # captured before the incident is classified, so at this point we do
        # not yet know which person the clip will end up being about.
        _maybe_buffer_frame(cam_id, frame, tuple(frame_records))

# ─────────────────────────────────────────────────────────────────────────────
# Flask — MJPEG Stream Routes
# ─────────────────────────────────────────────────────────────────────────────
def _make_offline_frame(cam_id):
    """Black JPEG with 'Camera Offline' text — yielded while the camera is
    unavailable so Cloudflare never times out with a 524."""
    img = np.zeros((INFERENCE_H, INFERENCE_W, 3), dtype=np.uint8)
    cv2.putText(img, "CAMERA OFFLINE", (INFERENCE_W // 2 - 160, INFERENCE_H // 2 - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (80, 80, 80), 2)
    cv2.putText(img, cam_id, (INFERENCE_W // 2 - 100, INFERENCE_H // 2 + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 60, 60), 1)
    cv2.putText(img, "Waiting for inference thread...", (INFERENCE_W // 2 - 190, INFERENCE_H // 2 + 55),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 50, 50), 1)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def generate_frames(cam_id):
    _offline_frame   = _make_offline_frame(cam_id)
    _offline_sent_at = 0.0
    while True:
        # 1) Annotated inference frame (normal path).
        with lock:
            _inf = cam_frames.get(cam_id)
            frame = _inf.copy() if _inf is not None else None

        if frame is None:
            # 2) YOLO not ready yet — fall back to raw capture frame so the
            #    browser shows video immediately instead of "CAMERA OFFLINE"
            #    for the entire warmup period (YOLO load can take 15-30s).
            with raw_lock:
                _raw = raw_frames.get(cam_id)
                raw_frame = _raw[0].copy() if _raw is not None else None

            if raw_frame is not None:
                cv2.putText(raw_frame, "AI LOADING...", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 200, 255), 2)
                _, buf = cv2.imencode(".jpg", raw_frame,
                                      [cv2.IMWRITE_JPEG_QUALITY, 65])
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + buf.tobytes()
                    + b"\r\n"
                )
                time.sleep(0.033)
                continue

            # 3) No frames at all — show offline placeholder at ~1 fps.
            now = time.time()
            if now - _offline_sent_at >= 1.0:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + _offline_frame
                    + b"\r\n"
                )
                _offline_sent_at = now
            time.sleep(0.1)
            continue

        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )
        time.sleep(0.033)   # ~30 FPS cap


def _verify_signed_stream_token(token: str) -> bool:
    """Verify a backend-minted short-lived stream token.

    Token format:  v1.<expUnixSeconds>.<hmacSha256Hex("v1.<exp>", secret)>
    Mirrors backend/utils/streamToken.js. Shared secret = STREAM_SIGNING_SECRET.
    Returns True only when the signature matches AND the token has not expired.
    """
    import hmac, hashlib, time as _time
    secret = os.getenv("STREAM_SIGNING_SECRET", "")
    if not secret or not token:
        return False
    parts = token.split(".")
    if len(parts) != 3:
        return False
    version, exp, sig = parts
    message = f"{version}.{exp}"
    expected = hmac.new(
        secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        if int(exp) < int(_time.time()):
            return False
    except ValueError:
        return False
    return True


def _is_safe_clip_filename(filename: str) -> bool:
    """Mirror of isSafeClipFilename in backend/utils/clipToken.js.

    Applied BEFORE the HMAC check and again before touching the filesystem. The
    token proves the backend authorised *some* name; it does not prove the name
    is harmless, because a caller controls the path segment the token is
    verified against.
    """
    return bool(filename) and not any(
        bad in filename for bad in ("/", "\\", "..", "\0")
    )


def _verify_clip_token(token: str, filename: str, action: str = "play") -> bool:
    """Verify a backend-minted, resource-bound clip token.

    Token format:
        play:    v1.<exp>.<hmacSha256Hex("v1.<exp>.<filename>", secret)>
        delete:  v1d.<exp>.<hmacSha256Hex("v1d.<exp>.<filename>", secret)>

    Mirrors backend/utils/clipToken.js. Shared secret = CLIP_SIGNING_SECRET.

    TWO PROPERTIES MATTER HERE, and both come from what is hashed rather than
    from what is checked afterwards:

    1. RESOURCE BINDING. The filename is hashed into the signature but not
       carried inside the token, so a token minted for one clip cannot be
       replayed against another -- change the filename and the expected HMAC
       changes with it.

    2. ACTION BINDING. The version prefix is part of the signed message, so a
       playback token ("v1.") can never satisfy a delete ("v1d.") check. Every
       played clip hands a valid token to the viewer's browser, where it sits
       in history, logs and the network tab. If that same token could delete,
       watching a fall would be enough to destroy the recording of it.
    """
    import hmac, hashlib, time as _time
    secret = os.getenv("CLIP_SIGNING_SECRET", "")
    if not secret or not token or not _is_safe_clip_filename(filename):
        return False
    expected_version = "v1d" if action == "delete" else "v1"
    parts = token.split(".")
    if len(parts) != 3:
        return False
    version, exp, sig = parts
    if version != expected_version:
        return False
    message = f"{version}.{exp}.{filename}"
    expected = hmac.new(
        secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        if int(exp) < int(_time.time()):
            return False
    except ValueError:
        return False
    return True


@app.route("/clips/<filename>")
def serve_clip(filename):
    """Serve one recorded incident clip out of CLIP_DIR.

    WHY THIS LIVES HERE AND NOT IN THE BACKEND: the clips are on this machine's
    disk (CLIP_DIR, e.g. /opt/visiosphere/clips). The Express backend runs on
    Render and has no access to this filesystem, so it cannot serve the bytes.
    It does the part it *can* do — check that the requesting user's facility
    owns the incident — and mints a short-lived token pointing here. This route
    is the other half of that handshake and does no facility logic of its own:
    holding a valid token IS the authorisation, exactly as with /video_feed.

    Flask's <filename> converter already refuses to match a path containing
    "/", but the checks below are kept explicit rather than relying on that.
    """
    from flask import request, abort, send_from_directory

    if not os.getenv("CLIP_SIGNING_SECRET", ""):
        # Fail closed. An unconfigured secret must not mean "serve to anyone" —
        # this endpoint hands out CCTV footage of residents.
        print("[CLIP] refused: CLIP_SIGNING_SECRET is not set")
        abort(503)

    lowered = filename.lower()
    if not _is_safe_clip_filename(filename) or not lowered.endswith((".mp4", ".jpg")):
        abort(400)

    if not _verify_clip_token(request.args.get("token", ""), filename):
        abort(403)

    # Resolve and confirm the file really sits directly inside CLIP_DIR — a
    # symlink planted in the clips folder should not be able to escape it.
    base = CLIP_DIR.resolve()
    target = (base / filename).resolve()
    if target.parent != base or not target.is_file():
        abort(404)

    # conditional=True enables HTTP Range responses, which is what lets the
    # browser seek within the clip instead of re-downloading from byte 0.
    return send_from_directory(
        base, filename,
        mimetype="image/jpeg" if lowered.endswith(".jpg") else "video/mp4",
        conditional=True,
    )


@app.route("/clips/<filename>", methods=["DELETE"])
def delete_clip(filename):
    """Delete one clip and its poster.

    Requires a DELETE-scoped token (see _verify_clip_token): the backend mints
    these only for an authenticated Facility Admin whose facility owns the
    incident, and only for that one filename. A playback token will not work
    here, which is the point -- see the action-binding note in that function.

    The poster is removed alongside the clip. Leaving orphaned thumbnails of a
    recording someone deliberately deleted would defeat the deletion.
    """
    from flask import request, abort, jsonify

    if not os.getenv("CLIP_SIGNING_SECRET", ""):
        print("[CLIP] delete refused: CLIP_SIGNING_SECRET is not set")
        abort(503)

    if not _is_safe_clip_filename(filename) or not filename.lower().endswith(".mp4"):
        abort(400)

    if not _verify_clip_token(request.args.get("token", ""), filename, action="delete"):
        abort(403)

    base = CLIP_DIR.resolve()
    target = (base / filename).resolve()
    if target.parent != base:
        abort(400)

    removed = []
    for path in (target, poster_path_for(target)):
        try:
            if path.is_file():
                path.unlink()
                removed.append(path.name)
        except OSError as err:
            print(f"[CLIP] delete failed for {path.name}: {err}")
            abort(500)

    if not removed:
        # Already gone. Report success rather than 404: the caller asked for the
        # file to not exist, and it does not exist. A 404 here would strand the
        # backend, which still needs to clear clipPath on the incident.
        print(f"[CLIP] delete: {filename} was already absent")

    print(f"[CLIP] deleted {removed or '(nothing, already absent)'}")
    return jsonify({"deleted": removed})


@app.route("/video_feed/<cam_id>")
def video_feed(cam_id):
    # Two-tier auth, both optional and independent:
    #   1. ?token=<signed>  — short-lived HMAC token minted by the authenticated
    #      backend (STREAM_SIGNING_SECRET). Preferred; per-session, expires.
    #   2. ?key=<STREAM_TOKEN> — legacy static shared secret (kept for the
    #      already-deployed web frontend until it migrates).
    # If neither STREAM_SIGNING_SECRET nor STREAM_TOKEN is set, the feed is open
    # (local-only/dev). Lets the public Cloudflare Tunnel be exposed safely.
    from flask import request, abort
    _signing_secret = os.getenv("STREAM_SIGNING_SECRET", "")
    _stream_token = os.getenv("STREAM_TOKEN", "")

    if _signing_secret or _stream_token:
        token = request.args.get("token", "")
        key = request.args.get("key", "")
        signed_ok = bool(_signing_secret) and _verify_signed_stream_token(token)
        legacy_ok = bool(_stream_token) and key == _stream_token
        if not (signed_ok or legacy_ok):
            abort(403)

    return Response(
        generate_frames(cam_id),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

# A camera counts as ONLINE if it produced a frame within this many seconds.
# Generous enough to ride out a brief RTSP hiccup (capture_thread retries once
# per second), tight enough that an unplugged camera goes Inactive quickly.
CAMERA_STALE_AFTER_S = float(os.getenv("CAMERA_STALE_AFTER_S", "5.0"))

# ── Low-light gate ───────────────────────────────────────────────────────────
# Keyed on BRIGHTNESS, never on the clock. Night falls are the ones that matter
# most, so refusing to watch after a certain hour would be indefensible. But a
# frame too dark to see is one where the detector's output is noise, and acting
# on noise is worse than not acting — it buries the real alerts.
# NIGHT_GATE_LUMA is mean pixel value 0-255; 18 is very dark, roughly "lights
# out with no IR". NIGHT_GATE_HYST stops it flapping at the boundary.
# Set NIGHT_GATE=0 to disable.
NIGHT_GATE_ON   = os.getenv("NIGHT_GATE", "1") == "1"
NIGHT_GATE_LUMA = float(os.getenv("NIGHT_GATE_LUMA", "18"))
NIGHT_GATE_HYST = float(os.getenv("NIGHT_GATE_HYST", "4"))


def camera_health():
    """Per-camera liveness, derived from the capture timestamp already stored
    alongside every raw frame (capture_thread: raw_frames[cam] = (frame, ts)).

    `online` means "this camera produced a frame in the last
    CAMERA_STALE_AFTER_S seconds" — NOT merely "it is configured". A camera
    that is listed in CAMERAS but unplugged reports online=False, which is the
    whole point: the dashboard must show what is actually working.
    """
    now = time.time()
    out = []
    with raw_lock:
        snapshot = {cam_id: (entry[1] if entry else None)
                    for cam_id, entry in raw_frames.items()}
    for cam_id, source in CAMERAS:
        last_ts = snapshot.get(cam_id)
        age = (now - last_ts) if last_ts else None
        out.append({
            "id":      cam_id,
            "online":  age is not None and age <= CAMERA_STALE_AFTER_S,
            "lastFrameAgo": round(age, 2) if age is not None else None,
            "source":  str(source),
        })
    return out


@app.route("/status")
def status():
    from flask import jsonify
    cams = camera_health()
    return jsonify({
        # Kept for backwards compatibility with anything reading the old shape.
        "cameras":   list(cam_frames.keys()),
        # New: real liveness, one entry per configured camera.
        "cameraHealth": cams,
        "onlineCount":  sum(1 for c in cams if c["online"]),
        "totalCount":   len(cams),
        "staleAfterSeconds": CAMERA_STALE_AFTER_S,
        "modules":   ["fall", "body_agitation", "movement"],
        "tracker":   "bytetrack",
        "pose_model": POSE_MODEL_PATH,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })

# ───────────────────────────────────────────────────────────────────────────────
# MAIN
# ───────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Spin up capture + inference threads for every configured camera.
    # CAMERAS is the single source of truth (env-var driven, see top of file).
    for cam_id, source in CAMERAS:
        ct = threading.Thread(target=capture_thread, args=(cam_id, source))
        ct.daemon = True
        ct.start()

        it = threading.Thread(target=process_camera_thread, args=(cam_id,))
        it.daemon = True
        it.start()

    print("\n[READY] VisioSphere AI Core running.")
    for cam_id, source in CAMERAS:
        # cam_id may contain spaces ("House of Charbel"); URL-encode for the
        # diagnostic link so it's pasteable into a browser.
        from urllib.parse import quote
        print(f"[READY]  Video feed: http://localhost:5001/video_feed/{quote(cam_id)}  ({cam_id} ← {source})")
    print(f"[READY]  Status:     http://localhost:5001/status")
    print(f"[READY]  Modules: C (Fall)  D (Body Agitation TEST_MODE={BEHAVIOR_TEST_MODE})  E (Movement TEST_MODE={MOVEMENT_TEST_MODE})")
    # Printed every start on purpose. This flag decides whether a person seen
    # already on the floor raises an EMERGENCY, and its state was previously
    # invisible at runtime — the only way to know was to read the source and
    # infer the default. Now the log says which way it is set.
    print(f"[READY]  Unwitnessed-fall alerts: "
          f"{'ON  (a person with no upright history raises an EMERGENCY)' if UNWITNESSED_FALL_ON else 'OFF (reported as LYING DOWN instead)'}"
          f"  [UNWITNESSED_FALL={os.getenv('UNWITNESSED_FALL', '0')}]")
    print(f"[READY]  Multi-person: ByteTrack track IDs, per-track state machines\n")

    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True, use_reloader=False)
