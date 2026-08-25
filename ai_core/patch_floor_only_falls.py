#!/usr/bin/env python3
"""FALL / LYING DOWN only when the person is really on the floor — with correct geometry.

    python3 patch_floor_only_falls.py /opt/visiosphere/repo/ai_core/cctv_core.py

RUN IT ON THE AI BOX, against the file the service actually loads.

What it changes, and why
------------------------
Your file already handles bending well: standing_bend() measures the hip-to-ankle
drop in torso lengths and gates Path A with it, and its docstring is right that
this must NOT be made a global override — a body lying with its feet toward the
camera measures 1.59 on the same scale and would be silenced. That guard is left
exactly as it is. What is missing sits either side of it:

  1. FLOOR ZONE (allowlist)   The furniture zones are a DENYLIST — every square
                              metre nobody drew a polygon on counts as floor, so
                              a resident seated in the gap between two zones is
                              judged on geometry alone. Draw one polygon named
                              "floor" and FALLEN may only be declared inside it.
                              Fails OPEN: a camera with no floor polygon behaves
                              exactly as it does today.

  2. LOWER BODY VISIBLE       standing_bend() abstains when it cannot see hips
                              or knees — correctly, it fails open. But that is
                              precisely the case in the 25 Aug false alarms: a
                              resident half hidden behind other people. If the
                              half of the body that would be on the floor is not
                              visible, no fall may be declared from what is.

  3. MINIMUM APPARENT SIZE    On a body 50 px tall at the back of the room, 3 px
                              of keypoint jitter is a 15-20 degree swing in
                              torso angle — wider than the margin between
                              "seated" and "fallen". Below 15% of frame height
                              the geometry is not evidence of anything.

  4. PIXEL-ASPECT CORRECTION  Frames are force-resized to INFERENCE_W x
                              INFERENCE_H. When the source aspect differs, x and
                              y are scaled by DIFFERENT factors and every angle
                              and ratio measured afterwards is wrong. A 16:9
                              camera squeezed into 720x480 reads a true 45
                              degree torso as 40. Thresholds tuned on the 3:2
                              test videos therefore do not mean the same thing
                              on the live camera. k = (source aspect) /
                              (inference aspect); multiply x-differences by it
                              and the geometry is true again. k == 1 for a
                              matching source, so this is a no-op where there is
                              nothing to correct. It is applied to the torso
                              angle, the bbox aspect and standing_bend()'s own
                              torso length.

It also makes LYING_CONFIRM_SECONDS configurable and raises the default from 3 s
to 10 s. Three seconds is shorter than picking something up off the floor. Fast
falls bypass that timer entirely, so no emergency is slowed down.

Gates 1-3 only ever PREVENT a new fall; none can undo a fall already
established, because clearing that state mid-confirmation restarts the timer and
the real alert never completes.

Safety
------
Every edit is anchored to a distinctive line. If any anchor is missing or
ambiguous the script writes NOTHING and names the anchor. A timestamped backup
is written before any change and the result is byte-compiled before success is
reported. Re-running is a no-op.

After patching
--------------
    python3 test_floor_gate.py <same path>          # must be all green
    python3 measure_clip.py --clip <a known false alarm> --camera "Living Room"
    systemctl restart visiosphere-ai

Rollback:  cp cctv_core.py.bak-<timestamp> cctv_core.py && systemctl restart visiosphere-ai
"""
import os
import py_compile
import re
import shutil
import sys
import tempfile
import time

MARKER = "FLOOR_ZONE_REQUIRED"

USAGE = """
Nothing was patched — I need to be told which file to patch.

    python3 patch_floor_only_falls.py <path to the cctv_core.py the SERVICE loads>

e.g. on the AI box:

    python3 patch_floor_only_falls.py /opt/visiosphere/repo/ai_core/cctv_core.py

This must run ON THE AI BOX (the Linux machine the systemd service runs on),
against the file that service actually loads — not on your Windows checkout.
Patching a copy on your laptop changes nothing that is running.
"""

CONSTANTS = '''
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
'''

HELPERS = '''
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

'''

GATE_BLOCK = '''        # ── Positive-evidence gates for a NEW fall ───────────────────────
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

'''

DWELL = '''# 10s, not 3s. Three seconds is shorter than picking something up off the floor,
# shorter than tying a shoe, shorter than wiping a spill — and a bend that
# outlasts the window gets relabelled LYING DOWN. standing_bend() catches most
# of those now, but it fails open whenever the legs are not visible, and this is
# the cheap second line behind it. A resident who has genuinely gone down stays
# down far longer than this, and a FAST fall skips the timer completely (see
# _evaluate_alert), so nothing about an emergency is slowed by raising it.
LYING_CONFIRM_SECONDS    = float(os.getenv("LYING_CONFIRM_SECONDS", "10.0"))'''


class Refuse(Exception):
    pass


def one(src, needle, label):
    n = src.count(needle)
    if n != 1:
        raise Refuse(f"anchor {label!r} found {n} times (expected exactly 1)\n"
                     f"          looked for: {needle.strip()[:90]}")
    return needle


def main():
    if len(sys.argv) < 2:
        default = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "cctv_core.py")
        if not os.path.isfile(default) or os.path.getsize(default) == 0:
            sys.exit(USAGE)
        path = default
        print(f"No path given — defaulting to {path}\n")
    else:
        path = sys.argv[1]
    if not os.path.isfile(path):
        sys.exit(f"\nno such file: {path}\n{USAGE}")
    if os.path.getsize(path) == 0:
        sys.exit(f"\n{path} is 0 BYTES — the file is empty.\n"
                 "Nothing was patched. Either you are on the wrong machine, or\n"
                 "this copy was truncated. Restore it before doing anything else.\n")

    src = open(path, encoding="utf-8").read()
    print(f"Patching: {path}")
    print(f"          {len(src.splitlines())} lines, modified "
          f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(path)))}\n")

    if MARKER in src:
        print("  Already patched. Nothing to do.")
        return 0
    if "standing_bend" not in src:
        print("  NOTE: this file has no standing_bend() guard — it is older than\n"
              "        the one this patch was written against. Patching anyway,\n"
              "        but bending will not be handled. Check you are on the AI box.\n")

    out = src
    try:
        # 1) constants, right after the furniture-mode switch
        if len(re.findall(r"^FURNITURE_MODE\s*=", out, re.M)) != 1:
            raise Refuse("'FURNITURE_MODE = ...' not found exactly once")
        m = re.search(r"^FURNITURE_MODE\s*=.*$", out, re.M)
        out = out[:m.end()] + "\n" + CONSTANTS + out[m.end():]
        print("  [ok] constants inserted after FURNITURE_MODE")

        # 2) lying-confirm dwell becomes configurable, default 3s -> 10s
        dwell = one(out, "LYING_CONFIRM_SECONDS    = 3.0", "LYING_CONFIRM_SECONDS")
        out = out.replace(dwell, DWELL, 1)
        print("  [ok] LYING_CONFIRM_SECONDS is now env-driven, default 10s")

        # 3) furniture_zone_at() must not treat the floor polygon as furniture
        fz = out.index("def furniture_zone_at(cam_id, point):")
        seg_end = out.index("\ndef ", fz + 10)
        seg = out[fz:seg_end]
        loop = re.search(r"^(\s*)for z in _FURNITURE_ZONES\.get\(cam_id, \(\)\):$",
                         seg, re.M)
        if not loop:
            raise Refuse("zone loop inside furniture_zone_at() not found")
        ind = loop.group(1)
        seg = (seg[:loop.end()]
               + f"\n{ind}    # A 'floor' polygon is an allowlist, not a seat — it must never"
               + f"\n{ind}    # exonerate anybody as 'on furniture'."
               + f"\n{ind}    if _is_floor_zone(z[\"name\"]):"
               + f"\n{ind}        continue"
               + seg[loop.end():])
        out = out[:fz] + seg + out[seg_end:]
        print("  [ok] furniture_zone_at() now skips floor polygons")

        # 4) helper functions, just before support_point()
        anchor = one(out, "def support_point(kpts, box):", "def support_point")
        out = out.replace(anchor, HELPERS.lstrip("\n") + "\n" + anchor, 1)
        print("  [ok] in_floor_zone() / lower_body_visible() / pixel_k() added")

        # 5) FallStateMachine.update() — extra keyword arguments
        mdef = one(out,
                   "    def update(self, angle, aspect_ratio, has_kpts, now, bbox_h=0,",
                   "update() definition")
        i = out.index(mdef)
        j = out.index("):", i)
        out = out[:j] + ",\n               on_floor=True, lower_body=True" + out[j:]
        print("  [ok] update() accepts on_floor / lower_body")

        # 6) the gates themselves, immediately before the raw classification
        cls = one(out, "        on_furniture = furniture is not None",
                  "raw classification block")
        out = out.replace(cls, GATE_BLOCK + cls, 1)
        print("  [ok] gate block inserted ahead of the FALLEN classification")

        # 7) measure the pixel-aspect correction once per camera, in capture
        rsz = one(out, "        frame = cv2.resize(frame, (INFERENCE_W, INFERENCE_H))",
                  "capture-thread resize")
        out = out.replace(
            rsz,
            "        # Measure the x/y scale mismatch this resize introduces, once.\n"
            "        # Everything downstream measures angles and ratios in these pixels.\n"
            "        if cam_id not in cam_pixel_k:\n"
            "            _sh, _sw = frame.shape[:2]\n"
            "            _k = ((_sw / max(_sh, 1)) / (INFERENCE_W / float(INFERENCE_H))\n"
            "                  if PIXEL_ASPECT_CORRECT else 1.0)\n"
            "            cam_pixel_k[cam_id] = _k\n"
            "            print(f\"[GEOM {cam_id}] source {_sw}x{_sh} -> \"\n"
            "                  f\"{INFERENCE_W}x{INFERENCE_H}, x-correction k={_k:.3f}\"\n"
            "                  + (\"  (square pixels, nothing to correct)\"\n"
            "                     if abs(_k - 1.0) < 0.02 else\n"
            "                     \"  (angles and aspect ratios were distorted by this \"\n"
            "                     \"factor - now corrected)\"))\n"
            + rsz, 1)
        print("  [ok] capture thread measures the pixel-aspect correction")

        # 8) standing_bend() measures torso length across both axes — correct it
        sb = out.index("def standing_bend(kpts")
        sb_end = out.index("\ndef ", sb + 10)
        sbseg = out[sb:sb_end]
        tl = "    torso_len = math.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1])"
        if sbseg.count(tl) != 1:
            raise Refuse("torso_len line inside standing_bend() not found exactly once")
        sbseg = sbseg.replace(
            tl,
            "    # x and y are not the same scale after the resize — see\n"
            "    # PIXEL_ASPECT_CORRECT. The drops below are pure-y and unaffected,\n"
            "    # but this length mixes both axes, so it needs the correction or\n"
            "    # the ratios shift against the thresholds measured above.\n"
            "    torso_len = math.hypot((sh_mid[0] - hip_mid[0]) * k,\n"
            "                           sh_mid[1] - hip_mid[1])", 1)
        sbseg = sbseg.replace("def standing_bend(kpts):",
                              "def standing_bend(kpts, k=1.0):", 1)
        out = out[:sb] + sbseg + out[sb_end:]
        print("  [ok] standing_bend() torso length is pixel-aspect corrected")

        # 9) call site — corrected geometry
        geo = one(out,
                  "            angle     = get_torso_angle(kpts) if has_kpts else 0.0\n"
                  "            aspect    = get_body_aspect_ratio((x1, y1, x2, y2))",
                  "torso angle / aspect call site")
        out = out.replace(
            geo,
            "            _k        = pixel_k(cam_id)\n"
            "            angle     = correct_angle(get_torso_angle(kpts), _k) if has_kpts else 0.0\n"
            "            aspect    = get_body_aspect_ratio((x1, y1, x2, y2)) / _k", 1)
        print("  [ok] torso angle and aspect ratio are pixel-aspect corrected")

        bend = one(out, "_bend = standing_bend(kpts) if has_kpts else False",
                   "standing_bend call site")
        out = out.replace(bend,
                          "_bend = standing_bend(kpts, _k) if has_kpts else False", 1)
        print("  [ok] standing_bend() call passes the correction")

        # 10) call site — the two gate signals
        call = one(out, "            _furniture = furniture_zone_at(cam_id, _support)",
                   "furniture_zone_at call site")
        out = out.replace(
            call,
            call
            + "\n            _on_floor = in_floor_zone(cam_id, _support)"
            + "\n            _lower_ok = lower_body_visible(kpts if has_kpts else None)", 1)
        print("  [ok] call site computes _on_floor / _lower_ok")

        # 11) ...and passes them in
        if len(re.findall(r"^\s*furniture=_furniture,$", out, re.M)) != 1:
            raise Refuse("'furniture=_furniture,' argument line not found exactly once")
        kw = re.search(r"^(\s*)furniture=_furniture,$", out, re.M)
        pad = kw.group(1)
        out = (out[:kw.end()]
               + f"\n{pad}on_floor=_on_floor,"
               + f"\n{pad}lower_body=_lower_ok,"
               + out[kw.end():])
        print("  [ok] update() call passes the new arguments")

    except Refuse as e:
        print(f"\n  REFUSED: {e}")
        print("  Nothing was written. This file is not the shape the patch expects —")
        print("  send it over and the patch can be re-anchored to it.\n")
        return 2

    tmp = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False,
                                      encoding="utf-8")
    tmp.write(out)
    tmp.close()
    try:
        py_compile.compile(tmp.name, doraise=True)
    except py_compile.PyCompileError as e:
        print(f"\n  REFUSED: patched file does not compile:\n{e}")
        os.unlink(tmp.name)
        return 3
    os.unlink(tmp.name)

    backup = f"{path}.bak-{time.strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(path, backup)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"\n  Backup : {backup}")
    print(f"  Written: {path}  ({len(out.splitlines())} lines)")
    print("\nNext:")
    print(f"  1. python3 test_floor_gate.py {path}")
    print("  2. draw the floor polygon (on a machine with a display) and copy")
    print("     furniture_zones.json onto this box")
    print("  3. systemctl restart visiosphere-ai")
    print("  4. journalctl -u visiosphere-ai -f | grep -E 'GEOM|gate:|ALERT'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
