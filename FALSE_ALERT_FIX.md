# VisioSphere — why the alert log floods, and what actually fixes it

Written against the code in this repo (`ai_core/cctv_core.py.before_pacing_removal`,
`backend/config/socket.js`, `frontend/src/context/AlertContext.jsx`) and the
screenshots from 25 Aug. Line numbers refer to the `.before_pacing_removal`
copy, which is the closest complete file in the repo — the deployed
`ai_core/cctv_core.py` in this checkout is **0 bytes**, see the warning at the end.

---

## What I could prove, and what I could not

**Proved from the code.** Three things, each traceable to a specific line:

1. **The alerts really were created overnight — you were right about that.**
   `getDailyStats()` (incidentService.js:210) counts `createdAt` against a
   correctly computed **Manila** midnight, not a UTC one. Your dashboard read
   `ALERTS TODAY 47` at around 06:00 on 25 Aug, so 47 incidents were written to
   MongoDB between midnight and 6 a.m. that morning. Those are new records, not
   an old list being re-displayed. Something was running.

   Separately, and still true: the log is a *database read*, not a live feed.
   `AlertContext.seedAlerts()` replaces the whole list from `/api/incidents`,
   whose default window is **the last seven days** (`incidentService.js:21`),
   unacknowledged and undismissed, newest first. So the backlog is mixed in with
   last night's alerts, and a full log next to `CAMERAS ONLINE 0/2` is expected.
   Clearing the backlog is what lets you tell the two apart tomorrow.

2. **Nothing but the AI core can create these incidents.**
   `backend/config/socket.js` creates an `Incident` only inside the
   `cctv_alert` handler, and only for a socket that presented
   `AI_SERVICE_TOKEN`. There is no cron, no replay, no backfill anywhere in the
   backend. Alerts cannot appear while `cctv_core.py` is stopped. They
   accumulate while it runs and stay until somebody acknowledges them.

3. **Each row's time is a bare clock string with no date.**
   `send_alert()` sends `"timestamp": time.strftime("%I:%M:%S %p")` — the AI
   box's local clock, no date, no timezone — and `AlertItem.jsx` renders that
   string verbatim. A row reading `5:38:44 AM` tells you the hour and nothing
   about *which day*. That is why last week's unresolved alerts look like they
   happened overnight.

**Not proved — this is the open question.** *Why* it was running. I have no
network path to `100.91.146.24` from here, so I cannot read the journal. Two
candidates, both settled by section 2b of `visiosphere_triage.sh`:

- **The service never stopped.** `systemctl stop` detaches a service from
  nothing at all — but closing the VS Code terminal, ending the SSH session or
  shutting the laptop does *not* stop a systemd unit. It keeps running on the
  server with nobody watching. If the journal shows no `Stopped` line last
  night, this is the answer.
- **The box rebooted.** The unit is `enabled`, so a power blip at the facility
  brings it straight back up and your earlier `systemctl stop` is forgotten.
  `uptime -s` gives it away instantly.

Either way the detector was live, the camera was fine, and the alerts are
genuine misclassifications of real people — which is what the two clips from
06:04 and 06:05 show: residents *sitting down*, reported as LYING DOWN. Fixing
that is worth more than fixing the on/off question, because at the facility this
thing is supposed to run 24/7 anyway. It has to be right at 3 a.m. with nobody
watching.

---

## Why a seated resident is reported as LYING DOWN

Both screenshots show the same failure: a small, distant, partly-occluded person
in the middle of the room, boxed and reported as LYING DOWN.

**The furniture zones are a denylist, and the gap is where they sat.**
`furniture_zone_at()` returns a zone name only if the support point falls inside
a polygon you drew. `Living Room` has five: Bench, Monoblocks, "Possible seat
location", Table and Bench, Bed. Taking the first screenshot's box, the support
point lands near `(0.42, 0.40)` in normalised coordinates. The Bench polygon's
right edge at that height is `x ≈ 0.28`; "Possible seat location" starts at
`x = 0.486`. The person is in the gap between two zones, so the guard abstains —
and the comment on that guard says the quiet part out loud: *"in an uncalibrated
oblique camera view, height above the floor is not observable."* With no zone
under them, geometry alone decides, and geometry cannot tell a seated person
from a fallen one.

**The geometry was never trustworthy for that detection anyway.** The box is
about 50–65 px tall. `MIN_CONFIDENT_KPTS = 5` means five of seventeen keypoints
is enough to call something a person, and `POSE_CONF_THRESHOLD = 0.45` is
applied per point. On a body that small, half hidden behind other residents,
3 px of keypoint jitter swings the torso angle by 15–20°, which is wider than
the entire margin between "seated" and "fallen". Path B makes it worse:
`height_ratio` is measured against `_max_bbox_h`, a standing reference captured
when the person was near the camera — so *walking to the back of the room*
shrinks the box and reads as a collapse.

**Then one false positive becomes five alerts.** This is the flood multiplier:

- `PERSIST_FALLEN` (default **on**, line 1036) keeps a track's state machine
  ticking after the track disappears.
- `promote_on_vanish()` (line 2294) *commits* a fall for a track that vanished
  while its fall candidate was still pending — a track that flickered in and out
  is treated as evidence somebody is on the floor.
- `tick_absent()` (line 2330) then walks it up the ladder — LYING DOWN,
  PROLONGED FALL (30s), (120s), (300s) — for `FALLEN_TIMEOUT_S = 300` seconds,
  tagging each one `— NO LONGER VISIBLE`.

Your screenshots show track IDs from 2601 to 41552. Tens of thousands of tracks
were created. Every one of them that flickered mid-frame could be promoted into
a fall nobody ever had.

**And the circuit breaker adds to the noise it exists to suppress.**
`DETECTION FAULT — 12+ alerts in one hour` appears at 4:36, 5:08, 5:15, 5:35 and
5:38. The notice is meant to fire once. It re-arms every time the sliding
one-hour window dips back below the cap, so a sustained flood produces a stream
of fault notices on top of the alerts.

---

## The fix

### Step 1 — two minutes, no code, do this first

In the AI box's `ai_core/.env`:

```ini
# Stop continuing "conclusions" about people the detector can no longer see.
# This removes every "— NO LONGER VISIBLE" alert and, because
# promote_on_vanish() is only reachable from this path, it also stops flickering
# ghost tracks from being committed as falls.
PERSIST_FALLEN=0
```

Then `systemctl restart visiosphere-ai`.

**The trade-off, stated honestly:** a resident who falls and whose track is lost
within 5 seconds, and who is never re-detected, no longer produces a late alert.
That is the case `PERSIST_FALLEN` was written for. It is also, on the evidence in
your own log, producing far more phantom falls than real ones. Turn it off now to
stop the bleeding; revisit it once the detector stops inventing tracks, and if
you do turn it back on, pair it with `FALLEN_TIMEOUT_S=60` so one ghost costs you
one alert rather than four.

### Step 2 — clear the backlog once

Acknowledge or resolve the 50 unresolved incidents. Until you do, every morning
will *look* like a fresh flood, because `seedAlerts()` re-loads them all on page
load. You cannot measure whether the fix worked while yesterday's alerts are
still on screen.

### Step 3 — make LYING DOWN require the floor (`patch_floor_only_falls.py`)

This is your actual requirement — *lying down should only trigger once the
person is on the floor, and only when the posture is really lying down* —
implemented as four gates in `FallStateMachine`, plus a longer dwell:

| Gate | Rule | Kills |
|---|---|---|
| Floor allowlist | support point inside a polygon named `floor` | anyone seated in the gaps between furniture zones |
| **Whole-body axis** | **shoulders→ankles axis ≥ 50° from vertical** | **picking something up, sweeping, wiping, crouching** |
| Lower body visible | both hips **+** at least one knee above `POSE_CONF_THRESHOLD` | occluded people in a crowd, where the torso angle is noise |
| Minimum apparent size | bbox height ≥ 15% of frame height | the distant blob at the back of the room |

**The body-axis gate is the one that answers "is this really lying down".**
Torso angle is measured shoulders-to-hips, so it reads ~90° for a resident
stooping to pick something up — their torso genuinely is horizontal. Their legs
are not. The axis from shoulder midpoint to ankle midpoint stays near vertical
for anyone still standing on their feet, whatever their torso is doing, and only
swings toward horizontal when the whole body is down. 50° is deliberately below
flat, so someone on their side with knees drawn up still clears it while a stoop
(typically 5–25°) does not.

`LYING_CONFIRM_SECONDS` also goes from a hard-coded **3 s** to an env-driven
**10 s**. Three seconds is shorter than picking something up off the floor.
Fast falls bypass that timer entirely (`_evaluate_alert`), so nothing about an
emergency is slowed down.

Every threshold is an env var — `LYING_BODY_AXIS_MIN_DEG`,
`FALL_MIN_BBOX_H_FRAC`, `LYING_CONFIRM_SECONDS`, `FLOOR_ZONE_REQUIRED`,
`FALL_REQUIRE_LOWER_BODY` — so you tune from the journal without editing code.

### The measurement error underneath all the thresholds

Every frame is force-resized to `INFERENCE_W x INFERENCE_H` = **720x480 (3:2)**.
Your `.env` comment explains why: it matches the test videos' native 3:2. But
the Living Room camera is a Tapo, and Tapo streams are **16:9**. Squeezing 16:9
into 3:2 scales x by `720/1280 = 0.5625` and y by `480/720 = 0.6667` — *different
factors*. Bodies come out 18.5% taller than they are, and **every angle and every
bbox ratio measured afterwards is wrong**:

| true torso angle | what the detector measures |
|---|---|
| 10° | 8.5° |
| 30° | 26.0° |
| 45° | 40.2° |
| 70° | 66.7° |

So thresholds you tuned against the 3:2 test videos do not mean the same thing
on the live camera. That is a large part of why tuning has felt like guesswork.

The patch measures `k = (source aspect) / (inference aspect)` once per camera
from the first real frame, then multiplies every x-difference by it — torso
angle, body-axis angle and bbox aspect are all restored to true proportions. For
a source that already matches, `k = 1` and nothing changes. It prints the value
at startup:

```
[GEOM Living Room] source 1280x720 -> 720x480, x-correction k=1.185
                   (angles and aspect ratios were distorted by this factor - now corrected)
```

I deliberately did **not** change the resize itself to letterbox instead. That
would shift every normalised coordinate and invalidate the `floor` polygon you
just drew. Correcting the maths leaves the image, the zones and the dashboard
untouched.

### Tuning from measurements instead of from the dashboard — `measure_clip.py`

```bash
python3 measure_clip.py --clip /opt/visiosphere/clips/<a false alarm>.mp4 --camera "Living Room"
python3 measure_clip.py --clip /opt/visiosphere/clips/<a real fall>.mp4  --camera "Living Room" --csv real.csv
```

It imports `cctv_core.py` and replays the clip through the same model, tracker,
thresholds and state machines the service uses — then prints, for every tracked
person: torso angle, body-axis angle, bbox aspect, apparent size, body extent,
posture ratios, floor/furniture/lower-body status, which gate decided the
outcome, and the alerts that clip would have produced. It never calls
`send_alert()`, so nothing is emitted and no incident is created.

Run it on a clip you know is false and one you know is real. A threshold is
right when it sits between the two distributions — if the false clip's body-axis
p95 is 30° and the real fall's p05 is 65°, anything from 35° to 60° separates
them, and you can say *why* you chose it. If a gate blocks ~100% of a real fall
clip, it is too tight; change that one env var and re-run.

It works on the unpatched file too, reporting what the gates *would* do — so you
can see the effect before changing anything.

Each gate can only **prevent** a new fall; none can undo an established one
(undoing resets the confirmation timer, which is how a real alert gets lost).
The floor gate **fails open** — a camera with no `floor` polygon behaves exactly
as it does today, so nothing changes until you draw one.

```bash
# on the AI box
python3 patch_floor_only_falls.py /opt/visiosphere/repo/ai_core/cctv_core.py
python3 test_floor_gate.py        /opt/visiosphere/repo/ai_core/cctv_core.py

python3 draw_zones.py --source living_room.jpg --camera "Living Room"
#   click around the open floor → ENTER → name it exactly:  floor  → s to save

systemctl restart visiosphere-ai
journalctl -u visiosphere-ai -f | grep -E "gate:|ALERT"
```

The patch verifies every anchor before touching the file and refuses to write if
your deployed copy differs, so it cannot half-patch a file it does not
recognise. It backs up, byte-compiles the result before committing, and
re-running it is a no-op.

`test_floor_gate.py` replays your false positives as unit tests — stooping,
cleaning, seated-and-occluded, off-floor, too-far — and then, the part that
matters more, asserts that **a fast fall and a slow lie-down on the open floor
both still alert**. A test suite that only proves things got quieter is
worthless in a care facility. It fails loudly against the unpatched file.

### A note on the `Floor` polygon you drew

It saved correctly and the name matches (the check is case-insensitive), and it
does exclude the benches, the doorway, the right-hand wall and everything above
the back-wall line. But I ran both 25 Aug false positives against it: the support
point of the 06:04 alert lands at roughly `(0.42, 0.34)` and the 06:05 one at
`(0.47, 0.41)` — **both inside your Floor polygon**. So the floor gate on its own
would not have stopped either of them. They are caught by the other three gates
(too small, lower body hidden, body axis vertical).

That is the correct outcome, not a mistake in your drawing: that patch of tile
*is* floor, and a resident who collapses there deserves an alert. Do not shrink
the polygon to chase those two — you would be trading away real coverage of the
middle of the room. The floor gate's job is the perimeter; the axis and
visibility gates do the work in the open.

### Step 4 — two small things worth doing before the facility deploys

1. **Latch the fault notice.** In whichever helper prints
   `DETECTION FAULT — 12+ alerts in one hour`, record the time it fired and
   suppress further notices for a full window; today it re-arms whenever the
   sliding count dips below the cap, so it repeats every few minutes.

2. **Send a real timestamp.** In `send_alert()`, replace
   `"timestamp": time.strftime("%I:%M:%S %p")` with an ISO-8601 instant
   (`datetime.now().astimezone().isoformat()`), and render it in the browser
   with `toLocaleString` in `Asia/Manila`. Right now no alert on the dashboard
   carries a date, which is why "these happened overnight" cannot be checked
   from the screen — and an audit trail in a care facility needs the date.

---

## Two things to look at that are not about alerts

- **`ai_core/cctv_core.py` in this checkout is 0 bytes**, modified about eight
  hours before I looked. Whatever wrote it truncated it. If anything ever syncs
  this desktop copy toward the server, it will wipe the AI core. Check the
  server's copy with section 6 of the triage script (it prints the byte count),
  and get a known-good file back into git.

- **`ai_core/.env` in this checkout carries live AWS keys, `AI_SERVICE_TOKEN`,
  `STREAM_SIGNING_SECRET` and `CLIP_SIGNING_SECRET` in plaintext**, and it is
  the *test* environment file — `CAM_0_SOURCE` points at a `C:\` path that
  cannot open on Linux and `CAM_1_SOURCE` (Living Room) is empty. If that is the
  file the server loads, neither camera can open at all. Section 7 of the triage
  script prints the server's real values. Rotate the AWS key pair before the
  facility deployment either way — it has been sitting in a synced folder.

---

## Order of operations

1. `bash visiosphere_triage.sh > triage.txt` — section 2b settles why it ran
   overnight (never stopped, or rebooted), section 5 says which file the running
   process loaded, section 7 the camera config. One command, changes nothing.
2. `PERSIST_FALLEN=0`, restart. The `NO LONGER VISIBLE` alerts stop immediately.
3. Clear the 50 unresolved incidents so you have a clean baseline.
4. Patch, draw the `floor` zone, restart, watch `gate:` lines for a day.
5. Then re-tune thresholds — with data, not guesses. `journalctl | grep gate:`
   tells you exactly what is being suppressed and why.
