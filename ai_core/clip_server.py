#!/usr/bin/env python3
"""
clip_server.py — serves recorded incident clips, independently of detection.

WHY THIS IS A SEPARATE PROCESS
------------------------------
The clip route originally lived inside cctv_core.py. That was wrong: it welded
playback to the detection service, so stopping the cameras also took the whole
recording archive offline. The clips are on local disk precisely so they stay
easy to reach — coupling them to the heaviest, most restart-prone process on
the machine threw that away.

This process shares nothing with detection. No YOLO, no OpenCV, no camera
threads, no RTSP. It opens a directory and serves files out of it, so it starts
in well under a second, uses almost no memory, and has no reason to ever go
down. cctv_core.py can be stopped, restarted, upgraded or crash outright and
the archive stays readable.

WHAT IT DOES NOT SOLVE
----------------------
If the mini PC itself is powered off, these files are unreachable — no design
that stores them on this disk can change that. What this guarantees is that the
archive survives the CAMERAS being off, the detector being stopped, and ai_core
being restarted, which is what actually happens day to day.

AUTH
----
Identical HMAC scheme to cctv_core.py and backend/utils/clipToken.js. The
backend checks that the caller's facility owns the incident, then mints a
short-lived token bound to one filename and one action. Holding a valid token
IS the authorisation here; this process does no facility logic of its own.

    GET    /clips/<filename>?token=...   play a clip, or fetch its poster
    DELETE /clips/<filename>?token=...   delete a clip and its poster
    GET    /health                       liveness, no auth

RUN
    python3 clip_server.py
    # or as a service: see scripts/visiosphere-clips.service
"""

import hashlib
import hmac
import os
import sys
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except Exception:
    pass

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Same default as cctv_core.py so a single CLIP_DIR in .env drives both.
CLIP_DIR_RAW = os.getenv("CLIP_DIR", "../backend/uploads/clips")
CLIP_DIR = Path(CLIP_DIR_RAW)
if not CLIP_DIR.is_absolute():
    CLIP_DIR = (Path(__file__).parent / CLIP_DIR).resolve()

PORT = int(os.getenv("CLIP_SERVER_PORT", "5002"))


def _is_safe_clip_filename(filename: str) -> bool:
    """Mirror of isSafeClipFilename in backend/utils/clipToken.js.

    Applied before the HMAC check and again before touching the filesystem. A
    valid token proves the backend authorised *some* name; it does not prove
    the name is harmless, because the caller controls the path segment the
    token is verified against.
    """
    return bool(filename) and not any(
        bad in filename for bad in ("/", "\\", "..", "\0")
    )


def _verify_clip_token(token: str, filename: str, action: str = "play") -> bool:
    """Verify a backend-minted, resource-bound clip token.

        play:    v1.<exp>.<hmacSha256Hex("v1.<exp>.<filename>", secret)>
        delete:  v1d.<exp>.<hmacSha256Hex("v1d.<exp>.<filename>", secret)>

    Two properties, both from what is hashed rather than what is checked after:

    1. RESOURCE BINDING — the filename is hashed in but not carried in the
       token, so a token for one clip cannot be replayed against another.
    2. ACTION BINDING — the version prefix is part of the signed message, so a
       playback token can never satisfy a delete check. Every played clip hands
       a valid token to the viewer's browser, where it lands in history and
       logs; if that token could delete, watching a fall would be enough to
       destroy the recording of it.
    """
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
        if int(exp) < int(time.time()):
            return False
    except ValueError:
        return False
    return True


def _resolve_inside_clip_dir(filename):
    """Absolute path for `filename`, proven to sit directly inside CLIP_DIR.

    Comparing the resolved parent (rather than using startswith on the string)
    is what stops a symlink planted in the clips folder from escaping it.
    """
    base = CLIP_DIR.resolve()
    target = (base / filename).resolve()
    if target.parent != base:
        return None, base
    return target, base


@app.route("/health")
def health():
    """Liveness plus enough context to diagnose a misconfiguration without SSH."""
    exists = CLIP_DIR.is_dir()
    return jsonify({
        "ok": True,
        "clipDir": str(CLIP_DIR),
        "clipDirExists": exists,
        "clipCount": len(list(CLIP_DIR.glob("*.mp4"))) if exists else 0,
        "signingSecretConfigured": bool(os.getenv("CLIP_SIGNING_SECRET", "")),
    })


@app.route("/clips/<filename>")
def serve_clip(filename):
    if not os.getenv("CLIP_SIGNING_SECRET", ""):
        # Fail closed. An unconfigured secret must never mean "serve to
        # anyone" — this endpoint hands out CCTV footage of residents.
        print("[CLIP] refused: CLIP_SIGNING_SECRET is not set", flush=True)
        abort(503)

    lowered = filename.lower()
    if not _is_safe_clip_filename(filename) or not lowered.endswith((".mp4", ".jpg")):
        abort(400)

    if not _verify_clip_token(request.args.get("token", ""), filename):
        abort(403)

    target, base = _resolve_inside_clip_dir(filename)
    if target is None or not target.is_file():
        abort(404)

    # conditional=True enables HTTP Range responses, which is what lets the
    # browser seek within a clip instead of re-downloading from byte 0.
    return send_from_directory(
        base, filename,
        mimetype="image/jpeg" if lowered.endswith(".jpg") else "video/mp4",
        conditional=True,
    )


@app.route("/clips/<filename>", methods=["DELETE"])
def delete_clip(filename):
    """Delete one clip and its poster.

    Requires a DELETE-scoped token, which the backend mints only for an
    authenticated Facility Admin whose facility owns the incident. The poster
    goes with the clip: leaving a thumbnail of a recording someone deliberately
    deleted would defeat the deletion.
    """
    if not os.getenv("CLIP_SIGNING_SECRET", ""):
        print("[CLIP] delete refused: CLIP_SIGNING_SECRET is not set", flush=True)
        abort(503)

    if not _is_safe_clip_filename(filename) or not filename.lower().endswith(".mp4"):
        abort(400)

    if not _verify_clip_token(request.args.get("token", ""), filename, action="delete"):
        abort(403)

    target, _ = _resolve_inside_clip_dir(filename)
    if target is None:
        abort(400)

    removed = []
    for path in (target, target.with_suffix(".jpg")):
        try:
            if path.is_file():
                path.unlink()
                removed.append(path.name)
        except OSError as err:
            print(f"[CLIP] delete failed for {path.name}: {err}", flush=True)
            abort(500)

    # Already gone counts as success: the caller asked for the file not to
    # exist, and it does not. A 404 here would strand the backend, which still
    # needs to clear clipPath on the incident.
    print(f"[CLIP] deleted {removed or '(already absent)'}", flush=True)
    return jsonify({"deleted": removed})


if __name__ == "__main__":
    if not CLIP_DIR.is_dir():
        print(f"[WARN] CLIP_DIR does not exist yet: {CLIP_DIR}", flush=True)
    if not os.getenv("CLIP_SIGNING_SECRET", ""):
        print("[FATAL] CLIP_SIGNING_SECRET is not set — every request would be "
              "refused. Set it in ai_core/.env, matching the backend.", flush=True)
        sys.exit(1)

    print(f"[READY] Clip server on http://0.0.0.0:{PORT}", flush=True)
    print(f"[READY]   serving {CLIP_DIR}", flush=True)
    print(f"[READY]   health: http://localhost:{PORT}/health", flush=True)
    app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)
