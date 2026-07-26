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

CAMERAS = [c for c in [
    _make_camera("CAM_0_ID", "House of Charbel", "CAM_0_SOURCE", "0"),
    _make_camera("CAM_1_ID", "House of Gabriel", "CAM_1_SOURCE", "rtsp://192.168.100.109/stream1"),
] if c is not None]

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
from datetime import datetime

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


def _record_alert_clip(cam_id, clip_path, alert_payload):
    """Worker (daemon thread): wait POSTROLL_S, snapshot frames, write mp4.

    Snapshots the rolling pre-roll buffer immediately so we don't lose pre-
    incident context if the buffer rolls during the post-roll wait. Then
    samples cam_frames at CLIP_FPS for POSTROLL_S to capture the aftermath.
    On finish, emits `cctv_alert_clip` so the backend can stamp clipPath
    onto the matching Incident document.
    """
    # 1) Snapshot pre-roll IMMEDIATELY (before sleeping). The inference thread
    #    keeps appending during our sleep, but the snapshot we hold is frozen.
    with clip_buffer_lock:
        pre_roll = [f.copy() for _, f in clip_buffers[cam_id]]

    # 2) Sample cam_frames at fixed cadence for POSTROLL_S seconds.
    post_roll = []
    sample_dt = 1.0 / max(1, CLIP_FPS)
    deadline  = time.time() + CLIP_POSTROLL_S
    next_t    = time.time()
    while time.time() < deadline:
        sleep_for = next_t - time.time()
        if sleep_for > 0:
            time.sleep(sleep_for)
        with lock:
            curr = cam_frames.get(cam_id)
            if curr is not None:
                post_roll.append(curr.copy())
        next_t += sample_dt

    all_frames = pre_roll + post_roll
    if not all_frames:
        print(f"[CLIP] {cam_id}: no frames captured, skipping save")
        return

    # 3) Encode. mp4v is broadly compatible with browser <video> tags. If your
    #    OpenCV build lacks the codec, swap to 'avc1' or use ffmpeg-python.
    h, w = all_frames[0].shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(clip_path), fourcc, float(CLIP_FPS), (w, h))
    if not writer.isOpened():
        print(f"[CLIP] {cam_id}: VideoWriter failed to open at {clip_path}")
        return
    for frame in all_frames:
        writer.write(frame)
    writer.release()

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
    rel_path = s3_path or f"clips/{clip_path.name}"
    print(f"[CLIP] {cam_id}: saved {clip_path.name} ({len(all_frames)} frames, "
          f"{len(pre_roll)} pre / {len(post_roll)} post) -> {rel_path}")
    if sio.connected:
        sio.emit("cctv_alert_clip", {
            "location":  cam_id,
            "clipPath":  rel_path,
            "alertKey":  alert_payload.get("alertKey"),
            "timestamp": alert_payload.get("timestamp"),
        })


def _maybe_buffer_frame(cam_id, frame):
    """Throttled append into the pre-roll deque. Called by the inference thread
    after every annotated frame is published to cam_frames."""
    now = time.time()
    if now < _clip_next_append[cam_id]:
        return
    _clip_next_append[cam_id] = now + (1.0 / max(1, CLIP_FPS))
    with clip_buffer_lock:
        clip_buffers[cam_id].append((now, frame))

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
# Raised from 0.35 → 0.45 to filter junk keypoints. YOLOv8-pose returns
# low-confidence keypoint guesses for occluded body parts; at 0.35 those
# guesses dragged the torso-angle calculation around (sometimes spiking
# 20–30° when the hip keypoint flickered). 0.45 trades occasional
# partial-pose detection for substantially cleaner angle math.
POSE_CONF_THRESHOLD      = 0.45
FALL_ANGLE_THRESHOLD        = 65.0   # torso degrees from vertical → LYING
STUMBLE_ANGLE_THRESHOLD     = 60.0   # torso degrees → transitional / at-risk (raised to avoid bending false positives)
FALL_HEIGHT_RATIO_THRESHOLD = 0.50   # bbox height / standing-reference below this → fall toward/away from camera
FALL_FRAMES_REQUIRED        = 3      # consecutive frames before fall alert fires (~0.3s at inference FPS)
STUMBLE_FRAMES_REQUIRED     = 4      # higher than fall — stumble is noisier, needs more confirmation
FALL_ALERT_COOLDOWN_S       = 15.0   # seconds before same alert can repeat

# Module D — Behavioral Monitoring
# ── Switch between TEST and PRODUCTION values here ────────────────────────────
# TEST mode: fast response, low thresholds — use while verifying detection works
# PRODUCTION mode: conservative, sustained — use for real deployment
BEHAVIOR_TEST_MODE       = True   # ← set False before deployment

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

# ── Module F — Pacing ──────────────────────────────────────────────────────
# Pacing = repeated back-and-forth motion within a bounded spatial range.
# Clinically associated with sundowning, dementia agitation, and anxiety in
# elderly populations (Cohen-Mansfield et al.; Algase NDB model).
#
# Two spatial geometry metrics are computed per frame, both must hold:
#   1. Sharp turn angle >= PACING_TURN_ANGLE_MIN (150°) per reversal.
#      Clinical AI literature (2022–2026) sets this threshold to distinguish
#      genuine U-turns from gradual curves or gait noise. Simple sign-change
#      reversal counting (the prior approach) fired on any drift.
#      This also makes the efficiency ratio redundant: no purposeful locomotion
#      produces 4+ sharp 150° U-turns, so we removed efficiency as a gate.
#   2. Per-leg sinuosity S < PACING_SINUOSITY_MAX. Each transit leg between
#      reversals should be nearly linear (S = 1.0 is a perfectly straight
#      leg). High S = wandering/weaving, not pacing. Computed per segment,
#      not over the full path (full-path sinuosity is misleading for pacing).
# Efficiency is still computed and logged but NOT used as an alert gate —
# the window-wide net_displacement/total_distance ratio oscillates during
# active pacing (high when at far end, low when near start), which caused
# the alert to fire only when the person stopped rather than during pacing.
# ── TEST vs PRODUCTION pacing thresholds ─────────────────────────────────
PACING_TEST_MODE         = False  # ← set False before deployment

if PACING_TEST_MODE:
    PACING_WARMUP_S      = 15.0   # seconds before alerting is possible
    PACING_MIN_REVERSALS = 2      # sharp U-turns required inside window
else:
    PACING_WARMUP_S      = 60.0
    PACING_MIN_REVERSALS = 4

PACING_WINDOW_S          = 60.0   # rolling time window for reversal counting
PACING_MIN_REVERSAL_DX   = 0.05   # jitter filter — ignore steps < 5% frame width
PACING_TURN_ANGLE_MIN    = 150.0  # degrees — minimum angle to count as a sharp U-turn
PACING_EFFICIENCY_MAX    = 0.15   # displacement/distance ratio must stay below this
PACING_SINUOSITY_MAX     = 1.8    # per-leg sinuosity ceiling (1.0 = perfectly straight)
PACING_MIN_TOTAL_DIST    = 0.20   # minimum normalized total distance before evaluating
PACING_COOLDOWN_S        = 300.0  # 5 min between repeat alerts for same track

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
MOVEMENT_TEST_MODE       = True

if MOVEMENT_TEST_MODE:
    INACTIVITY_THRESHOLD_S   = 10     # seconds stationary → alert
    MOVEMENT_DEBUG_EVERY_S   = 2.0    # print tracker diagnostics this often
else:
    # Raised from 60s to 5 minutes (300s) for deployment. One minute of
    # immobility is too short — false-fires on a resident reading quietly,
    # watching a TV scene, or napping briefly. Five minutes balances "long
    # enough to filter normal still-but-fine behaviour" against "short enough
    # to catch a real loss of consciousness or fall-without-collapse event."
    INACTIVITY_THRESHOLD_S   = 300
    MOVEMENT_DEBUG_EVERY_S   = 0.0    # silent in production

# ── Fall rate threshold ───────────────────────────────────────────────────────
# Peak angular velocity (deg/sec) above which a torso transition is treated as
# a genuine fall rather than an intentional lie-down.
#   Fast fall  (~0.7 s for 75°)     → ~107°/s  (well above)
#   Slumping fall (~1.5 s for 75°)  → ~50°/s   (above 45)
#   Intentional lie-down (~4 s)     → ~19°/s   (well below)
FALL_RATE_THRESHOLD      = 45.0
FALL_RATE_WINDOW_S       = 2.5    # lookback for peak rise (long enough at 3 fps)

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
LYING_CONFIRM_SECONDS    = 3.0

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

def get_body_aspect_ratio(box):
    """Returns bbox height/width. >1.5 = standing, <0.9 = likely fallen."""
    x1, y1, x2, y2 = box
    w = max(x2 - x1, 1)
    h = max(y2 - y1, 1)
    return h / w

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


def draw_pose_overlay(frame, kpts):
    skeleton = [
        (0,1),(0,2),(1,3),(2,4),(5,6),(5,7),(7,9),(6,8),
        (8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)
    ]
    for kp in kpts:
        if kp[2] > POSE_CONF_THRESHOLD:
            cv2.circle(frame, (int(kp[0]), int(kp[1])), 4, (0, 255, 255), -1)
    for a, b in skeleton:
        if kpts[a][2] > POSE_CONF_THRESHOLD and kpts[b][2] > POSE_CONF_THRESHOLD:
            cv2.line(
                frame,
                (int(kpts[a][0]), int(kpts[a][1])),
                (int(kpts[b][0]), int(kpts[b][1])),
                (255, 255, 0), 2
            )

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
# Module F — Pacing Detector
# ─────────────────────────────────────────────────────────────────────────────
class PacingDetector:
    """
    Evidence-based pacing detector using three spatial geometry metrics
    validated in clinical AI literature (2022–2026):

      1. Sharp turn angle >= 150° per reversal — filters gradual curves and
         gait noise from genuine U-turns (vs. the old sign-change approach).
      2. Displacement-to-distance efficiency ratio < 0.15 — confirms the
         person covered large total distance but negligible net displacement.
      3. Per-leg sinuosity S < PACING_SINUOSITY_MAX — each transit leg between
         reversals should be nearly linear (S = 1.0). High S = wandering.

    Tracks 2D centroid (x, y) instead of x-only so turn angles are accurate.
    All three metrics plus warmup and cooldown must hold to fire an alert.
    """

    def __init__(self, frame_w=640, frame_h=480, label="CAM"):
        self.fw    = frame_w
        self.fh    = frame_h
        self.label = label
        self._positions        = deque(maxlen=int(PACING_WINDOW_S * 30) + 30)
        self._track_started_at = None
        self._last_alert       = 0.0

    def reset(self):
        """Clear all state. Called when a fall fires on the same track to
        prevent pre-fall walk positions from triggering a spurious pacing alert
        after the person is already on the floor."""
        self._positions.clear()
        self._track_started_at = None

    def update(self, center_px, now):
        """
        Returns (pacing_score 0..1, alert_or_None).
        center_px: (pixel_x, pixel_y) bbox centroid from ByteTrack.
        """
        if self._track_started_at is None:
            self._track_started_at = now

        cx = center_px[0] / self.fw
        cy = center_px[1] / self.fh
        self._positions.append((cx, cy, now))

        cutoff = now - PACING_WINDOW_S
        while self._positions and self._positions[0][2] < cutoff:
            self._positions.popleft()

        if len(self._positions) < 6:
            return 0.0, None

        sharp_reversals, efficiency, avg_sinuosity = self._compute_metrics()
        score = float(min(1.0, sharp_reversals / max(1, PACING_MIN_REVERSALS)))

        track_age = now - self._track_started_at
        if track_age < PACING_WARMUP_S:
            return score, None

        if (sharp_reversals >= PACING_MIN_REVERSALS
                and avg_sinuosity < PACING_SINUOSITY_MAX
                and now - self._last_alert > PACING_COOLDOWN_S):
            self._last_alert = now
            print(f"[PACING {self.label}] {sharp_reversals} sharp reversals | "
                  f"efficiency={efficiency:.3f} | sinuosity={avg_sinuosity:.2f} → alert")
            return score, "PACING DETECTED"

        return score, None

    def _compute_metrics(self):
        """
        Returns (sharp_reversals, efficiency_ratio, avg_leg_sinuosity).

        Filters jitter steps first, then:
        - Walks consecutive displacement vectors, counts angle >= 150° as a
          sharp reversal, and records the index of each reversal point.
        - Computes per-leg sinuosity (D_total / D_straight) for each segment
          between reversal points — S=1.0 is a perfectly straight leg.
        - Computes overall efficiency ratio (net_displacement / total_distance)
          over the full window — approaches 0 for pacing.
        """
        raw   = list(self._positions)
        valid = [raw[0]]
        for p in raw[1:]:
            if np.hypot(p[0] - valid[-1][0], p[1] - valid[-1][1]) >= PACING_MIN_REVERSAL_DX:
                valid.append(p)

        if len(valid) < 4:
            return 0, 1.0, 999.0

        # ── Sharp reversals + reversal index map ──────────────────────────
        reversal_at     = [0]
        sharp_reversals = 0

        for i in range(2, len(valid)):
            v1 = (valid[i-1][0] - valid[i-2][0], valid[i-1][1] - valid[i-2][1])
            v2 = (valid[i][0]   - valid[i-1][0], valid[i][1]   - valid[i-1][1])
            n1 = np.hypot(v1[0], v1[1])
            n2 = np.hypot(v2[0], v2[1])
            if n1 < 1e-9 or n2 < 1e-9:
                continue
            cos_t = np.clip((v1[0]*v2[0] + v1[1]*v2[1]) / (n1 * n2), -1.0, 1.0)
            if np.degrees(np.arccos(cos_t)) >= PACING_TURN_ANGLE_MIN:
                sharp_reversals += 1
                reversal_at.append(i - 1)

        reversal_at.append(len(valid) - 1)

        # ── Per-leg sinuosity ─────────────────────────────────────────────
        # Skip the last entry in reversal_at — it is always len(valid)-1
        # (the current frame), meaning the final "leg" is incomplete. Its
        # sinuosity is unreliable: the centroid noise over a short partial
        # leg inflates the ratio and blocks valid pacing alerts.
        leg_sinuosities = []
        for j in range(1, len(reversal_at) - 1):
            seg = valid[reversal_at[j-1]: reversal_at[j] + 1]
            if len(seg) < 2:
                continue
            seg_total    = sum(np.hypot(seg[k][0] - seg[k-1][0],
                                        seg[k][1] - seg[k-1][1])
                               for k in range(1, len(seg)))
            seg_straight = np.hypot(seg[-1][0] - seg[0][0],
                                    seg[-1][1] - seg[0][1])
            if seg_straight > 1e-6 and seg_total > 1e-6:
                leg_sinuosities.append(seg_total / seg_straight)

        avg_sinuosity = float(np.mean(leg_sinuosities)) if leg_sinuosities else 999.0

        # ── Efficiency ratio ──────────────────────────────────────────────
        total_dist = sum(np.hypot(valid[i][0] - valid[i-1][0],
                                  valid[i][1] - valid[i-1][1])
                         for i in range(1, len(valid)))
        if total_dist < PACING_MIN_TOTAL_DIST:
            return sharp_reversals, 1.0, avg_sinuosity

        net_disp   = np.hypot(valid[-1][0] - valid[0][0],
                              valid[-1][1] - valid[0][1])
        efficiency = net_disp / total_dist

        return sharp_reversals, efficiency, avg_sinuosity


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
        self._angle_history    = deque(maxlen=60)   # (angle, timestamp) — ~10–20s at realistic 3–8 fps inference
        self._max_bbox_h       = 0  # largest bbox height seen for this track (standing reference)

    def update(self, angle, aspect_ratio, has_kpts, now, bbox_h=0):
        """
        angle:        torso angle from vertical (degrees)
        aspect_ratio: bbox height / width
        has_kpts:     whether required keypoints are visible
        bbox_h:       bounding box height in pixels (used for height-ratio fall path)
        Returns (state_string, alert_type_or_None)
        """
        if not has_kpts:
            self._candidate = self.NORMAL
            self._candidate_count = 0
            return self._state, None

        # Maintain standing-height reference. Only update when the person
        # appears upright (aspect_ratio > 1.5) so a fall frame doesn't corrupt
        # the reference value we use to detect that same fall.
        if bbox_h > 0 and aspect_ratio > 1.5:
            self._max_bbox_h = max(self._max_bbox_h, bbox_h)

        height_ratio = (bbox_h / self._max_bbox_h
                        if self._max_bbox_h > 30 and bbox_h > 0 else 1.0)

        # Track angle over time — used to measure transition speed
        self._angle_history.append((angle, now))

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
        if (angle > FALL_ANGLE_THRESHOLD and aspect_ratio < 0.85) or \
                (height_ratio < FALL_HEIGHT_RATIO_THRESHOLD and aspect_ratio < 1.2):
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
            # Person left FALLEN before the lying-confirm window elapsed —
            # this is exactly what the timer is for: their "fall" was
            # transient (a bend, a partial slump that recovered) and should
            # NOT alert. Cancel the pending confirmation.
            self._lying_confirm_since = None

        alert = self._evaluate_alert(prev, self._state, now)
        return self._state, alert

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

    def _evaluate_alert(self, prev, curr, now):
        alert = None

        if curr == self.FALLEN and prev != self.FALLEN:
            # FIRST FRAME of FALLEN — classify as fast fall vs slow lie-down.
            # Peak rising rate of torso angle over the last FALL_RATE_WINDOW_S.
            # Anchored on min angle in the window — see _get_angle_rate docstring
            # for why (latest − earliest) was unreliable at low inference fps.
            angle_rate = self._get_angle_rate(now)

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
            if self._lying_confirm_since is not None:
                if now - self._lying_confirm_since >= LYING_CONFIRM_SECONDS:
                    if now - self._last_lying_alert_time >= FALL_ALERT_COOLDOWN_S:
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
            if alert is None:
                elapsed = now - self._fallen_since
                if elapsed > 30 and now - self._last_fall_alert_time >= 60:
                    alert = f"PROLONGED FALL ({int(elapsed)}s)"
                    self._last_fall_alert_time = now
                    self._last_fall_label = alert

        return alert

# ─────────────────────────────────────────────────────────────────────────────
# Alert Emitter
# ─────────────────────────────────────────────────────────────────────────────
def send_alert(cam_id, alert_type, message, detection=None):
    """Emit alert via Socket.IO to the Node.js backend, and (subject to a
    per-camera cooldown) spawn a background worker that saves a pre/post-roll
    clip to disk and stamps the clipPath onto the persisted Incident.

    The cooldown deliberately does NOT suppress the alert itself — nurses
    still need every notification — only the *clip recording*. Clustered
    alerts (fall → lying-down → inactivity) all show up on the dashboard;
    only the first one within a CLIP_COOLDOWN_S window writes a video.
    """
    now = time.time()

    # alertKey lets the backend match the deferred `cctv_alert_clip` payload
    # to the Incident document this alert created. We hand the same key to
    # both sides; the backend uses (location, alertKey) as a join.
    alert_key = f"{cam_id}|{int(now * 1000)}"

    payload = {
        "type":      alert_type,
        "message":   message,
        "location":  cam_id,
        "timestamp": time.strftime("%I:%M:%S %p"),
        "alertKey":  alert_key,
    }

    if sio.connected:
        sio.emit("cctv_alert", payload)
    print(f"[ALERT] [{cam_id}] {alert_type}: {message}")

    # Cooldown: skip clip recording if we're still in the post-roll window of
    # a previous alert on this camera.
    if now < _clip_cooldown_until.get(cam_id, 0.0):
        return
    _clip_cooldown_until[cam_id] = now + CLIP_POSTROLL_S + CLIP_COOLDOWN_S

    # Deterministic filename: <cam>_<detection>_<YYYYMMDD_HHMMSS>_<key>.mp4
    safe_cam   = cam_id.replace(" ", "_").replace("/", "_").replace("\\", "_")
    safe_type  = (detection or alert_type).lower().replace(" ", "_").replace("/", "_")
    ts_str     = datetime.now().strftime("%Y%m%d_%H%M%S")
    key_short  = alert_key.split("|")[-1][-6:]   # last 6 digits of ms-epoch
    clip_name  = f"{safe_cam}_{safe_type}_{ts_str}_{key_short}.mp4"
    clip_path  = CLIP_DIR / clip_name

    t = threading.Thread(
        target=_record_alert_clip,
        args=(cam_id, clip_path, payload),
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
            # (inactivity, pacing) accumulate state across the full clip.
            if _is_file_source:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                print(f"[CAPTURE {cam_id}] Video file ended — looping.")
                continue
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
        frame = cv2.resize(frame, (INFERENCE_W, INFERENCE_H))
        with raw_lock:
            raw_frames[cam_id] = (frame, capture_ts)

# ─────────────────────────────────────────────────────────────────────────────
# Inference Thread — one per camera
# ─────────────────────────────────────────────────────────────────────────────
TRACK_TIMEOUT_S = 5.0   # drop a track's per-person state after this much absence

# Status string → display color
# DEPRESSION_RISK and MIXED_RISK previously lived here; the depression
# sub-score was removed from BehaviorScorer (see its docstring) and
# nothing ever set MIXED_RISK as a worst_status, so both were dropped.
STATUS_COLORS = {
    "NORMAL":   (0, 200, 0),
    "STANDING": (0, 200, 0),
    "SITTING":  (0, 165, 255),
    "STUMBLE DETECTED":     (0, 165, 255),
    "FALL DETECTED (HIGH CONFIDENCE)":   (0, 0, 255),
    "FALL DETECTED (MEDIUM CONFIDENCE)": (0, 0, 255),
    "PROLONGED FALL":       (0, 0, 200),
    "AGITATION_RISK":       (0, 60, 200),
    "PACING DETECTED":      (200, 100, 0),
}

# Worst-status priority for camera-level HUD aggregation across multiple tracks.
# Higher number = more severe; the HUD shows the worst across all visible people.
STATUS_PRIORITY = {
    "NO PERSON": 0,
    "NORMAL":    1,
    "PACING DETECTED": 2,
    "AGITATION_RISK": 3,
    "STUMBLE DETECTED": 4,
    "LYING DOWN": 5,
    "FALL DETECTED (MEDIUM CONFIDENCE)": 6,
    "FALL DETECTED (HIGH CONFIDENCE)":   7,
    "PROLONGED FALL": 8,
}

def _priority(status):
    # Inactivity variants ("INACTIVE", "INACTIVE — POSTURE") share priority
    # by prefix so the HUD aggregator handles them uniformly.
    if status.startswith("INACTIVE"):
        return 6
    return STATUS_PRIORITY.get(status, 1)


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
    pacing_detectors  = {}   # track_id → PacingDetector
    movement_trackers = {}   # track_id → MovementTracker
    last_seen         = {}   # track_id → wall-clock timestamp
    last_behavior_per = {}   # track_id → last body-agitation alert string (debounce)
    last_pacing_per   = {}   # track_id → last pacing alert string (debounce)
    last_movement_per = {}   # track_id → last movement alert string (debounce)
    kpt_smooth        = {}   # track_id → np.ndarray (17,3) EMA-smoothed keypoints

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
        # persist=True keeps the tracker's track table across calls within this
        # thread. ByteTrack (swapped from BoT-SORT) maintains tracks across
        # occlusion using low-confidence detections that BoT-SORT discards —
        # noticeably better identity preservation when residents cross paths
        # in common areas. We use track_model (per-thread) so cameras don't
        # share tracker state.
        results = track_model.track(frame, conf=0.4, iou=0.5, persist=True,
                                    tracker="bytetrack.yaml", verbose=False)
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
                kpts = smooth_keypoints(kpt_smooth, int(ids[i]), raw_kpts)
                observations.append({
                    "tid":  int(ids[i]),
                    "kpts": kpts,
                    "box":  box,
                    "conf": float(box.conf[0]),
                })

        # ── HUD aggregator: worst status across all visible tracks ────────
        worst_status = "NO PERSON" if not observations else "NORMAL"

        for obs in observations:
            tid  = obs["tid"]
            kpts = obs["kpts"]
            box  = obs["box"]
            last_seen[tid] = now

            # Get-or-create per-track state
            fall_sm     = state_for(fall_machines,     tid, FallStateMachine)
            body_agi_sc = state_for(body_agi_scorers,  tid, BodyAgitationScorer)
            pacing_det  = state_for(pacing_detectors,  tid,
                                    lambda: PacingDetector(INFERENCE_W, INFERENCE_H, label=f"{cam_id}#{tid}"))
            movement_tr = state_for(movement_trackers, tid,
                                    lambda: MovementTracker(640, 480, label=f"{cam_id}#{tid}"))

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # Default green box + skeleton overlay per track
            cv2.rectangle(display, (x1, y1), (x2, y2), (0, 200, 0), 2)
            cv2.putText(display, f"ID {tid}", (x1, y2 + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 220, 0), 1)
            draw_pose_overlay(display, kpts)

            has_kpts  = pose_has_required_keypoints(kpts)
            angle     = get_torso_angle(kpts) if has_kpts else 0.0
            aspect    = get_body_aspect_ratio((x1, y1, x2, y2))
            # Movement signal uses BBOX centroid, not torso keypoints.
            # YOLO-pose jitters keypoints by 2–5 px even on a perfectly
            # still subject; that jitter spikes per-frame velocity past
            # INACTIVITY_VEL_MAX and prevents the inactivity timer from
            # ever accumulating. Bbox centers from ByteTrack are
            # dramatically more stable.
            # NOTE: fall detection still uses torso angle / aspect / kpts
            # exactly as before — only the movement input changes here.
            center_px = ((x1 + x2) / 2, (y1 + y2) / 2)

            # ── Module C: Fall ────────────────────────────────────────────
            fall_status, fall_alert = fall_sm.update(angle, aspect, has_kpts, now, bbox_h=(y2 - y1))

            if fall_alert:
                if "FALL" in fall_alert:
                    send_alert(cam_id, "EMERGENCY", f"[ID {tid}] {fall_alert}", detection="fall_detected")
                elif "LYING DOWN" in fall_alert:
                    send_alert(cam_id, "WARNING",   f"[ID {tid}] {fall_alert}", detection="lying_down")

                # Clear pacing + inactivity state for this track. The pacing
                # detector's 60-second deque still contains positions from
                # BEFORE the fall (walking up to it, the fall trajectory
                # itself), and those positions can spuriously trigger a
                # "PACING DETECTED" alert moments after the person is
                # already on the floor — which is exactly the false positive
                # we want to prevent. Resetting also keeps the inactivity
                # timer from firing on someone the system already knows has
                # fallen. Both detectors will accumulate fresh state only if
                # the person recovers and stays in frame long enough.
                pacing_det.reset()
                movement_tr.reset()

            if fall_status == "FALLEN":
                cv2.rectangle(display, (x1, y1), (x2, y2), (0, 0, 255), 5)
                cv2.putText(display, fall_sm._last_fall_label, (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            elif fall_status == "STUMBLE":
                cv2.rectangle(display, (x1, y1), (x2, y2), (0, 140, 255), 3)
                cv2.putText(display, "STUMBLE DETECTED", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 255), 2)

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
                if has_kpts and body_agi_score > 0.1:
                    for wr_i in [9, 10]:
                        if float(kpts[wr_i][2]) >= 0.35:
                            wx, wy = int(kpts[wr_i][0]), int(kpts[wr_i][1])
                            wcolor = (0, 80, 255) if body_agi_score > AGITATION_THRESHOLD else (180, 80, 255)
                            cv2.circle(display, (wx, wy), 10, wcolor, 3)
                    cv2.putText(display, f"Body agi: {body_agi_score:.2f}",
                                (x1, y1 - 50), cv2.FONT_HERSHEY_SIMPLEX,
                                0.45, (180, 80, 255), 1)

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
                    send_alert(cam_id, "WARNING", f"[ID {tid}] {body_alert}", detection="agitation")
                    last_behavior_per[tid] = body_alert
                    if _priority(body_alert) > _priority(track_status):
                        track_status = body_alert
                else:
                    last_behavior_per.pop(tid, None)

                # ── Module F: Pacing ─────────────────────────────────────
                # Independent of agitation — pacing is a longer-window
                # behavioral signal (60s window, 5min cooldown). Runs on
                # bbox centroid, not keypoints, so it works even when
                # YOLO loses track of individual joints.
                #
                # Gate 1 — full-body visibility: pacing requires a walking
                # full body. When only a head is visible (lying down, close-up,
                # partial occlusion), has_kpts=False and the bbox is very
                # unstable — it can jump 30-50 px per frame with no real
                # movement, instantly filling the deque with fake reversals.
                #
                # Gate 2 — stationary: a person sitting still cannot be pacing.
                # Without this, bbox centroid jitter over 60 s accumulates
                # apparent "reversals" and the efficiency metric hits near-0
                # (no net displacement while sitting) — both conditions that
                # would spuriously pass the pacing thresholds.
                # is_stationary() reads existing movement_tr history so the
                # check is valid before movement_tr.update() for this frame.
                if has_kpts and not movement_tr.is_stationary(now):
                    pacing_score, pacing_alert = pacing_det.update(center_px, now)

                    if pacing_alert:
                        send_alert(cam_id, "WARNING", f"[ID {tid}] {pacing_alert}", detection="pacing")
                        last_pacing_per[tid] = pacing_alert
                        if _priority(pacing_alert) > _priority(track_status):
                            track_status = pacing_alert
                    else:
                        last_pacing_per.pop(tid, None)
                else:
                    pacing_score = 0.0
                    last_pacing_per.pop(tid, None)

                # HUD readout when pacing score is climbing — shows nurses
                # that this track is "building toward" a pacing alert
                # rather than firing it out of nowhere.
                if pacing_score > 0.25:
                    cv2.putText(display, f"Pacing: {pacing_score:.2f}",
                                (x1, y1 - 70), cv2.FONT_HERSHEY_SIMPLEX,
                                0.45, (200, 100, 0), 1)

                # ── Module E: Movement / Inactivity ──────────────────────
                # Uses bbox centroid (not keypoints) — runs on every tracked
                # bbox regardless of pose confidence. has_kpts is passed
                # through only for the posture-aware INACTIVE—POSTURE variant.
                movement_result = movement_tr.update(
                    center_px, now,
                    torso_angle=angle,
                    has_kpts=has_kpts,
                )
                # Standing-upright gate: suppress inactivity for a person who
                # is standing normally. Reset the timer so it restarts cleanly
                # if they sit or crouch later.
                if (aspect > INACTIVITY_STANDING_ASPECT_MIN
                        and angle < INACTIVITY_STANDING_ANGLE_MAX):
                    movement_result = None
                    movement_tr.reset()
                    last_movement_per.pop(tid, None)
                if movement_result and movement_result != last_movement_per.get(tid):
                    level = "EMERGENCY" if "INACTIVE" in movement_result else "WARNING"
                    send_alert(cam_id, level, f"[ID {tid}] {movement_result}", detection="inactivity")
                    last_movement_per[tid] = movement_result
                elif not movement_result and not movement_tr.is_stationary(now):
                    last_movement_per.pop(tid, None)
                if last_movement_per.get(tid) and \
                   _priority(last_movement_per[tid]) > _priority(track_status):
                    track_status = last_movement_per[tid]

            # Update camera-level worst status
            if _priority(track_status) > _priority(worst_status):
                worst_status = track_status

        # ── Garbage-collect stale tracks ─────────────────────────────────
        # Person walked out of frame → drop their state after TRACK_TIMEOUT_S
        # so a returning visitor doesn't inherit stale fall/movement history.
        stale = [tid for tid, t in last_seen.items() if now - t > TRACK_TIMEOUT_S]
        for tid in stale:
            fall_machines.pop(tid, None)
            body_agi_scorers.pop(tid, None)
            pacing_detectors.pop(tid, None)
            movement_trackers.pop(tid, None)
            last_seen.pop(tid, None)
            last_behavior_per.pop(tid, None)
            last_pacing_per.pop(tid, None)
            last_movement_per.pop(tid, None)
            kpt_smooth.pop(tid, None)

        # ── On-frame HUD ──────────────────────────────────────────────────
        # HUD bar spans the full frame width and a fixed pixel height so it
        # scales correctly when INFERENCE_W is bumped to 1280 on GPU setups.
        color = STATUS_COLORS.get(worst_status, (200, 200, 200))
        h_disp, w_disp = display.shape[:2]
        cv2.rectangle(display, (0, 0), (w_disp, 40), (0, 0, 0), -1)
        n_people = len(observations)
        cv2.putText(display,
                    f"[{cam_id}] {n_people} person(s) | WORST: {worst_status}",
                    (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        # Right-align the timestamp regardless of frame width.
        cv2.putText(display, time.strftime("%H:%M:%S"),
                    (max(10, w_disp - 80), 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        with lock:
            if cam_frames[cam_id] is None:
                print(f"[STREAM {cam_id}] ✅ First frame ready — browser feed is now live.")
            cam_frames[cam_id] = display.copy()

        # Throttled push into the pre-roll buffer for alert clip recording.
        # Uses the same annotated `display` frame the dashboard sees so clip
        # playback shows the bbox / pose / status overlays that triggered
        # the alert — much more useful for review than a clean feed.
        _maybe_buffer_frame(cam_id, display)

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
        with lock:
            raw = cam_frames.get(cam_id)
            frame = raw.copy() if raw is not None else None

        if frame is None:
            # Yield a placeholder at ~1 fps so the MJPEG stream stays alive
            # and Cloudflare doesn't 524. Switches to live frames the moment
            # the capture thread delivers one.
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

@app.route("/status")
def status():
    from flask import jsonify
    return jsonify({
        "cameras":   list(cam_frames.keys()),
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
    print(f"[READY]  Modules: C (Fall)  D (Body Agitation TEST_MODE={BEHAVIOR_TEST_MODE})  E (Movement TEST_MODE={MOVEMENT_TEST_MODE})  F (Pacing)")
    print(f"[READY]  Multi-person: ByteTrack track IDs, per-track state machines\n")

    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True, use_reloader=False)
