const STREAM_BASE_URL = import.meta.env.VITE_STREAM_URL || 'http://localhost:5001/video_feed';
// Shared secret matching STREAM_TOKEN in ai_core/.env. Appended as ?key= so the
// public Cloudflare Tunnel feed isn't open to anonymous viewers. Empty = no token.
const STREAM_TOKEN = import.meta.env.VITE_STREAM_TOKEN || '';
const feed = (cam) => `${STREAM_BASE_URL}/${cam}${STREAM_TOKEN ? `?key=${STREAM_TOKEN}` : ''}`;

export const CAMERAS = [
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
];

export const ACTIVE_CAMERA_COUNT = CAMERAS.filter(c => c.status === 'Active').length;
export const TOTAL_CAMERA_COUNT = CAMERAS.length;