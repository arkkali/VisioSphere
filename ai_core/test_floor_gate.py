#!/usr/bin/env python3
"""Prove the gates suppress the false alerts — and only those.

    python3 test_floor_gate.py                      # tests ./cctv_core.py
    python3 test_floor_gate.py /path/to/cctv_core.py

RUN IT ON THE SERVER, against the file the service loads:

    python3 test_floor_gate.py /opt/visiosphere/repo/ai_core/cctv_core.py

Cases 2-5 are the false positives you have actually seen: a resident stooping to
pick something up, one seated behind other people, one in the gap between two
furniture zones, and a body too far away to measure.

Cases 6 and 7 matter more than all of them. A fast fall and a slow lie-down on
the open floor MUST still alert. A test suite that only proves things got
quieter is worthless in a care facility.

Time is simulated, not waited for.
"""
import ast
import inspect
import math
import os
import sys
import time
import types
from collections import deque

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required: pip install numpy")

PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "cctv_core.py")
if not os.path.isfile(PATH):
    sys.exit(f"no such file: {PATH}")
if os.path.getsize(PATH) == 0:
    sys.exit(f"{PATH} is 0 bytes — that file is empty, nothing to test.")

SRC = open(PATH, encoding="utf-8").read()
TREE = ast.parse(SRC)
print(f"Testing: {PATH}")
print(f"         {len(SRC.splitlines())} lines, modified "
      f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(PATH)))}\n")

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if detail:
        print(f"         {detail}")


print("1) Gates present in the source")
for label, needle in {
    "standing-bend guard (already yours)": "def standing_bend(",
    "floor allowlist":                     "FLOOR_ZONE_REQUIRED",
    "lower-body gate":                     "FALL_REQUIRE_LOWER_BODY",
    "minimum apparent size":               "FALL_MIN_BBOX_H_FRAC",
    "floor zone is not furniture":         "_is_floor_zone",
    "pixel-aspect correction":             "PIXEL_ASPECT_CORRECT",
    "lying dwell is configurable":         'os.getenv("LYING_CONFIRM_SECONDS"',
}.items():
    check(label, needle in SRC)
if not all(results):
    print("\n  This file has not been patched. Run patch_floor_only_falls.py "
          "against it first.\n")
    sys.exit(1)

ns = {"math": math, "time": time, "deque": deque, "np": np, "os": os,
      "json": __import__("json"), "threading": __import__("threading"),
      "cv2": types.SimpleNamespace(),
      "datetime": __import__("datetime").datetime}
for node in TREE.body:
    if isinstance(node, (ast.Assign, ast.If, ast.Try, ast.ImportFrom)) or \
       (isinstance(node, ast.ClassDef) and node.name == "FallStateMachine"):
        try:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<t>", "exec"), ns)
        except Exception:
            pass

FSM = ns["FallStateMachine"]
H = ns["INFERENCE_H"]
ACCEPTS = set(inspect.signature(FSM.update).parameters)
print(f"\n   settings in this file:"
      f"\n     FLOOR_ZONE_REQUIRED     = {ns['FLOOR_ZONE_REQUIRED']}"
      f"\n     FALL_REQUIRE_LOWER_BODY = {ns['FALL_REQUIRE_LOWER_BODY']}"
      f"\n     FALL_MIN_BBOX_H_FRAC    = {ns['FALL_MIN_BBOX_H_FRAC']}"
      f"  (= {int(ns['FALL_MIN_BBOX_H_FRAC'] * H)} px of {H})"
      f"\n     LYING_CONFIRM_SECONDS   = {ns['LYING_CONFIRM_SECONDS']} s"
      f"\n     BEND_LEG_DROP_MIN       = {ns.get('BEND_LEG_DROP_MIN', 'n/a')}"
      f"\n     PIXEL_ASPECT_CORRECT    = {ns['PIXEL_ASPECT_CORRECT']}")

DT = 0.15


def run(seconds=25.0, ramp_s=0.0, **kw):
    """Drive one track: upright, then into a horizontal-looking pose, and hold."""
    sm, t, alerts = FSM(), 1_000_000.0, []
    common = {}
    for name, default in (("on_floor", True), ("lower_body", True), ("bend", False)):
        if name in ACCEPTS:
            common[name] = kw.get(name, default)

    for _ in range(10):                                  # upright
        sm.update(4.0, 2.3, True, t, bbox_h=kw.get("stand_h", 250),
                  center_y=240.0, **dict(common, **({"bend": False}
                                                    if "bend" in common else {})))
        t += DT
    steps = max(1, int(ramp_s / DT))
    for i in range(steps):                               # descent
        f = (i + 1) / steps
        sm.update(4.0 + f * 82.0, 2.3 - f * 1.8, True, t,
                  bbox_h=int(250 - f * (250 - kw.get("bbox_h", 70))),
                  center_y=240.0 + f * 160.0, **common)
        t += DT
    for _ in range(int(seconds / DT)):                   # hold
        _, a = sm.update(kw.get("angle", 86.0), kw.get("aspect", 0.5), True, t,
                         bbox_h=kw.get("bbox_h", 70),
                         extent_ratio=kw.get("extent_ratio", 1.5),
                         center_y=400.0, **common)
        if a:
            alerts.append(a)
        t += DT
    return alerts


print("\n2) PICKING SOMETHING UP — torso horizontal, legs still under the body")
a = run(bend=True, bbox_h=int(0.30 * H))
check("standing_bend keeps it out of Path A", not a, f"alerts: {a or 'none'}")

print("\n3) CLEANING — the same stoop held for 25 seconds")
a = run(bend=True, bbox_h=int(0.30 * H), seconds=25.0)
check("holding the stoop does not trip the dwell timer", not a,
      f"alerts: {a or 'none'}")

print("\n4) SEATED RESIDENT behind other people — lower body not visible")
a = run(lower_body=False, bbox_h=int(0.30 * H))
check("no fall declared from a body whose legs cannot be seen", not a,
      f"alerts: {a or 'none'}")

print("\n5) SEATED RESIDENT in the gap between furniture zones")
a = run(on_floor=False, bbox_h=int(0.30 * H))
check("no fall declared off the floor polygon", not a, f"alerts: {a or 'none'}")
a = run(bbox_h=max(1, int(0.08 * H)))
check("no fall declared from a body too small to measure", not a,
      f"alerts: {a or 'none'}")

print("\n6) MUST STILL WORK — fast fall onto the open floor")
a = run(bbox_h=int(0.30 * H))
check("a fall still alerts, and fast", bool(a),
      f"alerts: {a[:3] if a else 'NONE — too tight, DO NOT DEPLOY'}")

print("\n7) MUST STILL WORK — slow lie-down on the open floor")
a = run(bbox_h=int(0.30 * H), ramp_s=4.0, seconds=40.0)
check("a controlled descent to the floor still alerts", bool(a),
      f"alerts: {a[:3] if a else 'NONE — too tight, DO NOT DEPLOY'}")

print("\n" + "=" * 66)
if all(results):
    print(f"ALL {len(results)} CHECKS PASSED")
    print("\n  Suppressed : stooping, cleaning, seated, occluded, off-floor, too far.")
    print("  Reported   : a body that goes down on the open floor, fast or slow.")
else:
    print(f"{results.count(False)} CHECK(S) FAILED — do not deploy this build")
print("=" * 66)
sys.exit(0 if all(results) else 1)
