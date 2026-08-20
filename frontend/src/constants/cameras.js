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
    {
      cameraId: 'CAM-001',
      name: 'House of Charbel',
      location: 'Webcam · Cam 0',
      status: 'Active',
      fps: 30,
      type: 'stream',
      url: feed('House%20of%20Charbel'),
    },
    {
      cameraId: 'CAM-002',
      name: 'House of Gabriel',
      location: 'IP Camera · Phone Stream',
      status: 'Active',
      fps: 30,
      type: 'stream',
      url: feed('House%20of%20Gabriel'),
    },
    {
      cameraId: 'CAM-003',
      name: 'Future CCTV 1',
      location: 'Pending Installation',
      status: 'Inactive',
      fps: 0,
      type: 'stream',
      url: null,
    },
    {
      cameraId: 'CAM-004',
      name: 'Future CCTV 2',
      location: 'Pending Installation',
      status: 'Inactive',
      fps: 0,
      type: 'stream',
      url: null,
    },
  ],

  SAINT_ANTHONY: [
    {
      cameraId: 'STA-CAM-001',
      name: 'Living Room',
      // Shared rig until Saint Anthony has its own camera — see the note above.
      location: 'Shared feed · Awaiting dedicated camera',
      status: 'Active',
      fps: 30,
      type: 'stream',
      url: feed('House%20of%20Gabriel'),
    },
    {
      cameraId: 'STA-CAM-002',
      name: 'Future CCTV 1',
      location: 'Pending Installation',
      status: 'Inactive',
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

export const activeCameraCount = (cams = camerasForCurrentUser()) =>
  cams.filter((c) => c.status === 'Active').length;

export const totalCameraCount = (cams = camerasForCurrentUser()) => cams.length;
