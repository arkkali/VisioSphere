# VisioSphere Deployment Architecture Review

**Prepared for:** VisioSphere Capstone Team  
**Date:** 2026-05-30  
**System Version:** Pilot Deployment

---

## Executive Summary

Both proposed options have the same two fatal flaws that make them unworkable as stated. Before comparing them, these must be understood:

1. **The AI core cannot run in the cloud.** Your cameras are at `rtsp://192.168.100.109/...` — a private LAN IP. No Azure VM or container service can reach a private network address at your facility. The AI core must run on-premises.

2. **YOLOv11-pose on CPU yields 1–2 FPS.** Your own documentation states this is too slow for real-time fall detection. Cloud GPU instances (Azure NC-series) are expensive and are not covered meaningfully by student credits for sustained use. The GPU must be co-located with the AI core — i.e., at the facility.

A correct deployment architecture is therefore **hybrid**: the AI core runs on-premises on a GPU machine, and the backend/frontend run in the cloud.

---

## 1. Option A vs Option B Comparison

| Dimension | Option A (Vercel + Heroku + Azure AI) | Option B (Heroku FE + Heroku BE + Azure AI) |
|---|---|---|
| **Performance** | Vercel serves the SPA from a global CDN — fast first load everywhere. Heroku backend has cold starts on Eco dynos (~30s). | Heroku frontend has no CDN — slower global delivery, wastes a dyno on static files that Vercel handles better for free. |
| **Scalability** | Vercel scales frontend automatically and for free. Heroku backend requires manual dyno scaling (paid). | Both services on Heroku doubles scaling complexity. No benefit over A. |
| **Reliability** | Heroku Eco/Basic dynos **sleep after 30 min of inactivity**. For a fall-detection system where a sleeping backend means missed emergency alerts, this is a **safety issue**, not just a performance issue. | Same Heroku sleep risk, plus the frontend also sleeps. Strictly worse. |
| **Ease of deployment** | Good DX. Vercel auto-deploys from GitHub. Heroku CLI is straightforward. | Marginally simpler (one platform) but Heroku is the wrong tool for serving a static React build. |
| **Maintenance** | Two platforms to monitor. | Heroku-only but at the cost of inferior frontend hosting. |
| **Cost efficiency** | Vercel free tier + Heroku student credits for backend. Good split. | Consumes Heroku credits on both FE and BE. Inferior use of budget. |
| **Student suitability** | A > B. Vercel is purpose-built for SPAs like React + Vite. | No advantage over A on any dimension. |

**Verdict: Option A is strictly better than Option B, but both are architecturally broken** due to the RTSP and GPU issues described above. Neither should be implemented as specified.

---

## 2. Technical Issues and Bottlenecks

### Critical (blocks deployment entirely)

**RTSP camera access from cloud.**  
Your AI core connects to `rtsp://192.168.100.109/stream2`. This is a private LAN address. Any cloud-hosted service — Azure VM, Container App, App Service — operates on Azure's network, not your facility's LAN. The cameras are simply unreachable. There is no workaround short of either (a) exposing your cameras directly to the internet (a serious security risk), or (b) running the AI core on-premises.

**GPU requirement.**  
YOLOv11-pose with ByteTrack across multiple cameras requires a CUDA GPU for real-time throughput. Azure NC-series VMs (the cheapest GPU option) start at ~$0.90/hour (~$650/month). Student credits ($100) cover about 4–5 days. This is not a viable path for a sustained pilot.

### Serious (degrades reliability)

**Heroku dyno sleep.**  
Eco and Basic dynos sleep after 30 minutes without a web request. Your backend receives Socket.IO events from the AI core continuously, but if the AI core is also down or the facility is quiet overnight, the backend will sleep. The next alert — potentially a resident falling at 3 AM — triggers a cold start (~30s delay) before the alert reaches the nurse dashboard. This is unacceptable for a safety system.

**Socket.IO and serverless.**  
Vercel is serverless and stateless — it cannot host a Socket.IO server. This is fine because the frontend only runs the Socket.IO *client*. However, the backend Socket.IO server must run on a platform that maintains persistent TCP connections. Serverless platforms (Vercel Functions, Azure Functions consumption plan) cannot do this.

**MJPEG video feed access.**  
The AI core serves `/video_feed/<cam_id>` as an MJPEG stream. If the AI core is on-premises, remote users (off the facility network) cannot reach this URL directly. This needs a deliberate decision: either (a) dashboards are only accessed from within the facility LAN (acceptable for a pilot), or (b) a reverse proxy or VPN tunnel is set up for remote access.

### Minor (manageable)

**MongoDB Atlas M0 storage limit.** The free tier has a 512 MB cap. For a pilot deployment with limited users and incident documents (no video stored in Mongo), this is sufficient. Video clips should go to blob storage, not Mongo.

**CORS configuration.** Backend currently hardcodes `localhost:5000`. Cloud deployment requires updating CORS origins and the frontend's hardcoded `localhost:5000` API base URL.

---

## 3. Recommended Architecture

### Hybrid: On-Premises AI Core + Cloud Backend + Cloud Frontend

This is the only architecture that satisfies all constraints: RTSP camera access, GPU requirement, real-time alerting, and student budget.

```
┌─────────────────────────────────────────────────────────────────┐
│  FACILITY LAN                                                   │
│                                                                 │
│  [Tapo TC65 Cameras]                                           │
│       │ rtsp://                                                │
│       ▼                                                        │
│  [AI Core: On-Prem GPU Machine]                               │
│   - Python Flask + YOLOv11-pose                               │
│   - ByteTrack multi-person tracking                           │
│   - FallStateMachine / BodyAgitationScorer / MovementTracker  │
│   - Serves MJPEG at /video_feed/<cam_id>  (LAN only)         │
│       │                                                        │
│       │  Socket.IO (outbound, wss://)                        │
└───────┼────────────────────────────────────────────────────────┘
        │
        ▼ (outbound through facility firewall — no inbound rules needed)
┌──────────────────────────────────────────────────────────────────┐
│  CLOUD                                                          │
│                                                                 │
│  [Backend: Azure App Service B1]                               │
│   - Node.js / Express / Socket.IO server                       │
│   - REST API (/api/*)                                          │
│   - Receives cctv_alert → persists Incident → broadcasts      │
│   - Serves uploaded files (or delegates to Blob Storage)       │
│       │                 │                                      │
│       ▼                 ▼                                      │
│  [MongoDB Atlas M0]  [Azure Blob Storage]                     │
│   - Users, Residents   - Uploaded photos                      │
│   - Incidents          - Processed video clips                │
│   - Assessments                                                │
│   - Audit logs                                                 │
│                                                                 │
│  [Frontend: Vercel]                                            │
│   - React + Vite SPA                                          │
│   - Socket.IO client (wss:// to Backend)                     │
│   - REST calls to Backend                                      │
│   - MJPEG <img src> pointing to AI Core LAN IP (on-site)     │
└──────────────────────────────────────────────────────────────────┘
```

### Why this works

The AI core connects **outbound** to the cloud backend via Socket.IO over WebSocket (wss://). Outbound connections from the facility LAN work without special firewall rules. The cloud backend receives alerts, persists them, and broadcasts to all connected dashboards — exactly as the current architecture intends, just with the AI core on a different network.

### Service selection and cost

| Component | Service | Cost |
|---|---|---|
| Frontend | Vercel (free tier) | $0 |
| Backend | Azure App Service B1 | ~$13/month → ~7 months on $100 student credit |
| Database | MongoDB Atlas M0 | $0 (512 MB free) |
| File storage | Azure Blob Storage (LRS) | ~$0.02/GB/month — negligible on student credits |
| AI Core | On-prem GPU machine | $0 (existing hardware) |

A consumer NVIDIA GPU (RTX 3060 or better) runs YOLOv11-pose at 20–60+ FPS. This is far superior to any cloud GPU option within student budget.

---

## 4. Component Communication

### AI Core → Backend (real-time alerts)
The AI core is a Socket.IO **client** that connects to the backend Socket.IO **server** on startup. When a detection fires (fall, agitation, inactivity), it emits `cctv_alert` with `{type, message, location, timestamp}`. The backend handler (already implemented) parses this, persists an Incident document, then broadcasts `dashboard_alert` to all connected nurse/admin dashboards. This connection is outbound from the facility — no inbound firewall rules needed.

```
AI Core (Socket.IO client, on-prem)
  → wss://your-backend.azurewebsites.net
  → emit("cctv_alert", payload)
  → Backend persists → broadcast to dashboards
```

### Frontend → Backend (REST + real-time)
All REST calls use HTTPS to the Azure App Service URL. Update the Axios base URL from `localhost:5000` to the deployed backend URL via an environment variable (`VITE_API_URL`). The frontend Socket.IO client connects to the same URL over wss://.

```
Frontend (Vercel)
  → HTTPS REST → https://your-backend.azurewebsites.net/api/*
  → wss:// Socket.IO → receives dashboard_alert events
```

### Frontend → AI Core (live video feeds)
MJPEG streams from `/video_feed/<cam_id>` are served by the AI core directly. For a pilot where nurses access dashboards from within the facility LAN, the `<img src>` can point directly to the AI core's LAN IP (e.g., `http://192.168.100.x:5001/video_feed/House%20of%20Charbel`). For remote access later, proxy the stream through the backend or use a VPN.

### Backend → Storage
MongoDB Atlas: Mongoose connects over TLS using the `MONGO_URI` connection string. Azure Blob Storage: use the `@azure/storage-blob` SDK with a connection string or managed identity. Store uploaded files (profile photos, incident clips) in Blob and reference URLs in MongoDB documents.

---

## 5. YOLOv11 Deployment Recommendation

**Run as a separate on-premises microservice. Do not integrate into the backend.**

Reasons:

- **Different runtime.** The AI core is Python/Flask; the backend is Node.js. Merging them requires a subprocess bridge or rewriting inference in JavaScript — both are poor engineering choices.
- **GPU isolation.** The inference process needs exclusive or priority GPU access. Mixing this with API logic creates resource contention and complicates memory management.
- **Failure isolation.** If the inference service crashes (OOM, model load failure), the backend and dashboards remain operational. Nurses can still check resident records and submit assessments. Tight coupling removes this resilience.
- **Independent restart.** A systemd service or PM2-managed Python process can be restarted without touching the backend.

**Do not use Azure Container Apps, Azure App Service, or Azure VM for the AI core** — not because of any architectural problem with those services, but because none provide affordable GPU access on student credits, and none can reach your RTSP camera LAN addresses.

Run the AI core as a managed process on a dedicated on-premises machine:

```bash
# Using PM2 (recommended for process management)
pip install pm2  # or use npm install -g pm2 with a shell wrapper
pm2 start cctv_core.py --interpreter python3 --name visio-ai-core
pm2 startup   # enable auto-start on reboot
pm2 save
```

Or as a systemd service for a production-grade setup on Linux.

---

## 6. Deployment Roadmap

### Phase 1: Infrastructure Setup (Day 1–2)

1. **MongoDB Atlas** — Create M0 cluster, configure IP allowlist (Azure App Service egress IPs + facility static IP), create database user.
2. **Azure Blob Storage** — Create storage account, container for uploads, generate connection string.
3. **Seed the database** — Run `node seedAdmin.js`, `node seedNurse.js`, `node seedGuardian.js`, `node seedResident.js` against the Atlas cluster.

### Phase 2: Backend Deployment (Day 2–3)

4. Update `backend/.env` with production `MONGO_URI`, `JWT_SECRET`, `RESEND_API_KEY`, and Blob Storage connection string.
5. Deploy backend to Azure App Service (B1 tier). Use the Azure CLI or GitHub Actions.
6. **Test before moving on:** `curl https://your-backend.azurewebsites.net/api/health` — confirm the API responds. Test auth flow (login, OTP, JWT).

### Phase 3: Frontend Deployment (Day 3–4)

7. Update `VITE_API_URL` environment variable in Vercel to the backend URL.
8. Deploy frontend to Vercel (connect GitHub repo, Vercel auto-detects Vite).
9. **Test before moving on:** Login flow end-to-end. Confirm REST calls reach the backend (check Network tab in DevTools for correct URLs and 2xx responses).

### Phase 4: AI Core On-Premises Setup (Day 4–5)

10. Install dependencies on the facility GPU machine:
    ```bash
    pip install opencv-python ultralytics flask flask-cors python-socketio python-dotenv
    ```
    Install CUDA-enabled PyTorch matching your GPU driver (see https://pytorch.org/get-started/locally/).
11. Set environment variables pointing to the deployed backend: `BACKEND_URL=https://your-backend.azurewebsites.net`.
12. Run `python cctv_core.py` — Ultralytics auto-downloads `yolo11m-pose.pt` on first run.
13. **Test before declaring complete:** Confirm Socket.IO connection in backend logs. Trigger a test alert and verify it appears on the nurse dashboard in real time.

### Phase 5: End-to-End Validation (Day 5–6)

14. Simulate a fall event and trace: AI core → backend logs → MongoDB incident document → dashboard alert.
15. Test all user roles (Admin, Nurse, Guardian) against the deployed system.
16. Verify MJPEG video feeds display correctly in the CCTV view from within the facility LAN.

### CI/CD Recommendations

**Frontend (Vercel + GitHub Actions):** Vercel auto-deploys on push to `main` with zero configuration. Add a preview deployment on pull requests.

**Backend (GitHub Actions → Azure):**
```yaml
# .github/workflows/deploy-backend.yml
on:
  push:
    branches: [main]
    paths: ['backend/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/webapps-deploy@v3
        with:
          app-name: your-app-service-name
          publish-profile: ${{ secrets.AZURE_PUBLISH_PROFILE }}
          package: backend/
```

**AI Core:** Deploy manually. On-premises services don't benefit from cloud CI/CD pipelines — a Git pull and PM2 restart is sufficient. For the pilot, document the restart procedure and keep it simple.

---

## 7. Final Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════╗
║  FACILITY LAN (192.168.100.x)                                           ║
║                                                                          ║
║  ┌─────────────────────┐    ┌─────────────────────┐                    ║
║  │  Tapo TC65 Camera   │    │  Tapo TC65 Camera   │  (+ more cameras) ║
║  │  House of Charbel   │    │  House of Gabriel   │                    ║
║  └──────────┬──────────┘    └──────────┬──────────┘                    ║
║             │ rtsp://                  │ rtsp://                        ║
║             └──────────────┬───────────┘                               ║
║                            ▼                                            ║
║  ┌─────────────────────────────────────────────────────────────────┐   ║
║  │  AI Core Machine (GPU: RTX 3060+, Ubuntu/Windows)              │   ║
║  │                                                                 │   ║
║  │  cctv_core.py                                                  │   ║
║  │  ├── CaptureThread (per camera) ──► FrameBuffer               │   ║
║  │  ├── InferenceThread (per camera, YOLOv11-pose + ByteTrack)   │   ║
║  │  │   ├── FallStateMachine                                      │   ║
║  │  │   ├── BodyAgitationScorer                                   │   ║
║  │  │   └── MovementTracker                                       │   ║
║  │  ├── Flask MJPEG server (:5001/video_feed/<cam_id>)           │   ║
║  │  └── Socket.IO Client ──────────────────────────────────────► │   ║
║  └──────────────────────────────────┬───────────────────────────┘   ║
║                                     │ wss:// (outbound)               ║
╚═════════════════════════════════════╪═══════════════════════════════════╝
                                      │
                          ┌───────────▼────────────────────────────────┐
                          │  CLOUD                                     │
                          │                                            │
                          │  ┌──────────────────────────────────────┐ │
                          │  │  Backend: Azure App Service B1       │ │
                          │  │  (Node.js / Express / Socket.IO)     │ │
                          │  │                                      │ │
                          │  │  Socket.IO Server                   │ │
                          │  │  ├── recv: cctv_alert               │ │
                          │  │  │   ├── parse → Incident doc       │ │
                          │  │  │   ├── persist to MongoDB         │ │
                          │  │  │   └── broadcast: dashboard_alert │ │
                          │  │  │                                  │ │
                          │  │  REST API (/api/*)                  │ │
                          │  │  ├── /auth, /admin, /nurse          │ │
                          │  │  ├── /residents, /assessments       │ │
                          │  │  ├── /incidents                     │ │
                          │  │  └── /settings, /audit             │ │
                          │  └────────────┬─────────────┬──────────┘ │
                          │               │             │            │
                          │               ▼             ▼            │
                          │  ┌─────────────────┐  ┌──────────────┐  │
                          │  │  MongoDB Atlas  │  │  Azure Blob  │  │
                          │  │  M0 Free Tier   │  │  Storage     │  │
                          │  │  - Users        │  │  - Profile   │  │
                          │  │  - Residents    │  │    photos    │  │
                          │  │  - Incidents    │  │  - Video     │  │
                          │  │  - Assessments  │  │    clips     │  │
                          │  │  - Audit logs   │  └──────────────┘  │
                          │  └─────────────────┘                    │
                          │                                          │
                          │  ┌──────────────────────────────────┐   │
                          │  │  Frontend: Vercel                │   │
                          │  │  (React + Vite SPA, global CDN) │   │
                          │  │                                  │   │
                          │  │  ├── Socket.IO Client           │   │
                          │  │  │   └── recv: dashboard_alert  │   │
                          │  │  ├── Axios REST → Backend       │   │
                          │  │  └── <img src> MJPEG            │   │
                          │  │      → AI Core LAN IP:5001      │   │
                          │  │        (on-site access only)    │   │
                          │  └──────────────────────────────────┘   │
                          └────────────────────────────────────────────┘

DATA FLOWS
──────────────────────────────────────────────────────────────────────────
[A] Alert path:  Camera → AI Core → Backend (Socket.IO) → Dashboard
[B] API path:    Dashboard → Backend (HTTPS REST) → MongoDB
[C] Video path:  Camera → AI Core (MJPEG) → Dashboard (LAN only, pilot)
[D] Upload path: Dashboard → Backend (multipart) → Azure Blob
[E] Auth path:   Dashboard → Backend → MongoDB + Resend (OTP email)
```

---

## 8. Security and Scalability for Government Deployment

### Security

**Authentication and Authorization**
The current JWT + OTP + optional 2FA PIN implementation is a solid foundation. Before government deployment, enforce:
- Short JWT expiry (15–30 min access tokens) with refresh token rotation
- Account lockout after N failed login attempts (brute-force protection)
- All tokens transmitted over HTTPS only (enforce on Azure App Service)

**Data in Transit**
All external communication already uses HTTPS/wss if deployed to Azure App Service with a managed TLS certificate. Ensure the Socket.IO connection from the AI core uses `wss://` (not `ws://`).

**Data at Rest**
Azure Blob Storage encrypts data at rest by default (AES-256). MongoDB Atlas M0 also encrypts at rest. Sensitive fields in MongoDB (if any) should use field-level encryption for government compliance.

**Video Footage**
CCTV footage of residents is sensitive personal data. Establish a retention policy (e.g., 30-day rolling deletion). Ensure Azure Blob containers are private (not public), accessed only via signed URLs or through the backend.

**Network**
On the facility LAN, isolate the CCTV network on its own VLAN. The AI core machine should be on this VLAN with firewall rules allowing only outbound HTTPS/WebSocket to the backend. RTSP camera credentials must be in environment variables — never in source code.

**Compliance**
For a government elderly-care facility in Lebanon/MENA:
- Identify the applicable data protection law (GDPR equivalents or national law)
- Consider data residency: where Azure regions store your data
- Video footage of residents may require explicit consent documentation

**Penetration Testing**
Before government handover, conduct a basic penetration test of the backend API. Common targets: JWT tampering, IDOR on resident/assessment routes, file upload bypass.

### Future Scalability

The hybrid architecture scales naturally:

**More cameras:** Add entries to the `CAMERAS` dict in `cctv_core.py`. Hardware is the constraint (GPU VRAM), not the software architecture. A single RTX 3080 can handle 4–6 cameras at real-time throughput with YOLOv11-medium. For more, add a second GPU machine.

**More facilities:** Each facility runs its own AI core instance, connecting outbound to the same cloud backend. Add a `facility_id` field to the Incident model and route Socket.IO rooms by facility. The backend scales horizontally on Azure App Service without architecture changes.

**Higher backend load:** Azure App Service B1 → B2/B3 scaling is a slider change. If Socket.IO needs multi-instance support (multiple backend nodes), add Azure Cache for Redis as the Socket.IO adapter — a well-documented upgrade path.

**Database growth:** MongoDB Atlas M0 → M10 ($57/month) when the 512 MB limit approaches. Schema is already well-structured for this migration.

---

## Summary Recommendation

| Decision | Recommendation |
|---|---|
| Frontend | Vercel (free tier) |
| Backend | Azure App Service B1 (~$13/month, use student credits) |
| Database | MongoDB Atlas M0 (free, upgrade to M10 when needed) |
| File storage | Azure Blob Storage (student credits) |
| AI core | On-premises GPU machine at the facility |
| AI process management | PM2 or systemd on the facility machine |
| CI/CD frontend | Vercel GitHub integration (automatic) |
| CI/CD backend | GitHub Actions → Azure Web Deploy |
| Video feeds (pilot) | Direct from AI core LAN IP (no tunnel needed for on-site access) |
| Video feeds (remote) | Reverse proxy via backend or facility VPN (post-pilot) |

The single most important insight for your team: **the AI core is not a cloud service.** It is a piece of edge infrastructure tied to physical cameras on a local network. Design accordingly, and the rest of the architecture falls into place cleanly.
