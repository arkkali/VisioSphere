This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VisioSphere is an elderly care facility management system with three components:
- *backend/* — Node.js/Express REST API + Socket.io server
- *frontend/* — React + Vite SPA with Tailwind CSS
- *ai_core/* — Python Flask service running YOLOv11-pose computer vision for CCTV fall, inactivity, and agitation detection

## Development Commands

### Backend (runs on port 5000)
cd backend
node server.js

### Frontend (runs on port 5173 by default)
cd frontend
npm run dev       # start dev server
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview production build

### AI Core (runs on port 5001)
cd ai_core
python cctv_core.py

Requires: `pip install opencv-python ultralytics flask flask-cors python-socketio python-dotenv`

GPU acceleration (recommended): install the CUDA build of PyTorch — see https://pytorch.org/get-started/locally/ for the matching `--index-url` for your CUDA version (cu124, cu126, cu128 for current torch). On CPU the medium pose model is too slow (~1-2 fps) for real-time fall detection.

**Model files:**
- `yolo11m-pose.pt` — YOLOv11 medium pose model. Ultralytics auto-downloads (~40 MB) on first run; no manual placement needed. Override via `POSE_MODEL_PATH` env var if you need a different size class.

**Camera configuration (env vars, with defaults):**
- `CAM_0_ID=House of Charbel`, `CAM_0_SOURCE=0` (laptop webcam)
- `CAM_1_ID=House of Gabriel`, `CAM_1_SOURCE=rtsp://192.168.100.109/stream2 (Tapo TC65 RTSP — `stream1` = 2K HD, `stream2` = sub-stream; if anonymous RTSP returns 401, prepend Tapo Camera Account credentials: `rtsp://<user>:<pass>@192.168.100.109:554/stream1`)
- `BACKEND_URL=http://localhost:5000` (Node backend for Socket.IO alerts)

### Seeding the database
cd backend
node seedAdmin.js
node seedNurse.js
node seedGuardian.js
node seedResident.js

## Architecture

### Backend
- *Entry point*: backend/server.js — sets up Express, Mongoose, Socket.io, and registers all route modules. Includes the CCTV alert pipeline: parses raw alerts from the AI core, persists them as Incident documents, then broadcasts to dashboards.
- *Routes* (backend/routes/): adminRoutes, nurseRoutes, guardianRoutes, residentRoutes, assessmentRoutes, auditRoutes, settingsRoutes, **incidentRoutes** — mounted under /api/<resource>. incidentRoutes exposes filtered list, weekly stats, unread-count for the bell, and acknowledge/resolve PATCHes.
- *Models* (backend/models/): Mongoose schemas for User, Resident, Guardian, Nurse, DailyAssessment, AuditLog, Incident, SystemSettings. **Incident** is the unified collection for both CCTV-emitted alerts (`source: 'cctv'`, location-based, no resident binding) and manual nurse-logged events (`source: 'manual'`, may include residentId).
- *User roles*: Facility Admin, Nurse, Guardian — stored in the shared User model with custom IDs (A-YYYY##, N-YYYY##, G-YYYY##)
- *Auth*: JWT-based; first-login flow uses OTP via Resend email API; optional 2FA PIN
- *File uploads*: Multer, served statically from backend/uploads/
- *Real-time*: Socket.io relays `cctv_alert` events from the AI core. The handler parses the raw payload into structured Incident fields (incidentType enum, severity, location, etc.), persists to MongoDB, then broadcasts as `dashboard_alert` to all connected dashboard clients with the persisted document attached.

### Frontend
- *Entry point*: frontend/src/App.jsx — React Router with role-based route prefixes (/admin/*, /nurse/*)
- *Pages* (src/pages/): Role-specific dashboards (Admin, Nurse, Guardian), plus shared pages: EldersDashboard, CCTVAnalytics, DailyAssessments, AuditTrail, Settings
- *Components* (src/components/):
  - AdminSection/ — admin-only views (dashboard stats, CCTV live view, inbox, access log, system logs, settings)
  - CaregiverSection/ — nurse views (assigned residents, health assessment, medication tracker)
  - Sidebar.jsx / SidebarCaregiver.jsx — role-aware navigation
  - ui/ — shared UI primitives
- *Hooks*: useCCTV.js, useWebcam.js for camera/Socket.io integration
- *HTTP*: Axios for all API calls to http://localhost:5000
- *Charts*: Recharts; *PDF export*: jsPDF + jspdf-autotable; *Animations*: Framer Motion

### AI Core
- `ai_core/cctv_core.py` — multi-camera capture and inference. Per camera, two threads: one capture thread reading frames into a shared buffer, one inference thread running YOLOv11-pose with ByteTrack for multi-person tracking. Each camera has its own model instance to keep tracker state isolated.
- *Detection modules:*
  - **C — Fall detection** (`FallStateMachine`): per-track state machine using torso angle (shoulder→hip vector from vertical) and bbox aspect ratio. Distinguishes fast falls from slow lie-downs by peak angular velocity (`FALL_RATE_THRESHOLD`). Slow transitions arm a 3-second confirmation timer (`LYING_CONFIRM_SECONDS`) before emitting the LYING DOWN alert, suppressing false positives from brief bends. Prolonged-fall re-alert fires after 30 s.
  - **D — Body agitation** (`BodyAgitationScorer`): geometric scorer for distress poses — hands-on-head, bilateral arm raises, wrist oscillation (hair-grabbing pattern). Pure pose geometry, no facial signals. Sustained-threshold timer with grace period prevents single-frame triggers.
  - **E — Movement** (`MovementTracker`): centroid-based velocity tracking with EMA smoothing. Fires INACTIVE alerts after configurable stationary time, with a posture-aware variant that escalates when stationary AND torso pitched forward. Also exposes `is_stationary()` for cross-module gating.
- *Tracking*: ByteTrack via Ultralytics (`tracker="bytetrack.yaml"`), `persist=True`. Per-track state is GC'd after `TRACK_TIMEOUT_S = 5.0` seconds of absence to prevent state leakage between residents.
- *Output*: emits `cctv_alert` Socket.IO events with `{type: EMERGENCY|WARNING, message, location, timestamp}`. Streams annotated MJPEG at `/video_feed/<cam_id>` (URL-encode the cam_id since names contain spaces).

### Environment
backend/.env requires:
MONGO_URI=<MongoDB Atlas connection string>
PORT=5000
JWT_SECRET=<secret>
RESEND_API_KEY=<resend key>

## Key Conventions
- Backend uses CommonJS (require/module.exports); frontend uses ES modules
- No test suite is configured — npm test in backend exits with error
- The frontend dev proxy is not configured in vite.config.js; API calls read import.meta.env.VITE_API_URL (only src/context/AlertContext.jsx keeps a localhost:5000 fallback)
- backend/node_modules is NOT tracked in git (root .gitignore covers it); hosts reinstall from package-lock.json
- AI core camera configuration is env-var driven; CAMERAS is the single source of truth (defined at top of cctv_core.py)

## Deployment

- **Backend** — Heroku (Common Runtime), Basic dyno, deployed by GitHub integration from the `Deployment` branch. The repo root carries a `Procfile` and a launcher `package.json` because Heroku's GitHub integration always builds from the repo root; `.slugignore` keeps `frontend/` and `ai_core/` out of the slug.
- **Frontend** — Vercel. `VITE_*` vars are inlined at build time, so changing them requires a redeploy, not just an env update.
- **AI core** — runs on-prem beside the cameras; connects out to the backend over Socket.IO using `AI_SERVICE_TOKEN`.
- **Module system** — `backend/` is CommonJS ONLY. Do not add `import`/`export` to files under `backend/`: `backend/package.json` has no `"type": "module"`, and such files load only on Node >= 22.12 (they hard-crash on 18/20).
- **Ephemeral filesystem** — Heroku wipes the dyno disk on every restart (at least daily). Nothing that must outlive a single request may be written to disk. Audit archives and uploads go to S3 via `backend/config/s3.js`. The only permitted local writes are spreadsheet imports, which are parsed and unlinked inside one request.
- **PORT** — injected by Heroku. Never set it as a config var; doing so causes an R10 boot timeout.
