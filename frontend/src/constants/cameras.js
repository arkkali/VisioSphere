import { currentFacility } from './houses';

const STREAM_BASE_URL = import.meta.env.VITE_STREAM_URL || 'http://localhost:5001/video_feed';
// Shared secret matching STREAM_TOKEN in ai_core/.env. Appended as ?key= so the
// public Cloudflare Tunnel feed isn't open to anonymous viewers. Empty = no token.
const STREAM_TOKEN = import.meta.env.VITE_STREAM_TOKEN || '';
const feed = (cam) => `${STREAM_BASE_URL}/${cam}${STREAM_TOKEN ? `?key=${STREAM_TOKEN}` : ''}`;

/**
 * Cameras per facility.
 *
 * Camera ACCESS is deliberately NOT separated yet — there is only one physical
 * camera rig, so Saint Anthony's "Living Room" tile streams the same ai_core
 * feed as Graces' "House of Gabriel". What IS separated is the naming: Saint
 * Anthony staff should never see Graces' house names in their source list.
 *
 * ⚠ Because the feed is shared, a Saint Anthony viewer is watching a camera
 * that physically sits in a Graces house, and any alert it raises is still
 * attributed to Graces (ai_core reports location as "House of Gabriel", which
 * backend/config/facilities.js maps to GRACES). That is a deliberate interim
 * state, not an oversight.
 *
 * WHEN A REAL SAINT ANTHONY CAMERA IS INSTALLED:
 *   1. Add it to ai_core (CAM_2_ID=Living Room, CAM_2_SOURCE=<rtsp url>).
 *   2. Point the url below at feed('Living%20Room').
 *   3. 'Living Room' is already registered in backend CAMERA_FACILITY, so its
 *      incidents will be attributed to Saint Anthony automatically.
 */
export const FACILITY_CAMERAS = {
  GRACES: [
    // Listed first: this is the only rig actually installed and streaming.
    {
      cameraId: 'CAM-002',
      name: 'House of Gabriel',
      location: 'IP Camera · CCTV',
      feedId: 'House of Gabriel',
      fps: 30,
      type: 'stream',
      url: feed('House%20of%20Gabriel'),
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
      // Streams Graces' House of Gabriel rig — the only installed camera —
      // until Saint Anthony has its own. See the note above.
      location: 'Shared feed · Awaiting dedicated camera',
      feedId: 'House of Gabriel',
      fps: 30,
      type: 'stream',
      url: feed('House%20of%20Gabriel'),
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
