"""Render annotated frames with the real drawing code so the colour scheme can
be inspected, and build a short mp4 through the same static-HUD path the clip
recorder uses. Verification for the visual changes — no assertions, just eyes.

    python render_check.py test_videos/falls/fall5_slow.mp4
"""
import os, sys

os.environ.setdefault("INFERENCE_W", "720")
os.environ.setdefault("INFERENCE_H", "480")
os.environ.setdefault("POSTURE_RATIO", "1")
os.environ.setdefault("VERBOSE_LOGS", "0")

import cv2, numpy as np
from ultralytics import YOLO
import load_core

VIDEO  = sys.argv[1] if len(sys.argv) > 1 else "test_videos/falls/fall5_slow.mp4"
MODEL  = os.getenv("POSE_MODEL_PATH", "yolo11m-pose.pt")
STRIDE = int(os.getenv("STRIDE", "15"))
CAM    = os.getenv("CAM_ID", "Test_Falls_5")
OUTDIR = os.getenv("OUTDIR", "render")
os.makedirs(OUTDIR, exist_ok=True)

ns = load_core.load(os.getenv("CORE_FILE", "cctv_core.py"))
try:
    import torch
    DEVICE = os.getenv("DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
except Exception:
    DEVICE = "cpu"

W, H = ns["INFERENCE_W"], ns["INFERENCE_H"]
cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
model = YOLO(MODEL)

fall_machines, kpt_smooth, last_seen = {}, {}, {}
T0 = 100000.0
kept = []                     # (worst_status, annotated frame, t)
idx = raw = 0

while True:
    ok, frame = cap.read()
    if not ok:
        break
    raw += 1
    if (raw - 1) % STRIDE:
        continue
    frame = cv2.resize(frame, (W, H))
    now = T0 + (raw - 1) / fps
    idx += 1

    res = model.track(frame, conf=ns["DET_CONF"], iou=0.5, persist=True,
                      tracker=ns["TRACKER_CFG"], device=DEVICE, verbose=False)
    display = frame.copy()
    obs = []
    for r in res:
        if r.boxes is None or r.keypoints is None or r.boxes.id is None:
            continue
        ids = r.boxes.id.cpu().numpy().astype(int)
        for i, box in enumerate(r.boxes):
            rk = r.keypoints.data[i].cpu().numpy()
            if int(np.sum(rk[:, 2] >= ns["POSE_CONF_THRESHOLD"])) < ns["MIN_CONFIDENT_KPTS"]:
                continue
            obs.append((int(ids[i]), ns["smooth_keypoints"](kpt_smooth, int(ids[i]), rk),
                        tuple(map(int, box.xyxy[0]))))

    ns["reassociate_tracks"](CAM, {t: b for t, _, b in obs},
                             fall_machines, last_seen, (kpt_smooth,), now)
    ns["draw_furniture_zones"](display, CAM)
    worst = "NO PERSON" if not obs else "NORMAL"

    for tid, k, (x1, y1, x2, y2) in obs:
        last_seen[tid] = now
        sm = fall_machines.setdefault(tid, ns["FallStateMachine"]())
        has = ns["pose_has_required_keypoints"](k)
        ang = ns["get_torso_angle"](k) if has else 0.0
        asp = ns["get_body_aspect_ratio"]((x1, y1, x2, y2))
        posture = ns["get_posture_ratios"](k) if ns["POSTURE_RATIO_ON"] else (None, None)
        seated, deep = ns["looks_seated"](k, ang) if has else (False, False)
        sup = ns["support_point"](k if has else None, (x1, y1, x2, y2))
        furn = ns["furniture_zone_at"](CAM, sup)
        st, _al = sm.update(ang, asp, has, now, bbox_h=(y2 - y1), posture=posture,
                            seated=seated, seated_deep=deep, furniture=furn,
                            center_y=(y1 + y2) / 2.0,
                            extent_ratio=ns["body_extent_ratio"](k if has else None, y2 - y1))
        sm.last_box = (x1, y1, x2, y2)

        track_status = "NORMAL"
        if st == "FALLEN":
            track_status = sm._last_fall_label
        elif st == "STUMBLE":
            track_status = "STUMBLE DETECTED"

        prio = ns["_priority"](track_status)
        col  = ns["status_color"](track_status)
        thick = 5 if prio >= 7 else (3 if prio >= 4 else 2)
        cv2.rectangle(display, (x1, y1), (x2, y2), col, thick)
        cv2.putText(display, f"ID {tid}", (x1, y2 + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)
        ns["draw_pose_overlay"](display, k, color=col)
        if prio >= 2:
            cv2.putText(display, track_status, (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2)
        if prio > ns["_priority"](worst):
            worst = track_status

    n = len(obs)
    ns["draw_status_bar"](display, CAM, f"{n} person(s) | WORST: {worst}",
                          ns["status_color"](worst),
                          clock=f"{(raw - 1) / fps:6.2f}s")
    kept.append((worst, display, (raw - 1) / fps))

cap.release()

# One PNG per distinct status, so every colour in the scheme is inspectable.
seen = {}
for worst, frm, t in kept:
    if worst not in seen:
        seen[worst] = (frm, t)
for worst, (frm, t) in seen.items():
    safe = worst.replace(" ", "_").replace("/", "_").replace("?", "")
    cv2.imwrite(f"{OUTDIR}/live_{safe}.png", frm)
print("LIVE frames written for statuses:", list(seen))

# Static-HUD clip: repaint the band the way _record_alert_clip does, using the
# incident's final classification for every frame.
worst_overall = max((w for w, _, _ in kept), key=ns["_priority"])
label = ns["_CLIP_LABEL_STATUS"].get(
    {"LYING DOWN": "lying_down"}.get(worst_overall, ""), worst_overall)
bar = ns["status_color"](label)
print(f"clip incident label: {label!r}")

h, w = kept[0][1].shape[:2]
vw = cv2.VideoWriter(f"{OUTDIR}/clip_static_hud.mp4",
                     cv2.VideoWriter_fourcc(*"mp4v"), 8.0, (w, h))
vw_live = cv2.VideoWriter(f"{OUTDIR}/clip_live_hud.mp4",
                          cv2.VideoWriter_fourcc(*"mp4v"), 8.0, (w, h))
for worst, frm, t in kept:
    vw_live.write(frm)
    s = frm.copy()
    ns["draw_status_bar"](s, CAM, f"INCIDENT: {label}", bar, clock=f"{t:6.2f}s")
    vw.write(s)
vw.release(); vw_live.release()
print(f"wrote {OUTDIR}/clip_static_hud.mp4 and {OUTDIR}/clip_live_hud.mp4 "
      f"({len(kept)} frames)")
