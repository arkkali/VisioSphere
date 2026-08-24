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
const { signClipToken, isSafeClipFilename } = require('../utils/clipToken');

// Public origin of the mini PC's ai_core, i.e. the Cloudflare Tunnel hostname
// that already fronts /video_feed and /status. NOT a filesystem path.
// e.g. CLIP_BASE_URL=https://cctv.visiosphere.live
const CLIP_BASE_URL = (process.env.CLIP_BASE_URL || '').replace(/\/+$/, '');

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

module.exports = { getSignedClipUrl, clipFilename };
