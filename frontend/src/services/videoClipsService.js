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

/** Exported so a reclassified clip can be re-bucketed in place, without
 *  reloading the whole grid just to recompute one card's category. */
export const categoryForType = categoryFor;

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
    note: incident.note || '',
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
    params: {
      source: 'cctv',
      since,
      limit,
      // showDismissed is ESSENTIAL here, not optional. GET /incidents defaults
      // to hiding dismissed incidents because its primary caller is the alert
      // inbox on the CCTV Live Hub, where "dismissed" means "I have seen this
      // notification, stop showing it to me."
      //
      // This page is not an inbox. It is the recording archive. Dismissing a
      // notification must never hide the footage of the event from review --
      // that is how six clips silently disappeared from this grid the moment
      // someone pressed "Clear All" on the Live Hub. The recordings were on
      // disk the whole time, with clipPath intact; only this filter hid them.
      //
      // If a reviewer should ever be able to narrow by alert state, that
      // belongs in the Filters control as an explicit choice, never as a
      // default inherited from a different page's semantics.
      showDismissed: 'true',
    },
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
// Thumbnails
// ---------------------------------------------------------------------------
/**
 * Signed poster URLs for many clips at once: { [incidentId]: url }.
 *
 * Batched deliberately. One request per card would be a dozen round trips
 * through the Cloudflare tunnel on every page load, and folding poster URLs
 * into the clip list would mint a signed token for every incident the
 * dashboard polls, most of which nobody ever looks at.
 *
 * Ids missing from the response have no poster available -- the card keeps its
 * gradient placeholder. That is a normal state, not an error: clips recorded
 * before ai_core started writing posters simply do not have one.
 */
export async function fetchThumbnailUrls(ids = []) {
  if (!ids.length) return {};
  const { data } = await axiosInstance.get(`${API_PREFIX}/incidents/thumbnail-urls`, {
    params: { ids: ids.join(',') },
  });
  return data || {};
}

// ---------------------------------------------------------------------------
// Edit / delete
// ---------------------------------------------------------------------------
/**
 * Event types the backend will accept for a reclassification. Mirrors the
 * enum on backend/models/Incident.js -- the server validates against its own
 * schema regardless, so this list only shapes the dropdown.
 */
export const INCIDENT_TYPES = [
  'Fall',
  'Prolonged Fall',
  'Lying Down',
  'Agitation',
  'Inactivity',
  'Inactivity (Posture)',
  'Unusual Movement',
  'False Alarm',
];

/**
 * Correct the record attached to a recording.
 *
 * The video itself is immutable -- "editing a clip" means fixing what it was
 * labelled as, which is the part that is ever actually wrong (the detector
 * calls a resident sitting down heavily a fall; the nurse who watched it knows
 * better). Reclassifying also moves severity server-side, so the dashboard
 * totals follow the correction.
 *
 * @param {string} incidentId
 * @param {{ incidentType?: string, note?: string }} changes
 */
export async function updateClip(incidentId, changes) {
  const { data } = await axiosInstance.patch(
    `${API_PREFIX}/incidents/${incidentId}/clip`,
    changes
  );
  return data;
}

/**
 * Delete the recording from the mini PC.
 *
 * The INCIDENT is kept -- only the video goes. Removing the incident too would
 * let anyone quietly lower the facility's fall count by deleting the evidence.
 * Backend restricts this to a Facility Admin and writes an audit entry.
 */
export async function deleteClip(incidentId) {
  const { data } = await axiosInstance.delete(
    `${API_PREFIX}/incidents/${incidentId}/clip`
  );
  return data;
}

/** True if the signed-in user may delete recordings. The backend enforces this
 *  independently; this only decides whether to render the control. */
export function canDeleteClips() {
  try {
    return localStorage.getItem('userRole') === 'Facility Admin';
  } catch (_) {
    return false;
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
  fetchThumbnailUrls,
  updateClip,
  deleteClip,
  canDeleteClips,
  getCameraGroups,
  categoryForType,
  INCIDENT_TYPES,
};
