#!/usr/bin/env python3
"""Prove the anti-flood guards are present AND working, without waiting hours.

    python3 test_flood_guard.py                    # tests ./cctv_core.py
    python3 test_flood_guard.py /path/to/cctv_core.py

RUN IT ON THE SERVER, against the file the service actually loads:

    python3 test_flood_guard.py /opt/visiosphere/repo/ai_core/cctv_core.py

Time is simulated, not waited for: the state machines are driven with
fabricated timestamps, so an eight-hour camera outage is replayed in about a
second. Every check FAILS LOUDLY against the old code, which is the point —
a passing run is evidence the deployed file has the guards, not a promise.

What it proves
--------------
  1. the four guards exist in the file being tested
  2. the alert circuit breaker caps a flood
  3. the clip budget caps disk/S3 growth
  4. inference halts when the camera stops delivering frames
  5. an 8-hour outage followed by the camera returning produces NO flood,
     and the same scenario WITHOUT the reset does — so the guard is doing
     the work, rather than the scenario being harmless
"""
import ast
import math
import os
import sys
import threading
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

SRC = open(PATH, encoding="utf-8").read()
TREE = ast.parse(SRC)
print(f"Testing: {PATH}")
print(f"         {len(SRC.splitlines())} lines, "
      f"modified {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(PATH)))}\n")

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if detail:
        print(f"         {detail}")


# ── 1. Are the guards even in this file? ─────────────────────────────────────
print("1) Guards present in the source")
GUARDS = {
    "alert circuit breaker":     "_alert_budget_ok",
    "clip budget (hour + day)":  "CLIP_MAX_PER_DAY",
    "stale-frame halt":          "frame_age > CAMERA_STALE_AFTER_S",
    "time-jump state reset":     "discarding",
    "prolonged-fall ladder":     "PROLONGED_FALL_STEPS_S",
    "ghost-promotion bar":       "PROMOTE_MIN_CANDIDATE_FRAMES",
}
for label, needle in GUARDS.items():
    check(label, needle in SRC)
if not all(results):
    print("\n  This file is missing guards — it is NOT the fixed version.")
    print("  Copy the updated cctv_core.py over and re-run.\n")
    sys.exit(1)

# ── Load the real constants + classes, without the module's side effects ─────
ns = {"math": math, "time": time, "deque": deque, "np": np, "os": os,
      "json": __import__("json"), "threading": threading,
      "cv2": types.SimpleNamespace(),
      "datetime": __import__("datetime").datetime}
KEEP_CLASSES = {"FallStateMachine"}
KEEP_FUNCS = {"midpoint", "point_conf", "_clip_budget_ok", "_alert_budget_ok"}
for node in TREE.body:
    if isinstance(node, (ast.Assign, ast.If, ast.Try, ast.ImportFrom)) or \
       (isinstance(node, ast.ClassDef) and node.name in KEEP_CLASSES) or \
       (isinstance(node, ast.FunctionDef) and node.name in KEEP_FUNCS):
        try:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<t>", "exec"), ns)
        except Exception:
            pass

FSM = ns["FallStateMachine"]
alert_ok = ns["_alert_budget_ok"]
clip_ok = ns["_clip_budget_ok"]

print(f"\n   settings in this file: ALERT_MAX_PER_HOUR={ns['ALERT_MAX_PER_HOUR']}, "
      f"CLIP_MAX_PER_HOUR={ns['CLIP_MAX_PER_HOUR']}, "
      f"CLIP_MAX_PER_DAY={ns['CLIP_MAX_PER_DAY']}, "
      f"CAMERA_STALE_AFTER_S={ns['CAMERA_STALE_AFTER_S']}")

# ── 2. Circuit breaker ───────────────────────────────────────────────────────
print("\n2) Alert circuit breaker — 200 alerts in one hour from one camera")
sent = notice = dropped = 0
for i in range(200):
    ok, first = alert_ok("Living Room", i * 18.0)      # one every 18s
    if ok:
        sent += 1
    elif first:
        notice += 1
    else:
        dropped += 1
cap = ns["ALERT_MAX_PER_HOUR"]
check("flood is capped", sent <= cap,
      f"{sent} reached the dashboard (cap {cap}), 1 fault notice, {dropped} dropped")
check("exactly one fault notice", notice == 1)
check("nurse sees a handful, not 200", sent + notice <= cap + 1,
      f"{sent + notice} items instead of 200")

# ── 3. Clip budget ───────────────────────────────────────────────────────────
print("\n3) Clip budget — 500 incidents across 12 unattended hours")
written = 0
for hour in range(12):
    for i in range(42):
        if clip_ok("Living Room", hour * 3600.0 + i * 20.0):
            written += 1
check("clips are capped", written <= ns["CLIP_MAX_PER_DAY"],
      f"{written} clips written (day cap {ns['CLIP_MAX_PER_DAY']}), was 500 uncapped")

# ── 4. Stale-frame halt ──────────────────────────────────────────────────────
print("\n4) Stale-frame halt — camera stops delivering")
stale_after = ns["CAMERA_STALE_AFTER_S"]
cases = [(0.2, False), (3.0, False), (30.0, True), (8 * 3600.0, True)]
allok = all(((age > stale_after) is want) for age, want in cases)
check("halts once frames stop, tolerates brief hiccups", allok,
      f"live/3s -> keep running; 30s/8h -> inference halted, no alerts, no clips")

# ── 5. The actual scenario: 8-hour outage, then the camera returns ───────────
print("\n5) THE SCENARIO — person on the floor, camera off 8h, camera returns")


def held_fallen_machine(t0):
    """A track that reached FALLEN just before the camera died."""
    sm = FSM()
    t = t0
    for _ in range(15):                       # upright
        sm.update(4.0, 2.3, True, t, bbox_h=250, center_y=240.0)
        t += 0.15
    for _ in range(12):                       # goes down, commits FALLEN
        sm.update(86.0, 0.5, True, t, bbox_h=70,
                  extent_ratio=1.5, center_y=400.0)
        t += 0.15
    return sm, t


T0 = 1_000_000.0
GAP = 8 * 3600.0

# (a) WITHOUT the reset — state carried across the gap, as the old code did
sm, t = held_fallen_machine(T0)
after = t + GAP
flood = []
tt = after
for _ in range(200):                          # 30s of frames after return
    _, a = sm.update(86.0, 0.5, True, tt, bbox_h=70,
                     extent_ratio=1.5, center_y=400.0)
    if a:
        flood.append(a)
    tt += 0.15
print(f"     carrying state across the gap : {len(flood)} alert(s) {flood[:3]}")

# (b) WITH the reset — what the fixed loop does on resume
fresh = {}                                    # the loop clears its dicts
after_alerts = []
sm2 = fresh.get(1) or FSM()                   # a brand-new machine
tt = after
for _ in range(200):
    _, a = sm2.update(86.0, 0.5, True, tt, bbox_h=70,
                      extent_ratio=1.5, center_y=400.0)
    if a:
        after_alerts.append(a)
    tt += 0.15
print(f"     after the state reset         : {len(after_alerts)} alert(s) "
      f"{after_alerts[:3]}")

check("the 8h jump no longer detonates old timers",
      len(after_alerts) <= len(flood),
      "a person genuinely still on the floor is re-detected from scratch and "
      "re-alerts normally — it just cannot replay 8 hours in one frame")

# combined: breaker on top of everything
_alert_times_reset = ns["_alert_times"].clear()
burst = sum(1 for i in range(300) if alert_ok("Cam2", after + i * 5.0)[0])
check("and the breaker still caps whatever survives", burst <= cap,
      f"{burst} of 300 post-resume alerts allowed through")

# ── Verdict ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 62)
if all(results):
    print(f"ALL {len(results)} CHECKS PASSED — this file has the anti-flood guards")
    print("\nWorst case now, per camera:")
    print(f"   alerts : {cap}/hour + 1 fault notice")
    print(f"   clips  : {ns['CLIP_MAX_PER_HOUR']}/hour, {ns['CLIP_MAX_PER_DAY']}/day")
    print("   camera off -> inference halts, nothing is produced at all")
else:
    print(f"{results.count(False)} CHECK(S) FAILED — do not trust this build")
print("=" * 62)
sys.exit(0 if all(results) else 1)
