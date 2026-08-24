"""
evaluate.py — VisioSphere detection evaluation script

Compares alert_log.json (from test_listener.py) against a ground-truth JSON
file to compute precision, recall, and F1 for each detection category.

Usage:
    python evaluate.py --log alert_log.json --gt test_clips/falls/elderly_fall_01_gt.json

Optional:
    --offset N   Subtract N seconds from all alert timestamps to correct for
                 startup lag (default: 0). If alerts consistently fire ~2s
                 late, use --offset 2.
    --tolerance N  How many seconds of slack counts as a hit (default: 5).
                 e.g., alert at 26s for a fall at 23s = hit within 5s tolerance.

Ground-truth JSON format:
    {
      "clip": "falls/elderly_fall_01.mp4",
      "events": [
        {"type": "fall",        "start_seconds": 23, "end_seconds": 27},
        {"type": "lying_down",  "start_seconds": 27, "end_seconds": 58},
        {"type": "inactivity",  "start_seconds": 67, "end_seconds": 95}
      ]
    }

Alert types in alert_log.json map to ground-truth types as follows:
    EMERGENCY  + "FALL DETECTED"  → fall
    WARNING    + "LYING DOWN"      → lying_down
    WARNING    + "INACTIVE"        → inactivity
    WARNING    + "AGITATION"       → agitation
"""

import argparse
import json
import sys


# ── Map alert message keywords → ground-truth event type ──────────────────────
ALERT_TYPE_MAP = [
    ("FALL DETECTED",  "fall"),
    ("LYING DOWN",     "lying_down"),
    ("INACTIVE",       "inactivity"),
    ("AGITATION",      "agitation"),
]

def classify_alert(alert):
    msg = alert.get("message", "").upper()
    for keyword, gt_type in ALERT_TYPE_MAP:
        if keyword in msg:
            return gt_type
    return "unknown"


def load_log(path, offset_seconds):
    with open(path) as f:
        raw = json.load(f)
    alerts = []
    for a in raw:
        t = a.get("elapsed_seconds", 0) - offset_seconds
        alerts.append({
            "time":    max(0.0, t),
            "type":    classify_alert(a),
            "raw":     a,
        })
    return alerts


def load_gt(path):
    with open(path) as f:
        return json.load(f)


def evaluate(alerts, gt_events, tolerance):
    """
    For each ground-truth event, check if at least one alert of the matching
    type fired within [start - tolerance, end + tolerance].

    Returns per-type counts: TP, FP, FN.
    """
    # Collect all gt types
    all_types = sorted({e["type"] for e in gt_events} |
                       {a["type"] for a in alerts if a["type"] != "unknown"})

    results = {t: {"TP": 0, "FP": 0, "FN": 0, "hits": [], "misses": [], "false_alarms": []}
               for t in all_types}

    matched_alert_indices = set()

    # For each GT event, find a matching alert
    for ev in gt_events:
        t   = ev["type"]
        lo  = ev["start_seconds"] - tolerance
        hi  = ev["end_seconds"]   + tolerance

        hit = None
        for i, a in enumerate(alerts):
            if i in matched_alert_indices:
                continue
            if a["type"] == t and lo <= a["time"] <= hi:
                hit = i
                break

        if hit is not None:
            results[t]["TP"] += 1
            results[t]["hits"].append({
                "gt_window": f"{ev['start_seconds']}s – {ev['end_seconds']}s",
                "alert_at":  f"{alerts[hit]['time']:.1f}s",
                "notes":     ev.get("notes", ""),
            })
            matched_alert_indices.add(hit)
        else:
            results[t]["FN"] += 1
            results[t]["misses"].append({
                "gt_window": f"{ev['start_seconds']}s – {ev['end_seconds']}s",
                "notes":     ev.get("notes", ""),
            })

    # Any unmatched alert is a false positive
    for i, a in enumerate(alerts):
        if i not in matched_alert_indices and a["type"] in results:
            results[a["type"]]["FP"] += 1
            results[a["type"]]["false_alarms"].append({"alert_at": f"{a['time']:.1f}s"})

    return results


def print_report(results, gt_clip, tolerance, offset):
    print("\n" + "=" * 60)
    print(" VisioSphere Detection Evaluation Report")
    print("=" * 60)
    print(f" Clip         : {gt_clip}")
    print(f" Tolerance    : ±{tolerance}s")
    print(f" Clock offset : {offset}s")
    print("=" * 60)

    summary = []

    for det_type, r in sorted(results.items()):
        tp, fp, fn = r["TP"], r["FP"], r["FN"]
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0.0)
        summary.append((det_type, tp, fp, fn, precision, recall, f1))

        print(f"\n [{det_type.upper()}]")
        print(f"   TP={tp}  FP={fp}  FN={fn}")
        print(f"   Precision: {precision:.0%}   Recall: {recall:.0%}   F1: {f1:.2f}")

        if r["hits"]:
            print("   ✓ Hits:")
            for h in r["hits"]:
                print(f"     GT {h['gt_window']}  →  alert at {h['alert_at']}"
                      + (f"  [{h['notes']}]" if h["notes"] else ""))
        if r["misses"]:
            print("   ✗ Missed:")
            for m in r["misses"]:
                print(f"     GT {m['gt_window']}"
                      + (f"  [{m['notes']}]" if m["notes"] else ""))
        if r["false_alarms"]:
            print("   ! False alarms:")
            for fa in r["false_alarms"]:
                print(f"     Alert at {fa['alert_at']} (no matching GT event)")

    print("\n" + "-" * 60)
    print(f" {'TYPE':<20} {'PREC':>6}  {'RECALL':>6}  {'F1':>6}")
    print("-" * 60)
    for det_type, tp, fp, fn, prec, rec, f1 in summary:
        print(f" {det_type:<20} {prec:>6.0%}  {rec:>6.0%}  {f1:>6.2f}")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Evaluate VisioSphere detection against ground truth.")
    parser.add_argument("--log",       required=True,  help="Path to alert_log.json from test_listener.py")
    parser.add_argument("--gt",        required=True,  help="Path to ground-truth JSON file")
    parser.add_argument("--offset",    type=float, default=0.0,
                        help="Subtract N seconds from alert timestamps to correct startup lag")
    parser.add_argument("--tolerance", type=float, default=5.0,
                        help="Seconds of slack for matching an alert to a GT event (default: 5)")
    args = parser.parse_args()

    try:
        alerts   = load_log(args.log, args.offset)
        gt_data  = load_gt(args.gt)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)

    gt_events = gt_data.get("events", [])
    gt_clip   = gt_data.get("clip", args.gt)

    if not gt_events:
        print("No events found in ground-truth file.")
        sys.exit(1)

    results = evaluate(alerts, gt_events, args.tolerance)
    print_report(results, gt_clip, args.tolerance, args.offset)

    # Also save a machine-readable summary
    out_path = args.log.replace(".json", "_eval.json")
    with open(out_path, "w") as f:
        json.dump({
            "clip": gt_clip,
            "tolerance": args.tolerance,
            "offset": args.offset,
            "results": {
                k: {
                    "TP": v["TP"], "FP": v["FP"], "FN": v["FN"],
                    "precision": round(v["TP"] / (v["TP"] + v["FP"]), 3) if (v["TP"] + v["FP"]) else 0,
                    "recall":    round(v["TP"] / (v["TP"] + v["FN"]), 3) if (v["TP"] + v["FN"]) else 0,
                }
                for k, v in results.items()
            }
        }, f, indent=2)
    print(f"Saved machine-readable summary to {out_path}")


if __name__ == "__main__":
    main()
