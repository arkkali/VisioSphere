#!/usr/bin/env python3
"""Repair already-recorded clips: browser-playable H.264, plus a poster frame.

WHY THIS EXISTS
---------------
Every clip written before the encoding fix went to disk as mp4v (MPEG-4 Part 2)
because the pip opencv-python wheel has no usable H.264 encoder. Chromium
cannot decode that, so those clips play as a black box in the dashboard even
though the file is intact and the whole request path works. cctv_core.py now
transcodes new clips on write; this script fixes the ones already on disk.

It does two independent jobs per clip, either of which may already be done:

  1. TRANSCODE to H.264 if the clip is in some other codec.
  2. POSTER -- write a "<clip>.jpg" thumbnail if one is missing. cctv_core.py
     now writes these at record time; clips predating that have none, so the
     dashboard grid falls back to a plain gradient for them.

Safe to run repeatedly: work already done is skipped, so a second run after a
partial run just finishes the job.

USAGE
    python3 scripts/transcode_clips.py --dry-run     # report only, change nothing
    python3 scripts/transcode_clips.py               # convert what needs it
    python3 scripts/transcode_clips.py --dir /opt/visiosphere/clips

Run it on the mini PC, where the clips and ffmpeg both live. ai_core does NOT
need to be stopped: each file is converted to a temporary sibling and swapped
in with os.replace, which is atomic on POSIX, so a clip being served at that
moment is never a half-written file.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def find_ffmpeg(name):
    path = os.getenv(f"{name.upper()}_BIN", "").strip() or shutil.which(name)
    if not path:
        sys.exit(
            f"error: {name} not found on PATH. Install it (apt install ffmpeg) "
            f"or set {name.upper()}_BIN to its full path."
        )
    return path


def codec_of(ffprobe, path):
    """Video codec name, or None if the file is unreadable/not a video."""
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)],
            capture_output=True, timeout=30,
        )
        name = out.stdout.decode("utf-8", "replace").strip()
        return name or None
    except Exception:
        return None


def transcode(ffmpeg, path):
    """Rewrite `path` as H.264/yuv420p. Returns True on success.

    The original is left untouched on any failure -- a clip in an awkward codec
    is still evidence someone may need, and losing it to a failed conversion
    would be worse than leaving it unplayable in the browser.
    """
    tmp = path.with_name(path.name + ".h264.tmp.mp4")
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(path),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-an", str(tmp),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=600)
        if result.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
            err = (result.stderr or b"").decode("utf-8", "replace").strip()[:300]
            print(f"    FAILED: {err or 'ffmpeg returned non-zero'}")
            tmp.unlink(missing_ok=True)
            return False
        os.replace(str(tmp), str(path))
        return True
    except subprocess.TimeoutExpired:
        print("    FAILED: ffmpeg timed out")
        tmp.unlink(missing_ok=True)
        return False
    except Exception as err:
        print(f"    FAILED: {err}")
        tmp.unlink(missing_ok=True)
        return False


def make_poster(ffmpeg, clip, at_seconds, width=480):
    """Write `<clip>.jpg` from a frame `at_seconds` into the clip.

    Frame choice is not arbitrary. A clip opens CLIP_PREROLL_S seconds BEFORE
    the detector fired, so grabbing frame 0 would give a grid of empty rooms.
    Seeking to the pre-roll boundary lands on the moment the event was
    detected, which is the one frame that shows what the card is about.

    Falls back to the first frame if the seek lands past the end -- a clip
    shorter than the pre-roll window is unusual but not impossible.
    """
    poster = clip.with_suffix(".jpg")
    for seek in (max(at_seconds, 0), 0):
        tmp = poster.with_name(poster.name + ".tmp.jpg")
        cmd = [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(seek), "-i", str(clip),
            "-frames:v", "1", "-vf", f"scale={width}:-2",
            "-q:v", "4", str(tmp),
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
                os.replace(str(tmp), str(poster))
                return True
            tmp.unlink(missing_ok=True)
        except Exception:
            tmp.unlink(missing_ok=True)
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=os.getenv("CLIP_DIR", "/opt/visiosphere/clips"),
                    help="clip directory (default: $CLIP_DIR or /opt/visiosphere/clips)")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would change, write nothing")
    ap.add_argument("--skip-posters", action="store_true",
                    help="only transcode; do not generate missing thumbnails")
    ap.add_argument("--poster-at", type=float,
                    default=float(os.getenv("CLIP_PREROLL_S", "5")),
                    help="seconds into the clip to grab the poster frame "
                         "(default: CLIP_PREROLL_S, i.e. the detection moment)")
    args = ap.parse_args()

    clip_dir = Path(args.dir).expanduser().resolve()
    if not clip_dir.is_dir():
        sys.exit(f"error: {clip_dir} is not a directory")

    ffmpeg = find_ffmpeg("ffmpeg")
    ffprobe = find_ffmpeg("ffprobe")

    clips = sorted(p for p in clip_dir.glob("*.mp4")
                   if p.is_file() and not p.name.endswith(".h264.tmp.mp4"))
    if not clips:
        print(f"No .mp4 files in {clip_dir}")
        return

    print(f"Scanning {len(clips)} clip(s) in {clip_dir}")
    if args.dry_run:
        print("DRY RUN -- nothing will be modified\n")

    converted = skipped = failed = unreadable = 0
    postered = posters_ok = posters_failed = 0

    for path in clips:
        codec = codec_of(ffprobe, path)
        if codec is None:
            print(f"  ?  {path.name}  (unreadable or not a video -- left alone)")
            unreadable += 1
            continue

        needs_transcode = codec != "h264"
        needs_poster = not args.skip_posters and not path.with_suffix(".jpg").exists()

        if not needs_transcode and not needs_poster:
            skipped += 1
            continue

        todo = []
        if needs_transcode:
            todo.append(codec + " -> h264")
        if needs_poster:
            todo.append("poster")
        print(f"  ->  {path.name}  [{', '.join(todo)}]")

        if args.dry_run:
            if needs_transcode:
                converted += 1
            if needs_poster:
                postered += 1
            continue

        if needs_transcode:
            if transcode(ffmpeg, path):
                print(f"      h264, {path.stat().st_size/1024:.0f} KB")
                converted += 1
            else:
                failed += 1
                # Still try the poster: an unconverted clip with a thumbnail is
                # more useful in the grid than one without.

        if needs_poster:
            if make_poster(ffmpeg, path, args.poster_at):
                print(f"      poster {path.with_suffix('.jpg').name}")
                posters_ok += 1
            else:
                print("      poster FAILED")
                posters_failed += 1

    if args.dry_run:
        print(f"\nWould convert: {converted}   Would add posters: {postered}   "
              f"Nothing to do: {skipped}   Unreadable: {unreadable}")
    else:
        print(f"\nConverted: {converted}   Posters written: {posters_ok}   "
              f"Nothing to do: {skipped}   Failed: {failed}   "
              f"Poster failures: {posters_failed}   Unreadable: {unreadable}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
