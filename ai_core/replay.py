"""Replay a test video through the real detection functions, headless.

Mirrors what process_camera_thread computes per frame, but records every
intermediate signal to CSV so you can see WHY a frame was classified the way
it was, instead of inferring it from the overlay.

    python replay.py test_videos\\falls\\fall1_slow.mp4

Environment:
    STRIDE=15           process every Nth frame. The clips are 120 fps but the
                        live pipeline only manages 3-8 fps of inference, so
                        sampling is MORE faithful than every frame — and the
                        _angle_history deque (maxlen 60) spans 0.5 s at 120 fps
                        versus ~10 s at 6 fps, which changes the fall-rate
                        logic completely. Keep this near your real fps.
    CORE_FILE=...       which core to load (e.g. cctv_core.py.bak, to compare)
    OUT_CSV=...         output path
    POSE_MODEL_PATH=... defaults to yolo11l-pose.pt
    DEVICE=cuda:0|cpu   auto-detected
"""
import os, sys, csv

os.environ.setdefault("INFERENCE_W", "720")
os.environ.setdefault("INFERENCE_H", "480")
os.environ.setdefault("POSTURE_RATIO", os.getenv("POSTURE_RATIO", "1"))
os.environ.setdefault("VERBOSE_LOGS", "0")

import cv2, numpy as np
from ultralytics import YOLO        # the real package, BEFORE load_core stubs it
import load_core

CORE   = os.getenv("CORE_FILE", "cctv_core.py")
VIDEO  = sys.argv[1] if len(sys.argv) > 1 else "test_videos/falls/fall1_slow.mp4"
MODEL  = os.getenv("POSE_MODEL_PATH", "yolo11l-pose.pt")
OUT    = os.getenv("OUT_CSV", "replay.csv")
STRIDE = int(os.getenv("STRIDE", "15"))
CAM    = os.getenv("CAM_ID", "Test_Falls_2")

ns = load_core.load(CORE)

try:
    import torch
    DEVICE = os.getenv("DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
except Exception:
    DEVICE = os.getenv("DEVICE", "cpu")

W, H = ns["INFERENCE_W"], ns["INFERENCE_H"]
cap = cv2.VideoCapture(VIDEO)
if not cap.isOpened():
    sys.exit(f"cannot open {VIDEO}")
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
print(f"[REPLAY] {VIDEO}  {total:.0f} frames @ {fps:.1f} fps")
print(f"[REPLAY] core={CORE} model={MODEL} device={DEVICE} stride={STRIDE} "
      f"-> effective {fps / STRIDE:.1f} fps")

model = YOLO(MODEL)
fall_machines, kpt_smooth, last_seen = {}, {}, {}
rows, alerts = [], []
_now = [0.0]
T0 = 100000.0


def fake_send(cam_id, alert_type, message, detection=None, track_id=None, box=None):
    """Capture alerts instead of emitting them, but keep the dedup layer live."""
    dup = ns.get("_fall_alert_is_duplicate")
    if dup and dup(cam_id, detection, box, _now[0]):
        alerts.append((round(_now[0] - T0, 2), "SUPPRESSED", alert_type, message))
    else:
        alerts.append((round(_now[0] - T0, 2), "SENT", alert_type, message))


ns["send_alert"] = fake_send

idx = raw_idx = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    raw_idx += 1
    if (raw_idx - 1) % STRIDE:
        continue
    frame = cv2.resize(frame, (W, H))
    now = T0 + (raw_idx - 1) / fps
    _now[0] = now
    idx += 1
    if idx % 25 == 0:
        print(f"   ...{idx} sampled frames ({(raw_idx - 1) / fps:.1f}s)", flush=True)

    res = model.track(frame, conf=ns["DET_CONF"], iou=0.5, persist=True,
                      tracker=ns["TRACKER_CFG"], device=DEVICE, verbose=False)
    obs = []
    for r in res:
        if r.boxes is None or r.keypoints is None or r.boxes.id is None:
            continue
        ids = r.boxes.id.cpu().numpy().astype(int)
        for i, box in enumerate(r.boxes):
            raw = r.keypoints.data[i].cpu().numpy()
            if int(np.sum(raw[:, 2] >= ns["POSE_CONF_THRESHOLD"])) < ns["MIN_CONFIDENT_KPTS"]:
                continue
            k = ns["smooth_keypoints"](kpt_smooth, int(ids[i]), raw)
            obs.append((int(ids[i]), k, tuple(map(int, box.xyxy[0]))))

    if "reassociate_tracks" in ns:            # absent in the pre-patch core
        ns["reassociate_tracks"](CAM, {t: b for t, _, b in obs},
                                 fall_machines, last_seen, (kpt_smooth,), now)

    for tid, k, (x1, y1, x2, y2) in obs:
        last_seen[tid] = now
        sm = fall_machines.setdefault(tid, ns["FallStateMachine"]())
        has = ns["pose_has_required_keypoints"](k)
        ang = ns["get_torso_angle"](k) if has else 0.0
        asp = ns["get_body_aspect_ratio"]((x1, y1, x2, y2))
        posture = ns["get_posture_ratios"](k) if ns["POSTURE_RATIO_ON"] else (None, None)
        seated, deep = ns["looks_seated"](k, ang) if has else (False, False)
        sup = (ns["support_point"](k if has else None, (x1, y1, x2, y2))
               if "support_point" in ns else ((x1 + x2) / 2.0, (y1 + y2) / 2.0))
        furn = ns["furniture_zone_at"](CAM, sup) if "furniture_zone_at" in ns else None
        maxbh_before = sm._max_bbox_h
        try:                                  # patched core takes the extra kwargs
            st, al = sm.update(ang, asp, has, now, bbox_h=(y2 - y1), posture=posture,
                               seated=seated, seated_deep=deep, furniture=furn,
                               center_y=(y1 + y2) / 2.0,
                               extent_ratio=(ns["body_extent_ratio"](k if has else None, y2 - y1)
                                             if "body_extent_ratio" in ns else None))
        except TypeError:                     # original core does not
            st, al = sm.update(ang, asp, has, now, bbox_h=(y2 - y1),
                               posture=posture, seated=seated, seated_deep=deep)
        sm.last_box = (x1, y1, x2, y2)
        kl, kr = ns["knee_flexion"](k)
        hl, hr_ = ns["hip_flexion"](k) if "hip_flexion" in ns else (None, None)
        ev, cp = posture

        # Distance-invariant body scale: both numerator and denominator shrink
        # with range, so the ratio does not care where in the room they are.
        import math as _m
        _shm = ns["midpoint"](k[5][:2], k[6][:2])
        _hpm = ns["midpoint"](k[11][:2], k[12][:2])
        _tlen = _m.hypot(_shm[0] - _hpm[0], _shm[1] - _hpm[1])
        _shw = _m.hypot(k[5][0] - k[6][0], k[5][1] - k[6][1])
        bh_tl = round((y2 - y1) / _tlen, 2) if _tlen > 1e-3 else ""
        bh_sw = round((y2 - y1) / _shw, 2) if _shw > 1e-3 else ""

        def fmt(a, b):
            return (f"{a:.0f}" if a else "-") + "/" + (f"{b:.0f}" if b else "-")

        rows.append({
            "t": round(now - T0, 3), "f": raw_idx, "tid": tid, "state": st,
            "alert": al or "", "ang": round(ang, 1), "asp": round(asp, 2),
            "bh": y2 - y1, "maxbh": maxbh_before,
            "hratio": round((y2 - y1) / maxbh_before, 3) if maxbh_before > 30 else 1.0,
            "elev": round(ev, 2) if ev is not None else "",
            "comp": round(cp, 2) if cp is not None else "",
            "knee": fmt(kl, kr), "hip": fmt(hl, hr_),
            "seated": int(seated), "deep": int(deep),
            "tlen": round(_tlen,1), "shw": round(_shw,1),
            "bh_tl": bh_tl, "bh_sw": bh_sw,
            "rate": round(sm._get_angle_rate(now), 1),
            "zone": furn or "",
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "cx": round((x1 + x2) / 2), "cy": round((y1 + y2) / 2),
            "hipx": round(sup[0]), "hipy": round(sup[1]),
            "hnx": round(sup[0] / W, 3), "hny": round(sup[1] / H, 3),
        })
        if al:
            lvl = "EMERGENCY" if "FALL" in al else "WARNING"
            det = ("prolonged_fall" if "PROLONGED" in al
                   else "fall_detected" if "FALL" in al else "lying_down")
            fake_send(CAM, lvl, f"[ID {tid}] {al}", detection=det,
                      track_id=tid, box=(x1, y1, x2, y2))

    # ── Persistence path ──────────────────────────────────────────────────
    # process_camera_thread keeps ticking a track it can no longer see, and
    # that path emits the "NO LONGER VISIBLE" alerts. Omitting it here made
    # the replay under-report: the live system raises alerts this loop never
    # produced. Mirrored from cctv_core so the alert list is comparable.
    if ns.get("PERSIST_FALLEN_ON"):
        seen_now = {t for t, _, _ in obs}
        for _tid, _sm in list(fall_machines.items()):
            if _tid in seen_now:
                continue
            if not _sm.is_fallen():
                if not _sm.promote_on_vanish(now):
                    continue
            if not _sm.vanished_mid_frame(W, H):
                continue
            _a = _sm.tick_absent(now)
            if not _a:
                continue
            _lb = getattr(_sm, "last_box", None)
            _msg = f"[ID {_tid}] {_a} — NO LONGER VISIBLE"
            det = ("prolonged_fall" if "PROLONGED" in _a
                   else "fall_detected" if "FALL" in _a else "lying_down")
            fake_send(CAM, "EMERGENCY" if "FALL" in _a else "WARNING",
                      _msg, detection=det, track_id=_tid, box=_lb)

    # ── Stale-track GC, same policy as the live loop ──────────────────────
    stale = []
    for _tid, _t in last_seen.items():
        _sm = fall_machines.get(_tid)
        _limit = (ns["FALLEN_TIMEOUT_S"]
                  if (ns.get("PERSIST_FALLEN_ON") and _sm is not None and _sm.is_fallen())
                  else ns["TRACK_TIMEOUT_S"])
        if now - _t > _limit:
            stale.append(_tid)
    for _tid in stale:
        fall_machines.pop(_tid, None)
        last_seen.pop(_tid, None)
        kpt_smooth.pop(_tid, None)

cap.release()
if not rows:
    sys.exit("no observations recorded")
with open(OUT, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
print(f"\n{idx} sampled frames, {len(rows)} observations -> {OUT}")
print("\nALERTS")
if not alerts:
    print("   (none)")
for a in alerts:
    print("  ", a)
