/**
 * session.js — how long a signed-in session lasts, in ONE place.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Access tokens were minted with a fixed lifetime (admins 24h, nurses and
 * guardians 7d) and nothing ever extended them. A nurse mid-shift, or an admin
 * who signed in yesterday, would be thrown back to the login screen by an
 * expiry they had no way to see coming and no way to prevent. The requirement
 * is the opposite: a session ends when the user presses Log Out, not on a timer
 * they never agreed to.
 *
 * THE APPROACH: SLIDING RENEWAL
 *
 * Rather than issuing one long-lived token, every authenticated request checks
 * how much life the presented token has left. Inside the last
 * RENEW_WITHIN_SECONDS, the request is answered with a brand-new token in the
 * `X-Renewed-Token` response header, and the client swaps it in. Anyone who
 * opens the app at all within SESSION_TTL simply never runs out.
 *
 * WHY NOT JUST SET expiresIn TO 90 DAYS
 *
 * A JWT cannot be revoked — it is valid until it expires, full stop. The web
 * keeps its token in localStorage, which any XSS can read. A 90-day token is
 * therefore a 90-day key to resident health records handed to whoever gets it
 * once. Sliding renewal gives an ACTIVE user an unlimited session while keeping
 * any single leaked token short-lived, which is the combination this system
 * actually needs under the Data Privacy Act posture the project claims.
 *
 * THE HONEST LIMIT
 *
 * A session that is not used for longer than SESSION_TTL still expires, and
 * that user signs in again. That is deliberate: an abandoned session on a lost
 * phone should not live forever. Lengthen SESSION_TTL if a longer absence must
 * survive — but understand that is also how long a stolen token keeps working.
 *
 * Both values are env-tunable so this can be changed without a code edit.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/** Lifetime of a freshly minted access token. Any ms/jwt duration string. */
const SESSION_TTL = process.env.SESSION_TTL || '7d';

/**
 * Renew once a token has less than this much life left. Default 2 days, so a
 * 7-day token renews on the first request made from day 5 onward — frequent
 * enough that normal use never lapses, rare enough that the vast majority of
 * requests do no signing work at all.
 */
const RENEW_WITHIN_SECONDS = Number(
  process.env.SESSION_RENEW_WITHIN_SECONDS || 2 * 24 * 60 * 60
);

/**
 * Response header carrying a replacement token.
 *
 * MUST be listed in the CORS `exposedHeaders` in server.js. A custom response
 * header is invisible to browser JavaScript on a cross-origin response unless
 * it is explicitly exposed — without that the web app would silently never
 * renew while mobile (not subject to CORS) worked fine, which is a miserable
 * bug to chase.
 */
const RENEWED_TOKEN_HEADER = 'X-Renewed-Token';

/** Claims that describe the TOKEN rather than the user; re-signing regenerates them. */
const RESERVED_CLAIMS = ['iat', 'exp', 'nbf', 'jti'];

/**
 * A replacement token for an already-verified payload, or null if this one does
 * not need replacing yet.
 *
 * The new token carries exactly the claims of the old one — same user, same
 * role, same facility — so renewal can never escalate anything. It only moves
 * the expiry.
 */
const renewedTokenFor = (decoded) => {
  if (!decoded || typeof decoded.exp !== 'number') return null;

  const secondsLeft = decoded.exp - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0 || secondsLeft > RENEW_WITHIN_SECONDS) return null;

  const claims = { ...decoded };
  for (const claim of RESERVED_CLAIMS) delete claims[claim];

  return jwt.sign(claims, JWT_SECRET, { expiresIn: SESSION_TTL });
};

module.exports = {
  SESSION_TTL,
  RENEW_WITHIN_SECONDS,
  RENEWED_TOKEN_HEADER,
  renewedTokenFor,
};
