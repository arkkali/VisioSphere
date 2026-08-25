import { currentFacility } from './houses';

const STREAM_BASE_URL = import.meta.env.VITE_STREAM_URL || 'http://localhost:5001/video_feed';

/**
 * The UNAUTHENTICATED feed path for a camera. Not playable on its own.
 *
 * This used to append `?key=${VITE_STREAM_TOKEN}` — a single static secret.
 * Vite inlines every VITE_* variable into the built bundle, so that secret was
 * public: anyone could read it out of the JavaScript and stream a camera
 * straight from ai_core without signing in, bypassing this app entirely.
 *
 * Authorisation now comes from a short-lived signed token minted per session by
 * the authenticated backend (see hooks/useStreamToken.js) and attached by
 * withStreamToken() below.
 */
const feed = (cam) => `${STREAM_BASE_URL}/${cam}`;

/**
 * Cameras per facility — now FULLY separated.
 *
 * Each facility has its own physical rig, its own ai_core feed, and therefore
 * its own detections and its own alerts:
 *
 *   Saint Anthony  Living Room  ->  ai_core cam_id "Living Room"   (deployed)
 *   Graces         —            ->  no camera on site yet
 *
 * `feedId` is the ai_core cam_id backing a tile. It drives BOTH the live
 * stream URL and the Active/Inactive badge (see withLiveStatus). A tile with
 * feedId: null is a placeholder — no stream, always Inactive.
 *
 * A camera's facility comes from backend/config/facilities.js CAMERA_FACILITY,
 * keyed on that same cam_id. That mapping is what routes an alert to the right
 * facility's dashboard, socket room, and staff push notifications — so a new
 * camera must be added in THREE places: ai_core/.env (CAM_<n>_*), the backend
 * CAMERA_FACILITY map, and this file.
 */
export const FACILITY_CAMERAS = {
  // Graces is not deployed yet — no camera on site, so every tile is a
  // placeholder. When a rig is installed: add a CAM_<n> slot in ai_core/.env,
  // then set feedId + url here to match its cam_id.
  GRACES: [
    {
      cameraId: 'CAM-002',
      name: 'House of Gabriel',
      location: 'Pending Installation',
      feedId: null,
      fps: 0,
      type: 'stream',
      url: null,
    },
    {
      cameraId: 'CAM-001',
      name: 'House of Charbel',
      location: 'Pending Installation',
      feedId: null,
      fps: 0,
      type: 'stream',
      url: null,
    },
    {
      cameraId: 'CAM-003',
      name: 'Future CCTV 1',
      location: 'Pending Installation',
      feedId: null,
      fps: 0,
      type: 'stream',
      url: null,
    },
    {
      cameraId: 'CAM-004',
      name: 'Future CCTV 2',
      location: 'Pending Installation',
      feedId: null,
      fps: 0,
      type: 'stream',
      url: null,
    },
  ],

  SAINT_ANTHONY: [
    {
      cameraId: 'STA-CAM-001',
      name: 'Living Room',
      location: 'IP Camera · CCTV',
      // Saint Anthony's own rig. Requires CAM_2_ID=Living Room in ai_core/.env
      // — until that exists the tile shows Inactive, which is correct rather
      // than borrowing Graces' feed.
      feedId: 'Living Room',
      fps: 30,
      type: 'stream',
      url: feed('Living%20Room'),
    },
    {
      cameraId: 'STA-CAM-002',
      name: 'Future CCTV 1',
      location: 'Pending Installation',
      feedId: null,
      fps: 0,
      type: 'stream',
      url: null,
    },
  ],
};

/**
 * Cameras the signed-in user may see.
 *
 * Returns [] for an unknown facility rather than falling back to every camera —
 * an empty grid is an obvious bug report, whereas a silent fallback would show
 * one facility's cameras to the other.
 */
export const camerasForCurrentUser = () => FACILITY_CAMERAS[currentFacility()] || [];

export const camerasFor = (facility) => FACILITY_CAMERAS[facility] || [];

/** Where ai_core answers /status — same host as the MJPEG feeds. */
export const AI_CORE_STATUS_URL =
  `${STREAM_BASE_URL.replace(/\/video_feed\/?$/, '')}/status`;

/**
 * Apply live health to a camera list.
 *
 * `health` is a Map of ai_core cam_id → online (from useCameraHealth). A tile
 * is Active only when it is backed by a feed AND that feed produced a frame
 * recently. Cameras with no feedId are always Inactive, and if ai_core cannot
 * be reached NOTHING is reported Active — an over-report would tell staff a
 * camera is watching a resident when it isn't.
 */
export const withLiveStatus = (cams, health) =>
  cams.map((c) => ({
    ...c,
    status: c.feedId && health?.get?.(c.feedId) ? 'Active' : 'Inactive',
    lastFrameAgo: c.feedId ? health?.getAge?.(c.feedId) ?? null : null,
  }));

/**
 * Attach a signed viewing token to every camera that has a feed.
 *
 * `stream` is what useStreamToken() returns, or null before one has arrived.
 * With no token the url is deliberately left null — a tile with no playable URL
 * renders "No Signal", which is the honest state. Guessing a URL without
 * authorisation would just produce a 403 from ai_core and a broken image.
 */
export const withStreamToken = (cams, stream) =>
  cams.map((c) => {
    if (!c.url || !stream?.token) return { ...c, url: null };
    // Prefer the base the backend reported; it knows the public tunnel URL.
    const url = stream.streamBase
      ? c.url.replace(STREAM_BASE_URL, stream.streamBase)
      : c.url;
    return { ...c, url: `${url}?token=${encodeURIComponent(stream.token)}` };
  });

export const activeCameraCount = (cams = []) =>
  cams.filter((c) => c.status === 'Active').length;

export const totalCameraCount = (cams = camerasForCurrentUser()) => cams.length;
