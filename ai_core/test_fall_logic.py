"""Synthetic-skeleton regression tests for the fall / lying-down pipeline.

No video, no model — poses are built from COCO-17 coordinates so each test
states exactly which geometry it is asserting on.
"""
import json, math, os, sys
import numpy as np

import load_core

L_SH, R_SH = 5, 6
L_HIP, R_HIP = 11, 12
L_KN, R_KN = 13, 14
L_AN, R_AN = 15, 16

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"   [{detail}]" if detail else ""))


def kpts(mapping, conf=0.9):
    """Build a (17,3) array; unlisted joints get confidence 0."""
    a = np.zeros((17, 3), dtype=np.float32)
    for idx, (x, y) in mapping.items():
        a[idx] = (x, y, conf)
    return a


def seated(with_ankles=True, torso_lean_deg=0.0):
    """Side-on seated pose: torso up, thighs forward, shins down."""
    th = math.radians(torso_lean_deg)
    hx, hy = 200.0, 260.0
    sx, sy = hx - 100 * math.sin(th), hy - 100 * math.cos(th)
    m = {
        L_SH: (sx - 5, sy), R_SH: (sx + 5, sy),
        L_HIP: (hx - 5, hy), R_HIP: (hx + 5, hy),
        L_KN: (hx + 65, hy + 8), R_KN: (hx + 75, hy + 8),
    }
    if with_ankles:
        m[L_AN] = (hx + 70, hy + 70)
        m[R_AN] = (hx + 80, hy + 70)
    return kpts(m)


def lying_flat():
    """Body flat on the floor, across the view, legs extended."""
    return kpts({
        L_SH: (100, 300), R_SH: (100, 312),
        L_HIP: (170, 300), R_HIP: (170, 312),
        L_KN: (240, 303), R_KN: (240, 309),
        L_AN: (300, 304), R_AN: (300, 308),
    })


def torso_at(angle_deg, cx=200.0, cy=200.0):
    """Straight body rotated `angle_deg` from vertical — no knee/hip fold."""
    t = math.radians(angle_deg)
    sx, sy = cx, cy
    seg = 60.0

    def along(n):
        return (sx + n * seg * math.sin(t), sy + n * seg * math.cos(t))

    hx, hy = along(1)
    kx, ky = along(2)
    ax, ay = along(3)
    return kpts({
        L_SH: (sx - 5, sy), R_SH: (sx + 5, sy),
        L_HIP: (hx - 5, hy), R_HIP: (hx + 5, hy),
        L_KN: (kx - 5, ky), R_KN: (kx + 5, ky),
        L_AN: (ax - 5, ay), R_AN: (ax + 5, ay),
    })


T0 = 100000.0   # wall-clock-like start: alert cooldowns are absolute


def run(ns):
    looks_seated = ns["looks_seated"]
    get_torso_angle = ns["get_torso_angle"]
    FallStateMachine = ns["FallStateMachine"]

    print("\n[1] Seated guard — the sofa false positive")
    s = seated()
    a = get_torso_angle(s)
    check("upright sitting, ankles visible -> seated", looks_seated(s, a)[0],
          f"torso {a:.0f}deg")

    s2 = seated(with_ankles=False)
    a2 = get_torso_angle(s2)
    check("sitting with ankles hidden (armrest) -> still seated",
          looks_seated(s2, a2)[0],
          f"hip flexion {ns['hip_flexion'](s2)[0]:.0f}deg, knees "
          f"{ns['knee_flexion'](s2)}")

    s3 = seated(with_ankles=False, torso_lean_deg=40.0)
    a3 = get_torso_angle(s3)
    check("reclined 40deg on sofa, ankles hidden -> seated",
          looks_seated(s3, a3)[0], f"torso {a3:.0f}deg")

    lf = lying_flat()
    alf = get_torso_angle(lf)
    check("lying flat on floor -> NOT seated", not looks_seated(lf, alf)[0],
          f"torso {alf:.0f}deg, hip flexion {ns['hip_flexion'](lf)[0]:.0f}deg")

    print("\n[2] State machine — sitting must never reach FALLEN")
    sm = FallStateMachine()
    t = T0
    for _ in range(6):                       # establish standing reference
        up = torso_at(0.0)
        sm.update(get_torso_angle(up), 2.2, True, t, bbox_h=200)
        t += 0.2
    states = []
    for _ in range(40):                      # then sit down (bbox collapses)
        p = seated(with_ankles=False, torso_lean_deg=35.0)
        st, al = sm.update(get_torso_angle(p), 0.9, True, t, bbox_h=120,
                           seated=looks_seated(p, get_torso_angle(p))[0],
                           seated_deep=looks_seated(p, get_torso_angle(p))[1])
        states.append((st, al))
        t += 0.2
    check("40 frames of sitting -> never FALLEN",
          all(s == "NORMAL" for s, _ in states),
          f"states seen: {sorted({s for s, _ in states})}")
    check("40 frames of sitting -> no alert",
          all(a is None for _, a in states))

    print("\n[3] State machine — a real fall must still fire")
    sm = FallStateMachine()
    t, alerts = T0, []
    for _ in range(8):
        sm.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.15
    for ang in (15, 45, 75, 88, 89, 90, 90, 90):
        p = torso_at(ang)
        st, al = sm.update(get_torso_angle(p), 0.55, True, t, bbox_h=70,
                           seated=looks_seated(p, get_torso_angle(p))[0])
        if al:
            alerts.append(al)
        t += 0.15
    check("fast collapse -> FALL DETECTED",
          any("FALL DETECTED" in a for a in alerts), f"alerts {alerts}")
    check("fast collapse -> not reported as lying down",
          not any("LYING DOWN" in a for a in alerts), f"alerts {alerts}")

    print("\n[4] State machine — slow lie-down on the floor")
    sm = FallStateMachine()
    t, alerts = T0, []
    for _ in range(8):
        sm.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.2
    for ang in list(range(0, 91, 3)):                 # ~6s descent
        p = torso_at(ang)
        st, al = sm.update(get_torso_angle(p), 0.55, True, t, bbox_h=70,
                           seated=looks_seated(p, get_torso_angle(p))[0])
        if al:
            alerts.append((round(t, 1), al))
        t += 0.2
    for _ in range(30):                                # hold on the floor
        p = torso_at(90)
        st, al = sm.update(get_torso_angle(p), 0.55, True, t, bbox_h=70)
        if al:
            alerts.append((round(t, 1), al))
        t += 0.2
    check("slow descent -> LYING DOWN DETECTED",
          any("LYING DOWN" in a for _, a in alerts), f"alerts {alerts}")
    check("slow descent -> no EMERGENCY fall",
          not any("FALL DETECTED" in a for _, a in alerts), f"alerts {alerts}")

    print("\n[5] Unwitnessed gate — a newborn track cannot fire instantly")
    sm = FallStateMachine()
    t, alerts = T0, []
    for i in range(4):                       # appears already on the floor
        st, al = sm.update(90.0, 0.55, True, t, bbox_h=70)
        if al:
            alerts.append((round(t, 1), al))
        t += 0.2
    check("track <1.5s old -> no instant UNWITNESSED emergency",
          not alerts, f"alerts {alerts}")
    for _ in range(40):
        st, al = sm.update(90.0, 0.55, True, t, bbox_h=70)
        if al:
            alerts.append((round(t, 1), al))
        t += 0.2
    check("sustained -> UNWITNESSED fall still fires as EMERGENCY",
          any("FALL DETECTED (UNWITNESSED)" in a for _, a in alerts),
          f"alerts {alerts}")

    print("\n[6] Re-association across an ID switch")
    old = FallStateMachine()
    t = T0
    for _ in range(10):
        old.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.2
    old.last_box = (100, 100, 160, 300)
    new = FallStateMachine()
    new.adopt_from(old)
    check("adopted track keeps upright history",
          not new._never_seen_upright())
    check("adopted track keeps standing-height reference",
          new._max_bbox_h == old._max_bbox_h,
          f"{new._max_bbox_h} vs {old._max_bbox_h}")
    check("adopted track keeps last_box", new.last_box == old.last_box)
    fresh = FallStateMachine()
    check("a genuinely new track still has no history",
          fresh._never_seen_upright())

    print("\n[7] IoU + camera-level duplicate suppression")
    _iou = ns["_iou"]
    check("identical boxes -> IoU 1.0", abs(_iou((0, 0, 10, 10), (0, 0, 10, 10)) - 1.0) < 1e-6)
    check("disjoint boxes -> IoU 0.0", _iou((0, 0, 10, 10), (50, 50, 60, 60)) == 0.0)
    check("None box -> IoU 0.0", _iou(None, (0, 0, 10, 10)) == 0.0)

    dup = ns["_fall_alert_is_duplicate"]
    ns["_fall_dedup"].clear()
    b = (100, 200, 180, 260)
    t0 = T0
    check("first lying alert passes", not dup("CamA", "lying_down", b, t0))
    check("same lying alert 1s later suppressed",
          dup("CamA", "lying_down", (102, 201, 182, 262), t0 + 1))
    check("escalation to fall passes",
          not dup("CamA", "fall_detected", (101, 200, 181, 261), t0 + 2))
    check("second fall in same spot suppressed",
          dup("CamA", "fall_detected", (100, 200, 180, 260), t0 + 3))
    check("fall elsewhere in the room passes",
          not dup("CamA", "fall_detected", (400, 380, 480, 440), t0 + 3))
    check("same spot after the window passes again",
          not dup("CamA", "fall_detected", b, t0 + ns["FALL_DEDUP_S"] * 2 + 5))
    check("non-fall alerts are never deduped",
          not dup("CamA", "agitation", b, t0 + 4))

    print("\n[8] The reported log sequence: one person, three track IDs")
    ns["_fall_dedup"].clear()
    sent = []
    real_send = ns["send_alert"]
    ns["sio"].connected = False
    box = (300, 250, 420, 330)
    for tid, det, lvl in ((7, "lying_down", "WARNING"),
                          (20, "fall_detected", "EMERGENCY"),
                          (19, "fall_detected", "EMERGENCY")):
        before = len(ns["_fall_dedup"].get("Test_Falls_2", []))
        d = ns["_fall_alert_is_duplicate"]("Test_Falls_2", det, box, T0 + 500.0 + tid * 0.1)
        if not d:
            sent.append((tid, det))
    check("3 alerts for one body collapse to 2 (lying, then the escalation)",
          len(sent) == 2, f"delivered {sent}")


def run_reassoc_tests(ns):
    print("\n[10] Re-association end to end — the ID 7 / 19 / 20 sequence")
    FallStateMachine = ns["FallStateMachine"]
    reassoc = ns["reassociate_tracks"]
    ns["_clip_alias"].clear()

    fall_machines, last_seen = {}, {}
    agi, movement = {}, {}
    carry = (agi, movement)

    # ID 7 walks in upright, then goes down.
    sm7 = FallStateMachine()
    t = T0
    for _ in range(10):
        sm7.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.2
    for ang in (30, 60, 85, 90):
        sm7.update(float(ang), 0.55, True, t, bbox_h=70)
        t += 0.2
    sm7.last_box = (300, 250, 420, 330)
    fall_machines[7] = sm7
    last_seen[7] = t
    agi[7] = "agi-state-7"

    # Next frame ByteTrack renames them 20, essentially the same box.
    t += 0.3
    plan = reassoc("Test_Falls_2", {20: (302, 252, 418, 332)},
                   fall_machines, last_seen, carry, t)
    check("switched ID is re-associated", plan == [(7, 20, plan[0][2])] if plan else False,
          f"plan {plan}")
    check("old ID 7 retired from fall_machines", 7 not in fall_machines)
    check("old ID 7 retired from last_seen", 7 not in last_seen)
    check("new ID 20 owns the state", 20 in fall_machines)
    check("behavioural state carried across", agi.get(20) == "agi-state-7" and 7 not in agi)
    check("new ID inherits upright history (no bogus UNWITNESSED)",
          not fall_machines[20]._never_seen_upright())
    check("clip incident key follows the person",
          ns["_canonical_clip_key"]("Test_Falls_2", 20) == ("Test_Falls_2", 7))

    # A second, genuinely different person elsewhere must NOT be absorbed.
    fall_machines[20].last_box = (302, 252, 418, 332)
    last_seen[20] = t
    t += 0.3
    plan2 = reassoc("Test_Falls_2", {20: (302, 252, 418, 332), 31: (40, 40, 110, 220)},
                    fall_machines, last_seen, carry, t)
    check("a person across the room is not absorbed", plan2 == [], f"plan {plan2}")

    # Too long a gap = genuinely new person, not a rename.
    fall_machines.pop(31, None)
    t += ns["REASSOC_MAX_GAP_S"] + 2.0
    plan3 = reassoc("Test_Falls_2", {44: (302, 252, 418, 332)},
                    fall_machines, last_seen, carry, t)
    check("gap beyond REASSOC_MAX_GAP_S is not re-associated", plan3 == [],
          f"plan {plan3}")


def run_extent_tests(ns):
    print("\n[11] Distance blindness — Path B must not fire on range alone")
    ber = ns["body_extent_ratio"]
    FallStateMachine = ns["FallStateMachine"]

    # Measured on fall3_slow.mp4: one person, no posture change, walks from
    # near the camera to the far wall. bbox 262px -> 95px, height ratio 0.36.
    sm = FallStateMachine()
    t = T0
    for _ in range(6):                       # near the camera, standing
        sm.update(0.0, 0.9, True, t, bbox_h=262, extent_ratio=3.5)
        t += 0.2
    states = set()
    for _ in range(30):                      # far away, still standing/sitting
        st, _al = sm.update(25.0, 1.40, True, t, bbox_h=95, extent_ratio=3.34)
        states.add(st)
        t += 0.2
    check("upright person at range -> never FALLEN", "FALLEN" not in states,
          f"height ratio {95/262:.2f}, aspect 1.40, extent 3.34; states {states}")

    # Same collapse in height, but the skeleton agrees the body is horizontal.
    sm2 = FallStateMachine()
    t = T0
    for _ in range(6):
        sm2.update(0.0, 2.2, True, t, bbox_h=262, extent_ratio=3.5)
        t += 0.2
    st2 = set()
    for _ in range(20):
        st, _al = sm2.update(20.0, 0.9, True, t, bbox_h=95, extent_ratio=1.5)
        st2.add(st)
        t += 0.2
    check("genuine height collapse -> still FALLEN", "FALLEN" in st2, f"states {st2}")

    # Unmeasurable torso must abstain, never suppress.
    sm3 = FallStateMachine()
    t = T0
    for _ in range(6):
        sm3.update(0.0, 2.2, True, t, bbox_h=262, extent_ratio=None)
        t += 0.2
    st3 = set()
    for _ in range(20):
        st, _al = sm3.update(20.0, 0.9, True, t, bbox_h=95, extent_ratio=None)
        st3.add(st)
        t += 0.2
    check("unmeasurable torso -> gate abstains, Path B still fires",
          "FALLEN" in st3, f"states {st3}")

    check("body_extent_ratio(None, h) -> None", ber(None, 100) is None)
    check("body_extent_ratio(kpts, 0) -> None", ber(lying_flat(), 0) is None)
    v = ber(lying_flat(), 40)
    check("lying flat measures below the gate", v is not None and v < ns["FALL_EXTENT_MAX"],
          f"bbox_h/torso_len = {v:.2f}")


def run_style_tests(ns):
    print("\n[12] Status styling — severity and colour from one table")
    st = ns["status_style"]
    pri = ns["_priority"]
    col = ns["status_color"]
    GREEN = (0, 200, 0)

    # The exact regressions seen on the Test_Falls_5 frames.
    check("'LYING DOWN (CONFIRMING)' does not rank as NORMAL",
          pri("LYING DOWN (CONFIRMING)") > pri("NORMAL"),
          f"prio {pri('LYING DOWN (CONFIRMING)')} vs NORMAL {pri('NORMAL')}")
    check("'LYING DOWN (CONFIRMING)' is not green",
          col("LYING DOWN (CONFIRMING)") != GREEN)
    check("'LYING DOWN' is not white",
          col("LYING DOWN") != (200, 200, 200))
    check("'FALL DETECTED (UNWITNESSED)' ranks as an emergency",
          pri("FALL DETECTED (UNWITNESSED)") >= pri("FALL DETECTED (HIGH CONFIDENCE)"),
          f"prio {pri('FALL DETECTED (UNWITNESSED)')}")
    check("'PROLONGED FALL (37s)' matches despite the seconds suffix",
          pri("PROLONGED FALL (37s)") == pri("PROLONGED FALL"),
          f"prio {pri('PROLONGED FALL (37s)')}")
    check("'INACTIVE - POSTURE' matches the INACTIVE family",
          pri("INACTIVE - POSTURE") == pri("INACTIVE"))

    # Longest-prefix precedence: the confirming variant must not be swallowed.
    check("confirming ranks BELOW confirmed lying down",
          pri("LYING DOWN (CONFIRMING)") < pri("LYING DOWN"))
    check("severity order holds",
          pri("NO PERSON") < pri("NORMAL") < pri("STUMBLE DETECTED")
          < pri("LYING DOWN") < pri("FALL DETECTED (HIGH CONFIDENCE)")
          < pri("PROLONGED FALL"))

    # An unregistered label must be visible, not silently NORMAL.
    check("unknown label does not collapse into NORMAL",
          pri("SOMETHING NEW") > pri("NORMAL"))

    # Every label the state machine can actually emit must be styled.
    emitted = ["NORMAL", "NO PERSON", "STUMBLE DETECTED",
               "FALL DETECTED (HIGH CONFIDENCE)", "FALL DETECTED (MEDIUM CONFIDENCE)",
               "FALL DETECTED (UNWITNESSED)", "FALL? (CONFIRMING)",
               "LYING DOWN", "LYING DOWN (CONFIRMING)", "PROLONGED FALL (12s)",
               "FALLEN (UNSEEN)", "ON SOFA", "AGITATION_RISK"]
    unstyled = [e for e in emitted if st(e) == ns["STATUS_STYLE_DEFAULT"]]
    check("every emitted label has an explicit style", not unstyled,
          f"unstyled: {unstyled}")

    # The clip label map must cover every rank the clip recorder can assign.
    missing = [k for k in ns["_CLIP_LABEL_RANK"] if k not in ns["_CLIP_LABEL_STATUS"]]
    check("clip labels all map to a status for the static band", not missing,
          f"missing: {missing}")

    print("\n[13] draw helpers actually paint")
    import numpy as _np
    frm = _np.zeros((120, 320, 3), dtype=_np.uint8)
    ns["draw_status_bar"](frm, "CamA", "INCIDENT: LYING DOWN",
                          col("LYING DOWN"), clock="12:00:00")
    check("status bar paints inside the top band", frm[:40].any())
    check("status bar leaves the image below untouched", not frm[41:].any())

    frm2 = _np.zeros((400, 400, 3), dtype=_np.uint8)
    ns["draw_pose_overlay"](frm2, lying_flat(), color=(0, 0, 255))
    painted = {tuple(int(v) for v in p) for p in frm2.reshape(-1, 3) if p.any()}
    check("skeleton uses the status colour, not the old cyan/yellow",
          (0, 0, 255) in painted and (255, 255, 0) not in painted
          and (0, 255, 255) not in painted,
          f"{len(painted)} distinct colours drawn")


def run_zone_tests():
    print("\n[9] Furniture zones")
    zpath = "/tmp/work/zones_test.json"
    with open(zpath, "w") as fh:
        json.dump({"Test_Falls_2": [{"name": "sofa", "rect": [0.45, 0.50, 0.80, 0.85]}]}, fh)
    os.environ["FURNITURE_ZONES_FILE"] = zpath
    ns = load_core.load()
    check("zone file parsed", "Test_Falls_2" in ns["_FURNITURE_ZONES"])
    inside = (0.6 * ns["INFERENCE_W"], 0.7 * ns["INFERENCE_H"])
    outside = (0.1 * ns["INFERENCE_W"], 0.2 * ns["INFERENCE_H"])
    check("hip inside sofa -> zone named",
          ns["furniture_zone_at"]("Test_Falls_2", inside) == "sofa")
    check("hip on open floor -> no zone",
          ns["furniture_zone_at"]("Test_Falls_2", outside) is None)
    check("other camera unaffected",
          ns["furniture_zone_at"]("Some_Other_Cam", inside) is None)

    FallStateMachine = ns["FallStateMachine"]
    sm = FallStateMachine()
    t = T0
    for _ in range(6):
        sm.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.2
    alerts, states = [], set()
    for ang in list(range(0, 91, 3)) + [90] * 40:
        st, al = sm.update(float(ang), 0.55, True, t, bbox_h=70, furniture="sofa")
        states.add(st)
        if al:
            alerts.append(al)
        t += 0.2
    check("lying ON the sofa -> never FALLEN (FURNITURE_MODE=all)",
          "FALLEN" not in states, f"states {states}")
    check("lying ON the sofa -> no alert", not alerts, f"alerts {alerts}")

    sm2 = FallStateMachine()
    t = T0
    for _ in range(6):
        sm2.update(0.0, 2.2, True, t, bbox_h=200)
        t += 0.2
    alerts2 = []
    for ang in list(range(0, 91, 3)) + [90] * 40:
        st, al = sm2.update(float(ang), 0.55, True, t, bbox_h=70, furniture=None)
        if al:
            alerts2.append(al)
        t += 0.2
    check("same descent on the FLOOR -> still alerts",
          any("LYING DOWN" in a for a in alerts2), f"alerts {alerts2}")
    os.environ.pop("FURNITURE_ZONES_FILE", None)


if __name__ == "__main__":
    ns = load_core.load()
    run(ns)
    run_reassoc_tests(ns)
    run_extent_tests(ns)
    run_style_tests(ns)
    run_zone_tests()
    print(f"\n=== {len(PASS)} passed, {len(FAIL)} failed ===")
    if FAIL:
        for f in FAIL:
            print("   FAILED:", f)
        sys.exit(1)
