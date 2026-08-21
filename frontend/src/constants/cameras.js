import { currentFacility } from './houses';

const STREAM_BASE_URL = import.meta.env.VITE_STREAM_URL || 'http://localhost:5001/video_feed';
// Shared secret matching STREAM_TOKEN in ai_core/.env. Appended as ?key= so the
// public Cloudflare Tunnel feed isn't open to anonymous viewers. Empty = no token.
const STREAM_TOKEN = import.meta.env.VITE_STREAM_TOKEN || '';
const feed = (cam) => `${STREAM_BASE_URL}/${cam}${STREAM_TOKEN ? `?key=${STREAM_TOKEN}` : ''}`;

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

export const activeCameraCount = (cams = []) =>
  cams.filter((c) => c.status === 'Active').length;

export const totalCameraCount = (cams = camerasForCurrentUser()) => cams.length;
