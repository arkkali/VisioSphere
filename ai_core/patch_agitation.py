#!/usr/bin/env python3
"""Stop AGITATION firing on residents eating, and make the overlay show it.

    /opt/visiosphere/venv/bin/python patch_agitation.py cctv_core.py

Run it in /opt/visiosphere/repo/ai_core on the AI box.

THE FIX — one line of maths
---------------------------
BodyAgitationScorer counts a wrist as "near head" when it is above the
SHOULDER midpoint:

    if wy < shoulder_mid_y and abs(wx - head_x) < shoulder_width * 1.0:

Your mouth is above your shoulders. So eating, drinking, wiping your mouth,
holding a cup — every one of them puts a wrist above that line and within a
shoulder-width of the nose. Two hands up near the face scores 0.70 in a single
frame against AGITATION_THRESHOLD = 0.25, and once it holds for
BEHAVIOR_MIN_SUSTAINED_S the alert fires. That is the entire reason one seated
resident at the dining table produced AGITATION at 10:05, 10:15, 10:21 and
10:34.

Distress puts the wrist on the scalp or temple — at or ABOVE the nose.
Eating puts it at the mouth or chin — BELOW the nose. Measuring from the nose
instead of the shoulder line separates the two, and because the margin is
expressed in shoulder-widths it scales with distance from the camera, so it
works the same on the resident at the near table and one across the room.

    AGITATION_WRIST_ABOVE_NOSE   0.00 = wrist must be strictly above the nose
                                 raise toward 0.25 if eating still leaks
                                 through; it is an env var, no code edit

AND THE OVERLAY
---------------
The clips never changed colour for agitation because the box was coloured from
`body_alert`, which _evaluate_alert() returns on exactly ONE frame and then
resets. One frame out of hundreds. Falls colour from `fall_status`, a state
that persists — which is why they look right and agitation does not.

The same colouring now keys off the SCORE, which persists, so the box and
skeleton turn the AGITATION_RISK colour for as long as the scorer is hot,
through the pre-roll and post-roll of the saved clip.

Safety: anchored edits, refuses to write if anything does not match, backs up
first, byte-compiles before committing. Re-running is a no-op.
"""
import os
import py_compile
import shutil
import sys
import tempfile
import time

MARKER = "AGITATION_WRIST_ABOVE_NOSE"

CONST = '''
# ── Where "hand near head" starts ────────────────────────────────────────────
# The hands-on-head test used to count any wrist above the SHOULDER midpoint.
# Your mouth is above your shoulders, so eating, drinking, wiping your mouth and
# holding a cup all satisfied it — and two hands near the face scores 0.70 in a
# single frame, well past AGITATION_THRESHOLD. That is the whole story behind
# the repeated AGITATION alerts on one resident at the dining table.
#
# Distress puts the wrist on the scalp or temple — at or ABOVE the nose. Eating
# puts it at the mouth or chin — BELOW the nose. Measured from the nose instead,
# in shoulder-widths so it scales with distance from the camera.
#
# 0.00 = the wrist must be strictly above the nose. Raise toward 0.25 if eating
# still leaks through. Negative values loosen it back toward the old behaviour.
AGITATION_WRIST_ABOVE_NOSE = float(os.getenv("AGITATION_WRIST_ABOVE_NOSE", "0.0"))
'''

OLD_TEST = "                if wy < shoulder_mid_y and abs(wx - head_x) < shoulder_width * 1.0:"
NEW_TEST = '''                # Measured from the NOSE, not the shoulder line. A wrist at
                # mouth or chin level is someone eating; a wrist above the nose
                # is a hand on the scalp or temple. See
                # AGITATION_WRIST_ABOVE_NOSE for the margin and how to tune it.
                _head_bar = nose_y - AGITATION_WRIST_ABOVE_NOSE * shoulder_width
                if wy < _head_bar and abs(wx - head_x) < shoulder_width * 1.0:'''

OVERLAY = '''                # Colour the box and skeleton while the SCORE is high, not
                # only on the one frame the alert fires. _evaluate_alert()
                # returns "AGITATION_RISK" once and then resets its timer, so
                # the block below set track_status for a single frame out of
                # hundreds — which is why agitation clips never changed colour
                # the way falls do. fall_status is a persisting state; the
                # agitation score is the equivalent here.
                if (body_agi_score > AGITATION_THRESHOLD
                        and _priority("AGITATION_RISK") > _priority(track_status)):
                    track_status = "AGITATION_RISK"

'''
OVERLAY_ANCHOR = "                if body_alert:"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "cctv_core.py"
    if not os.path.isfile(path):
        sys.exit(f"no such file: {path}\n"
                 "run this in /opt/visiosphere/repo/ai_core")
    src = open(path, encoding="utf-8").read()
    print(f"Patching: {path}  ({len(src.splitlines())} lines)\n")

    if MARKER in src:
        print("  Already patched. Nothing to do.")
        return 0

    for needle, label in ((OLD_TEST, "hands-on-head wrist test"),
                          (OVERLAY_ANCHOR, "body_alert branch"),
                          ("AGITATION_MOTION_GATE_S  = 2.5", "AGITATION_MOTION_GATE_S")):
        n = src.count(needle)
        if n != 1:
            print(f"  REFUSED: anchor {label!r} found {n} times, expected 1.")
            print("  Nothing was written. Send me this file and I will re-anchor it.")
            return 2

    out = src.replace("AGITATION_MOTION_GATE_S  = 2.5",
                      "AGITATION_MOTION_GATE_S  = 2.5\n" + CONST, 1)
    print("  [ok] AGITATION_WRIST_ABOVE_NOSE added")
    out = out.replace(OLD_TEST, NEW_TEST, 1)
    print("  [ok] hands-on-head now measured from the nose, not the shoulders")
    out = out.replace(OVERLAY_ANCHOR, OVERLAY + OVERLAY_ANCHOR, 1)
    print("  [ok] box + skeleton colour follow the agitation score")

    tmp = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False,
                                      encoding="utf-8")
    tmp.write(out)
    tmp.close()
    try:
        py_compile.compile(tmp.name, doraise=True)
    except py_compile.PyCompileError as e:
        print(f"\n  REFUSED: result does not compile:\n{e}")
        os.unlink(tmp.name)
        return 3
    os.unlink(tmp.name)

    backup = f"{path}.bak-agi-{time.strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(path, backup)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"\n  Backup : {backup}")
    print(f"  Written: {path}  ({len(out.splitlines())} lines)")
    print("\n  systemctl restart visiosphere-ai")
    print("\n  If eating still leaks through, raise the bar without editing code:")
    print("    echo 'AGITATION_WRIST_ABOVE_NOSE=0.20' >> .env && systemctl restart visiosphere-ai")
    return 0


if __name__ == "__main__":
    sys.exit(main())
