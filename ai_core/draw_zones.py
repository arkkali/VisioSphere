#!/usr/bin/env python3
"""Click out the furniture zones that cctv_core.py uses to decide what counts
as "on the floor".

Why this exists
---------------
In an uncalibrated oblique camera view, height above the floor is not
observable. A resident reclining on a sofa and a resident lying on the carpet
in front of it project nearly the same skeleton, so no threshold on torso angle
or bounding-box shape can separate them — the information simply is not in the
image. Telling the system where the furniture is closes that gap.

Usage
-----
    python draw_zones.py --source 0                 --camera "House of Charbel"
    python draw_zones.py --source rtsp://...        --camera "House of Gabriel"
    python draw_zones.py --source clip.mp4          --camera "Test_Falls_2"
    python draw_zones.py --source still.jpg         --camera "Test_Falls_2"

Controls
--------
    left click    add a point to the current zone
    right click   undo the last point
    ENTER / c     close the current zone and name it
    n             grab a fresh frame from the source (find a clearer moment)
    u             delete the last saved zone
    s             save to the JSON file and exit
    q / ESC       quit without saving

Draw TIGHT to the seat or mattress surface. From an oblique camera the floor
immediately in front of a sofa projects close to the seat itself, and an
oversized zone will swallow a genuine fall beside the furniture.
"""
import argparse
import json
import os
import sys

import cv2

HELP_LINES = [
    "L-click: add point   R-click: undo point",
    "ENTER/c: close zone  n: new frame  u: undo zone",
    "s: save & exit       q/ESC: quit",
]


def grab_frame(source, width, height):
    if isinstance(source, str) and os.path.isfile(source) and \
            source.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
        img = cv2.imread(source)
        if img is None:
            sys.exit(f"could not read image {source}")
        return cv2.resize(img, (width, height))

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        sys.exit(f"could not open source {source}")
    frame = None
    for _ in range(10):                      # let auto-exposure settle
        ok, f = cap.read()
        if ok:
            frame = f
    cap.release()
    if frame is None:
        sys.exit(f"no frames read from {source}")
    return cv2.resize(frame, (width, height))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True,
                    help="camera index, RTSP URL, video file or still image")
    ap.add_argument("--camera", required=True,
                    help="camera id EXACTLY as cctv_core.py knows it")
    ap.add_argument("--out", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "furniture_zones.json"))
    ap.add_argument("--width", type=int,
                    default=int(os.getenv("INFERENCE_W", "640")))
    ap.add_argument("--height", type=int,
                    default=int(os.getenv("INFERENCE_H", "480")))
    ap.add_argument("--absolute", action="store_true",
                    help="write pixel coords instead of normalised 0..1 "
                         "(normalised is preferred — it survives a resolution change)")
    args = ap.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source
    frame = grab_frame(source, args.width, args.height)

    data = {}
    if os.path.isfile(args.out):
        try:
            with open(args.out, encoding="utf-8") as fh:
                data = json.load(fh) or {}
            print(f"loaded existing {args.out}")
        except Exception as err:
            print(f"warning: could not parse {args.out} ({err}) — starting fresh")
    zones = list(data.get(args.camera, []))
    print(f"camera '{args.camera}' currently has {len(zones)} zone(s)")

    current = []

    def on_mouse(event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            current.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN and current:
            current.pop()

    win = f"furniture zones — {args.camera}"
    cv2.namedWindow(win)
    cv2.setMouseCallback(win, on_mouse)

    def to_px(entry):
        if "rect" in entry:
            x1, y1, x2, y2 = entry["rect"]
            pts = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
        else:
            pts = [tuple(p) for p in entry["poly"]]
        if all(0.0 <= v <= 1.0 for p in pts for v in p):
            pts = [(x * args.width, y * args.height) for x, y in pts]
        return [(int(round(x)), int(round(y))) for x, y in pts]

    while True:
        canvas = frame.copy()
        for z in zones:
            pts = to_px(z)
            cv2.polylines(canvas, [_np_pts(pts)], True, (120, 120, 255), 2)
            cv2.putText(canvas, z.get("name", "zone"),
                        (pts[0][0] + 3, pts[0][1] + 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (120, 120, 255), 1)
        for i, p in enumerate(current):
            cv2.circle(canvas, p, 4, (0, 255, 255), -1)
            if i:
                cv2.line(canvas, current[i - 1], p, (0, 255, 255), 1)
        if len(current) > 2:
            cv2.line(canvas, current[-1], current[0], (0, 200, 200), 1)

        cv2.rectangle(canvas, (0, 0), (canvas.shape[1], 18 * len(HELP_LINES) + 8),
                      (0, 0, 0), -1)
        for i, line in enumerate(HELP_LINES):
            cv2.putText(canvas, line, (8, 16 + i * 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)

        cv2.imshow(win, canvas)
        key = cv2.waitKey(20) & 0xFF

        if key in (ord("q"), 27):
            print("quit without saving")
            break
        if key == ord("n"):
            frame = grab_frame(source, args.width, args.height)
        elif key == ord("u") and zones:
            print(f"removed zone '{zones[-1].get('name')}'")
            zones.pop()
        elif key in (13, 10, ord("c")):
            if len(current) < 3:
                print("need at least 3 points")
                continue
            cv2.destroyWindow(win)
            name = input("zone name (sofa / bed / armchair / ...): ").strip() or "zone"
            if args.absolute:
                poly = [[int(x), int(y)] for x, y in current]
            else:
                poly = [[round(x / args.width, 4), round(y / args.height, 4)]
                        for x, y in current]
            zones.append({"name": name, "poly": poly})
            current = []
            cv2.namedWindow(win)
            cv2.setMouseCallback(win, on_mouse)
            print(f"added '{name}' ({len(zones)} zone(s) total)")
        elif key == ord("s"):
            data[args.camera] = zones
            with open(args.out, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
            print(f"saved {len(zones)} zone(s) for '{args.camera}' to {args.out}")
            print("restart cctv_core.py to pick them up")
            break

    cv2.destroyAllWindows()


def _np_pts(pts):
    import numpy as np
    return np.array(pts, dtype=np.int32)


if __name__ == "__main__":
    main()
