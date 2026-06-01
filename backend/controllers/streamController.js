const { signStreamToken } = require('../utils/streamToken');

// Public base URL of the AI core stream, fronted by the Cloudflare Tunnel.
// e.g. https://cctv.visiosphere.live/video_feed
const STREAM_PUBLIC_URL = (process.env.STREAM_PUBLIC_URL || '').replace(/\/$/, '');

/**
 * GET /api/stream/token
 * Returns a short-lived signed token an authenticated client appends to the
 * MJPEG feed URL as ?token=. The AI core verifies it without a DB round-trip.
 */
const getStreamToken = (req, res, next) => {
  try {
    const { token, expiresIn, exp } = signStreamToken();
    res.json({
      token,
      expiresIn,          // seconds until expiry
      exp,                // absolute unix-seconds expiry
      streamBase: STREAM_PUBLIC_URL || null,
    });
  } catch (err) {
    err.status = err.status || 500;
    next(err);
  }
};

module.exports = { getStreamToken };
