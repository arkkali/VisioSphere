// frontend/src/services/videoClipsService.js
//
// The JWT is attached automatically by axiosInstance's request interceptor and
// a 401 triggers a global redirect, so no auth handling is needed here — only
// the 404 special-case in getClipVideoUrl (see its comment).
//
// API_PREFIX is empty because VITE_API_URL already ends in /api
// (https://visiosphere-backend.onrender.com/api). Every backend route is
// mounted under '/api' in server.js, so adding a second prefix here would
// produce /api/api/incidents. Isolated to one constant so it is a one-line fix
// if the base URL ever changes shape.
import axiosInstance from '../api/axiosInstance';
import { camerasForCurrentUser } from '../constants/cameras';

const API_PREFIX = '';

// ---------------------------------------------------------------------------
// Event type categories
// ---------------------------------------------------------------------------
// Incident.incidentType has more values than the filter pills show (see
// backend/models/Incident.js's enum: Fall, Prolonged Fall, Lying Down,
// Agitation, Inactivity, Inactivity (Posture), Unusual Movement, False Alarm).
// Rather than inventing a new grouping, this reuses the same category mapping
// backend/services/incidentService.js's getWeeklyStats() applies server-side,
// so a "Prolonged Fall" clip shows under the same category everywhere in the
// app, not just on the dashboard chart.
//
// NOTE ON PACING: the original handoff shipped a 'Pacing' category and filter
// pill. There is no 'Pacing' value in the Incident enum — it was removed from
// ai_core (see cctv_core.py.before_pacing_removal) — so that pill could only
// ever return zero results. Removed rather than shipped dead. If Pacing is
// reinstated in the detector AND added back to the Incident enum, restore the
// entry here and the matching pill below.
const EVENT_TYPE_CATEGORY = {
  Fall: 'Fall',
  'Prolonged Fall': 'Fall',
  Agitation: 'Agitation',
  Inactivity: 'Inactivity',
  'Inactivity (Posture)': 'Inactivity',
  'Lying Down': 'Lying Down',
  // 'Unusual Movement' and 'False Alarm' intentionally have no bucket — they
  // still render via VideoClipCard's generic fallback badge, they just aren't
  // filterable by a dedicated pill.
};

function categoryFor(incidentType) {
  return EVENT_TYPE_CATEGORY[incidentType] || incidentType;
}

/** Pills shown in EventFilterPills. 'All Events' plus the categories above. */
export const eventTypes = [
  { id: 'all', label: 'All Events' },
  { id: 'Fall', label: 'Fall Detection' },
  { id: 'Agitation', label: 'Agitation' },
  { id: 'Lying Down', label: 'Lying Down' },
  { id: 'Inactivity', label: 'Inactivity' },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTimeLabel(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Incident -> clip mapping
// ---------------------------------------------------------------------------
/**
 * Maps one raw Incident (as returned by GET /api/incidents) to the shape
 * VideoClipCard.jsx / VideoPlayerModal.jsx actually read.
 *
 * Deliberately NOT populated here:
 *   - duration: no such field exists on Incident anywhere in the pipeline.
 *     Left null; VideoPlayerModal reads it from the video element's own
 *     metadata once playback loads, and VideoClipCard hides its badge until
 *     then.
 *   - thumbnail: no such field either. Left null; the card renders a gradient
 *     placeholder in that case.
 *   - videoUrl: deliberately NOT resolved here. Resolving a signed URL for
 *     every clip in a list the user is only browsing would mint tokens for
 *     clips nobody opens. Call getClipVideoUrl(id) when a clip is selected.
 *
 * `cameraName` intentionally holds the RAW value from Incident.location (the
 * ai_core cam_id string, e.g. "Living Room") rather than a display name — that
 * raw value is the only reliable join key back to a camera tile. Display-name
 * resolution happens in getCameraGroups() below.
 */
function mapIncidentToClip(incident) {
  const createdAt = new Date(incident.createdAt);
  return {
    id: incident._id,
    eventType: categoryFor(incident.incidentType),
    rawIncidentType: incident.incidentType,
    cameraName: incident.location,
    cameraId: incident.cameraId,
    thumbnail: null,
    duration: null,
    dateLabel: formatDateLabel(createdAt),
    timeLabel: formatTimeLabel(createdAt),
    timestamp: incident.createdAt,
    videoUrl: null,
  };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
/**
 * Fetch recent CCTV incidents that have a recorded clip attached.
 *
 * Facility isolation is NOT applied here and should not be — GET /incidents
 * runs behind verifyToken on the backend, which auto-scopes every query to the
 * caller's facility (see backend/models/plugins/facilityScope.js). A
 * client-side facility filter on top would be redundant, and as a safeguard it
 * would be meaningless: anyone can edit what runs in their own browser. The
 * backend is the enforcement point.
 *
 * @param {{ since?: string, limit?: number }} [options]
 *   since: ISO date string; omit to use the backend's default (last 7 days).
 */
export async function fetchVideoClips(options = {}) {
  const { since, limit = 100 } = options;
  const { data } = await axiosInstance.get(`${API_PREFIX}/incidents`, {
    params: { source: 'cctv', since, limit },
  });

  // Only incidents with a clip already attached. An incident can exist before
  // its clip finishes encoding (ai_core's cctv_alert fires first,
  // cctv_alert_clip follows ~10-45s later) — those simply don't appear yet,
  // rather than showing a card with nothing playable behind it.
  return (data.items || [])
    .filter((incident) => incident.clipPath)
    .map(mapIncidentToClip);
}

/**
 * Resolve a short-lived, signed playback URL for one clip. Call this only when
 * the user actually opens a clip, never for a whole list — the backend mints
 * tokens with a short TTL (see backend/utils/clipToken.js) on the assumption
 * that they are requested right before use.
 *
 * @param {string} incidentId
 * @returns {Promise<{ url: string, expiresIn: number } | null>}
 *   null means no clip is available yet (still recording, or the file went
 *   missing on disk). A normal state to handle in the UI, not an error.
 */
export async function getClipVideoUrl(incidentId) {
  try {
    const { data } = await axiosInstance.get(`${API_PREFIX}/incidents/${incidentId}/video-url`);
    return data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Camera groups
// ---------------------------------------------------------------------------
/**
 * Camera tiles for the CURRENT user's facility, shaped to both (a) display a
 * facility-appropriate name and (b) join incidents to the right group by
 * feedId.
 *
 * Reuses camerasForCurrentUser() from constants/cameras.js rather than
 * re-deriving "what facility is this user" here — that logic already exists
 * and already handles the per-facility camera naming correctly.
 *
 * Cameras with no feedId ("Pending Installation") are excluded: they cannot
 * have produced incidents, so they would only ever render as an empty group.
 *
 * @returns {Array<{ groupId: string, groupName: string, feedId: string }>}
 */
export function getCameraGroups() {
  return camerasForCurrentUser()
    .filter((cam) => cam.feedId)
    .map((cam) => ({
      groupId: cam.cameraId,
      groupName: cam.name,
      feedId: cam.feedId,
    }));
}

export default {
  eventTypes,
  fetchVideoClips,
  getClipVideoUrl,
  getCameraGroups,
};
