const crypto = require('crypto');

// Stateless, short-lived stream token shared between this backend (minter) and
// the AI core (verifier). Both must share STREAM_SIGNING_SECRET.
//
// Token format:  v1.<expUnixSeconds>.<hmacSha256Hex("v1.<exp>", secret)>
//
// The AI core only needs to validate the signature + expiry at connection time;
// once an MJPEG stream is open it stays open, so a short TTL does not interrupt
// an active feed. Clients fetch a fresh token before (re)connecting.

const SECRET = process.env.STREAM_SIGNING_SECRET || '';
const DEFAULT_TTL = parseInt(process.env.STREAM_TTL_SECONDS || '600', 10); // 10 min

function _sign(message) {
  return crypto.createHmac('sha256', SECRET).update(message).digest('hex');
}

/**
 * Mint a signed stream token.
 * @param {number} [ttlSeconds]
 * @returns {{ token: string, expiresIn: number, exp: number }}
 */
function signStreamToken(ttlSeconds = DEFAULT_TTL) {
  if (!SECRET) {
    throw new Error('STREAM_SIGNING_SECRET is not configured');
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const message = `v1.${exp}`;
  const token = `${message}.${_sign(message)}`;
  return { token, expiresIn: ttlSeconds, exp };
}

/**
 * Verify a token (mirror of the AI core's Python check; handy for tests).
 * @returns {boolean}
 */
function verifyStreamToken(token) {
  if (!SECRET || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [v, exp, sig] = parts;
  const message = `${v}.${exp}`;
  const expected = _sign(message);
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return false;
  return true;
}

module.exports = { signStreamToken, verifyStreamToken };
