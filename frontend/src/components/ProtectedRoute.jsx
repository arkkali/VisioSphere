// frontend/src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { clearSession } from '../utils/browserSession';

/**
 * Gate for every route that is not the sign-in page.
 *
 * WHAT THIS FIXES
 *
 * Every route in App.jsx used to render unconditionally, so typing
 * /admin/monitoring straight into the address bar opened the CCTV hub with no
 * sign-in at all.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is a UX and exposure control, NOT a security boundary. Anything running
 * in the browser can be edited by whoever is holding the browser, so a
 * determined visitor can always render the shell. Real enforcement is server
 * side: every /api route sits behind verifyToken, and axiosInstance sends the
 * user back here on a 401. What this stops is the accidental and the casual —
 * a shared link, a bookmarked deep link, a guessed URL.
 *
 * IMPORTANT: a route guard does NOT protect the camera feed itself. The MJPEG
 * stream is served by ai_core, not by this app, and is reachable directly by
 * URL. See constants/cameras.js.
 *
 * SCOPE: this checks that someone is SIGNED IN, and nothing more. It
 * deliberately does not restrict which role may open which route — a signed-in
 * nurse can still reach /admin/*. The backend enforces role separately
 * (authorizeRoles), so the exposure is a rendered page, not the data behind it.
 *
 * WHY THE EXPIRY CHECK EXISTS
 *
 * Checking that a token is merely PRESENT is not the same as checking that it
 * is still good. The JWT carries its own `exp`, so an expired one is treated as
 * no token at all rather than rendering the shell and waiting for the first API
 * call to 401. Read-only: signature verification is the server's job and cannot
 * be done here.
 *
 * WHERE THE IDLE TIMEOUT WENT
 *
 * This file used to end a session after 30 minutes without a mousedown,
 * keydown, touchstart or scroll. It signed people out mid-shift — the CCTV wall
 * is a page you watch, not one you click, and `scroll` on `window` never fires
 * for this layout's inner scroll panels. Session lifetime is now owned by
 * utils/browserSession.js, which ends the session when the BROWSER ends
 * instead: keep working for as long as the machine is up, sign in again after
 * it is shut down and restarted. Read that file before reintroducing any timer
 * here.
 */

/** Seconds-since-epoch expiry from a JWT, or null if it cannot be read. */
const tokenExpiry = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    // Malformed token — treat as unreadable rather than as valid.
    return null;
  }
};

const isExpired = (token) => {
  const exp = tokenExpiry(token);
  // A token with no readable exp is left alone: the server is the authority on
  // validity, and refusing to render on a parse failure would lock out a valid
  // session over a formatting quirk.
  if (exp === null) return false;
  return Date.now() >= exp * 1000;
};

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');

  const expired = !token || isExpired(token);
  if (expired && token) clearSession();

  if (expired) {
    // `state.from` records where they were headed, for a later
    // return-to-intended-page. It costs nothing and keeps the intent.
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
