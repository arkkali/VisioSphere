#!/usr/bin/env python3
"""Measure a clip through the real detection maths. Numbers, not guesses.

    python3 measure_clip.py --clip /opt/visiosphere/clips/Living_Room_lying_....mp4
    python3 measure_clip.py --clip fall3_slow.mp4 --camera "Living Room" --csv out.csv

RUN IT ON THE AI BOX — it imports cctv_core.py and uses the same model, the same
tracker, the same thresholds and the same state machines the service uses. What
it prints is what the service would have decided about that clip.

Why this exists
---------------
Tuning by watching the dashboard is guesswork: you see the alert, not the
measurement that produced it. This replays a clip and prints, for every tracked
person: torso angle, whole-body axis angle, bbox aspect, body extent, posture
ratios, apparent size, whether the support point is on the floor, whether the
lower body is visible — and then which gate decided the outcome, and which
alerts would have been emitted.

Point it at a clip you KNOW is a false alarm and a clip you KNOW is a real fall.
The percentile tables show you exactly where to put each threshold so the two
separate, and the VERDICT section tells you what each gate is costing you.

Notes
-----
* Importing cctv_core opens its Socket.IO connection to the backend. This tool
  never calls send_alert(), so nothing is emitted and no incident is created.
* It works on both the patched and unpatched file. On an unpatched one it
  computes the new measurements itself and reports what the gates WOULD do, so
  you can see the effect before changing anything.
"""
import argparse
import csv as csvmod
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import cctv_core as C
except Exception as e:                                    # pragma: no cover
    sys.exit(f"could not import cctv_core.py from this directory: {e}")

import cv2
import inspect


# ── measurements the patched core has, recomputed here if it does not ────────
def _point_ok(k):
    return C.point_conf(k) >= C.POSE_CONF_THRESHOLD


def axis_angle(kpts, k=1.0):
    fn = getattr(C, "body_axis_angle", None)
    if fn is not None:
        try:
            return fn(kpts, k)
        except TypeError:
            return fn(kpts)
    if kpts is None:
        return None
    if not (_point_ok(kpts[C.LEFT_SHOULDER]) and _point_ok(kpts[C.RIGHT_SHOULDER])):
        return None
    top = C.midpoint(kpts[C.LEFT_SHOULDER][:2], kpts[C.RIGHT_SHOULDER][:2])
    bottom = None
    for l, r in ((C.LEFT_ANKLE, C.RIGHT_ANKLE), (C.LEFT_KNEE, C.RIGHT_KNEE)):
        if _point_ok(kpts[l]) and _point_ok(kpts[r]):
            bottom = C.midpoint(kpts[l][:2], kpts[r][:2]); break
        if _point_ok(kpts[l]):
            bottom = kpts[l][:2]; break
        if _point_ok(kpts[r]):
            bottom = kpts[r][:2]; break
    if bottom is None:
        return None
    dx = abs(float(bottom[0]) - float(top[0])) * k
    dy = abs(float(bottom[1]) - float(top[1]))
    if dx < 1e-6 and dy < 1e-6:
        return None
    return math.degrees(math.atan2(dx, dy))


def lower_ok(kpts):
    fn = getattr(C, "lower_body_visible", None)
    if fn is not None:
        return fn(kpts)
    if kpts is None:
        return False
    hips = _point_ok(kpts[C.LEFT_HIP]) and _point_ok(kpts[C.RIGHT_HIP])
    knee = _point_ok(kpts[C.LEFT_KNEE]) or _point_ok(kpts[C.RIGHT_KNEE])
    return bool(hips and knee)


def on_floor(cam, point):
    fn = getattr(C, "in_floor_zone", None)
    if fn is not None:
        return fn(cam, point)
    zones = [z for z in C._FURNITURE_ZONES.get(cam, ())
             if str(z["name"]).strip().lower() in ("floor", "ground", "open floor")]
    if not zones or point is None:
        return True
    return any(cv2.pointPolygonTest(z["pts"], (float(point[0]), float(point[1])),
                                    False) >= 0 for z in zones)


def pct(vals, q):
    vals = [v for v in vals if v is not None]
    return float(np.percentile(vals, q)) if vals else float("nan")


def fmt(v, nd=1):
    return "  --  " if v is None or (isinstance(v, float) and math.isnan(v)) \
        else f"{v:6.{nd}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--camera", default=None,
                    help="camera name for the zone lookup (default: first configured)")
    ap.add_argument("--csv", default=None, help="write every measured frame here")
    ap.add_argument("--every", type=int, default=1, help="process every Nth frame")
    ap.add_argument("--max-frames", type=int, default=0)
    a = ap.parse_args()

    if not os.path.isfile(a.clip):
        sys.exit(f"no such clip: {a.clip}")
    cam = a.camera or (C.CAMERAS[0][0] if getattr(C, "CAMERAS", None) else "Living Room")

    cap = cv2.VideoCapture(a.clip)
    if not cap.isOpened():
        sys.exit(f"could not open {a.clip}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    # Always measure the true geometry here — that is the point of the tool.
    # Whether the RUNNING core also corrects for it is reported separately.
    k = ((src_w / float(src_h)) / (C.INFERENCE_W / float(C.INFERENCE_H))
         if src_h else 1.0)
    core_corrects = bool(getattr(C, "PIXEL_ASPECT_CORRECT", False))

    zones = C._FURNITURE_ZONES.get(cam, ())
    floor_zones = [z for z in zones
                   if str(z["name"]).strip().lower() in ("floor", "ground", "open floor")]

    print("=" * 78)
    print(f"CLIP    {a.clip}")
    print(f"        {src_w}x{src_h} @ {fps:.1f} fps, {n_total or '?'} frames")
    print(f"CAMERA  {cam!r}   zones: {[z['name'] for z in zones] or 'none configured'}")
    print(f"        floor polygon: {'YES' if floor_zones else 'NO — floor gate will abstain'}")
    print(f"INFER   {C.INFERENCE_W}x{C.INFERENCE_H}   pixel-aspect k = {k:.3f}")
    if abs(k - 1.0) < 0.02:
        print("        square pixels — nothing to correct")
    else:
        print(f"        x and y are scaled differently by the resize: every angle"
              f"\n        and bbox ratio is off by this factor. A torso truly at 45 deg"
              f"\n        measures {math.degrees(math.atan(math.tan(math.radians(45))/k)):.1f} deg.")
        print(f"        running core corrects for it: "
              f"{'YES' if core_corrects else 'NO  <-- it is measuring distorted geometry'}")
        print("        (numbers below are the TRUE geometry either way)")
    print(f"MODEL   {C.POSE_MODEL_PATH}   DET_CONF={C.DET_CONF} "
          f"MIN_CONFIDENT_KPTS={C.MIN_CONFIDENT_KPTS}")
    print("THRESH  " + "  ".join(f"{n}={getattr(C, n)}" for n in (
        "FALL_ANGLE_THRESHOLD", "FALL_HEIGHT_RATIO_THRESHOLD",
        "LYING_CONFIRM_SECONDS") if hasattr(C, n)))
    for n in ("LYING_BODY_AXIS_MIN_DEG", "FALL_MIN_BBOX_H_FRAC",
              "FLOOR_ZONE_REQUIRED", "FALL_REQUIRE_LOWER_BODY"):
        if hasattr(C, n):
            print(f"        {n}={getattr(C, n)}")
    patched = hasattr(C, "LYING_BODY_AXIS_MIN_DEG")
    print(f"CORE    {'PATCHED — gates are live' if patched else 'UNPATCHED — reporting what the gates WOULD do'}")
    print("=" * 78)

    model = C.YOLO(C.POSE_MODEL_PATH)
    accepts = set(inspect.signature(C.FallStateMachine.update).parameters)

    machines, smooth, rows, alerts = {}, {}, [], []
    blocked = {"furniture": 0, "seated": 0, "bend": 0, "floor": 0,
               "lower_body": 0, "size": 0}
    seen_frames = 0
    idx = -1

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        if a.every > 1 and idx % a.every:
            continue
        if a.max_frames and seen_frames >= a.max_frames:
            break
        seen_frames += 1
        now = idx / fps

        frame = cv2.resize(frame, (C.INFERENCE_W, C.INFERENCE_H))
        res = model.track(frame, conf=C.DET_CONF, iou=0.5, persist=True,
                          tracker=C.TRACKER_CFG, verbose=False)

        for r in res:
            if r.boxes is None or r.keypoints is None or r.boxes.id is None:
                continue
            ids = r.boxes.id.cpu().numpy().astype(int)
            for i, box in enumerate(r.boxes):
                raw = r.keypoints.data[i].cpu().numpy()
                if int(np.sum(raw[:, 2] >= C.POSE_CONF_THRESHOLD)) < C.MIN_CONFIDENT_KPTS:
                    continue
                tid = int(ids[i])
                kp = C.smooth_keypoints(smooth, tid, raw)
                x1, y1, x2, y2 = map(float, box.xyxy[0].cpu().numpy())
                bh = y2 - y1

                has = C.pose_has_required_keypoints(kp)
                ang_raw = C.get_torso_angle(kp) if has else 0.0
                ang = (math.degrees(math.atan2(k * math.sin(math.radians(ang_raw)),
                                               math.cos(math.radians(ang_raw))))
                       if k != 1.0 else ang_raw)
                asp = C.get_body_aspect_ratio((x1, y1, x2, y2)) / k
                ax = axis_angle(kp if has else None, k)
                low = lower_ok(kp if has else None)
                sup = C.support_point(kp if has else None, (x1, y1, x2, y2))
                furn = C.furniture_zone_at(cam, sup)
                flr = on_floor(cam, sup)
                ext = C.body_extent_ratio(kp if has else None, bh)
                post = C.get_posture_ratios(kp) if has else (None, None)
                seated, seated_deep = (C.looks_seated(kp, ang) if has else (False, False))

                bend = False
                if hasattr(C, "standing_bend") and has:
                    try:
                        bend = C.standing_bend(kp, k)
                    except TypeError:
                        bend = C.standing_bend(kp)

                # which gate decides, in the order the core applies them
                why = None
                if furn:
                    why = f"on {furn}"; blocked["furniture"] += 1
                elif seated:
                    why = "seated"; blocked["seated"] += 1
                elif bend and ang > C.FALL_ANGLE_THRESHOLD:
                    why = "standing bend"; blocked["bend"] += 1
                elif not flr:
                    why = "off floor"; blocked["floor"] += 1
                elif not low:
                    why = "lower body hidden"; blocked["lower_body"] += 1
                elif bh < getattr(C, "FALL_MIN_BBOX_H_FRAC", 0.15) * C.INFERENCE_H:
                    why = f"{int(bh)}px too small"; blocked["size"] += 1

                sm = machines.get(tid)
                if sm is None:
                    sm = machines[tid] = C.FallStateMachine()
                kwargs = dict(bbox_h=bh, posture=post, seated=seated,
                              seated_deep=seated_deep, furniture=furn,
                              center_y=(y1 + y2) / 2.0, extent_ratio=ext)
                if "on_floor" in accepts:
                    kwargs.update(on_floor=flr, lower_body=low, axis_angle=ax)
                state, alert = sm.update(ang, asp, has, now, **kwargs)
                if alert:
                    alerts.append((now, tid, alert))

                rows.append(dict(
                    t=round(now, 2), frame=idx, track=tid, state=state,
                    torso_deg=None if not has else round(ang, 1),
                    axis_deg=None if ax is None else round(ax, 1),
                    aspect=round(asp, 2), bbox_h=int(bh),
                    bbox_h_frac=round(bh / C.INFERENCE_H, 3),
                    extent=None if ext is None else round(ext, 2),
                    elevation=None if post[0] is None else round(post[0], 2),
                    compact=None if post[1] is None else round(post[1], 2),
                    lower_body=int(low), on_floor=int(flr),
                    furniture=furn or "", seated=int(seated),
                    blocked_by=why or "", alert=alert or ""))

    cap.release()

    if not rows:
        print("\nNo person was detected in this clip at all.")
        print("That is itself the finding — check DET_CONF and MIN_CONFIDENT_KPTS.")
        return 0

    print(f"\nMeasured {seen_frames} frames, {len(rows)} person-detections, "
          f"{len(machines)} track id(s)\n")

    print("DISTRIBUTION  (per person-detection)")
    print("  measure          p05     p25    median    p75     p95")
    for label, key in (("torso angle deg", "torso_deg"),
                       ("BODY AXIS deg",   "axis_deg"),
                       ("bbox aspect h/w", "aspect"),
                       ("bbox h / frame",  "bbox_h_frac"),
                       ("body extent",     "extent"),
                       ("elevation",       "elevation"),
                       ("compactness",     "compact")):
        v = [r[key] for r in rows]
        nd = 2 if key in ("aspect", "bbox_h_frac", "extent", "elevation", "compact") else 1
        print(f"  {label:15} " + " ".join(fmt(pct(v, q), nd)
                                          for q in (5, 25, 50, 75, 95)))

    n = len(rows)
    print("\nGATE ACCOUNTING  (first gate that would stop a NEW fall)")
    for key, label in (("furniture", "on a furniture zone"),
                       ("seated",    "seated guard"),
                       ("bend",      "standing bend - bent over, still on their feet"),
                       ("floor",     "support point off the floor polygon"),
                       ("lower_body","hips/knees not visible"),
                       ("size",      "body too small to measure")):
        c = blocked[key]
        print(f"  {c:6d}  {100.0*c/n:5.1f}%   {label}")
    passed = n - sum(blocked.values())
    print(f"  {passed:6d}  {100.0*passed/n:5.1f}%   reached the fall classifier")

    print(f"\nALERTS THIS CLIP WOULD PRODUCE: {len(alerts)}")
    for t, tid, msg in alerts[:40]:
        print(f"  t+{t:6.1f}s  [ID {tid}]  {msg}")
    if len(alerts) > 40:
        print(f"  ... and {len(alerts) - 40} more")

    print("\nHOW TO READ THIS")
    print("  Run it on a clip you know is a FALSE alarm and one you know is REAL.")
    print("  A threshold is right when it sits between the two distributions —")
    print("  e.g. if a false clip's BODY AXIS p95 is 30 and a real fall's p05 is")
    print("  65, then LYING_BODY_AXIS_MIN_DEG anywhere in 35..60 separates them.")
    print("  If a gate blocks ~100% of a REAL fall clip, it is too tight: loosen")
    print("  that one env var and re-run. Nothing here changes the running service.")

    if a.csv:
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csvmod.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nPer-frame measurements written to {a.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
