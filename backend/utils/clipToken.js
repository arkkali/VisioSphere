// backend/utils/clipToken.js
//
// Stateless, short-lived, RESOURCE-BOUND token for playing back one recorded
// incident clip. Sibling of streamToken.js, and deliberately a different
// token: streamToken grants "you may open the live feed for the next N
// minutes, whichever camera you like." This one grants "you may fetch exactly
// THIS file, and nothing else" — a signed URL for one incident's clip must not
// double as a signed URL for a different incident's clip.
//
// WHO VERIFIES THIS: not the backend. Clips live on the mini PC's disk
// (CLIP_DIR, e.g. /opt/visiosphere/clips) and the backend runs on Render —
// different machines, no shared filesystem. So the backend MINTS the token and
// ai_core VERIFIES it, exactly like the STREAM_SIGNING_SECRET pair already
// does for the live feed. CLIP_SIGNING_SECRET must be identical in
// backend/.env (or Render's env) and ai_core/.env on the mini PC.
//
// Token format:
//   play:    v1.<exp>.<hmacSha256Hex("v1.<exp>.<filename>", secret)>
//   delete:  v1d.<exp>.<hmacSha256Hex("v1d.<exp>.<filename>", secret)>
//
// The version prefix is part of the SIGNED MESSAGE, not just a label, so a
// playback token can never satisfy a delete check. This matters because every
// played clip hands a valid token to the viewer's browser, where it lands in
// history, proxy logs and the network tab. If that same token could delete,
// simply watching a fall would be enough to destroy the recording of it.
//
// `filename` is NOT embedded in the token string — only hashed into it:
//   1. Embedding it would break parsing. Filenames contain dots (".mp4") and
//      the format is dot-delimited, so a four-part split fails on every real
//      clip name.
//   2. It isn't needed. The filename is already public in the URL path
//      (GET /clips/:filename?token=...), so verifyClipToken() takes it as a
//      separate argument rather than recovering it from inside the token.
//
// A token minted for incident A's clip fails verification against incident B's
// filename, because the HMAC was computed over A's filename — changing the
// filename changes the message, which changes the expected signature.

const crypto = require('crypto');

const SECRET = process.env.CLIP_SIGNING_SECRET || '';

// Short TTL on purpose: this token only needs to survive long enough for the
// browser to request the video once the <video> tag mounts. Unlike the live
// stream token there is no long-lived connection to keep alive — if playback
// needs a fresh token later (the user re-opens the clip), the frontend just
// asks for a new one.
//
// NOTE: it must still outlive the whole download, not just the first byte.
// A range request that starts at second 118 of a 120s token gets a 403
// mid-scrub. 300s is a compromise: long enough to watch a 10s clip and scrub
// it repeatedly, short enough that a leaked URL is stale by the time it is
// pasted anywhere.
const DEFAULT_TTL = parseInt(process.env.CLIP_TOKEN_TTL_SECONDS || '300', 10);

const VERSION_FOR = { play: 'v1', delete: 'v1d' };

function _sign(message) {
  return crypto.createHmac('sha256', SECRET).update(message).digest('hex');
}

/**
 * True if `filename` is safe to use in a filesystem path join — no directory
 * separators, no '..' traversal segments. Both signClipToken and ai_core's
 * route handler apply this: signing an unsafe name would produce a
 * valid-looking token for a path-traversal attempt, and serving without
 * re-checking would trust the URL param blindly even if the token verified.
 */
function isSafeClipFilename(filename) {
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('..') &&
    !filename.includes('\0')
  );
}

/**
 * Mint a signed token authorizing playback of exactly one clip file.
 * @param {string} filename - basename only, e.g. what ai_core wrote
 *   (see cctv_core.py _record_alert_clip: "<cam>_<label>_<ts>_<key>.mp4").
 *   Never a full path.
 * @param {number} [ttlSeconds]
 * @returns {{ token: string, expiresIn: number, exp: number }}
 */
function signClipToken(filename, ttlSeconds = DEFAULT_TTL, action = 'play') {
  if (!SECRET) {
    throw new Error('CLIP_SIGNING_SECRET is not configured');
  }
  if (!isSafeClipFilename(filename)) {
    throw new Error(`Refusing to sign an unsafe filename: ${filename}`);
  }
  const version = VERSION_FOR[action];
  if (!version) {
    throw new Error(`Unknown clip token action: ${action}`);
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const message = `${version}.${exp}.${filename}`;
  const token = `${version}.${exp}.${_sign(message)}`;
  return { token, expiresIn: ttlSeconds, exp };
}

/**
 * Mint a token authorising DELETION of one clip. Deliberately a separate
 * function rather than a flag on the caller's side, so that every delete is a
 * visible, greppable decision at the call site. TTL is short: a delete token
 * is minted and used within one request, never handed to a browser.
 */
function signClipDeleteToken(filename, ttlSeconds = 60) {
  return signClipToken(filename, ttlSeconds, 'delete');
}

/**
 * Verify a token against the filename it claims to authorize. Kept here for
 * completeness and unit tests; in production ai_core does the verifying (see
 * _verify_clip_token in cctv_core.py, which mirrors this byte for byte).
 */
function verifyClipToken(token, filename, action = 'play') {
  if (!SECRET || typeof token !== 'string') return false;
  if (!isSafeClipFilename(filename)) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [v, exp, sig] = parts;
  if (v !== VERSION_FOR[action]) return false;

  const message = `${v}.${exp}.${filename}`;
  const expected = _sign(message);
  let sigBuf;
  try {
    sigBuf = Buffer.from(sig, 'hex');
  } catch (_) {
    return false;
  }
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

  if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return false;
  return true;
}

module.exports = {
  signClipToken,
  signClipDeleteToken,
  verifyClipToken,
  isSafeClipFilename,
};
