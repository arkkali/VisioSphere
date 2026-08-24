// backend/services/videoService.js
//
// Resolves a playable URL for one incident's recorded clip.
//
// WHERE THE BYTES LIVE — the constraint that shapes this whole file:
// ai_core writes clips to CLIP_DIR on the mini PC (/opt/visiosphere/clips).
// This backend runs on Render. Different machines, no shared filesystem, so
// this process CANNOT open the file, cannot stat it, and cannot stream it.
// Any design where Express serves the bytes 404s on every request.
//
// What this backend CAN do — and the only thing it should do — is decide
// WHETHER the caller is allowed to see this clip, then hand back a
// short-lived URL pointing at the machine that does have the file. ai_core
// already exposes an authenticated HTTP surface through the same Cloudflare
// Tunnel that serves the live MJPEG feed, so the clip route rides that.
//
// The permission decision happens BEFORE this function is called, and not by
// this function: incidentController.getVideoUrl loads the incident through
// incidentService.getIncidentById -> Incident.findById, which the
// facilityScope plugin auto-scopes to the caller's facility (verifyToken runs
// next() inside runWithFacility). An admin from one facility asking for the
// other facility's incident _id gets null and never reaches this code. That
// is why getSignedClipUrl takes an already-loaded incident document rather
// than an id — passing an id here would invite a future caller to skip the
// scoped lookup and mint a token for a clip they may not see.

const path = require('path');
const {
  signClipToken,
  signClipDeleteToken,
  isSafeClipFilename,
} = require('../utils/clipToken');

// Public origin of the mini PC's ai_core, i.e. the Cloudflare Tunnel hostname
// that already fronts /video_feed and /status. NOT a filesystem path.
// e.g. CLIP_BASE_URL=https://cctv.visiosphere.live
const CLIP_BASE_URL = (process.env.CLIP_BASE_URL || '').replace(/\/+$/, '');

// Posters get a longer TTL than clips. A clip token is minted the instant
// someone clicks play and used immediately; a poster URL sits in an <img> on
// a grid the user may leave open while doing rounds. Too short a TTL and the
// thumbnails silently rot into placeholders while the page is still up.
const POSTER_TTL = parseInt(process.env.CLIP_POSTER_TTL_SECONDS || '1800', 10);

/**
 * Reduce whatever is stored in Incident.clipPath to a bare filename.
 *
 * Three shapes exist in the database, because the storage story changed twice:
 *   1. "clips/Living_Room_fall_1730000000_abc.mp4"  — current, ai_core relative
 *   2. "https://<bucket>.s3.<region>.amazonaws.com/clips/test/<name>.mp4"
 *      — historical rows from when CLIP_S3_BUCKET was set. The S3 upload was
 *        always IN ADDITION to the local write, so the file is still on the
 *        mini PC under the same basename and these rows stay playable.
 *   3. an absolute path, if CLIP_DIR was ever echoed back verbatim.
 * All three reduce to the same basename, which is the only part ai_core needs.
 *
 * @returns {string|null} null when clipPath is missing or unusable.
 */
function clipFilename(clipPath) {
  if (typeof clipPath !== 'string' || !clipPath.trim()) return null;

  let raw = clipPath.trim();

  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = decodeURIComponent(new URL(raw).pathname);
    } catch (_) {
      return null;
    }
  }

  // Normalise Windows separators before taking a POSIX basename, so a value
  // written on a Windows dev box still reduces correctly.
  const base = path.posix.basename(raw.replace(/\\/g, '/'));

  if (!base || !isSafeClipFilename(base)) return null;
  // Only ever hand out video files. Belt and braces: ai_core re-checks this,
  // but a token should not exist for anything that isn't a clip.
  if (!base.toLowerCase().endsWith('.mp4')) return null;

  return base;
}

/**
 * Mint a short-lived, resource-bound playback URL for one incident's clip.
 *
 * @param {object} incident - an already facility-scoped Incident (lean or doc)
 * @returns {Promise<{ url: string, expiresIn: number } | null>}
 *   null means "this incident has no playable clip" — either ai_core has not
 *   finished encoding yet (cctv_alert fires ~10-45s before cctv_alert_clip, so
 *   there is a real window where this is the correct answer) or clipPath holds
 *   something unusable. The controller turns null into a 404 and the UI shows
 *   "This clip is not available yet." Deliberately not an error: a clip that
 *   does not exist yet is a normal state, not a failure.
 */
async function getSignedClipUrl(incident) {
  const filename = clipFilename(incident && incident.clipPath);
  if (!filename) return null;

  if (!CLIP_BASE_URL) {
    // Configuration error, not a missing clip — surfacing it as 404 would send
    // someone hunting through ai_core for a file that is sitting right there.
    throw new Error(
      'CLIP_BASE_URL is not configured (expected the ai_core tunnel origin, ' +
      'e.g. https://cctv.visiosphere.live)'
    );
  }

  const { token, expiresIn } = signClipToken(filename);

  // encodeURIComponent, not encodeURI: cam ids contain spaces ("Living Room"),
  // so filenames do too. The HMAC was computed over the RAW filename, and
  // Flask hands the route handler the DECODED value — so both sides hash the
  // same string and only the wire format is escaped.
  const url =
    `${CLIP_BASE_URL}/clips/${encodeURIComponent(filename)}` +
    `?token=${encodeURIComponent(token)}`;

  return { url, expiresIn };
}


/** Poster (thumbnail) filename for a clip: same basename, .jpg instead of .mp4. */
function posterFilename(clipPath) {
  const clip = clipFilename(clipPath);
  return clip ? clip.replace(/\.mp4$/i, '.jpg') : null;
}

function buildUrl(filename, token) {
  // encodeURIComponent, not encodeURI: cam ids contain spaces ("Living Room"),
  // so filenames do too. The HMAC was computed over the RAW filename, and Flask
  // hands the route handler the DECODED value, so both sides hash the same
  // string and only the wire format is escaped.
  return (
    `${CLIP_BASE_URL}/clips/${encodeURIComponent(filename)}` +
    `?token=${encodeURIComponent(token)}`
  );
}

function requireBaseUrl() {
  if (!CLIP_BASE_URL) {
    throw new Error(
      'CLIP_BASE_URL is not configured (expected the ai_core tunnel origin, ' +
      'e.g. https://cctv.visiosphere.live)'
    );
  }
}

/**
 * Signed URL for one incident's poster frame.
 *
 * Returns null when the incident has no clip. Note it does NOT check that the
 * .jpg exists on disk -- this process cannot see that filesystem. Clips
 * recorded before posters existed simply 404 when the <img> loads, and the card
 * falls back to its gradient. That is the right failure: a missing thumbnail is
 * cosmetic and must never cost a round trip to discover.
 */
async function getSignedPosterUrl(incident) {
  const filename = posterFilename(incident && incident.clipPath);
  if (!filename) return null;
  requireBaseUrl();
  const { token } = signClipToken(filename, POSTER_TTL);
  return { url: buildUrl(filename, token) };
}

/**
 * Batch form of getSignedPosterUrl. One call per grid render instead of one per
 * card -- signing is cheap, HTTP round trips over a tunnel are not.
 *
 * @param {Array<object>} incidents - already facility-scoped
 * @returns {Promise<Record<string, string>>} incident _id -> poster URL.
 *   Incidents without a usable clip are omitted rather than mapped to null, so
 *   the caller can treat presence as "there is a thumbnail to try".
 */
async function getSignedPosterUrls(incidents = []) {
  const out = {};
  for (const incident of incidents) {
    const filename = posterFilename(incident && incident.clipPath);
    if (!filename) continue;
    requireBaseUrl();
    const { token } = signClipToken(filename, POSTER_TTL);
    out[String(incident._id)] = buildUrl(filename, token);
  }
  return out;
}

/**
 * Ask ai_core to delete one incident's clip and poster from the mini PC.
 *
 * Uses a DELETE-scoped token, which a playback token cannot substitute for
 * (see utils/clipToken.js). Short TTL: it is minted and spent inside this one
 * request and never reaches a browser.
 *
 * Treats "already gone" as success. The caller's next step is to clear
 * clipPath on the incident, and refusing to do that because the file was
 * already missing would leave a permanently broken card that can never be
 * cleaned up.
 *
 * @returns {Promise<{ deleted: string[] }>}
 * @throws when ai_core is unreachable or refuses -- the caller must NOT clear
 *   clipPath in that case, or the record would claim a deletion that never
 *   happened.
 */
async function deleteClip(incident) {
  const filename = clipFilename(incident && incident.clipPath);
  if (!filename) return { deleted: [] };
  requireBaseUrl();

  const { token } = signClipDeleteToken(filename);
  const url = buildUrl(filename, token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { method: 'DELETE', signal: controller.signal });
  } catch (err) {
    throw new Error(
      `Could not reach the recorder to delete this clip: ${err.message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(
      `The recorder refused to delete this clip (HTTP ${res.status})`
    );
  }

  const body = await res.json().catch(() => ({}));
  return { deleted: Array.isArray(body.deleted) ? body.deleted : [] };
}

module.exports = {
  getSignedClipUrl,
  getSignedPosterUrl,
  getSignedPosterUrls,
  deleteClip,
  clipFilename,
  posterFilename,
};
